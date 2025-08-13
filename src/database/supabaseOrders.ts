import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Order } from "../types/database";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Message interface for the new messages table
export interface Message {
  id?: number;
  sid: string;
  order_id?: number;
  to_number: string;
  from_number: string;
  message_type?: string;
  message_content?: string;
  template_id?: string;
  latest_status: string;
  status_history?: any[];
  error_code?: string;
  error_message?: string;
  sent_at?: string;
  last_updated?: string;
  created_at?: string;
}

// Conversation interface
export interface Conversation {
  id?: number;
  phone_number: string;
  customer_name?: string;
  last_message_at?: string;
  status?: string;
  assigned_to?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Insert a new order into Supabase
 */
export async function insertOrder(order: Order): Promise<number> {
  const { data, error } = await supabase
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
export async function updateOrderStatus(
  trackingNumber: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("tracking_number", trackingNumber);

  if (error) {
    console.error("❌ Failed to update order status:", error);
    throw error;
  }

  console.log(
    `✅ Updated order status for tracking ${trackingNumber}: ${status}`
  );
}

/**
 * Get order by tracking number
 */
export async function getOrderByTracking(
  trackingNumber: string
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("❌ Failed to get order:", error);
    throw error;
  }

  return data ?? null;
}

/**
 * Get order by phone number (for linking messages to orders)
 */
export async function getOrderByPhoneNumber(
  phoneNumber: string
): Promise<Order | null> {
  const { data, error } = await supabase
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

  return data ?? null;
}

/**
 * Get all orders with pending status
 */
export async function getPendingOrders(): Promise<Order[]> {
  const { data, error } = await supabase
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
export async function bulkInsertOrders(orders: Order[]): Promise<void> {
  console.log(`📦 Bulk inserting ${orders.length} orders...`);
  let successCount = 0;
  let errorCount = 0;

  for (const order of orders) {
    try {
      const existing = await getOrderByTracking(order.tracking_number!);
      if (existing) {
        console.log(
          `⏭️ Order with tracking ${order.tracking_number} already exists, skipping`
        );
        continue;
      }

      await insertOrder(order);
      successCount++;
    } catch (error) {
      console.error(
        `❌ Failed to insert order ${order.tracking_number}:`,
        error
      );
      errorCount++;
    }
  }

  console.log(
    `✅ Bulk insert completed: ${successCount} success, ${errorCount} errors`
  );
}

/**
 * Insert a new message record
 */
export async function insertMessage(message: Message): Promise<number> {
  // Try to link message to an order by phone number
  if (!message.order_id && message.to_number) {
    try {
      const order = await getOrderByPhoneNumber(message.to_number);
      if (order) {
        message.order_id = order.id;
      }
    } catch (error) {
      console.log("Could not link message to order:", error);
    }
  }

  const { data, error } = await supabase
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
export async function updateMessageStatus(
  sid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    // Get current message to append to status history
    const { data: existingMessage, error: selectError } = await supabase
      .from("messages")
      .select("status_history")
      .eq("sid", sid)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("❌ Failed to get existing message:", selectError);
      throw selectError;
    }

    let statusHistory = existingMessage?.status_history || [];

    // Add new status to history
    statusHistory.push({
      status,
      timestamp: new Date().toISOString(),
      error_code: errorCode,
      error_message: errorMessage,
    });

    const updateData: any = {
      latest_status: status,
      status_history: statusHistory,
      last_updated: new Date().toISOString(),
    };

    if (errorCode) updateData.error_code = errorCode;
    if (errorMessage) updateData.error_message = errorMessage;

    const { error: updateError } = await supabase
      .from("messages")
      .update(updateData)
      .eq("sid", sid);

    if (updateError) {
      console.error("❌ Failed to update message status:", updateError);
      throw updateError;
    }

    console.log(`✅ Updated message status for ${sid}: ${status}`);
  } catch (error) {
    console.error("❌ Error in updateMessageStatus:", error);
    throw error;
  }
}

/**
 * Upsert conversation record
 */
export async function upsertConversation(
  phoneNumber: string,
  lastMessageAt?: string
): Promise<void> {
  const { error } = await supabase
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
export async function getMessagesByPhoneNumber(
  phoneNumber: string,
  limit: number = 50
): Promise<Message[]> {
  const { data, error } = await supabase
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
export async function getConversations(
  limit: number = 100
): Promise<Conversation[]> {
  const { data, error } = await supabase
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
export async function getConversationWithLatestMessage(
  phoneNumber: string
): Promise<any> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      *,
      messages!messages_to_number_fkey (
        sid,
        message_content,
        latest_status,
        sent_at
      )
    `
    )
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
export async function updateMessageStatusInDB(
  sid: string,
  status: string,
  to_number: string,
  from_number: string,
  timestamp: string = new Date().toISOString(),
  order_id?: number
): Promise<void> {
  await updateMessageStatus(sid, status);
}

/**
 * Test Supabase connection
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("orders").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Supabase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Supabase connection failed:", error);
    return false;
  }
}
