"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateCustomerStats = recalculateCustomerStats;
const supabase_1 = require("../supabase");
async function recalculateCustomerStats(customerId) {
    var _a;
    const { data: orders, error: fetchError } = await supabase_1.supabase
        .from('orders')
        .select('total_amount, created_at, order_date')
        .eq('customer_id', customerId)
        .is('deleted_at', null);
    if (fetchError)
        throw fetchError;
    const activeOrders = orders !== null && orders !== void 0 ? orders : [];
    const totalOrders = activeOrders.length;
    const totalSpent = activeOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const lastOrderDate = totalOrders > 0
        ? (_a = activeOrders.sort((a, b) => {
            var _a, _b;
            const dateA = new Date((_a = a.order_date) !== null && _a !== void 0 ? _a : a.created_at).getTime();
            const dateB = new Date((_b = b.order_date) !== null && _b !== void 0 ? _b : b.created_at).getTime();
            return dateB - dateA;
        })[0].order_date) !== null && _a !== void 0 ? _a : activeOrders[0].created_at
        : null;
    const { error: updateError } = await supabase_1.supabase
        .from('customers')
        .update({
        total_purchase_count: totalOrders,
        total_amount_spent: totalSpent,
        last_order_date: lastOrderDate,
        repeat_customer: totalOrders > 1 ? 'returning' : 'new',
    })
        .eq('id', customerId);
    if (updateError)
        throw updateError;
}
