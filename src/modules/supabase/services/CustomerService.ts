import { SupabaseClient } from "@supabase/supabase-js";
import { Customer } from "../../whatsapp/types";

export class CustomerService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Upsert a customer by phone number:
   * - If exists → update with rules
   * - If not exists → insert new customer
   */
  async upsert(customerData: Customer): Promise<Customer> {
    const now = new Date().toISOString();
    const existing = await this.findByPhone(customerData.phoneNumber);

    return existing
      ? this.update(existing, customerData, now)
      : this.insert(customerData, now);
  }

  /** --- Private Helpers --- */

  private async findByPhone(phone: string): Promise<Customer | null> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("*")
      .eq("phone_number", phone)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data ?? null;
  }

  private async update(
    existing: Customer,
    incoming: Customer,
    now: string
  ): Promise<Customer> {
    const isRepeat = (existing.totalOrders || 0) > 0;

    const { data, error } = await this.supabase
      .from("customers")
      .update({
        // prefer longer/more complete name
        customer_name:
          incoming.customerName.length > (existing.customerName?.length || 0)
            ? incoming.customerName
            : existing.customerName,
        fb_name: incoming.fbName || existing.fbName,
        customer_type: isRepeat
          ? "repeat"
          : incoming.isRepeatCustomer || existing.isRepeatCustomer,
        updated_at: now,
      })
      .eq("phone_number", incoming.phoneNumber)
      .select()
      .single();

    if (error) throw error;
    return data!;
  }

  private async insert(incoming: Customer, now: string): Promise<Customer> {
    const { data, error } = await this.supabase
      .from("customers")
      .insert({
        customer_id: incoming.customerId,
        customer_name: incoming.customerName,
        phone_number: incoming.phoneNumber,
        is_repeat_customer: incoming.isRepeatCustomer,
        fb_name: incoming.fbName ?? null,
        email: incoming.email ?? null,
        total_orders: incoming.totalOrders ?? 0,
        total_spent: incoming.totalSpent ?? 0,
        last_order_date: incoming.lastOrderDate ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
  
    if (error) throw error;
  
    console.log(
      `✅ Created new customer: id=${data!.customer_id}, phone=${data!.phone_number}`
    );
  
    return data!;
  }
  
}
