import express from "express";
import path from "path";
import dotenv from "dotenv";
import {
  syncNewOrdersOnly,
  syncSheetsToD1,
  validateSheetStructure,
} from "../sheets-db/sync";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const syncRouter = express.Router();

syncRouter.post("/", async (req, res) => {
  const sheetName = req.body?.sheetName || "Test";

  try {
    console.log(`📦 Starting sync for sheet: ${sheetName}`);

    await syncNewOrdersOnly(sheetName);

    res.json({
      success: true,
      message: `✅ Successfully synced new orders from sheet: ${sheetName}`,
    });
  } catch (error) {
    console.error("❌ Sync failed:", error);
    res.status(500).json({
      success: false,
      error: "Sync failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

syncRouter.post("/full-sync", async (req, res) => {
  const sheetName = req.body?.sheetName || "Test";

  try {
    console.log(`📦 Starting sync for sheet: ${sheetName}`);

    await syncSheetsToD1(sheetName);

    res.json({
      success: true,
      message: `✅ Successfully synced new orders from sheet: ${sheetName}`,
    });
  } catch (error) {
    console.error("❌ Sync failed:", error);
    res.status(500).json({
      success: false,
      error: "Sync failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Optionally add structure validation route
syncRouter.get("/validate-sheet", async (req, res) => {
  const sheetName = req.query?.sheetName?.toString() || "Test";

  try {
    const isValid = await validateSheetStructure(sheetName);
    res.json({ success: isValid });
  } catch (error) {
    console.error("❌ Sheet validation failed:", error);
    res.status(500).json({
      success: false,
      error: "Validation failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default syncRouter;
