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
// routes/whatsapp.ts
const express_1 = __importDefault(require("express"));
const supabaseOrders_1 = require("../database/supabaseOrders");
const whatsappOrderBot_1 = require("../whatsappOrderBot");
const whatsappRouter = express_1.default.Router();
// Twilio WhatsApp webhook for incoming messages
whatsappRouter.post("/whatsapp/incoming", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { MessageSid, From, To, Body, ProfileName, WaId, GroupId, GroupName, Timestamp, } = req.body;
    console.log(`📱 Incoming WhatsApp message:`);
    console.log(`   From: ${ProfileName || From}`);
    console.log(`   Group: ${GroupName || "Direct message"}`);
    console.log(`   Message: ${Body}`);
    // Only process messages that look like orders
    const looksLikeOrder = Body &&
        (Body.includes("total：") ||
            Body.includes("汇款人名字：") ||
            /\d+[wfs]/.test(Body));
    if (!looksLikeOrder) {
        console.log(`⏭️ Message doesn't look like an order, skipping`);
        return res.status(200).end();
    }
    try {
        console.log(`🔍 Processing potential order message...`);
        // Extract order information from the message
        const orderData = (0, whatsappOrderBot_1.extractOrderFromMessage)(Body, {
            customerPhone: WaId || From,
            customerName: ProfileName,
            groupName: GroupName,
            messageId: MessageSid,
            timestamp: Timestamp,
        });
        if (!orderData) {
            console.log(`❌ Could not extract valid order from message`);
            return res.status(200).end();
        }
        console.log(`✅ Order extracted successfully!`);
        console.log(`   Customer: ${orderData.customerName}`);
        console.log(`   Products: ${orderData.products
            .map((p) => `${p.quantity}x ${p.name}`)
            .join(", ")}`);
        console.log(`   Total: RM${orderData.totalPaid}`);
        // Insert into Google Sheets
        console.log(`📊 Inserting into Google Sheets...`);
        const result = yield (0, whatsappOrderBot_1.appendOrderToSheet)(orderData);
        if (result.success) {
            console.log(`✅ Order added to Google Sheet at row ${result.rowIndex}!`);
            // Log successful processing in database
            yield (0, supabaseOrders_1.updateMessageStatusInDB)(MessageSid, "processed", To, From, Timestamp || new Date().toISOString(), result.rowIndex);
            // Optionally send confirmation back to WhatsApp
            // You can uncomment this if you want the bot to reply
            // await sendConfirmationMessage(From, orderData, result.rowIndex);
        }
        else {
            console.log(`❌ Failed to add to sheet: ${result.error}`);
            throw new Error(`Sheet insertion failed: ${result.error}`);
        }
        res.status(200).json({
            success: true,
            message: "Order processed successfully",
            rowIndex: result.rowIndex,
        });
    }
    catch (error) {
        console.error("❌ Failed to process WhatsApp order:", error);
        // Log the error in database
        try {
            yield (0, supabaseOrders_1.updateMessageStatusInDB)(MessageSid, "failed", To, From, Timestamp || new Date().toISOString());
        }
        catch (dbError) {
            console.error("❌ Failed to log error to database:", dbError);
        }
        res.status(500).json({
            success: false,
            error: "Failed to process order",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Health check endpoint
whatsappRouter.get("/whatsapp/status", (req, res) => {
    res.json({
        status: "WhatsApp bot is running",
        timestamp: new Date().toISOString(),
    });
});
exports.default = whatsappRouter;
