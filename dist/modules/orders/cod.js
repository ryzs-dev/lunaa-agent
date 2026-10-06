"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodOrders = getCodOrders;
exports.getCodCounts = getCodCounts;
exports.markCodCollected = markCodCollected;
const supabase_1 = require("../supabase");
const STATUSES = ['out', 'pending', 'collected'];
async function getCodOrders(status) {
    const { data, error } = await supabase_1.supabase
        .from('orders')
        .select('id, order_number, order_date, total_amount, shipment_description, cod_status, agent_name, customers(id, name, phone_number)')
        .eq('cod_status', status)
        .is('deleted_at', null)
        .order('order_date', { ascending: false })
        .limit(500);
    if (error)
        throw error;
    return data !== null && data !== void 0 ? data : [];
}
async function getCodCounts() {
    const counts = { out: 0, pending: 0, collected: 0 };
    await Promise.all(STATUSES.map(async (status) => {
        const { count, error } = await supabase_1.supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('cod_status', status)
            .is('deleted_at', null);
        if (error)
            throw error;
        counts[status] = count !== null && count !== void 0 ? count : 0;
    }));
    return counts;
}
async function markCodCollected(orderId) {
    const { data, error } = await supabase_1.supabase
        .from('orders')
        .update({ cod_status: 'collected', cod_collected_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('deleted_at', null)
        .select('id, cod_status')
        .single();
    if (error)
        throw error;
    return data;
}
