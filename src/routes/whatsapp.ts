// src/routes/whatsapp.ts - Updated with Order Queue
import express from "express";
import { updateMessageStatusInDB } from "../database/supabaseOrders";
import {
  appendOrderToSheet,
  extractOrderFromMessage,
  getAuthorizedPhoneNumbers,
  PhoneNumberUtil,
} from "../whatsappOrderBot";

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

  // Enhanced order detection with date patterns
  function normalizeText(text: string) {
    return text
      .replace(/：/g, ":") // Chinese colon → regular colon
      .replace(/。/g, ".") // Chinese period → regular period
      .replace(/\s*:\s*/g, ": ") // Fix spacing around colons
      .toLowerCase()
      .trim();
  }

  const looksLikeOrder = (Body: string) => {
    const normalized = normalizeText(Body);
    return (
      normalized.includes("total: ") ||
      normalized.includes("name: ") ||
      normalized.includes("contact: ") ||
      /\d+[wfs]/.test(normalized)
    );
  };

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
