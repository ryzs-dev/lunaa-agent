"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOrderNumber = generateOrderNumber;
const supabase_1 = require("../supabase");
async function generateOrderNumber() {
    const { data, error } = await supabase_1.supabase
        .from('orders')
        .select('order_number')
        .like('order_number', 'ORD-%')
        .order('created_at', { ascending: false })
        .limit(200);
    if (error)
        throw error;
    let maxSequence = 0;
    for (const row of data !== null && data !== void 0 ? data : []) {
        const orderNumber = row.order_number;
        if (!orderNumber)
            continue;
        const simpleMatch = orderNumber.match(/^ORD-(\d+)$/);
        if (simpleMatch) {
            maxSequence = Math.max(maxSequence, Number(simpleMatch[1]));
            continue;
        }
        const datedMatch = orderNumber.match(/^ORD-\d{6}-(\d+)$/);
        if (datedMatch) {
            maxSequence = Math.max(maxSequence, Number(datedMatch[1]));
        }
    }
    return `ORD-${String(maxSequence + 1).padStart(5, '0')}`;
}
