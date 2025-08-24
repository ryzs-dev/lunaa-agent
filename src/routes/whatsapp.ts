// src/routes/whatsapp.ts - Updated with Order Queue
import express from "express";
import { updateMessageStatusInDB } from "../database/supabaseOrders";
import {
  appendOrderToSheet,
  extractOrderFromMessage,
  getAuthorizedPhoneNumbers,
} from "../whatsappOrderBot";
import { PhoneNumberUtil } from "../whatsappOrderBot"; // Make sure this is exported

const whatsappRouter = express.Router();

// ============================================================================
// ORDER QUEUE SYSTEM
// ============================================================================

interface QueuedOrder {
  id: string;
  messageData: any;
  context: any;
  timestamp: number;
  retryCount: number;
}

const orderQueue: QueuedOrder[] = [];
let isProcessing = false;
const MAX_RETRIES = 3;
const PROCESSING_DELAY = 2000; // 2 seconds between orders
const RETRY_DELAY = 5000; // 5 seconds before retry

/**
 * Add order to processing queue
 */
function addToQueue(messageData: any, context: any): string {
  const queueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const queuedOrder: QueuedOrder = {
    id: queueId,
    messageData,
    context,
    timestamp: Date.now(),
    retryCount: 0,
  };

  orderQueue.push(queuedOrder);
  console.log(
    `📥 Added to queue: ${queueId} (Queue size: ${orderQueue.length})`
  );

  // Start processing if not already running
  if (!isProcessing) {
    processOrderQueue();
  }

  return queueId;
}

/**
 * Process orders in queue sequentially
 */
async function processOrderQueue(): Promise<void> {
  if (isProcessing) {
    console.log("⏸️ Queue processing already running");
    return;
  }

  if (orderQueue.length === 0) {
    console.log("✅ Queue is empty");
    return;
  }

  isProcessing = true;
  console.log(`🔄 Starting queue processing (${orderQueue.length} orders)`);

  while (orderQueue.length > 0) {
    const queuedOrder = orderQueue.shift()!;

    try {
      console.log(
        `📋 Processing order ${queuedOrder.id} (Attempt ${
          queuedOrder.retryCount + 1
        })`
      );

      // Extract order data
      const orderData = extractOrderFromMessage(
        queuedOrder.messageData.Body,
        queuedOrder.context
      );

      if (!orderData) {
        console.log(`❌ Could not extract order from ${queuedOrder.id}`);
        continue;
      }

      // Process the order
      console.log(`📊 Inserting order ${queuedOrder.id} into Google Sheets...`);
      const result = await appendOrderToSheet(orderData);

      if (result.success) {
        console.log(
          `✅ Order ${queuedOrder.id} processed successfully at row ${result.rowIndex}`
        );

        // Log success to database if you have message tracking
        try {
          await updateMessageStatusInDB(
            queuedOrder.messageData.MessageSid,
            "processed",
            queuedOrder.messageData.To || "",
            queuedOrder.messageData.From || "",
            new Date().toISOString()
          );
        } catch (dbError) {
          console.warn(
            `⚠️ Failed to update message status for ${queuedOrder.id}:`,
            dbError
          );
        }
      } else {
        throw new Error("Failed to append to sheet");
      }
    } catch (error) {
      console.error(`❌ Failed to process order ${queuedOrder.id}:`, error);

      // Retry logic
      if (queuedOrder.retryCount < MAX_RETRIES) {
        queuedOrder.retryCount++;
        orderQueue.push(queuedOrder); // Add back to end of queue
        console.log(
          `🔄 Added ${queuedOrder.id} back to queue for retry ${queuedOrder.retryCount}/${MAX_RETRIES}`
        );

        // Wait before processing retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error(
          `💀 Order ${queuedOrder.id} failed after ${MAX_RETRIES} attempts`
        );
        // Could save to failed orders table here
      }
    }

    // Delay between processing orders to avoid rate limits
    if (orderQueue.length > 0) {
      console.log(
        `⏱️ Waiting ${PROCESSING_DELAY / 1000}s before next order...`
      );
      await new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY));
    }
  }

  isProcessing = false;
  console.log("✅ Queue processing completed");
}

/**
 * Get queue status (for monitoring)
 */
function getQueueStatus() {
  return {
    queueLength: orderQueue.length,
    isProcessing,
    oldestOrder: orderQueue.length > 0 ? orderQueue[0].timestamp : null,
    queuedOrders: orderQueue.map((order) => ({
      id: order.id,
      timestamp: order.timestamp,
      retryCount: order.retryCount,
      customerPhone: order.context.customerPhone,
    })),
  };
}

// ============================================================================
// WEBHOOK HANDLER (Updated with Queue)
// ============================================================================

