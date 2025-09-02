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
const whatsappOrderBot_2 = require("../whatsappOrderBot"); // Make sure this is exported
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const whatsapp_1 = require("../services/whatsapp");
const whatsappRouter = express_1.default.Router();
// Initialize WhatsApp Service
const waService = new whatsapp_1.WhatsAppService();
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
 * Process orders in queue sequentially (MODIFIED)
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
                console.log(`🧾 Extracted Order Data:`, orderData);
                // ✨ DUAL SAVE: Google Sheets + Supabase
                console.log(`📊 Processing order ${queuedOrder.id} to both Google Sheets and Supabase...`);
                let sheetsSuccess = false;
                let supabaseSuccess = false;
                let sheetsResult = null;
                let supabaseResult = null;
                // 1. Save to Google Sheets (existing functionality)
                try {
                    console.log(`📝 Saving to Google Sheets...`);
                    sheetsResult = yield (0, whatsappOrderBot_1.appendOrderToSheet)(orderData);
                    sheetsSuccess = sheetsResult.success;
                    if (sheetsSuccess) {
                        console.log(`✅ Google Sheets: Order saved successfully at row ${sheetsResult.rowIndex}`);
                    }
                    else {
                        console.log(`❌ Google Sheets: Failed to save order`);
                    }
                }
                catch (sheetsError) {
                    console.error(`❌ Google Sheets error for ${queuedOrder.id}:`, sheetsError);
                    sheetsSuccess = false;
                }
                // 2. Save to Supabase (NEW functionality with normalized schema)
                try {
                    console.log(`💾 Saving to Supabase normalized database...`);
                    const supabaseOrderInput = transformOrderForNormalizedSupabase(orderData);
                    const result = yield (0, supabaseNormalized_1.createCompleteOrder)(supabaseOrderInput);
                    supabaseSuccess = true;
                    console.log(`✅ Supabase: Order saved successfully (Order ID: ${result.order.id}, Customer ID: ${result.customer.id})`);
                    supabaseResult = result;
                }
                catch (supabaseError) {
                    console.error(`❌ Supabase error for ${queuedOrder.id}:`, supabaseError);
                    supabaseSuccess = false;
                }
                // Determine overall success
                const overallSuccess = sheetsSuccess || supabaseSuccess;
                if (overallSuccess) {
                    console.log(`✅ Order ${queuedOrder.id} processed successfully:`);
                    console.log(`  📝 Google Sheets: ${sheetsSuccess ? "✅" : "❌"}`);
                    console.log(`  💾 Supabase: ${supabaseSuccess ? "✅" : "❌"}`);
                    // Log success to database message tracking
                    try {
                        yield (0, supabaseOrders_1.updateMessageStatusInDB)(queuedOrder.messageData.MessageSid, "processed", queuedOrder.messageData.To || "", queuedOrder.messageData.From || "", new Date().toISOString());
                    }
                    catch (dbError) {
                        console.warn(`⚠️ Failed to update message status for ${queuedOrder.id}:`, dbError);
                    }
                }
                else {
                    throw new Error(`Both Google Sheets and Supabase failed: Sheets(${(sheetsResult === null || sheetsResult === void 0 ? void 0 : sheetsResult.error) || "unknown"}), Supabase(${(supabaseResult === null || supabaseResult === void 0 ? void 0 : supabaseResult.error) || "unknown"})`);
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
                    // Save failed order to database for manual review using normalized schema
                    try {
                        const failedOrderInput = transformOrderForNormalizedSupabase((0, whatsappOrderBot_1.extractOrderFromMessage)(queuedOrder.messageData.Body, queuedOrder.context) || {});
                        failedOrderInput.status = "failed";
                        failedOrderInput.remark = `Failed after ${MAX_RETRIES} attempts: ${error}`;
                        yield (0, supabaseNormalized_1.createCompleteOrder)(failedOrderInput);
                        console.log(`📝 Saved failed order ${queuedOrder.id} to database for review`);
                    }
                    catch (failedSaveError) {
                        console.error(`💥 Could not even save failed order ${queuedOrder.id}:`, failedSaveError);
                    }
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
/**
 * Convert extracted order data to CreateOrderInput format for normalized schema
 */
function transformOrderForNormalizedSupabase(orderData) {
    // Helper function to get product quantity by name
    const getProductQuantity = (productName) => {
        if (!orderData.products || !Array.isArray(orderData.products))
            return 0;
        const product = orderData.products.find((p) => p.name === productName);
        return product ? product.quantity : 0;
    };
    return {
        // Customer information (FIXED: use correct field names)
        customer_name: orderData.customerName, // ✅ FIXED: was orderData.name
        phone_number: orderData.phoneNumber, // ✅ FIXED: already correct
        fb_name: orderData.fbName, // Add fb_name if available
        customer_type: orderData.isRepeatCustomer ? "repeat" : "new",
        // Order details
        order_date: orderData.orderDate || new Date().toISOString().split("T")[0],
        payment_method: orderData.paymentMethod || "",
        // Product quantities (FIXED: map from products array)
        wash_qty: getProductQuantity("wash"),
        femlift_30ml_qty: getProductQuantity("femlift_30ml"),
        femlift_10ml_qty: getProductQuantity("femlift_10ml"),
        wash_30ml_qty: getProductQuantity("wash_30ml"),
        spray_qty: getProductQuantity("spray"),
        // Pricing (FIXED: use correct field names)
        package_price: orderData.packagePrice || 0,
        postage: orderData.postage || 0,
        total_amount: orderData.totalPaid || orderData.totalAmount || 0, // ✅ FIXED: was totalAmount
        // Address information
        address: orderData.address,
        city: orderData.city,
        postcode: orderData.postcode,
        state: orderData.state,
        // Tracking and fulfillment
        tracking_number: orderData.trackingNumber,
        courier_company: orderData.courierCompany,
        shipment_description: orderData.shipmentDescription,
        // Additional metadata
        remark: orderData.remark,
        agent_name: orderData.agentName,
        currency: orderData.currency || "MYR",
        status: orderData.status || "pending",
        // Source tracking
        source: orderData.groupName
            ? `whatsapp_group_${orderData.groupName}`
            : "whatsapp_direct",
    };
}
// ============================================================================
// WEBHOOK HANDLER (Updated with Queue)( Legacy Twilio format )
// ============================================================================
whatsappRouter.post("/whatsapp/incoming", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { MessageSid, From, To, Body, ProfileName, WaId, GroupId, GroupName, Timestamp, } = req.body;
    res.status(200).end();
    // ============================================================================
    // ENHANCED DEBUG LOGGING
    // ============================================================================
    const messageNumber = Date.now(); // Unique identifier for this message
    console.log(`\n🚨 === MESSAGE ${messageNumber} START ===`);
    console.log(`📱 INCOMING MESSAGE DEBUG`);
    console.log(`MessageSid: ${MessageSid || "MISSING"}`);
    console.log(`Raw From: ${From || "MISSING"}`);
    console.log(`WaId: ${WaId || "MISSING"}`);
    console.log(`ProfileName: ${ProfileName || "MISSING"}`);
    console.log(`Group: ${GroupName || "Direct message"}`);
    console.log(`Body exists: ${!!Body}`);
    console.log(`Body Length: ${(Body === null || Body === void 0 ? void 0 : Body.length) || 0}`);
    if (Body) {
        console.log(`📝 FULL MESSAGE BODY:`);
        console.log(`"${Body}"`);
        console.log(`📝 BODY ANALYSIS:`);
        console.log(`  - Starts with: "${Body.substring(0, 20)}..."`);
        console.log(`  - Contains newlines: ${Body.includes("\n")}`);
        console.log(`  - Number of lines: ${Body.split("\n").length}`);
        console.log(`  - Has numbers: ${/\d/.test(Body)}`);
        console.log(`  - Has letters: ${/[a-zA-Z]/.test(Body)}`);
        // Test specific patterns
        console.log(`📋 PATTERN TESTS:`);
        console.log(`  - Has "total" (any case): ${/total/i.test(Body)}`);
        console.log(`  - Has "name" (any case): ${/name/i.test(Body)}`);
        console.log(`  - Has "contact": ${/contact/i.test(Body)}`);
        console.log(`  - Has product codes: ${/\d+[wfs]/i.test(Body)}`);
        console.log(`  - Starts with date: ${/^\s*\d{1,2}[\/\-\.]\d{1,2}/.test(Body)}`);
    }
    else {
        console.log(`❌ NO BODY CONTENT!`);
    }
    // Test normalization and authorization
    const customerPhone = WaId || From;
    const normalizedPhone = whatsappOrderBot_2.PhoneNumberUtil.normalize(customerPhone);
    const isAuthorized = whatsappOrderBot_2.PhoneNumberUtil.isAuthorized(normalizedPhone);
    console.log(`📞 PHONE ANALYSIS:`);
    console.log(`  Customer Phone: ${customerPhone || "MISSING"}`);
    console.log(`  Normalized Phone: ${normalizedPhone || "MISSING"}`);
    console.log(`  Is Authorized: ${isAuthorized}`);
    console.log(`  Authorized Numbers:`, (0, whatsappOrderBot_1.getAuthorizedPhoneNumbers)());
    // ============================================================================
    // ENHANCED SMART SCORING WITH DETAILED LOGGING
    // ============================================================================
    function smartOrderDetection(Body) {
        if (!Body) {
            console.log(`🧠 === SMART DETECTION FAILED: NO BODY ===`);
            return false;
        }
        let score = 0;
        const text = Body.toLowerCase();
        console.log(`🧠 === SMART ORDER DETECTION START ===`);
        console.log(`🧠 Processing text: "${Body.substring(0, 100)}..."`);
        // 1. Date at start (STRONG indicator) - Score: 3
        const datePattern = /^\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
        if (datePattern.test(Body.trim())) {
            score += 3;
            const match = Body.trim().match(datePattern);
            if (match) {
                console.log(`   ✅ Date at start detected: "${match[0]}" (+3) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No date at start detected`);
        }
        // 2. Total with number (STRONG indicator) - Score: 3
        const totalPattern = /total.{0,10}\d+/i;
        if (totalPattern.test(Body)) {
            score += 3;
            const match = Body.match(totalPattern);
            if (match) {
                console.log(`   ✅ Total with number detected: "${match[0]}" (+3) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No total with number detected`);
        }
        // 3. Name field (MEDIUM indicator) - Score: 2
        const namePattern = /name.{0,10}[a-zA-Z\s\u4e00-\u9fff]{2,}/i;
        if (namePattern.test(Body)) {
            score += 2;
            const match = Body.match(namePattern);
            if (match) {
                console.log(`   ✅ Name field detected: "${match[0]}" (+2) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No name field detected`);
        }
        // 4. Contact with numbers (MEDIUM indicator) - Score: 2
        const contactPattern = /contact.{0,10}[\d\s\-+()]{7,}/i;
        const phonePattern = /\b0\d{8,11}\b/;
        if (contactPattern.test(Body) || phonePattern.test(Body)) {
            score += 2;
            console.log(`   ✅ Contact/Phone detected (+2) - Score: ${score}`);
            if (contactPattern.test(Body)) {
                const match = Body.match(contactPattern);
                if (match) {
                    console.log(`     Contact match: "${match[0]}"`);
                }
            }
            if (phonePattern.test(Body)) {
                const match = Body.match(phonePattern);
                if (match) {
                    console.log(`     Phone match: "${match[0]}"`);
                }
            }
        }
        else {
            console.log(`   ❌ No contact/phone detected`);
        }
        // 5. Address field (MEDIUM indicator) - Score: 2
        const addressPattern = /address.{0,15}[a-zA-Z0-9\s,.\-\u4e00-\u9fff]{8,}/i;
        if (addressPattern.test(Body)) {
            score += 2;
            const match = Body.match(addressPattern);
            if (match) {
                console.log(`   ✅ Address detected: "${match[0].substring(0, 50)}..." (+2) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No address detected`);
        }
        // 6. Product codes (STRONG indicator) - Score: 3
        const productPattern = /\d+[wfs](\d+ml)?/i;
        if (productPattern.test(Body)) {
            score += 3;
            const matches = Body.match(/\d+[wfs](\d+ml)?/gi);
            if (matches) {
                console.log(`   ✅ Product codes detected: ${matches.join(", ")} (+3) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No product codes detected`);
        }
        // 7. Malaysian postcode (WEAK indicator) - Score: 1
        const postcodePattern = /\b\d{5}\b/;
        if (postcodePattern.test(Body)) {
            score += 1;
            const match = Body.match(postcodePattern);
            if (match) {
                console.log(`   ✅ Malaysian postcode detected: "${match[0]}" (+1) - Score: ${score}`);
            }
        }
        else {
            console.log(`   ❌ No postcode detected`);
        }
        // 8. Contains "Order" keyword (MEDIUM indicator) - Score: 2
        if (/order|订单/i.test(Body)) {
            score += 2;
            console.log(`   ✅ Order keyword detected (+2) - Score: ${score}`);
        }
        else {
            console.log(`   ❌ No order keyword detected`);
        }
        // 9. Multi-line structured format (WEAK indicator) - Score: 1
        const lines = Body.split("\n").filter((line) => line.trim().length > 0);
        if (lines.length >= 4) {
            score += 1;
            console.log(`   ✅ Multi-line format (${lines.length} lines) (+1) - Score: ${score}`);
            lines.forEach((line, i) => console.log(`     Line ${i + 1}: "${line}"`));
        }
        else {
            console.log(`   ❌ Not enough lines (${lines.length} lines, need 4+)`);
        }
        // 10. Contains price/money indicators (WEAK indicator) - Score: 1
        if (/rm\s*\d+|\d+\s*ringgit|price|harga/i.test(Body)) {
            score += 1;
            console.log(`   ✅ Price/money indicator detected (+1) - Score: ${score}`);
        }
        else {
            console.log(`   ❌ No price/money indicator detected`);
        }
        console.log(`🧠 === FINAL RESULTS ===`);
        console.log(`🧠 Final Score: ${score}/20 (Need 5+ to qualify as order)`);
        console.log(`🧠 Qualification: ${score >= 5 ? "✅ PASSED" : "❌ FAILED"}`);
        console.log(`🧠 === END SMART DETECTION ===`);
        // Need at least 5 points to be considered an order
        return score >= 5;
    }
    const looksLikeOrder = smartOrderDetection(Body);
    console.log(`📊 FINAL DECISION:`);
    console.log(`  Looks Like Order: ${looksLikeOrder}`);
    console.log(`  Queue Status:`, getQueueStatus());
    console.log(`🚨 === MESSAGE ${messageNumber} END ===\n`);
    if (!looksLikeOrder) {
        console.log(`⏭️ Message ${messageNumber} doesn't look like an order, skipping`);
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
// Meta Cloud API - Send Messages & Fetch Templates
// ============================================================================
whatsappRouter.post("/send", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { to, message, template, mediaUrl } = req.body;
    const { type } = req.query;
    console.log(`\n🚀 /send called with type='${type}' to='${to}'`);
    if (!to || !type) {
        return res.status(400).json({
            success: false,
            error: "Missing 'to' in body or 'type' in query",
        });
    }
    try {
        switch (type) {
            case "text":
                if (!message) {
                    return res
                        .status(400)
                        .json({ success: false, error: "Missing 'message' for text type" });
                }
                console.log(`📤 Sending text message to ${to}`);
                yield waService.sendTextMessage(to, message);
                break;
            case "template":
                if (!template) {
                    return res.status(400).json({
                        success: false,
                        error: "Missing 'template' for template type",
                    });
                }
                console.log(`📤 Sending template message to ${to}`);
                yield waService.sendTemplateMessage(to, template);
                break;
            // If you want to re-enable media later
            // case "media":
            //   if (!mediaUrl) {
            //     return res.status(400).json({ success: false, error: "Missing 'mediaUrl' for media type" });
            //   }
            //   console.log(`📤 Sending media message to ${to}`);
            //   await waService.sendMediaMessage(to, mediaUrl, message || "");
            //   break;
            default:
                return res.status(400).json({
                    success: false,
                    error: `Unsupported type '${type}'`,
                });
        }
        res.json({
            success: true,
            message: `✅ Message sent to ${to} using type '${type}'`,
        });
    }
    catch (error) {
        console.error("❌ Error sending message:", error);
        res.status(500).json({
            success: false,
            error: "Failed to send message",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
whatsappRouter.get("/whatsapp/templates", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield waService.getMessageTemplates();
        res.json({
            success: true,
            templates,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch templates",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
whatsappRouter.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "supersecret"; // set in Meta dashboard
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verified!");
        res.status(200).send(challenge);
    }
    else {
        res.sendStatus(403);
    }
});
whatsappRouter.post("/webhook", (req, res) => {
    var _a;
    const body = req.body;
    console.log("Raw webhook body:", JSON.stringify(body, null, 2));
    if (body.object === "whatsapp_business_account") {
        (_a = body.entry) === null || _a === void 0 ? void 0 : _a.forEach((entry) => {
            var _a;
            (_a = entry.changes) === null || _a === void 0 ? void 0 : _a.forEach((change) => {
                var _a, _b;
                // ✅ Save contacts
                if ((_a = change.value) === null || _a === void 0 ? void 0 : _a.contacts) {
                    change.value.contacts.forEach((contact) => {
                        var _a;
                        const newContact = {
                            waId: contact.wa_id,
                            profileName: ((_a = contact.profile) === null || _a === void 0 ? void 0 : _a.name) || "",
                        };
                        waService.saveContact(newContact);
                        console.log("👤 Saved Contact:", newContact);
                    });
                }
                // ✅ Save messages
                if ((_b = change.value) === null || _b === void 0 ? void 0 : _b.messages) {
                    change.value.messages.forEach((msg) => {
                        var _a;
                        const newMsg = {
                            id: msg.id,
                            from: msg.from, // This ties to contact.waId
                            body: ((_a = msg.text) === null || _a === void 0 ? void 0 : _a.body) || "",
                            type: msg.type,
                            timestamp: msg.timestamp,
                            direction: "inbound",
                        };
                        waService.saveMessage(newMsg);
                        console.log("📥 Saved Message:", newMsg);
                    });
                }
            });
        });
        res.sendStatus(200);
    }
    else {
        res.sendStatus(404);
    }
});
whatsappRouter.get("/whatsapp/messages", (req, res) => {
    const data = waService.getMessages();
    res.json(data);
});
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
