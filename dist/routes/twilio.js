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
const twilioRouter = express_1.default.Router();
// Twilio webhook for status updates
twilioRouter.post("/twilio/status", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Immediately respond with 200 to acknowledge receipt
        res.status(200).send("OK");
        // Process the webhook data asynchronously
        const { MessageSid, MessageStatus, SmsStatus, To, From, Timestamp, ErrorCode, ErrorMessage, } = req.body;
        const status = MessageStatus || SmsStatus || "unknown";
        const timestamp = Timestamp || new Date().toISOString();
        console.log(`📥 Webhook received:`, {
            sid: MessageSid,
            status: status,
            to: To,
            from: From,
            timestamp: timestamp,
            errorCode: ErrorCode,
            errorMessage: ErrorMessage,
        });
        // Save to database asynchronously
        if (MessageSid) {
            try {
                yield (0, supabaseOrders_1.updateMessageStatusInDB)(MessageSid, status, To || "", From || "", timestamp);
                console.log(`✅ Status updated in DB: ${MessageSid} → ${status}`);
            }
            catch (dbError) {
                console.error(`❌ Failed to update DB for ${MessageSid}:`, dbError);
            }
        }
    }
    catch (error) {
        console.error("❌ Webhook processing error:", error);
        // Even if processing fails, we still return 200 to prevent retries
        if (!res.headersSent) {
            res.status(200).send("OK");
        }
    }
}));
// Health check for webhook
twilioRouter.get("/twilio/status", (req, res) => {
    res.json({
        status: "ok",
        message: "Twilio webhook endpoint is ready",
        timestamp: new Date().toISOString(),
    });
});
// Endpoint to get message history for a phone number (for shared inbox)
twilioRouter.get("/messages/:phoneNumber", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phoneNumber } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const { getMessagesByPhoneNumber } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        const messages = yield getMessagesByPhoneNumber(phoneNumber, limit);
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
            error: "Failed to get messages",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Endpoint to get all conversations (for shared inbox listing)
twilioRouter.get("/conversations", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const { getConversations } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        const conversations = yield getConversations(limit);
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
            error: "Failed to get conversations",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Endpoint to get conversation details with messages
twilioRouter.get("/conversations/:phoneNumber", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phoneNumber } = req.params;
        const { getConversationWithLatestMessage, getMessagesByPhoneNumber } = yield Promise.resolve().then(() => __importStar(require("../database/supabaseOrders")));
        const conversation = yield getConversationWithLatestMessage(phoneNumber);
        const messages = yield getMessagesByPhoneNumber(phoneNumber, 50);
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
            error: "Failed to get conversation details",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
exports.default = twilioRouter;