whatsappRouter.post("/whatsapp/incoming", async (req, res) => {
  const {
    MessageSid,
    From,
    To,
    Body,
    ProfileName,
    WaId,
    GroupId,
    GroupName,
    Timestamp,
  } = req.body;

  // Immediately respond to Twilio to avoid timeout
  res.status(200).json({
    success: true,
    message: "Message received and queued for processing",
  });

  console.log(`📱 === INCOMING MESSAGE DEBUG ===`);
  console.log(`MessageSid: ${MessageSid}`);
  console.log(`Raw From: ${From}`);
  console.log(`WaId: ${WaId}`);
  console.log(`ProfileName: ${ProfileName}`);
  console.log(`Group: ${GroupName || "Direct message"}`);
  console.log(`Body Length: ${Body?.length}`);
  console.log(`Body Preview: ${Body?.substring(0, 200)}...`);

  // Test normalization and authorization
  const customerPhone = WaId || From;
  const normalizedPhone = PhoneNumberUtil.normalize(customerPhone);
  const isAuthorized = PhoneNumberUtil.isAuthorized(normalizedPhone);

  console.log(`Customer Phone: ${customerPhone}`);
  console.log(`Normalized Phone: ${normalizedPhone}`);
  console.log(`Is Authorized: ${isAuthorized}`);
  console.log(`Current Authorized Numbers:`, getAuthorizedPhoneNumbers());

  // Smart Scoring Order Detection
  function smartOrderDetection(Body: string) {
    if (!Body) return false;

    let score = 0;
    const text = Body.toLowerCase();

    console.log(`🧠 === SMART ORDER DETECTION ===`);

    // 1. Date at start (STRONG indicator) - Score: 3
    if (/^\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(Body.trim())) {
      score += 3;
      console.log(`   ✅ Date at start detected (+3) - Score: ${score}`);
    }

    // 2. Total with number (STRONG indicator) - Score: 3
    if (/total.{0,10}\d+/i.test(Body)) {
      score += 3;
      console.log(`   ✅ Total with number detected (+3) - Score: ${score}`);
    }

    // 3. Name field (MEDIUM indicator) - Score: 2
    if (/name.{0,10}[a-zA-Z\s]{2,}/i.test(Body)) {
      score += 2;
      console.log(`   ✅ Name field detected (+2) - Score: ${score}`);
    }

    // 4. Contact with numbers (MEDIUM indicator) - Score: 2
    if (
      /contact.{0,10}[\d\s\-+()]{7,}/i.test(Body) ||
      /\b0\d{8,11}\b/.test(Body)
    ) {
      score += 2;
      console.log(`   ✅ Contact/Phone detected (+2) - Score: ${score}`);
    }

    // 5. Address field (MEDIUM indicator) - Score: 2
    if (/address.{0,15}[a-zA-Z0-9\s,.\-]{8,}/i.test(Body)) {
      score += 2;
      console.log(`   ✅ Address detected (+2) - Score: ${score}`);
    }

    // 6. Product codes (STRONG indicator) - Score: 3
    if (/\d+[wfs](\d+ml)?/i.test(Body)) {
      score += 3;
      console.log(`   ✅ Product codes detected (+3) - Score: ${score}`);
    }

    // 7. Malaysian postcode (WEAK indicator) - Score: 1
    if (/\b\d{5}\b/.test(Body)) {
      score += 1;
      console.log(`   ✅ Malaysian postcode detected (+1) - Score: ${score}`);
    }

    // 8. Contains "Order" keyword (MEDIUM indicator) - Score: 2
    if (/order|订单/i.test(Body)) {
      score += 2;
      console.log(`   ✅ Order keyword detected (+2) - Score: ${score}`);
    }

    // 9. Multi-line structured format (WEAK indicator) - Score: 1
    const lines = Body.split("\n").filter(
      (line: string) => line.trim().length > 0
    );
    if (lines.length >= 4) {
      score += 1;
      console.log(
        `   ✅ Multi-line format (${lines.length} lines) (+1) - Score: ${score}`
      );
    }

    // 10. Contains price/money indicators (WEAK indicator) - Score: 1
    if (/rm\s*\d+|\d+\s*ringgit|price|harga/i.test(Body)) {
      score += 1;
      console.log(
        `   ✅ Price/money indicator detected (+1) - Score: ${score}`
      );
    }

    console.log(`🧠 Final Score: ${score}/20 (Need 5+ to qualify as order)`);
    console.log(`🧠 === END SMART DETECTION ===`);

    // Need at least 5 points to be considered an order
    return score >= 5;
  }

  // Use the smart scoring instead of the old logic
  const looksLikeOrder = smartOrderDetection(Body);

  console.log(`Looks Like Order: ${looksLikeOrder}`);
  console.log(`Queue Status:`, getQueueStatus());
  console.log(`=== END DEBUG ===`);

  if (!looksLikeOrder) {
    console.log(`⏭️ Message doesn't look like an order, skipping`);
    return;
  }

  // Create context for order processing
  const context = {
    customerPhone: customerPhone,
    customerName: ProfileName,
    groupName: GroupName,
    messageId: MessageSid,
    timestamp: Timestamp,
  };

  // Add to queue instead of processing immediately
  const queueId = addToQueue(req.body, context);

  console.log(`📥 Order message queued with ID: ${queueId}`);
});

// ============================================================================
// QUEUE MONITORING ENDPOINTS
// ============================================================================

// Get queue status
whatsappRouter.get("/queue/status", (req, res) => {
  res.json({
    success: true,
    ...getQueueStatus(),
  });
});

// Manually trigger queue processing (for debugging)
whatsappRouter.post("/queue/process", async (req, res) => {
  try {
    if (isProcessing) {
      return res.json({
        success: false,
        message: "Queue is already being processed",
      });
    }

    processOrderQueue();

    res.json({
      success: true,
      message: "Queue processing started",
      ...getQueueStatus(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to start queue processing",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Clear queue (for emergency situations)
whatsappRouter.post("/queue/clear", (req, res) => {
  const clearedCount = orderQueue.length;
  orderQueue.length = 0; // Clear array

  res.json({
    success: true,
    message: `Cleared ${clearedCount} orders from queue`,
  });
});

export default whatsappRouter;
