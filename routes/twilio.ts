import express from "express";
import {
  updateMessageStatus,
  updateMessageStatusInDB,
} from "../database/supabaseOrders";

const twilioRouter = express.Router();

// Twilio webhook for status updates
twilioRouter.post("/twilio/status", async (req, res) => {
  try {
    // Immediately respond with 200 to acknowledge receipt
    res.status(200).send("OK");

    // Process the webhook data asynchronously
    const {
      MessageSid,
      MessageStatus,
      SmsStatus,
      To,
      From,
      Timestamp,
      ErrorCode,
      ErrorMessage,
    } = req.body;

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
        await updateMessageStatusInDB(
          MessageSid,
          status,
          To || "",
          From || "",
          timestamp
        );
        console.log(`✅ Status updated in DB: ${MessageSid} → ${status}`);
      } catch (dbError) {
        console.error(`❌ Failed to update DB for ${MessageSid}:`, dbError);
      }
    }
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    // Even if processing fails, we still return 200 to prevent retries
    if (!res.headersSent) {
      res.status(200).send("OK");
    }
  }
});

// Health check for webhook
twilioRouter.get("/twilio/status", (req, res) => {
  res.json({
    status: "ok",
    message: "Twilio webhook endpoint is ready",
    timestamp: new Date().toISOString(),
  });
});

// Endpoint to get message history for a phone number (for shared inbox)
twilioRouter.get("/messages/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const { getMessagesByPhoneNumber } = await import(
      "../database/supabaseOrders"
    );
    const messages = await getMessagesByPhoneNumber(phoneNumber, limit);

    res.json({
      success: true,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("❌ Failed to get messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get messages",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Endpoint to get all conversations (for shared inbox listing)
twilioRouter.get("/conversations", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const { getConversations } = await import("../database/supabaseOrders");
    const conversations = await getConversations(limit);

    res.json({
      success: true,
      conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error("❌ Failed to get conversations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversations",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Endpoint to get conversation details with messages
twilioRouter.get("/conversations/:phoneNumber", async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const { getConversationWithLatestMessage, getMessagesByPhoneNumber } =
      await import("../database/supabaseOrders");

    const conversation = await getConversationWithLatestMessage(phoneNumber);
    const messages = await getMessagesByPhoneNumber(phoneNumber, 50);

    res.json({
      success: true,
      conversation,
      messages,
      messageCount: messages.length,
    });
  } catch (error) {
    console.error("❌ Failed to get conversation details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversation details",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default twilioRouter;
