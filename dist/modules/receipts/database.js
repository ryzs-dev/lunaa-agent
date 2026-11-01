"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
const BUCKET = 'receipts';
class ReceiptDatabase {
    async getByWamid(wamid) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('wamid', wamid)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async get(id) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async insert(row) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .insert(row)
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async update(id, patch) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async listByOrder(orderId) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('order_id', orderId)
            .order('received_at', { ascending: false });
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    async listUnmatched(limit = 50) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .is('order_id', null)
            .order('received_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    async getOrderTotal(orderId) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount')
            .eq('id', orderId)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async findOrderByNumber(orderNumber) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount')
            .ilike('order_number', orderNumber.trim())
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    // The sender's most recent order in the window, preferring one with no receipt yet.
    async latestOrderBySender(sender, from, to) {
        var _a, _b;
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount, created_at, order_receipts(id)')
            .eq('created_by_phone', sender)
            .is('deleted_at', null)
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: false })
            .limit(5);
        if (error)
            throw error;
        const orders = data !== null && data !== void 0 ? data : [];
        return ((_b = (_a = orders.find((o) => { var _a; return !((_a = o.order_receipts) === null || _a === void 0 ? void 0 : _a.length); })) !== null && _a !== void 0 ? _a : orders[0]) !== null && _b !== void 0 ? _b : null);
    }
    async upload(path, file, contentType) {
        const { error } = await supabase_1.supabase.storage
            .from(BUCKET)
            .upload(path, file, { contentType, upsert: true });
        if (error)
            throw error;
    }
    async download(path) {
        const { data, error } = await supabase_1.supabase.storage.from(BUCKET).download(path);
        if (error)
            throw error;
        return Buffer.from(await data.arrayBuffer());
    }
    async signedUrl(path) {
        const { data, error } = await supabase_1.supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, 60 * 60);
        if (error)
            throw error;
        return data.signedUrl;
    }
}
exports.default = ReceiptDatabase;
