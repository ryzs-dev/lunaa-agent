import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { CustomerInput } from './types';

class CustomerDatabase {
  async getAllCustomers({
    limit,
    offset,
    search,
    sortBy,
    sortOrder,
    filterDate,
  }: {
    limit: number;
    offset: number;
    search?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    filterDate?: Date;
  }) {
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (filterDate) {
      query = query.gte('last_order_date', filterDate.toISOString());
    }

    const { data: customers, error, count } = await query;
    if (error) throw error;
    return { customers, count };
  }

  async getCustomerByPhoneNumber(phoneNumber: string) {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    if (error) throw error;
    return customer;
  }

  async getCustomerById(id: string) {
    const { data, error } = await supabase
      .from('customers')
      .select(
        `
      *,
      orders:orders(
        id,
        status,
        order_date,
        total_amount,
        created_at
      )
    `
      )
      .eq('id', id)
      .single();

    if (error) throw error;

    return data;
  }

  async upsertCustomer(customer: CustomerInput) {
    const { data: upsertedCustomer, error } = await supabase
      .from('customers')
      .upsert(customer, { onConflict: 'phone_number' })
      .select('*')
      .single();
    if (error) throw error;
    return upsertedCustomer;
  }

  async deleteCustomer(id: UUID) {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async updateCustomer(id: UUID, updates: Partial<CustomerInput>) {
    const { data: updatedCustomer, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return updatedCustomer;
  }
}

export default CustomerDatabase;
