"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.announceOrderToConverra = announceOrderToConverra;
const supabase_1 = require("../supabase");
const converra_forwarder_1 = require("./converra-forwarder");
// Tells Converra a customer ordered, with their phone so Converra can find the chat.
// Converra then stops follow-ups and flows still selling to them. Never blocks the order.
async function announceOrderToConverra(order) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        let phone = (_a = order.phone) !== null && _a !== void 0 ? _a : null;
        if (!phone && order.customer_id) {
            const { data } = await supabase_1.supabase.from('customers').select('phone_number').eq('id', order.customer_id).maybeSingle();
            phone = (_b = data === null || data === void 0 ? void 0 : data.phone_number) !== null && _b !== void 0 ? _b : null;
        }
        const orderId = (_c = order.id) !== null && _c !== void 0 ? _c : `manual-${Date.now()}`;
        await (0, converra_forwarder_1.forwardToConverra)({
            event_type: 'order.created',
            external_event_id: `order-${orderId}`,
            timestamp: new Date().toISOString(),
            payload: Object.assign(Object.assign({ order_id: orderId, customer_id: (_d = order.customer_id) !== null && _d !== void 0 ? _d : null }, (phone ? { customer_phone: String(phone).replace(/\D/g, '') } : {})), { total_amount: (_e = order.total_amount) !== null && _e !== void 0 ? _e : null, amount: (_f = order.total_amount) !== null && _f !== void 0 ? _f : null, status: (_g = order.status) !== null && _g !== void 0 ? _g : 'unpaid', payment_method: (_h = order.payment_method) !== null && _h !== void 0 ? _h : '', order_date: (_j = order.order_date) !== null && _j !== void 0 ? _j : null }),
        });
    }
    catch (error) {
        console.error('[converra] Could not announce the order:', error);
    }
}
