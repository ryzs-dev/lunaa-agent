"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerService = void 0;
class CustomerService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Upsert a customer by phone number:
     * - If exists → update with rules
     * - If not exists → insert new customer
     */
    async upsert(customerData) {
        const now = new Date().toISOString();
        const existing = await this.findByPhone(customerData.phoneNumber);
        return existing
            ? this.update(existing, customerData, now)
            : this.insert(customerData, now);
    }
    /** --- Private Helpers --- */
    async findByPhone(phone) {
        const { data, error } = await this.supabase
            .from("customers")
            .select("*")
            .eq("phone_number", phone)
            .single();
        if (error && error.code !== "PGRST116") {
            throw error;
        }
        return data !== null && data !== void 0 ? data : null;
    }
    async update(existing, incoming, now) {
        var _a;
        const isRepeat = (existing.totalOrders || 0) > 0;
        const { data, error } = await this.supabase
            .from("customers")
            .update({
            // prefer longer/more complete name
            customer_name: incoming.customerName.length > (((_a = existing.customerName) === null || _a === void 0 ? void 0 : _a.length) || 0)
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
        if (error)
            throw error;
        return data;
    }
    async insert(incoming, now) {
        var _a, _b, _c, _d, _e;
        const { data, error } = await this.supabase
            .from("customers")
            .insert({
            customer_id: incoming.customerId,
            customer_name: incoming.customerName,
            phone_number: incoming.phoneNumber,
            is_repeat_customer: incoming.isRepeatCustomer,
            fb_name: (_a = incoming.fbName) !== null && _a !== void 0 ? _a : null,
            email: (_b = incoming.email) !== null && _b !== void 0 ? _b : null,
            total_orders: (_c = incoming.totalOrders) !== null && _c !== void 0 ? _c : 0,
            total_spent: (_d = incoming.totalSpent) !== null && _d !== void 0 ? _d : 0,
            last_order_date: (_e = incoming.lastOrderDate) !== null && _e !== void 0 ? _e : null,
            created_at: now,
            updated_at: now,
        })
            .select()
            .single();
        if (error)
            throw error;
        console.log(`✅ Created new customer: id=${data.customer_id}, phone=${data.phone_number}`);
        return data;
    }
}
exports.CustomerService = CustomerService;
