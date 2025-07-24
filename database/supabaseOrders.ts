import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Order } from "../types/database";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
 * Get orders that need tracking updates
 */
export async function getOrdersNeedingTracking(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .not("tracking_number", "is", null)
    .neq("tracking_number", "")
    .not("status", "in", "({delivered,failed,cancelled})")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Failed to get orders needing tracking:", error);
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
 * Update message status with history in Supabase
 */
export async function updateMessageStatusInDB(
  sid: string,
  status: string,
  to_number: string,
  from_number: string,
  timestamp: string = new Date().toISOString(),
  order_id?: number
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("messages")
    .select("status_history")
    .eq("sid", sid)
    .single();

  let updatedHistory = [];

  if (existing?.status_history) {
    try {
      updatedHistory = JSON.parse(existing.status_history);
    } catch {
      updatedHistory = [];
    }
  }

  updatedHistory.push({ status, timestamp });

  const { error: upsertError } = await supabase.from("messages").upsert({
    sid,
    to_number,
    from_number,
    latest_status: status,
    last_updated: timestamp,
    status_history: JSON.stringify(updatedHistory),
    order_id: order_id ?? null,
  });

  if (upsertError) {
    console.error("❌ Failed to update message status:", upsertError);
    throw upsertError;
  }
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
