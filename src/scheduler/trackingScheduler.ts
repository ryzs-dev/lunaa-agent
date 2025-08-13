// src/scheduler/trackingScheduler.ts
import cron from "node-cron";
import { fetchSheetData, updateSheetStatusByTracking } from "../googleSheet";
import {
  sendCompleteMessageSequence,
  sendWhatsAppTemplate,
  getMessageStatusBySid,
} from "../twilioClient";
import { getProcessed, saveProcessed } from "../utils/tracker";

// Malaysia timezone is UTC+8
const MALAYSIA_TIMEZONE = "Asia/Kuala_Lumpur";

/**
 * Schedule daily tracking number automation at 4 PM Malaysia time
 * Cron expression: '0 16 * * *' = At 16:00 (4 PM) every day
 */
export function startDailyTrackingScheduler(): void {
  console.log("🕐 Starting daily tracking scheduler...");
  console.log("📅 Scheduled to run every day at 4:00 PM Malaysia time");

  // Schedule the job to run at 4 PM Malaysia time every day
  cron.schedule(
    "0 16 * * *",
    async () => {
      const now = new Date();
      const malaysiaTime = new Date(
        now.toLocaleString("en-US", { timeZone: MALAYSIA_TIMEZONE })
      );

      console.log(
        `\n🚀 Starting daily tracking automation at ${malaysiaTime.toLocaleString()}`
      );
      console.log("📊 Processing tracking numbers from Google Sheets...");

      try {
        const result = await runTrackingAutomation();

        console.log("✅ Daily tracking automation completed successfully!");
        console.log(
          `📊 Results: ${result.processedCount} processed, ${result.successCount} successful, ${result.failedCount} failed`
        );

        // Log the completion time
        const completionTime = new Date();
        const completionMalaysiaTime = new Date(
          completionTime.toLocaleString("en-US", {
            timeZone: MALAYSIA_TIMEZONE,
          })
        );
        console.log(
          `⏰ Completed at: ${completionMalaysiaTime.toLocaleString()}`
        );
      } catch (error) {
        console.error("❌ Daily tracking automation failed:", error);

        // You could add notification logic here to alert you of failures
        // For example, send yourself a WhatsApp message or email
        await notifyAdminOfFailure(error);
      }
    },
    {
      timezone: MALAYSIA_TIMEZONE,
    }
  );

  console.log("✅ Daily tracking scheduler started successfully");
}

/**
 * Main function that replicates the logic from your /track endpoint
 * This processes the Google Sheet and sends WhatsApp messages
 */
async function runTrackingAutomation(): Promise<{
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
}> {
  const sheetName = "Test"; // Your actual sheet name
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

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

  const rows = await fetchSheetData(sheetName, spreadsheetId);

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
    throw new Error("Required columns (phone, tracking number) not found");
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

    if (!phone || !trackingNumber) {
      console.log(
        `⏭️ Row ${i}: Skipping due to missing phone or tracking number`
      );
      skippedCount++;
      continue;
    }

    if (processed.has(trackingNumber)) {
      console.log(
        `⏭️ Row ${i}: Skipping ${trackingNumber} (already processed)`
      );
      skippedCount++;
      continue;
    }

    try {
      console.log(
        `📤 Row ${i}: Processing ${phone} with tracking ${trackingNumber}`
      );

      let messageSid: string;
      let additionalSids: { usageGuideSid?: string; usageVideoSid?: string } =
        {};

      if (options.useSequence) {
        // Send complete message sequence
        const result = await sendCompleteMessageSequence(
          phone,
          trackingNumber,
          courierCompany,
          {
            includeUsageGuide: options.includeUsageGuide,
            includeUsageVideo: options.includeUsageVideo,
            delayBetweenMessages: options.delayBetweenMessages,
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
      console.error(`❌ Row ${i}: Error processing ${trackingNumber}:`, error);

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
      const customerDelay = options.useSequence ? 30000 : 2000; // 30 seconds for sequences, 2 seconds for single messages
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
  };

  console.log(`🎉 Track process completed:`, stats);
  return stats;
}

/**
 * Stop the daily tracking scheduler
 */
export function stopDailyTrackingScheduler(): void {
  cron.getTasks().forEach((task) => task.stop());
  console.log("🛑 Daily tracking scheduler stopped");
}

/**
 * Notify admin of automation failure
 */
async function notifyAdminOfFailure(error: any): Promise<void> {
  try {
    // Import your WhatsApp function
    const { sendWhatsAppTextMessage } = await import("../twilioClient");

    // Send notification to your admin phone number
    const adminPhone = "601126470411"; // Your phone number
    const errorMessage = `🚨 Daily tracking automation failed at ${new Date().toLocaleString()}.\n\nError: ${
      error instanceof Error ? error.message : String(error)
    }`;

    await sendWhatsAppTextMessage(adminPhone, errorMessage);
    console.log("📱 Admin notified of failure");
  } catch (notifyError) {
    console.error("❌ Failed to notify admin:", notifyError);
  }
}

/**
 * Manual trigger function for testing
 */
export async function runTrackingAutomationNow(): Promise<any> {
  console.log("🧪 Manually triggering tracking automation...");

  try {
    const result = await runTrackingAutomation();

    console.log("✅ Manual tracking automation completed!");
    console.log(
      `📊 Results: ${result.processedCount} processed, ${result.successCount} successful, ${result.failedCount} failed`
    );

    return result;
  } catch (error) {
    console.error("❌ Manual tracking automation failed:", error);
    throw error;
  }
}
