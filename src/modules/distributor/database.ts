import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { DistributorInput } from './types';

class DistributorDatabase {
  async getAllDistributors() {
    const { data, error } = await supabase
      .from('distributors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async getDistributorById(id: UUID) {
    const { data, error } = await supabase
      .from('distributors')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getDistributorByPhoneNumber(phoneNumber: string) {
    const { data, error } = await supabase
      .from('distributors')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsertDistributor(distributor: DistributorInput) {
    const { data, error } = await supabase
      .from('distributors')
      .upsert(distributor, { onConflict: 'phone_number' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteDistributor(id: UUID) {
    const { error } = await supabase.from('distributors').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  // Re-tag every existing order placed under this phone number
  async setOrdersDistributorFlag(phoneNumber: string, isDistributor: boolean) {
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('phone_number', phoneNumber);
    if (customerError) throw customerError;

    const customerIds = (customers ?? []).map((c) => c.id);
    if (!customerIds.length) return 0;

    const { data, error } = await supabase
      .from('orders')
      .update({ is_distributor: isDistributor })
      .in('customer_id', customerIds)
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }

  async getOrderCounts() {
    const { data, error } = await supabase
      .from('orders')
      .select('customers!inner(phone_number)')
      .eq('is_distributor', true)
      .is('deleted_at', null);
    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const customer = row.customers as unknown as { phone_number: string };
      counts[customer.phone_number] = (counts[customer.phone_number] ?? 0) + 1;
    }
    return counts;
  }
}

export default DistributorDatabase;
