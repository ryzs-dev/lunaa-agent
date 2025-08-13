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
const express_1 = __importDefault(require("express"));
const supabaseOrders_1 = require("../database/supabaseOrders");
const twilioClient_1 = require("../twilioClient");
const inboxRouter = express_1.default.Router();
// Get all conversations for shared inbox
inboxRouter.get("/conversations", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const status = req.query.status;
        console.log(`📋 Fetching conversations (limit: ${limit}${status ? `, status: ${status}` : ""})`);
        let conversations = yield (0, supabaseOrders_1.getConversations)(limit);
        // Filter by status if provided
        if (status) {
            conversations = conversations.filter((conv) => conv.status === status);
        }
        res.json({
            success: true,
            conversations,
            count: conversations.length,
        });
    }
    catch (error) {
        console.error("❌ Failed to get conversations:", error);
        res.status(500).json({
            success: false,
            conversations: [],
            count: 0,
            error: "Failed to get conversations",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Get specific conversation with messages
// Fixed: Use query parameter instead of path parameter for phone numbers
inboxRouter.get("/conversation", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const phoneNumber = req.query.phone;
        const limit = parseInt(req.query.limit) || 50;
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: "Phone number query parameter is required (?phone=+60123456789)",
            });
        }
        console.log(`💬 Fetching conversation for ${phoneNumber} (limit: ${limit})`);
        const conversation = yield (0, supabaseOrders_1.getConversationWithLatestMessage)(phoneNumber);
        const messages = yield (0, supabaseOrders_1.getMessagesByPhoneNumber)(phoneNumber, limit);
        res.json({
            success: true,
            conversation,
            messages,
            messageCount: messages.length,
        });
    }
    catch (error) {
        console.error("❌ Failed to get conversation details:", error);
        res.status(500).json({
            success: false,
            conversation: {},
            messages: [],
            messageCount: 0,
            error: "Failed to get conversation details",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Get messages for a specific phone number
// Fixed: Use query parameter instead of path parameter
inboxRouter.get("/messages", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const phoneNumber = req.query.phone;
        const limit = parseInt(req.query.limit) || 50;
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: "Phone number query parameter is required (?phone=+60123456789)",
            });
        }
        console.log(`📨 Fetching messages for ${phoneNumber} (limit: ${limit})`);
        const messages = yield (0, supabaseOrders_1.getMessagesByPhoneNumber)(phoneNumber, limit);
        res.json({
            success: true,
            messages,
            count: messages.length,
        });
    }
    catch (error) {
        console.error("❌ Failed to get messages:", error);
        res.status(500).json({
            success: false,
            messages: [],
            count: 0,
            error: "Failed to get messages",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Send a new WhatsApp message
inboxRouter.post("/send-message", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { to, message, tracking_number, courier_company } = req.body;
        if (!to) {
            return res.status(400).json({
                success: false,
                error: "Phone number (to) is required",
            });
        }
        console.log(`📤 Sending message to ${to}`);
        let messageSid;
        let messageContent;
        if (tracking_number) {
            // Send tracking template message
            messageSid = yield (0, twilioClient_1.sendWhatsAppTemplate)(to, tracking_number, courier_company);
            messageContent = `Tracking: ${tracking_number}`;
        }
        else if (message) {
            // Send regular text message
            messageSid = yield (0, twilioClient_1.sendWhatsAppTextMessage)(to, message);
            messageContent = message;
        }
        else {
            return res.status(400).json({
                success: false,
                error: "Either 'message' or 'tracking_number' is required",
            });
        }
        // Update conversation
        yield (0, supabaseOrders_1.upsertConversation)(to);
        res.json({
            success: true,
            data: {
                message_sid: messageSid,
                to,
                content: messageContent,
                sent_at: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        console.error("❌ Failed to send message:", error);
        res.status(500).json({
            success: false,
            error: "Failed to send message",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Update conversation details - Fixed: Use query parameter
inboxRouter.patch("/conversation", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const phoneNumber = req.query.phone;
        const updates = req.body;
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: "Phone number query parameter is required (?phone=+60123456789)",
            });
        }
        console.log(`🔄 Updating conversation ${phoneNumber}:`, updates);
        // Import supabase client directly for this update
        const { supabase } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        const { error } = yield supabase
            .from("conversations")
            .update(Object.assign(Object.assign({}, updates), { updated_at: new Date().toISOString() }))
            .eq("phone_number", phoneNumber);
        if (error) {
            throw error;
        }
        res.json({
            success: true,
            data: {
                phone_number: phoneNumber,
                updated_fields: Object.keys(updates),
                updated_at: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        console.error("❌ Failed to update conversation:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update conversation",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Search conversations by customer name or phone number
inboxRouter.get("/search", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 50;
        if (!query) {
            return res.status(400).json({
                success: false,
                error: "Search query (q) is required",
            });
        }
        console.log(`🔍 Searching conversations for: ${query}`);
        const { supabase } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        const { data: conversations, error } = yield supabase
            .from("conversations")
            .select("*")
            .or(`phone_number.ilike.%${query}%,customer_name.ilike.%${query}%`)
            .order("last_message_at", { ascending: false })
            .limit(limit);
        if (error) {
            throw error;
        }
        res.json({
            success: true,
            conversations: conversations || [],
            count: (conversations === null || conversations === void 0 ? void 0 : conversations.length) || 0,
        });
    }
    catch (error) {
        console.error("❌ Failed to search conversations:", error);
        res.status(500).json({
            success: false,
            conversations: [],
            count: 0,
            error: "Failed to search conversations",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Get conversation statistics
inboxRouter.get("/stats", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`📊 Fetching inbox statistics`);
        const { supabase } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        // Get conversation counts by status
        const { data: conversationStats, error: convError } = yield supabase
            .from("conversations")
            .select("status")
            .not("status", "is", null);
        if (convError)
            throw convError;
        // Get message counts by status for last 24 hours
        const { data: messageStats, error: msgError } = yield supabase
            .from("messages")
            .select("latest_status")
            .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        if (msgError)
            throw msgError;
        // Get total orders count
        const { count: ordersCount, error: ordersError } = yield supabase
            .from("orders")
            .select("*", { count: "exact", head: true });
        if (ordersError)
            throw ordersError;
        // Calculate statistics
        const stats = {
            conversations: {
                total: (conversationStats === null || conversationStats === void 0 ? void 0 : conversationStats.length) || 0,
                active: (conversationStats === null || conversationStats === void 0 ? void 0 : conversationStats.filter((c) => c.status === "active").length) || 0,
                archived: (conversationStats === null || conversationStats === void 0 ? void 0 : conversationStats.filter((c) => c.status === "archived").length) || 0,
                blocked: (conversationStats === null || conversationStats === void 0 ? void 0 : conversationStats.filter((c) => c.status === "blocked").length) || 0,
            },
            messages_24h: {
                total: (messageStats === null || messageStats === void 0 ? void 0 : messageStats.length) || 0,
                delivered: (messageStats === null || messageStats === void 0 ? void 0 : messageStats.filter((m) => m.latest_status === "delivered").length) ||
                    0,
                failed: (messageStats === null || messageStats === void 0 ? void 0 : messageStats.filter((m) => m.latest_status === "failed").length) || 0,
                pending: (messageStats === null || messageStats === void 0 ? void 0 : messageStats.filter((m) => ["queued", "sending", "sent"].includes(m.latest_status)).length) || 0,
            },
            orders: {
                total: ordersCount || 0,
            },
            system: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
            },
        };
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        console.error("❌ Failed to get statistics:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get statistics",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
exports.default = inboxRouter;
