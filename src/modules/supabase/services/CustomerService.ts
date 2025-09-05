import { SupabaseClient } from "@supabase/supabase-js";
import { CustomerDB } from "../types/CustomerDB";

export class CustomerService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Upsert a customer by phone number:
   * - If exists → update with rules
   * - If not exists → insert new customer
   */
  async upsert(customerData: CustomerDB): Promise<CustomerDB> {
    const now = new Date().toISOString();
    const existing = await this.findByPhone(customerData.phoneNumber);

    return existing
      ? this.update(existing, customerData, now)
      : this.insert(customerData, now);
  }

  /** --- Private Helpers --- */

  private async findByPhone(phone: string): Promise<CustomerDB | null> {
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
    existing: CustomerDB,
    incoming: CustomerDB,
    now: string
  ): Promise<CustomerDB> {
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

  private async insert(incoming: CustomerDB, now: string): Promise<CustomerDB> {
    const { data, error } = await this.supabase
      .from("customers")
      .insert({
        phone_number: incoming.phoneNumber,
        customer_name: incoming.customerName,
        id: '200',
        customer_type: incoming.isRepeatCustomer,
        total_orders: 0,
        total_spent: 0,
        average_order_value: 0,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(
      `✅ Created new customer: id=${data!.id}, phone=${data!.phoneNumber}`
    );

    return data!;
  }
}
