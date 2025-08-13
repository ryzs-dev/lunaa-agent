import express from "express";
import {
  getConversations,
  getMessagesByPhoneNumber,
  getConversationWithLatestMessage,
  upsertConversation,
} from "../database/supabaseOrders";
import { sendWhatsAppTemplate, sendWhatsAppTextMessage } from "../twilioClient";

const inboxRouter = express.Router();

// Get all conversations for shared inbox
inboxRouter.get("/conversations", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const status = req.query.status as string;

    console.log(
      `📋 Fetching conversations (limit: ${limit}${
        status ? `, status: ${status}` : ""
      })`
    );

    let conversations = await getConversations(limit);

    // Filter by status if provided
    if (status) {
      conversations = conversations.filter((conv) => conv.status === status);
    }

    res.json({
      success: true,
      conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error("❌ Failed to get conversations:", error);
    res.status(500).json({
      success: false,
      conversations: [],
      count: 0,
      error: "Failed to get conversations",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get specific conversation with messages
// Fixed: Use query parameter instead of path parameter for phone numbers
inboxRouter.get("/conversation", async (req, res) => {
  try {
    const phoneNumber = req.query.phone as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Phone number query parameter is required (?phone=+60123456789)",
      });
    }

    console.log(
      `💬 Fetching conversation for ${phoneNumber} (limit: ${limit})`
    );

    const conversation = await getConversationWithLatestMessage(phoneNumber);
    const messages = await getMessagesByPhoneNumber(phoneNumber, limit);

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
      conversation: {},
      messages: [],
      messageCount: 0,
      error: "Failed to get conversation details",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get messages for a specific phone number
// Fixed: Use query parameter instead of path parameter
inboxRouter.get("/messages", async (req, res) => {
  try {
    const phoneNumber = req.query.phone as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Phone number query parameter is required (?phone=+60123456789)",
      });
    }

    console.log(`📨 Fetching messages for ${phoneNumber} (limit: ${limit})`);

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
      messages: [],
      count: 0,
      error: "Failed to get messages",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Send a new WhatsApp message
inboxRouter.post("/send-message", async (req, res) => {
  try {
    const { to, message, tracking_number, courier_company } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: "Phone number (to) is required",
      });
    }

    console.log(`📤 Sending message to ${to}`);

    let messageSid: string;
    let messageContent: string;

    if (tracking_number) {
      // Send tracking template message
      messageSid = await sendWhatsAppTemplate(
        to,
        tracking_number,
        courier_company
      );
      messageContent = `Tracking: ${tracking_number}`;
    } else if (message) {
      // Send regular text message
      messageSid = await sendWhatsAppTextMessage(to, message);
      messageContent = message;
    } else {
      return res.status(400).json({
        success: false,
        error: "Either 'message' or 'tracking_number' is required",
      });
    }

    // Update conversation
    await upsertConversation(to);

    res.json({
      success: true,
      data: {
        message_sid: messageSid,
        to,
        content: messageContent,
        sent_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("❌ Failed to send message:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send message",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Update conversation details - Fixed: Use query parameter
inboxRouter.patch("/conversation", async (req, res) => {
  try {
    const phoneNumber = req.query.phone as string;
    const updates = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Phone number query parameter is required (?phone=+60123456789)",
      });
    }

    console.log(`🔄 Updating conversation ${phoneNumber}:`, updates);

    // Import supabase client directly for this update
    const { supabase } = await import("../database/supabaseOrders");

    const { error } = await supabase
      .from("conversations")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
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
  } catch (error) {
    console.error("❌ Failed to update conversation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update conversation",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Search conversations by customer name or phone number
inboxRouter.get("/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query (q) is required",
      });
    }

    console.log(`🔍 Searching conversations for: ${query}`);

    const { supabase } = await import("../database/supabaseOrders");

    const { data: conversations, error } = await supabase
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
      count: conversations?.length || 0,
    });
  } catch (error) {
    console.error("❌ Failed to search conversations:", error);
    res.status(500).json({
      success: false,
      conversations: [],
      count: 0,
      error: "Failed to search conversations",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get conversation statistics
inboxRouter.get("/stats", async (req, res) => {
  try {
    console.log(`📊 Fetching inbox statistics`);

    const { supabase } = await import("../database/supabaseOrders");

    // Get conversation counts by status
    const { data: conversationStats, error: convError } = await supabase
      .from("conversations")
      .select("status")
      .not("status", "is", null);

    if (convError) throw convError;

    // Get message counts by status for last 24 hours
    const { data: messageStats, error: msgError } = await supabase
      .from("messages")
      .select("latest_status")
      .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (msgError) throw msgError;

    // Get total orders count
    const { count: ordersCount, error: ordersError } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    if (ordersError) throw ordersError;

    // Calculate statistics
    const stats = {
      conversations: {
        total: conversationStats?.length || 0,
        active:
          conversationStats?.filter((c) => c.status === "active").length || 0,
        archived:
          conversationStats?.filter((c) => c.status === "archived").length || 0,
        blocked:
          conversationStats?.filter((c) => c.status === "blocked").length || 0,
      },
      messages_24h: {
        total: messageStats?.length || 0,
        delivered:
          messageStats?.filter((m) => m.latest_status === "delivered").length ||
          0,
        failed:
          messageStats?.filter((m) => m.latest_status === "failed").length || 0,
        pending:
          messageStats?.filter((m) =>
            ["queued", "sending", "sent"].includes(m.latest_status)
          ).length || 0,
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
  } catch (error) {
    console.error("❌ Failed to get statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get statistics",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default inboxRouter;
