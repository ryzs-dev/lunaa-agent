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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDailyTrackingScheduler = startDailyTrackingScheduler;
exports.stopDailyTrackingScheduler = stopDailyTrackingScheduler;
exports.runTrackingAutomationNow = runTrackingAutomationNow;
// src/scheduler/trackingScheduler.ts
const node_cron_1 = __importDefault(require("node-cron"));
const googleSheet_1 = require("../googleSheet");
const twilioClient_1 = require("../twilioClient");
const tracker_1 = require("../utils/tracker");
// Malaysia timezone is UTC+8
const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";
/**
 * Schedule daily tracking number automation at 4 PM Malaysia time
 * Cron expression: '0 16 * * *' = At 16:00 (4 PM) every day
 */
function startDailyTrackingScheduler() {
    console.log("🕐 Starting daily tracking scheduler...");
    console.log("📅 Scheduled to run every day at 4:00 PM Malaysia time");
    // Schedule the job to run at 4 PM Malaysia time every day
    node_cron_1.default.schedule("0 16 * * *", () => __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const malaysiaTime = new Date(now.toLocaleString("en-US", { timeZone: MALAYSIA_TIMEZONE }));
        console.log(`\n🚀 Starting daily tracking automation at ${malaysiaTime.toLocaleString()}`);
        console.log("📊 Processing tracking numbers from Google Sheets...");
        try {
            const result = yield runTrackingAutomation();
            console.log("✅ Daily tracking automation completed successfully!");
            console.log(`📊 Results: ${result.processedCount} processed, ${result.successCount} successful, ${result.failedCount} failed`);
            // Log the completion time
            const completionTime = new Date();
            const completionMalaysiaTime = new Date(completionTime.toLocaleString("en-US", {
                timeZone: MALAYSIA_TIMEZONE,
            }));
            console.log(`⏰ Completed at: ${completionMalaysiaTime.toLocaleString()}`);
        }
        catch (error) {
            console.error("❌ Daily tracking automation failed:", error);
            // You could add notification logic here to alert you of failures
            // For example, send yourself a WhatsApp message or email
            yield notifyAdminOfFailure(error);
        }
    }), {
        timezone: MALAYSIA_TIMEZONE,
    });
    console.log("✅ Daily tracking scheduler started successfully");
}
/**
 * Main function that replicates the logic from your /track endpoint
 * This processes the Google Sheet and sends WhatsApp messages
 */
function runTrackingAutomation() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const sheetName = "LUNAA Order form  Test 1"; // Your actual sheet name
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        // Options for the automation
        const options = {
            includeUsageGuide: true,
            includeUsageVideo: false, // Removed usage video
            delayBetweenMessages: 1000, // 1 second between messages
            useSequence: true, // Send complete message sequence
        };
        if (!spreadsheetId) {
            throw new Error("GOOGLE_SHEET_ID environment variable is required");
        }
        console.log(`📋 Starting track process for sheet: ${sheetName}`);
        console.log(`🔧 Options:`, options);
        const rows = yield (0, googleSheet_1.fetchSheetData)(sheetName, spreadsheetId);
        if (rows.length === 0) {
            console.log("No data found in the sheet");
            return {
                processedCount: 0,
                successCount: 0,
                failedCount: 0,
                skippedCount: 0,
            };
        }
        const header = rows[0];
        const phoneCol = header.findIndex((col) => col.toLowerCase().includes("phone"));
        const trackingCol = header.findIndex((col) => col.toLowerCase().includes("tracking number"));
        const courierCol = header.findIndex((col) => col.toLowerCase().includes("couriers company") ||
            col.toLowerCase().includes("courier company"));
        if (phoneCol === -1 || trackingCol === -1) {
            throw new Error("Required columns (phone, tracking number) not found");
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
            if (!phone || !trackingNumber) {
                console.log(`⏭️ Row ${i}: Skipping due to missing phone or tracking number`);
                skippedCount++;
                continue;
            }
            if (processed.has(trackingNumber)) {
                console.log(`⏭️ Row ${i}: Skipping ${trackingNumber} (already processed)`);
                skippedCount++;
                continue;
            }
            try {
                console.log(`📤 Row ${i}: Processing ${phone} with tracking ${trackingNumber}`);
                let messageSid;
                let additionalSids = {};
                if (options.useSequence) {
                    // Send complete message sequence
                    const result = yield (0, twilioClient_1.sendCompleteMessageSequence)(phone, trackingNumber, courierCompany, {
                        includeUsageGuide: options.includeUsageGuide,
                        includeUsageVideo: options.includeUsageVideo,
                        delayBetweenMessages: options.delayBetweenMessages,
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
                    messageSid = yield (0, twilioClient_1.sendWhatsAppTemplate)(phone, trackingNumber, courierCompany);
                    console.log(`✅ Row ${i}: Tracking message sent with SID: ${messageSid}`);
                }
                // Wait 5 seconds for status update on main tracking message
                yield new Promise((resolve) => setTimeout(resolve, 5000));
                // Check message status for the tracking message
                const status = yield (0, twilioClient_1.getMessageStatusBySid)(messageSid);
                const finalStatus = status || "sent";
                console.log(`📊 Row ${i}: Final tracking status: ${finalStatus}`);
                // Update Google Sheets status
                yield (0, googleSheet_1.updateSheetStatusByTracking)(sheetName, spreadsheetId, trackingNumber, finalStatus);
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
                    yield (0, googleSheet_1.updateSheetStatusByTracking)(sheetName, spreadsheetId, trackingNumber, "failed");
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
                const customerDelay = options.useSequence ? 30000 : 2000; // 30 seconds for sequences, 2 seconds for single messages
                console.log(`⏱️ Waiting ${customerDelay / 1000} seconds before next customer...`);
                yield new Promise((resolve) => setTimeout(resolve, customerDelay));
            }
        }
        // Save processed tracking numbers
        (0, tracker_1.saveProcessed)(processed);
        const stats = {
            processedCount,
            successCount,
            failedCount,
            skippedCount,
        };
        console.log(`🎉 Track process completed:`, stats);
        return stats;
    });
}
/**
 * Stop the daily tracking scheduler
 */
function stopDailyTrackingScheduler() {
    node_cron_1.default.getTasks().forEach((task) => task.stop());
    console.log("🛑 Daily tracking scheduler stopped");
}
/**
 * Notify admin of automation failure
 */
function notifyAdminOfFailure(error) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Import your WhatsApp function
            const { sendWhatsAppTextMessage } = yield Promise.resolve().then(() => __importStar(require("../twilioClient")));
            // Send notification to your admin phone number
            const adminPhone = "601126470411"; // Your phone number
            const errorMessage = `🚨 Daily tracking automation failed at ${new Date().toLocaleString()}.\n\nError: ${error instanceof Error ? error.message : String(error)}`;
            yield sendWhatsAppTextMessage(adminPhone, errorMessage);
            console.log("📱 Admin notified of failure");
        }
        catch (notifyError) {
            console.error("❌ Failed to notify admin:", notifyError);
        }
    });
}
/**
 * Manual trigger function for testing
 */
function runTrackingAutomationNow() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🧪 Manually triggering tracking automation...");
        try {
            const result = yield runTrackingAutomation();
            console.log("✅ Manual tracking automation completed!");
            console.log(`📊 Results: ${result.processedCount} processed, ${result.successCount} successful, ${result.failedCount} failed`);
            return result;
        }
        catch (error) {
            console.error("❌ Manual tracking automation failed:", error);
            throw error;
        }
    });
}
