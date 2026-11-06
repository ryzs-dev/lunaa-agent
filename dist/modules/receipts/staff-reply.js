"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptLine = receiptLine;
exports.orderReceivedText = orderReceivedText;
exports.orderRepeatText = orderRepeatText;
exports.receiptOnlyText = receiptOnlyText;
exports.orderFailedText = orderFailedText;
exports.replyToStaff = replyToStaff;
const converra_send_1 = require("../converra/converra-send");
const money = (value) => `RM ${Number(value !== null && value !== void 0 ? value : 0).toFixed(2)}`;
// WhatsApp can deliver a message twice; each one gets one reply.
const replied = new Set();
const REMEMBERED = 2000;
function receiptLine(receipt) {
    var _a;
    switch (receipt.check_status) {
        case 'match':
            return `🧾 Receipt matches: ${money(receipt.amount)}`;
        case 'mismatch':
            return `⚠️ ${(_a = receipt.check_note) !== null && _a !== void 0 ? _a : 'Receipt does not match the order total'}. Please check.`;
        case 'unreadable':
        case 'error':
            return '⚠️ Could not read the receipt. Please check it.';
        default:
            return '🧾 Receipt saved, not checked.';
    }
}
function orderReceivedText(order, buyer, receipt) {
    var _a;
    const summary = [money(order.total_amount), buyer].filter(Boolean).join(' · ');
    return [`✅ Order received: ${(_a = order.order_number) !== null && _a !== void 0 ? _a : ''}`.trim(), summary, receipt ? receiptLine(receipt) : null]
        .filter(Boolean)
        .join('\n');
}
function orderRepeatText(order, receipt) {
    var _a;
    return [`ℹ️ Already recorded: ${(_a = order.order_number) !== null && _a !== void 0 ? _a : ''}`.trim(), receipt ? receiptLine(receipt) : null]
        .filter(Boolean)
        .join('\n');
}
function receiptOnlyText(orderNumber, receipt) {
    return orderNumber
        ? `${orderNumber}\n${receiptLine(receipt)}`
        : '⚠️ Receipt saved, but no recent order of yours to match it to. Please link it in the CRM.';
}
function orderFailedText(savedAs, reason) {
    return savedAs
        ? `⚠️ ${savedAs} is saved, but the Google Sheet row failed. Please add it to the sheet.`
        : `⚠️ Order not saved: ${reason}. Please check and send it again.`;
}
// Answers only the staff member who sent the message, through Converra so it
// shows in their thread. It is a chat reply inside their open window, so it
// never needs a template. A failed reply is logged and never affects the order.
async function replyToStaff(to, text, wamid) {
    var _a, _b, _c;
    if (!to)
        return;
    if (wamid) {
        if (replied.has(wamid))
            return;
        replied.add(wamid);
        if (replied.size > REMEMBERED)
            replied.delete(replied.values().next().value);
    }
    try {
        await (0, converra_send_1.sendThroughConverra)({ to, text: { body: text } }, wamid ? `staff-reply:${wamid}` : undefined);
    }
    catch (error) {
        console.error('[staff-reply] could not reply:', (_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) !== null && _c !== void 0 ? _c : error.message);
    }
}
