"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderButtons = orderButtons;
exports.parseOrderButton = parseOrderButton;
exports.displayDate = displayDate;
exports.orderSummaryText = orderSummaryText;
exports.fillCorrection = fillCorrection;
exports.rememberOrderPayload = rememberOrderPayload;
exports.orderPayload = orderPayload;
exports.startChange = startChange;
exports.orderBeingChanged = orderBeingChanged;
exports.endChange = endChange;
const queue_1 = __importDefault(require("../queue"));
// After the bot saves a WhatsApp order it shows staff what it read, with
// Confirm and Change. Change makes that staff member's next order message
// replace this order instead of adding a new one.
const FIX_SECONDS = 30 * 60;
const PAYLOAD_SECONDS = 14 * 24 * 60 * 60;
const fixKey = (sender) => `order-bot:fix:${sender}`;
const payloadKey = (orderId) => `order-bot:order:${orderId}`;
function orderButtons(orderId) {
    return [
        { id: `order_ok:${orderId}`, title: 'Confirm' },
        { id: `order_fix:${orderId}`, title: 'Change' },
    ];
}
function parseOrderButton(id) {
    const match = /^order_(ok|fix):([0-9a-f-]{36})$/i.exec(String(id !== null && id !== void 0 ? id : ''));
    if (!match)
        return null;
    return { action: match[1] === 'ok' ? 'confirm' : 'change', orderId: match[2] };
}
const money = (value) => `RM ${Number(value !== null && value !== void 0 ? value : 0).toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function displayDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value !== null && value !== void 0 ? value : ''));
    if (!match)
        return null;
    const month = MONTHS[Number(match[2]) - 1];
    return month ? `${Number(match[3])} ${month} ${match[1]}` : null;
}
// What the bot read, so staff can spot a wrong date, item or total at a glance.
function orderSummaryText(input) {
    var _a, _b, _c, _d;
    const { customer, address, order } = input.data;
    const items = (order.order_items || [])
        .map((item) => `${item.quantity}× ${item.product_name || 'Unknown product'}`)
        .join(', ');
    const buyer = [customer.name, customer.phone_number].filter(Boolean).join(' · ');
    const place = [address.city, address.state].filter(Boolean).join(', ');
    return [
        `${input.heading}: ${(_a = input.orderNumber) !== null && _a !== void 0 ? _a : ''}`.trim(),
        `Date: ${(_c = (_b = displayDate(input.orderDate)) !== null && _b !== void 0 ? _b : displayDate(order.order_date)) !== null && _c !== void 0 ? _c : 'not given'}`,
        buyer ? `Buyer: ${buyer}` : null,
        place ? `Ship to: ${place}` : null,
        `Items: ${items || 'none'}`,
        `Total: ${money(order.total_amount)}`,
        ...((_d = input.extraLines) !== null && _d !== void 0 ? _d : []),
    ]
        .filter(Boolean)
        .join('\n');
}
// A correction often leaves out what didn't change; the saved order fills it in.
function fillCorrection(next, previous) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!previous)
        return next;
    const pick = (value, fallback) => value === undefined || value === null || value === '' ? fallback : value;
    return Object.assign(Object.assign({}, next), { customer: {
            name: pick((_a = next.customer) === null || _a === void 0 ? void 0 : _a.name, previous.customer.name),
            phone_number: pick((_b = next.customer) === null || _b === void 0 ? void 0 : _b.phone_number, previous.customer.phone_number),
            email: pick((_c = next.customer) === null || _c === void 0 ? void 0 : _c.email, previous.customer.email),
        }, address: {
            full_address: pick((_d = next.address) === null || _d === void 0 ? void 0 : _d.full_address, previous.address.full_address),
            city: pick((_e = next.address) === null || _e === void 0 ? void 0 : _e.city, previous.address.city),
            postcode: pick((_f = next.address) === null || _f === void 0 ? void 0 : _f.postcode, previous.address.postcode),
            state: pick((_g = next.address) === null || _g === void 0 ? void 0 : _g.state, previous.address.state),
        }, order: Object.assign(Object.assign({}, next.order), { order_date: pick((_h = next.order) === null || _h === void 0 ? void 0 : _h.order_date, previous.order.order_date), payment_method: pick((_j = next.order) === null || _j === void 0 ? void 0 : _j.payment_method, previous.order.payment_method) }), remark: pick(next.remark, previous.remark) });
}
// The order as it was written to the sheet, so a correction can find its row.
async function rememberOrderPayload(orderId, data) {
    const { customer, address, order, remark } = data;
    await queue_1.default.set(payloadKey(orderId), JSON.stringify({ customer, address, order, remark }), 'EX', PAYLOAD_SECONDS);
}
async function orderPayload(orderId) {
    const raw = await queue_1.default.get(payloadKey(orderId));
    return raw ? JSON.parse(raw) : null;
}
async function startChange(sender, orderId) {
    await queue_1.default.set(fixKey(sender), orderId, 'EX', FIX_SECONDS);
}
async function orderBeingChanged(sender) {
    return sender ? queue_1.default.get(fixKey(sender)) : null;
}
async function endChange(sender, orderId) {
    if (orderId && (await queue_1.default.get(fixKey(sender))) !== orderId)
        return;
    await queue_1.default.del(fixKey(sender));
}
