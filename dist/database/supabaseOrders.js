"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.insertOrder = insertOrder;
exports.updateOrderStatus = updateOrderStatus;
exports.getOrderByTracking = getOrderByTracking;
exports.getOrderByPhoneNumber = getOrderByPhoneNumber;
exports.getPendingOrders = getPendingOrders;
exports.bulkInsertOrders = bulkInsertOrders;
exports.insertMessage = insertMessage;
exports.updateMessageStatus = updateMessageStatus;
exports.upsertConversation = upsertConversation;
exports.getMessagesByPhoneNumber = getMessagesByPhoneNumber;
exports.getConversations = getConversations;
exports.getConversationWithLatestMessage = getConversationWithLatestMessage;
exports.updateMessageStatusInDB = updateMessageStatusInDB;
exports.testSupabaseConnection = testSupabaseConnection;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
exports.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
/**
 * Insert a new order into Supabase
 */
async function insertOrder(order) {
    const { data, error } = await exports.supabase
        .from("orders")
        .insert([order])
        .select("id")
        .single();
    if (error) {
        console.error("❌ Failed to insert order:", error);
        throw error;
    }
    return data.id;
}
/**
 * Update order status by tracking number
 */
async function updateOrderStatus(trackingNumber, status) {
    const { error } = await exports.supabase
        .from("orders")
        .update({ status })
        .eq("tracking_number", trackingNumber);
    if (error) {
        console.error("❌ Failed to update order status:", error);
        throw error;
    }
    console.log(`✅ Updated order status for tracking ${trackingNumber}: ${status}`);
}
/**
 * Get order by tracking number
 */
async function getOrderByTracking(trackingNumber) {
    const { data, error } = await exports.supabase
        .from("orders")
        .select("*")
        .eq("tracking_number", trackingNumber)
        .single();
    if (error && error.code !== "PGRST116") {
        console.error("❌ Failed to get order:", error);
        throw error;
    }
    return data !== null && data !== void 0 ? data : null;
}
/**
 * Get order by phone number (for linking messages to orders)
 */
