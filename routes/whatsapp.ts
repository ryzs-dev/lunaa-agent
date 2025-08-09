// routes/whatsapp.ts
import express from "express";
import {
  appendOrderToSheet,
  extractOrderFromMessage,
} from "../src/whatsappOrderBot";
import { updateMessageStatusInDB } from "../database/supabaseOrders";

const whatsappRouter = express.Router();

// Twilio WhatsApp webhook for incoming messages
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

  console.log(`📱 Incoming WhatsApp message:`);
  console.log(`   From: ${ProfileName || From}`);
  console.log(`   Group: ${GroupName || "Direct message"}`);
  console.log(`   Message: ${Body}`);

  // Only process messages that look like orders
  const looksLikeOrder =
    Body &&
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
    const orderData = extractOrderFromMessage(Body, {
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
    console.log(
      `   Products: ${orderData.products
        .map((p) => `${p.quantity}x ${p.name}`)
        .join(", ")}`
    );
    console.log(`   Total: RM${orderData.totalPaid}`);

    // Insert into Google Sheets
    console.log(`📊 Inserting into Google Sheets...`);
    const result = await appendOrderToSheet(orderData);

    if (result.success) {
      console.log(`✅ Order added to Google Sheet at row ${result.rowIndex}!`);

      // Log successful processing in database
      await updateMessageStatusInDB(
        MessageSid,
        "processed",
        To,
        From,
        Timestamp || new Date().toISOString(),
        result.rowIndex
      );

      // Optionally send confirmation back to WhatsApp
      // You can uncomment this if you want the bot to reply
      // await sendConfirmationMessage(From, orderData, result.rowIndex);
    } else {
      console.log(`❌ Failed to add to sheet: ${result.error}`);
      throw new Error(`Sheet insertion failed: ${result.error}`);
    }

    res.status(200).json({
      success: true,
      message: "Order processed successfully",
      rowIndex: result.rowIndex,
    });
  } catch (error) {
    console.error("❌ Failed to process WhatsApp order:", error);

    // Log the error in database
    try {
      await updateMessageStatusInDB(
        MessageSid,
        "failed",
        To,
        From,
        Timestamp || new Date().toISOString()
      );
    } catch (dbError) {
      console.error("❌ Failed to log error to database:", dbError);
    }

    res.status(500).json({
      success: false,
      error: "Failed to process order",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Health check endpoint
whatsappRouter.get("/whatsapp/status", (req, res) => {
  res.json({
    status: "WhatsApp bot is running",
    timestamp: new Date().toISOString(),
  });
});

export default whatsappRouter;
