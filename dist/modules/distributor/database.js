"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class DistributorDatabase {
    async getAllDistributors() {
        const { data, error } = await supabase_1.supabase
            .from('distributors')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data !== null && data !== void 0 ? data : [];
    }
    async getDistributorById(id) {
        const { data, error } = await supabase_1.supabase
            .from('distributors')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async getDistributorByPhoneNumber(phoneNumber) {
        const { data, error } = await supabase_1.supabase
            .from('distributors')
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async upsertDistributor(distributor) {
        const { data, error } = await supabase_1.supabase
            .from('distributors')
            .upsert(distributor, { onConflict: 'phone_number' })
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async deleteDistributor(id) {
        const { error } = await supabase_1.supabase.from('distributors').delete().eq('id', id);
        if (error)
            throw error;
        return true;
    }
    // Re-tag every existing order placed under this phone number
    async setOrdersDistributorFlag(phoneNumber, isDistributor) {
        var _a;
        const { data: customers, error: customerError } = await supabase_1.supabase
            .from('customers')
            .select('id')
            .eq('phone_number', phoneNumber);
        if (customerError)
            throw customerError;
        const customerIds = (customers !== null && customers !== void 0 ? customers : []).map((c) => c.id);
        if (!customerIds.length)
            return 0;
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .update({ is_distributor: isDistributor })
            .in('customer_id', customerIds)
            .select('id');
        if (error)
            throw error;
        return (_a = data === null || data === void 0 ? void 0 : data.length) !== null && _a !== void 0 ? _a : 0;
    }
    async getOrderCounts() {
        var _a;
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('customers!inner(phone_number)')
            .eq('is_distributor', true)
            .is('deleted_at', null);
        if (error)
            throw error;
        const counts = {};
        for (const row of data !== null && data !== void 0 ? data : []) {
            const customer = row.customers;
            counts[customer.phone_number] = ((_a = counts[customer.phone_number]) !== null && _a !== void 0 ? _a : 0) + 1;
        }
        return counts;
    }
}
exports.default = DistributorDatabase;