async function getOrderByPhoneNumber(phoneNumber) {
    const { data, error } = await exports.supabase
        .from("orders")
        .select("*")
        .eq("phone_number", phoneNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
    if (error && error.code !== "PGRST116") {
        console.error("❌ Failed to get order by phone:", error);
        throw error;
    }
    return data !== null && data !== void 0 ? data : null;
}
/**
 * Get all orders with pending status
 */
async function getPendingOrders() {
    const { data, error } = await exports.supabase
        .from("orders")
        .select("*")
        .in("status", ["pending", "sent", "queued"])
        .order("created_at", { ascending: false });
    if (error) {
        console.error("❌ Failed to get pending orders:", error);
        throw error;
    }
    return data;
}
/**
 * Bulk insert orders from Google Sheets data
 */
async function bulkInsertOrders(orders) {
    console.log(`📦 Bulk inserting ${orders.length} orders...`);
    let successCount = 0;
    let errorCount = 0;
    for (const order of orders) {
        try {
            const existing = await getOrderByTracking(order.tracking_number);
            if (existing) {
                console.log(`⏭️ Order with tracking ${order.tracking_number} already exists, skipping`);
                continue;
            }
            await insertOrder(order);
            successCount++;
        }
        catch (error) {
            console.error(`❌ Failed to insert order ${order.tracking_number}:`, error);
            errorCount++;
        }
    }
    console.log(`✅ Bulk insert completed: ${successCount} success, ${errorCount} errors`);
}
/**
 * Insert a new message record
 */
async function insertMessage(message) {
    // Try to link message to an order by phone number
    if (!message.order_id && message.to_number) {
        try {
            const order = await getOrderByPhoneNumber(message.to_number);
            if (order) {
                message.order_id = order.id;
            }
        }
        catch (error) {
            console.log("Could not link message to order:", error);
        }
    }
    const { data, error } = await exports.supabase
        .from("messages")
        .insert([message])
        .select("id")
        .single();
    if (error) {
        console.error("❌ Failed to insert message:", error);
        throw error;
    }
    // Update or create conversation
    await upsertConversation(message.to_number, message.sent_at);
    return data.id;
}
/**
 * Update message status with history tracking
 */
async function updateMessageStatus(sid, status, errorCode, errorMessage) {
    try {
        // Get current message to append to status history
        const { data: existingMessage, error: selectError } = await exports.supabase
            .from("messages")
            .select("status_history")
            .eq("sid", sid)
            .single();
        if (selectError && selectError.code !== "PGRST116") {
            console.error("❌ Failed to get existing message:", selectError);
            throw selectError;
        }
        let statusHistory = (existingMessage === null || existingMessage === void 0 ? void 0 : existingMessage.status_history) || [];
        // Add new status to history
        statusHistory.push({
            status,
            timestamp: new Date().toISOString(),
            error_code: errorCode,
            error_message: errorMessage,
        });
        const updateData = {
            latest_status: status,
            status_history: statusHistory,
            last_updated: new Date().toISOString(),
        };
        if (errorCode)
            updateData.error_code = errorCode;
        if (errorMessage)
            updateData.error_message = errorMessage;
        const { error: updateError } = await exports.supabase
            .from("messages")
            .update(updateData)
            .eq("sid", sid);
        if (updateError) {
            console.error("❌ Failed to update message status:", updateError);
            throw updateError;
        }
        console.log(`✅ Updated message status for ${sid}: ${status}`);
    }
    catch (error) {
        console.error("❌ Error in updateMessageStatus:", error);
        throw error;
    }
}
/**
 * Upsert conversation record
 */
async function upsertConversation(phoneNumber, lastMessageAt) {
    const { error } = await exports.supabase
        .from("conversations")
        .upsert({
        phone_number: phoneNumber,
        last_message_at: lastMessageAt || new Date().toISOString(),
    })
        .eq("phone_number", phoneNumber);
    if (error) {
        console.error("❌ Failed to upsert conversation:", error);
        throw error;
    }
}
/**
 * Get messages for a conversation (shared inbox)
 */
async function getMessagesByPhoneNumber(phoneNumber, limit = 50) {
    const { data, error } = await exports.supabase
        .from("messages")
        .select("*")
        .eq("to_number", phoneNumber)
        .order("sent_at", { ascending: false })
        .limit(limit);
    if (error) {
        console.error("❌ Failed to get messages:", error);
        throw error;
    }
    return data || [];
}
/**
 * Get all conversations (for shared inbox listing)
 */
async function getConversations(limit = 100) {
    const { data, error } = await exports.supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(limit);
    if (error) {
        console.error("❌ Failed to get conversations:", error);
        throw error;
    }
    return data || [];
}
/**
 * Get conversation with latest message details
 */
async function getConversationWithLatestMessage(phoneNumber) {
    const { data, error } = await exports.supabase
        .from("conversations")
        .select(`
      *,
      messages!messages_to_number_fkey (
        sid,
        message_content,
        latest_status,
        sent_at
      )
    `)
        .eq("phone_number", phoneNumber)
        .single();
    if (error && error.code !== "PGRST116") {
        console.error("❌ Failed to get conversation with messages:", error);
        throw error;
    }
    return data;
}
/**
 * Legacy function for compatibility
 */
async function updateMessageStatusInDB(sid, status, to_number, from_number, timestamp = new Date().toISOString(), order_id) {
    await updateMessageStatus(sid, status);
}
/**
 * Test Supabase connection
 */
async function testSupabaseConnection() {
    try {
        const { error } = await exports.supabase.from("orders").select("id").limit(1);
        if (error)
            throw error;
        console.log("✅ Supabase connection successful");
        return true;
    }
    catch (error) {
        console.error("❌ Supabase connection failed:", error);
        return false;
    }
}
