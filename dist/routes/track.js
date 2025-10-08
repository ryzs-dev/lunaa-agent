"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const googleSheet_1 = require("../googleSheet");
const twilioClient_1 = require("../twilioClient");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const tracker_1 = require("../utils/tracker");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
const trackRouter = express_1.default.Router();
trackRouter.post("/track", async (req, res) => {
    var _a, _b, _c;
    const sheetName = "Test";
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    // Options from request body with proper defaults
    const body = req.body || {};
    const { includeUsageGuide = true, includeUsageVideo = false, delayBetweenMessages = 5000, // 30 seconds
    useSequence = true, // Whether to send all messages or just tracking
     } = body;
    if (!spreadsheetId) {
        return res
            .status(500)
            .json({ error: "GOOGLE_SHEET_ID environment variable is required" });
    }
    try {
        const rows = await (0, googleSheet_1.fetchSheetData)(sheetName, spreadsheetId);
        if (rows.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No data found in the sheet",
                stats: { processedCount: 0, successCount: 0, failedCount: 0 },
            });
        }
        const header = rows[0];
        const phoneCol = header.findIndex((col) => col.toLowerCase().includes("phone"));
        const trackingCol = header.findIndex((col) => col.toLowerCase().includes("tracking number"));
        const courierCol = header.findIndex((col) => col.toLowerCase().includes("couriers company") ||
            col.toLowerCase().includes("courier company"));
        if (phoneCol === -1 || trackingCol === -1) {
            return res.status(400).json({
                success: false,
                error: "Required columns (phone, tracking number) not found",
            });
        }
        console.log(`📞 Phone column: ${phoneCol}, 📦 Tracking column: ${trackingCol}, 🚚 Courier column: ${courierCol}`);
        const processed = (0, tracker_1.getProcessed)();
        let processedCount = 0;
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        console.log(`📊 Processing ${rows.length - 1} rows...`);
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const phone = (_a = row[phoneCol]) === null || _a === void 0 ? void 0 : _a.toString().trim();
            const trackingNumber = (_b = row[trackingCol]) === null || _b === void 0 ? void 0 : _b.toString().trim();
            const courierCompany = courierCol !== -1 ? (_c = row[courierCol]) === null || _c === void 0 ? void 0 : _c.toString().trim() : undefined;
            // Skip if missing required data or already processed
            if (!phone || !trackingNumber) {
                console.log(`⏭️ Row ${i}: Missing phone (${phone}) or tracking (${trackingNumber})`);
                skippedCount++;
                continue;
            }
            if (processed.has(trackingNumber)) {
                console.log(`⏭️ Row ${i}: Tracking ${trackingNumber} already processed`);
                skippedCount++;
                continue;
            }
            try {
                console.log(`📤 Row ${i}: Processing messages for ${phone} - tracking ${trackingNumber}`);
                let messageSid;
                let additionalSids = {};
                if (useSequence) {
                    // Send complete message sequence
                    const result = await (0, twilioClient_1.sendCompleteMessageSequence)(phone, trackingNumber, courierCompany, {
                        includeUsageGuide,
                        includeUsageVideo,
                        delayBetweenMessages,
                    });
                    messageSid = result.trackingSid;
                    additionalSids = {
                        usageGuideSid: result.usageGuideSid,
                        usageVideoSid: result.usageVideoSid,
                    };
                    console.log(`✅ Row ${i}: Complete sequence sent:`, Object.assign({ tracking: messageSid }, additionalSids));
                }
                else {
                    // Send only tracking message
                    messageSid = await (0, twilioClient_1.sendWhatsAppTemplate)(phone, trackingNumber, courierCompany);
                    console.log(`✅ Row ${i}: Tracking message sent with SID: ${messageSid}`);
                }
                // Wait 5 seconds for status update on main tracking message
                await new Promise((resolve) => setTimeout(resolve, 5000));
                // Check message status for the tracking message
                const status = await (0, twilioClient_1.getMessageStatusBySid)(messageSid);
                const finalStatus = status || "sent";
                console.log(`📊 Row ${i}: Final tracking status: ${finalStatus}`);
                // Update Google Sheets status
                await (0, googleSheet_1.updateSheetStatusByTracking)(sheetName, spreadsheetId, trackingNumber, finalStatus);
                // Mark as processed
                processed.add(trackingNumber);
                processedCount++;
                if (finalStatus === "delivered" ||
                    finalStatus === "sent" ||
                    finalStatus === "queued") {
                    successCount++;
                    console.log(`✅ Row ${i}: Successfully processed ${trackingNumber}`);
                }
                else {
                    failedCount++;
                    console.log(`❌ Row ${i}: Failed status ${finalStatus} for ${trackingNumber}`);
                }
            }
            catch (error) {
                console.error(`❌ Row ${i}: Error processing ${trackingNumber}:`, error);
                // Update sheet with failed status
                try {
                    await (0, googleSheet_1.updateSheetStatusByTracking)(sheetName, spreadsheetId, trackingNumber, "failed");
                }
                catch (sheetError) {
                    console.error(`❌ Failed to update sheet status for ${trackingNumber}:`, sheetError);
                }
                processed.add(trackingNumber);
                processedCount++;
                failedCount++;
            }
            // Add delay between customers to avoid rate limiting
            if (i < rows.length - 1) {
                const customerDelay = useSequence ? 60000 : 2000; // 1 minute for sequences, 2 seconds for single messages
                console.log(`⏱️ Waiting ${customerDelay / 1000} seconds before next customer...`);
                await new Promise((resolve) => setTimeout(resolve, customerDelay));
            }
        }
        // Save processed tracking numbers
        (0, tracker_1.saveProcessed)(processed);
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
    }
    catch (error) {
        console.error("❌ Track API failed:", error);
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// Route to test message sequence for a single phone number
trackRouter.post("/track/test-sequence", async (req, res) => {
    const body = req.body || {};
    const { phone, trackingNumber, courierCompany, includeUsageGuide = true, includeUsageVideo = true, delayBetweenMessages = 30000, } = body;
    if (!phone || !trackingNumber) {
        return res.status(400).json({
            success: false,
            error: "Phone number and tracking number are required",
        });
    }
    try {
        console.log(`🧪 Testing message sequence for ${phone}`);
        const result = await (0, twilioClient_1.sendCompleteMessageSequence)(phone, trackingNumber, courierCompany, {
            includeUsageGuide,
            includeUsageVideo,
            delayBetweenMessages,
        });
        return res.json({
            success: true,
            message: "Test message sequence sent successfully",
            result,
        });
    }
    catch (error) {
        console.error("❌ Test sequence failed:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to send test sequence",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// Get tracking statistics
trackRouter.get("/track/stats", async (req, res) => {
    try {
        const { getStats } = await Promise.resolve().then(() => __importStar(require("../utils/tracker")));
        const stats = getStats();
        res.json({
            success: true,
            data: {
                processed_tracking_numbers: stats,
                description: "Statistics about processed tracking numbers from local file",
            },
        });
    }
    catch (error) {
        console.error("❌ Failed to get track stats:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get statistics",
        });
    }
});
// Clear processed tracking numbers (use with caution)
trackRouter.delete("/track/processed", async (req, res) => {
    try {
        const { clearProcessed } = await Promise.resolve().then(() => __importStar(require("../utils/tracker")));
        clearProcessed();
        res.json({
            success: true,
            message: "Cleared all processed tracking numbers",
        });
    }
    catch (error) {
        console.error("❌ Failed to clear processed:", error);
        res.status(500).json({
            success: false,
            error: "Failed to clear processed tracking numbers",
        });
    }
});
exports.default = trackRouter;
