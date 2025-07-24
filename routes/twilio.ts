import express from "express";
import { updateMessageStatusInDB } from "../database/d1Database";

const twilioRouter = express.Router();

// Twilio webhook for status updates
twilioRouter.post("/twilio/status", async (req, res) => {
  const {
    MessageSid,
    MessageStatus,
    SmsStatus,
    To,
    From,
    Timestamp,
  } = req.body;

  const status = MessageStatus || SmsStatus;

  try {
    await updateMessageStatusInDB(
      MessageSid,
      status,
      To,
      From,
      Timestamp || new Date().toISOString(),
      undefined // Optionally replace with actual order_id if available
    );

    console.log(`✅ Status update: ${MessageSid} → ${status}`);
    res.status(200).end();
  } catch (error) {
    console.error("❌ Failed to update message status:", error);
    res.status(500).json({ error: "Failed to update message status" });
  }
});

export default twilioRouter;
