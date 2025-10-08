import { Order, OrderItem } from "../../whatsapp/types";
import { SupabaseClient } from "@supabase/supabase-js";


export class OrderService {
    private supabase: SupabaseClient

    constructor(supabase: SupabaseClient) {
      this.supabase = supabase
    }

  /**
   * Extract order items from raw input (string, JSON, etc.)
   */
  extractItems(raw: any): OrderItem[] {
    // implement your parsing logic here
    // example if raw is already structured:
    return raw.products.map((p: any) => ({
      productId: p.productId,
      name: p.name,
      quantity: p.quantity,
      type: p.type,
      isActive: p.isActive ?? true,
    }));
  }

  /**
   * Upsert order into Supabase
   */
  async upsertOrder(order: Order): Promise<void> {
    const { data, error } = await this.supabase
      .from("orders")
      .upsert({
        order_id: order.orderId,
        order_date: order.orderDate,
        customer_id: order.customer.customerId,
        total_paid: order.totalPaid,
        remark: order.remark,
        payment_method: order.paymentMethod,
        receipt_number: order.receiptNumber,
        currency: order.currency,
      });

    if (error) throw error;

    // Now handle items (child table)
    for (const item of order.items) {
      const { error: itemError } = await this.supabase
        .from("order_items")
        .upsert({
          order_id: order.orderId,
          product_id: item.productId,
          name: item.name,
          quantity: item.quantity,
          type: item.type,
          is_active: item.isActive,
        });

      if (itemError) throw itemError;
    }
  }
}
