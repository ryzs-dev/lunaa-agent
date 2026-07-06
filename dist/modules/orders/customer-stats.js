"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateCustomerStats = recalculateCustomerStats;
const supabase_1 = require("../supabase");
async function recalculateCustomerStats(customerId) {
    const { data: orders, error: fetchError } = await supabase_1.supabase
        .from('orders')
        .select('total_amount, created_at')
        .eq('customer_id', customerId)
        .is('deleted_at', null);
    if (fetchError)
        throw fetchError;
    const activeOrders = orders !== null && orders !== void 0 ? orders : [];
    const totalOrders = activeOrders.length;
    const totalSpent = activeOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const lastOrderDate = totalOrders > 0
        ? activeOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : null;
    const { error: updateError } = await supabase_1.supabase
        .from('customers')
        .update({
        total_orders: totalOrders,
        total_spent: totalSpent,
        average_order_value: averageOrderValue,
        last_order_date: lastOrderDate,
        customer_type: totalOrders > 1 ? 'repeat' : 'new',
        updated_at: new Date().toISOString(),
    })
        .eq('id', customerId);
    if (updateError)
        throw updateError;
}
