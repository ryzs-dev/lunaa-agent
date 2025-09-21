import { Order, OrderItem } from "../types";
import { OrderService as SupabaseOrderService } from "../../supabase/services/OrderService";
import { supabase } from "../../supabase";

export class WhatsappOrderService {
  private supabaseOrderService: SupabaseOrderService;

  constructor() {
    this.supabaseOrderService = new SupabaseOrderService(supabase);
  }

  /**
   * Parse raw WhatsApp text into OrderItems
   */
  private parseItems(rawText: string): OrderItem[] {
    // TODO: implement parsing logic properly
    // Example (simple split)
    const lines = rawText.split("\n").filter(l => l.trim());
    return lines.map((line, idx) => {
      const [name, qtyStr] = line.split("x");
      return {
        productId: `temp-${idx}`,
        name: name.trim(),
        quantity: parseInt(qtyStr ?? "1", 10),
        isActive: true,
      };
    });
  }

  /**
   * Convert WhatsApp message → Order object
   */
  public buildOrderFromMessage(message: string, meta: any): Order {
    const items = this.parseItems(message);

    return {
      orderId: meta.orderId,
      orderDate: new Date().toISOString(),
      customer: meta.customer,
      items,
      totalPaid: meta.totalPaid,
      remark: meta.remark,
      paymentMethod: meta.paymentMethod,
      shipment: meta.shipment,
      isRepeatCustomer: meta.isRepeatCustomer,
      receiptNumber: meta.receiptNumber,
      currency: meta.currency ?? "RM",
    };
  }

  /**
   * Full pipeline: WhatsApp → Order → Supabase
   */
  public async processWhatsappOrder(message: string, meta: any) {
    const order = this.buildOrderFromMessage(message, meta);
    await this.supabaseOrderService.upsertOrder(order);
    return order;
  }
}
