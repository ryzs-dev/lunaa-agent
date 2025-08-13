import express, { Request, Response } from "express";
import { fetchSheetData, updateSheetStatusByTracking } from "../googleSheet";
import {
  getMessageStatusBySid,
  sendWhatsAppTemplate,
  sendProductUsageInstructions,
  sendCompleteMessageSequence,
} from "../twilioClient";
import { updateMessageStatusInDB } from "../database/supabaseOrders";
import dotenv from "dotenv";
import path from "path";
import { getProcessed, saveProcessed } from "../utils/tracker";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const trackRouter = express.Router();

trackRouter.post("/track", async (req: Request, res: Response) => {
  const sheetName = "Test";
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // Options from request body with proper defaults
  const body = req.body || {};
  const {
    includeUsageGuide = true,
    includeUsageVideo = false,
    delayBetweenMessages = 5000, // 30 seconds
    useSequence = true, // Whether to send all messages or just tracking
  } = body;

  if (!spreadsheetId) {
    return res
      .status(500)
      .json({ error: "GOOGLE_SHEET_ID environment variable is required" });
  }

  try {
    console.log(`📋 Starting track process for sheet: ${sheetName}`);
    console.log(`🔧 Options:`, {
      includeUsageGuide,
      includeUsageVideo,
      delayBetweenMessages,
      useSequence,
    });

    const rows = await fetchSheetData(sheetName, spreadsheetId);

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No data found in the sheet",
        stats: { processedCount: 0, successCount: 0, failedCount: 0 },
      });
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

    if (phoneCol === -1 || trackingCol === -1) {
      return res.status(400).json({
        success: false,
        error: "Required columns (phone, tracking number) not found",
      });
    }

    console.log(
      `📞 Phone column: ${phoneCol}, 📦 Tracking column: ${trackingCol}, 🚚 Courier column: ${courierCol}`
    );

    const processed = getProcessed();
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    console.log(`📊 Processing ${rows.length - 1} rows...`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const phone = row[phoneCol]?.toString().trim();
      const trackingNumber = row[trackingCol]?.toString().trim();
      const courierCompany =
        courierCol !== -1 ? row[courierCol]?.toString().trim() : undefined;

      // Skip if missing required data or already processed
      if (!phone || !trackingNumber) {
        console.log(
          `⏭️ Row ${i}: Missing phone (${phone}) or tracking (${trackingNumber})`
        );
        skippedCount++;
        continue;
      }

      if (processed.has(trackingNumber)) {
        console.log(
          `⏭️ Row ${i}: Tracking ${trackingNumber} already processed`
        );
        skippedCount++;
        continue;
      }

      try {
        console.log(
          `📤 Row ${i}: Processing messages for ${phone} - tracking ${trackingNumber}`
        );

        let messageSid: string;
        let additionalSids: { usageGuideSid?: string; usageVideoSid?: string } =
          {};

        if (useSequence) {
          // Send complete message sequence
          const result = await sendCompleteMessageSequence(
            phone,
            trackingNumber,
            courierCompany,
            {
              includeUsageGuide,
              includeUsageVideo,
              delayBetweenMessages,
            }
          );

          messageSid = result.trackingSid;
          additionalSids = {
            usageGuideSid: result.usageGuideSid,
            usageVideoSid: result.usageVideoSid,
          };

          console.log(`✅ Row ${i}: Complete sequence sent:`, {
            tracking: messageSid,
            ...additionalSids,
          });
        } else {
          // Send only tracking message
          messageSid = await sendWhatsAppTemplate(
            phone,
            trackingNumber,
            courierCompany
          );

          console.log(
            `✅ Row ${i}: Tracking message sent with SID: ${messageSid}`
          );
        }

        // Wait 5 seconds for status update on main tracking message
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Check message status for the tracking message
        const status = await getMessageStatusBySid(messageSid);
        const finalStatus = status || "sent";

        console.log(`📊 Row ${i}: Final tracking status: ${finalStatus}`);

        // Update Google Sheets status
        await updateSheetStatusByTracking(
          sheetName,
          spreadsheetId,
          trackingNumber,
          finalStatus
        );

        // Mark as processed
        processed.add(trackingNumber);
        processedCount++;

        if (
          finalStatus === "delivered" ||
          finalStatus === "sent" ||
          finalStatus === "queued"
        ) {
          successCount++;
          console.log(`✅ Row ${i}: Successfully processed ${trackingNumber}`);
        } else {
          failedCount++;
          console.log(
            `❌ Row ${i}: Failed status ${finalStatus} for ${trackingNumber}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Row ${i}: Error processing ${trackingNumber}:`,
          error
        );

        // Update sheet with failed status
        try {
          await updateSheetStatusByTracking(
            sheetName,
            spreadsheetId,
            trackingNumber,
            "failed"
          );
        } catch (sheetError) {
          console.error(
            `❌ Failed to update sheet status for ${trackingNumber}:`,
            sheetError
          );
        }

        processed.add(trackingNumber);
        processedCount++;
        failedCount++;
      }

      // Add delay between customers to avoid rate limiting
      if (i < rows.length - 1) {
        const customerDelay = useSequence ? 60000 : 2000; // 1 minute for sequences, 2 seconds for single messages
        console.log(
          `⏱️ Waiting ${customerDelay / 1000} seconds before next customer...`
        );
        await new Promise((resolve) => setTimeout(resolve, customerDelay));
      }
    }

    // Save processed tracking numbers
    saveProcessed(processed);

    const stats = {
      processedCount,
      successCount,
      failedCount,
      skippedCount,
      totalRows: rows.length - 1,
    };

    console.log(`🎉 Track process completed:`, stats);

    return res.status(200).json({
      success: true,
      message: "Tracking process completed",
      stats,
      options: {
        includeUsageGuide,
        includeUsageVideo,
        delayBetweenMessages,
        useSequence,
      },
    });
  } catch (error) {
    console.error("❌ Track API failed:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Route to test message sequence for a single phone number
trackRouter.post(
  "/track/test-sequence",
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const {
      phone,
      trackingNumber,
      courierCompany,
      includeUsageGuide = true,
      includeUsageVideo = true,
      delayBetweenMessages = 30000,
    } = body;

    if (!phone || !trackingNumber) {
      return res.status(400).json({
        success: false,
        error: "Phone number and tracking number are required",
      });
    }

    try {
      console.log(`🧪 Testing message sequence for ${phone}`);

      const result = await sendCompleteMessageSequence(
        phone,
        trackingNumber,
        courierCompany,
        {
          includeUsageGuide,
          includeUsageVideo,
          delayBetweenMessages,
        }
      );

      return res.json({
        success: true,
        message: "Test message sequence sent successfully",
        result,
      });
    } catch (error) {
      console.error("❌ Test sequence failed:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to send test sequence",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Get tracking statistics
trackRouter.get("/track/stats", async (req: Request, res: Response) => {
  try {
    const { getStats } = await import("../utils/tracker");
    const stats = getStats();

    res.json({
      success: true,
      data: {
        processed_tracking_numbers: stats,
        description:
          "Statistics about processed tracking numbers from local file",
      },
    });
  } catch (error) {
    console.error("❌ Failed to get track stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get statistics",
    });
  }
});

// Clear processed tracking numbers (use with caution)
trackRouter.delete("/track/processed", async (req: Request, res: Response) => {
  try {
    const { clearProcessed } = await import("../utils/tracker");
    clearProcessed();

    res.json({
      success: true,
      message: "Cleared all processed tracking numbers",
    });
  } catch (error) {
    console.error("❌ Failed to clear processed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear processed tracking numbers",
    });
  }
});

export default trackRouter;
