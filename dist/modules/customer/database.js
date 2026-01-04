"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class CustomerDatabase {
    async getAllCustomers({ limit, offset, search, sortBy, sortOrder, filterDate, }) {
        let query = supabase_1.supabase
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
        if (error)
            throw error;
        return { customers, count };
    }
    async getCustomerByPhoneNumber(phoneNumber) {
        const { data: customer, error } = await supabase_1.supabase
            .from('customers')
            .select('*')
            .eq('phone_number', phoneNumber)
            .single();
        if (error)
            throw error;
        return customer;
    }
    async getCustomerById(id) {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select(`
      *,
      orders:orders(
        id,
        status,
        order_number,
        order_date,
        total_amount,
        created_at
      )
    `)
            .eq('id', id)
            .single();
        if (error)
            throw error;
        return data;
    }
    async upsertCustomer(customer) {
        const { data: upsertedCustomer, error } = await supabase_1.supabase
            .from('customers')
            .upsert(customer, { onConflict: 'phone_number' })
            .select('*')
            .single();
        if (error)
            throw error;
        return upsertedCustomer;
    }
    async deleteCustomer(id) {
        const { error } = await supabase_1.supabase.from('customers').delete().eq('id', id);
        if (error)
            throw error;
        return true;
    }
    async updateCustomer(id, updates) {
        const { data: updatedCustomer, error } = await supabase_1.supabase
            .from('customers')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();
        if (error)
            throw error;
        return updatedCustomer;
    }
}
exports.default = CustomerDatabase;
