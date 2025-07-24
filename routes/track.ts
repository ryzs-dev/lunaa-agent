import express, { Request, Response } from "express";
import {
  fetchSheetData,
  updateSheetStatusByTracking,
} from "../src/googleSheet";
import { getProcessed, saveProcessed } from "../utils/tracker";
import {
  getMessageStatusBySid,
  sendWhatsAppTemplate,
} from "../src/twilioClient";

const trackRouter = express.Router();

trackRouter.post("/track", async (req: Request, res: Response) => {
  const sheetName = "Test";
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  if (!spreadsheetId) {
    return res
      .status(500)
      .json({ error: "GOOGLE_SHEET_ID environment variable is required" });
  }

  try {
    const rows = await fetchSheetData(sheetName, spreadsheetId);

    if (rows.length === 0) {
      return res.status(200).json({ message: "No data found in the sheet" });
    }

    const header = rows[0];
    const phoneCol = header.findIndex((col: string) =>
      col.toLowerCase().includes("phone")
    );
    const trackingCol = header.findIndex((col: string) =>
      col.toLowerCase().includes("tracking number")
    );
    const courierCol = header.findIndex(
      (col: string) =>
        col.toLowerCase().includes("couriers company") ||
        col.toLowerCase().includes("courier company")
    );
    const statusCol = header.findIndex((col: string) =>
      col.toLowerCase().includes("status")
    );

    if (phoneCol === -1 || trackingCol === -1) {
      return res.status(400).json({
        error: "Required columns (phone, tracking number) not found",
      });
    }

    const processed = getProcessed();
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const phone = row[phoneCol]?.toString().trim();
      const trackingNumber = row[trackingCol]?.toString().trim();
      const courierCompany =
        courierCol !== -1 ? row[courierCol]?.toString().trim() : undefined;

      if (!phone || !trackingNumber || processed.has(trackingNumber)) continue;

      try {
        const messageSid = await sendWhatsAppTemplate(
          phone,
          trackingNumber,
          courierCompany
        );

        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await getMessageStatusBySid(messageSid);
        const finalStatus = status || "sent";

        await updateSheetStatusByTracking(
          sheetName,
          spreadsheetId,
          trackingNumber,
          finalStatus
        );

        processed.add(trackingNumber);
        processedCount++;

        if (
          status === "delivered" ||
          status === "sent" ||
          status === "queued"
        ) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        await updateSheetStatusByTracking(
          sheetName,
          spreadsheetId,
          trackingNumber,
          "failed"
        );
        processed.add(trackingNumber);
        processedCount++;
        failedCount++;
      }

      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    saveProcessed(processed);

    return res.status(200).json({
      message: "Tracking completed",
      stats: {
        processedCount,
        successCount,
        failedCount,
      },
    });
  } catch (error) {
    console.error("❌ Track API failed:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default trackRouter;
