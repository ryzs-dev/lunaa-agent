"use strict";
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
// src/routes/whatsapp.ts - Updated with Order Queue
const express_1 = __importDefault(require("express"));
const supabaseOrders_1 = require("../database/supabaseOrders");
const whatsappOrderBot_1 = require("../whatsappOrderBot");
const whatsappRouter = express_1.default.Router();
const orderQueue = [];
let isProcessing = false;
const MAX_RETRIES = 3;
const PROCESSING_DELAY = 2000; // 2 seconds between orders
const RETRY_DELAY = 5000; // 5 seconds before retry
/**
 * Add order to processing queue
 */
function addToQueue(messageData, context) {
    const queueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const queuedOrder = {
        id: queueId,
        messageData,
        context,
        timestamp: Date.now(),
        retryCount: 0,
    };
    orderQueue.push(queuedOrder);
    console.log(`📥 Added to queue: ${queueId} (Queue size: ${orderQueue.length})`);
    // Start processing if not already running
    if (!isProcessing) {
        processOrderQueue();
    }
    return queueId;
}
/**
 * Process orders in queue sequentially
 */
function processOrderQueue() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const queuedOrder = orderQueue.shift();
            try {
                console.log(`📋 Processing order ${queuedOrder.id} (Attempt ${queuedOrder.retryCount + 1})`);
                // Extract order data
                const orderData = (0, whatsappOrderBot_1.extractOrderFromMessage)(queuedOrder.messageData.Body, queuedOrder.context);
                if (!orderData) {
                    console.log(`❌ Could not extract order from ${queuedOrder.id}`);
                    continue;
                }
                // Process the order
                console.log(`📊 Inserting order ${queuedOrder.id} into Google Sheets...`);
                const result = yield (0, whatsappOrderBot_1.appendOrderToSheet)(orderData);
                if (result.success) {
                    console.log(`✅ Order ${queuedOrder.id} processed successfully at row ${result.rowIndex}`);
                    // Log success to database if you have message tracking
                    try {
                        yield (0, supabaseOrders_1.updateMessageStatusInDB)(queuedOrder.messageData.MessageSid, "processed", queuedOrder.messageData.To || "", queuedOrder.messageData.From || "", new Date().toISOString());
                    }
                    catch (dbError) {
                        console.warn(`⚠️ Failed to update message status for ${queuedOrder.id}:`, dbError);
                    }
                }
                else {
                    throw new Error("Failed to append to sheet");
                }
            }
            catch (error) {
                console.error(`❌ Failed to process order ${queuedOrder.id}:`, error);
                // Retry logic
                if (queuedOrder.retryCount < MAX_RETRIES) {
                    queuedOrder.retryCount++;
                    orderQueue.push(queuedOrder); // Add back to end of queue
                    console.log(`🔄 Added ${queuedOrder.id} back to queue for retry ${queuedOrder.retryCount}/${MAX_RETRIES}`);
                    // Wait before processing retry
                    yield new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
                }
                else {
                    console.error(`💀 Order ${queuedOrder.id} failed after ${MAX_RETRIES} attempts`);
                    // Could save to failed orders table here
                }
            }
            // Delay between processing orders to avoid rate limits
            if (orderQueue.length > 0) {
                console.log(`⏱️ Waiting ${PROCESSING_DELAY / 1000}s before next order...`);
                yield new Promise((resolve) => setTimeout(resolve, PROCESSING_DELAY));
            }
        }
        isProcessing = false;
        console.log("✅ Queue processing completed");
    });
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
whatsappRouter.post("/whatsapp/incoming", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { MessageSid, From, To, Body, ProfileName, WaId, GroupId, GroupName, Timestamp, } = req.body;
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
    console.log(`Body Length: ${Body === null || Body === void 0 ? void 0 : Body.length}`);
    console.log(`Body Preview: ${Body === null || Body === void 0 ? void 0 : Body.substring(0, 200)}...`);
    // Test normalization and authorization
    const customerPhone = WaId || From;
    const normalizedPhone = whatsappOrderBot_1.PhoneNumberUtil.normalize(customerPhone);
    const isAuthorized = whatsappOrderBot_1.PhoneNumberUtil.isAuthorized(normalizedPhone);
    console.log(`Customer Phone: ${customerPhone}`);
    console.log(`Normalized Phone: ${normalizedPhone}`);
    console.log(`Is Authorized: ${isAuthorized}`);
    console.log(`Current Authorized Numbers:`, (0, whatsappOrderBot_1.getAuthorizedPhoneNumbers)());
    // Enhanced order detection with date patterns
    const looksLikeOrder = Body &&
        // Existing patterns
        (Body.includes("total：") ||
            Body.includes("total:") ||
            Body.includes("Total") ||
            Body.includes("汇款人名字：") ||
            Body.includes("Name:") ||
            Body.includes("Contact:") ||
            Body.includes("Address:") ||
            /\d+[wfs]/.test(Body) ||
            // Enhanced patterns
            /Order from WhatsApp/i.test(Body) ||
            /New Customer/i.test(Body) ||
            /Repeat Customer/i.test(Body) ||
            /\d+w\d*f\d*s/i.test(Body) ||
            /\d+ml/i.test(Body) ||
            /rm\s*\d+/i.test(Body) ||
            /total.*?\d+/i.test(Body) ||
            Body.toLowerCase().includes("order") ||
            /\d+.*?rm\s*\d+/i.test(Body) ||
            // Date patterns
            /^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/.test(Body) ||
            /\b\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})\b/.test(Body) ||
            /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}/i.test(Body) ||
            /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(Body) ||
            /\b\d{4}-\d{2}-\d{2}\b/.test(Body) ||
            /order\s+date/i.test(Body));
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
}));
// ============================================================================
// QUEUE MONITORING ENDPOINTS
// ============================================================================
// Get queue status
whatsappRouter.get("/queue/status", (req, res) => {
    res.json(Object.assign({ success: true }, getQueueStatus()));
});
// Manually trigger queue processing (for debugging)
whatsappRouter.post("/queue/process", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (isProcessing) {
            return res.json({
                success: false,
                message: "Queue is already being processed",
            });
        }
        processOrderQueue();
        res.json(Object.assign({ success: true, message: "Queue processing started" }, getQueueStatus()));
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to start queue processing",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Clear queue (for emergency situations)
whatsappRouter.post("/queue/clear", (req, res) => {
    const clearedCount = orderQueue.length;
    orderQueue.length = 0; // Clear array
    res.json({
        success: true,
        message: `Cleared ${clearedCount} orders from queue`,
    });
});
exports.default = whatsappRouter;
