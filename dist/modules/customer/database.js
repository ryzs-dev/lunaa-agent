"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
const customer_search_1 = require("../shared/customer-search");
class CustomerDatabase {
    async getAllCustomers({ limit, offset, search, sortBy, sortOrder, filterDate, repeatCustomer, countryFilter, }) {
        let query = supabase_1.supabase
            .from('customers')
            .select('*', { count: 'exact' })
            .order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: false })
            .order('id')
            .range(offset, offset + limit - 1);
        if (repeatCustomer) {
            query = query.eq('repeat_customer', repeatCustomer);
        }
        if (search) {
            const filter = (0, customer_search_1.customerSearchOrFilter)(search);
            if (filter)
                query = query.or(filter);
        }
        if (filterDate) {
            query = query.gte('last_order_date', filterDate.toISOString());
        }
        if (countryFilter)
            query = query.or(countryFilter);
        const { data: customers, error, count } = await query;
        if (error)
            throw error;
        return { customers, count };
    }
    async getCustomerSummary() {
        const countWhere = async (repeatCustomer) => {
            let query = supabase_1.supabase
                .from('customers')
                .select('*', { count: 'exact', head: true });
            if (repeatCustomer)
                query = query.eq('repeat_customer', repeatCustomer);
            const { count, error } = await query;
            if (error)
                throw error;
            return count !== null && count !== void 0 ? count : 0;
        };
        const [total, returning, newCustomers] = await Promise.all([
            countWhere(),
            countWhere('returning'),
            countWhere('new'),
        ]);
        return { total, returning, new: newCustomers };
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
        created_at,
        deleted_at,
        shipment_description,
        order_items(quantity),
        order_tracking(status, tracking_number, courier)
      ),
      addresses(
        id,
        full_address,
        postcode,
        city,
        state,
        country,
        created_at
      )
    `)
            .eq('id', id)
            .order('order_date', { referencedTable: 'orders', ascending: false })
            .order('created_at', { referencedTable: 'addresses', ascending: false })
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
    async getAllCustomerIds({ search, filterDate, countryFilter, }) {
        let query = supabase_1.supabase
            .from('customers')
            .select('id', { count: 'exact' })
            .limit(10000); // explicitly override the default 1000 cap
        if (search) {
            const filter = (0, customer_search_1.customerSearchOrFilter)(search);
            if (filter)
                query = query.or(filter);
        }
        if (filterDate) {
            query = query.gte('created_at', filterDate.toISOString());
        }
        if (countryFilter)
            query = query.or(countryFilter);
        const { data, error } = await query;
        if (error)
            throw error;
        return data.map((r) => r.id);
    }
}
exports.default = CustomerDatabase;
