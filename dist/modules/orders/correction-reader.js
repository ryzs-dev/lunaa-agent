"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.correctionToOrder = correctionToOrder;
exports.readCorrection = readCorrection;
exports.orderAfterChange = orderAfterChange;
exports.mergeItems = mergeItems;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const zod_1 = require("@anthropic-ai/sdk/helpers/beta/zod");
const v4_1 = require("zod/v4");
const supabase_1 = require("../supabase");
const settings_1 = require("../receipts/settings");
const staff_check_1 = require("./staff-check");
// After Change, staff write the fix however they like ("w + 1", "add 1 wash",
// "tukar tarikh 9/11", "remove spray"). Claude reads it against the order the
// bot saved; staff see the result and confirm, so nothing is applied unseen.
const Correction = v4_1.z.object({
    understood: v4_1.z.boolean(),
    items: v4_1.z
        .array(v4_1.z.object({ code: v4_1.z.string(), quantity: v4_1.z.number().int() }))
        .nullable(),
    order_date: v4_1.z.string().nullable(),
    total_amount: v4_1.z.number().nullable(),
    buyer_name: v4_1.z.string().nullable(),
    phone_number: v4_1.z.string().nullable(),
    full_address: v4_1.z.string().nullable(),
    city: v4_1.z.string().nullable(),
    postcode: v4_1.z.string().nullable(),
    state: v4_1.z.string().nullable(),
    remark: v4_1.z.string().nullable(),
    question: v4_1.z.string().nullable(),
});
const SYSTEM = `Staff of a Malaysian women's care shop record WhatsApp orders. They tapped Change on an order and sent one short message saying what to change. Work out the order after that change.

Products are written as quantity then code, e.g. "2w1f" is 2 Wash and 1 Femlift 30ml. Only the products a message mentions change; every other saved item stays as it is. "3w" or "w 3" sets Wash to 3. "2w1s" sets Wash to 2 and Spray to 1. "w + 1" or "+1w" adds one Wash, "w - 1" takes one away. "remove spray", "no spray" or "s 0" removes Spray. Staff may also write "add 1 wash" or the same in Malay or Chinese.

Return only what changes; null keeps the saved value:
- items: the complete item list after the change (the saved items with the mentioned ones changed), as product codes from the list with quantities, or null if the items don't change. Drop items whose quantity becomes 0 or less.
- order_date: YYYY-MM-DD. Dates are day/month (9/11 is 9 November). Use the year of the saved order unless one is given; "today" and "semalam" are relative to today's date given below.
- total_amount: only if the message states a total or price. Never work one out from the items.
- buyer_name, phone_number, full_address, city, postcode, state, remark: only if the message changes them.
- understood: false if the message isn't a change to this order or you can't tell what to change. Then question: one short question to ask the staff, in the language they wrote in. Otherwise question is null.
Only use codes from the product list. If a product they name isn't in the list, set understood to false.`;
const clients = new Map();
const clientFor = (apiKey) => {
    let client = clients.get(apiKey);
    if (!client) {
        client = new sdk_1.default({ apiKey });
        clients.clear();
        clients.set(apiKey, client);
    }
    return client;
};
async function products() {
    const { data, error } = await supabase_1.supabase.from('products').select('id, code, name');
    if (error)
        throw error;
    return (data !== null && data !== void 0 ? data : []).filter((product) => product.code);
}
function todayInMalaysia() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function describeOrder(order) {
    var _a, _b, _c, _d;
    const items = (order.order.order_items || [])
        .map((item) => { var _a; return `${item.quantity}× ${(_a = item.product_name) !== null && _a !== void 0 ? _a : item.product_id}`; })
        .join(', ');
    return [
        `Date: ${(_a = (0, staff_check_1.displayDate)(order.order.order_date)) !== null && _a !== void 0 ? _a : 'none'} (${order.order.order_date || 'none'})`,
        `Buyer: ${(_b = order.customer.name) !== null && _b !== void 0 ? _b : ''} ${(_c = order.customer.phone_number) !== null && _c !== void 0 ? _c : ''}`.trim(),
        `Address: ${[order.address.full_address, order.address.postcode, order.address.city, order.address.state].filter(Boolean).join(', ')}`,
        `Items: ${items || 'none'}`,
        `Total: RM ${Number((_d = order.order.total_amount) !== null && _d !== void 0 ? _d : 0).toFixed(2)}`,
        `Remark: ${order.remark || 'none'}`,
    ].join('\n');
}
// The change as an order message would carry it: only changed fields are set,
// fillCorrection keeps the rest from the saved order.
function correctionToOrder(correction, list) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const byCode = new Map(list.map((product) => [product.code.toLowerCase(), product]));
    let items;
    let shipment;
    if (correction.items) {
        const kept = correction.items.filter((item) => item.quantity > 0);
        if (kept.some((item) => !byCode.has(item.code.toLowerCase())))
            return null;
        const merged = new Map();
        for (const item of kept) {
            const code = item.code.toLowerCase();
            merged.set(code, ((_a = merged.get(code)) !== null && _a !== void 0 ? _a : 0) + item.quantity);
        }
        if (!merged.size)
            return null;
        items = [...merged].map(([code, quantity]) => {
            const product = byCode.get(code);
            return { product_id: product.id, quantity, product_name: product.name };
        });
        shipment = [...merged].map(([code, quantity]) => `${quantity}${code}`).join('');
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test((_b = correction.order_date) !== null && _b !== void 0 ? _b : '') ? correction.order_date : '';
    return {
        customer: {
            name: (_c = correction.buyer_name) !== null && _c !== void 0 ? _c : undefined,
            phone_number: ((_d = correction.phone_number) === null || _d === void 0 ? void 0 : _d.replace(/\D/g, '')) || undefined,
        },
        address: {
            full_address: (_e = correction.full_address) !== null && _e !== void 0 ? _e : undefined,
            city: (_f = correction.city) !== null && _f !== void 0 ? _f : undefined,
            postcode: (_g = correction.postcode) !== null && _g !== void 0 ? _g : undefined,
            state: (_h = correction.state) !== null && _h !== void 0 ? _h : undefined,
        },
        order: {
            order_date: date,
            order_items: items !== null && items !== void 0 ? items : [],
            shipment_description: shipment !== null && shipment !== void 0 ? shipment : '',
            total_amount: (_j = correction.total_amount) !== null && _j !== void 0 ? _j : 0,
        },
        remark: (_k = correction.remark) !== null && _k !== void 0 ? _k : undefined,
    };
}
async function readCorrection(text, saved) {
    const config = await (0, settings_1.readingConfig)();
    if (!config.ready) {
        return { ok: false, reply: `⚠️ Couldn't read the change: ${config.reason}`, unavailable: true };
    }
    const list = await products();
    const fallback = config.model === 'claude-haiku-5-5'
        ? {}
        : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
    const response = await clientFor(config.apiKey).beta.messages.parse(Object.assign(Object.assign({ model: config.model, max_tokens: 4000 }, fallback), { output_config: { effort: 'low', format: (0, zod_1.betaZodOutputFormat)(Correction) }, system: SYSTEM, messages: [
            {
                role: 'user',
                content: [
                    `Today: ${todayInMalaysia()}`,
                    `Products (code: name):\n${list.map((product) => `${product.code}: ${product.name}`).join('\n')}`,
                    `Saved order:\n${describeOrder(saved)}`,
                    `Staff message:\n${text}`,
                ].join('\n\n'),
            },
        ] }));
    const correction = response.stop_reason === 'refusal' ? null : response.parsed_output;
    if (!correction)
        return { ok: false, reply: "⚠️ Couldn't read that change. Please write it another way." };
    if (!correction.understood) {
        return { ok: false, reply: `🤔 ${correction.question || 'What should change?'}` };
    }
    const data = correctionToOrder(correction, list);
    if (!data)
        return { ok: false, reply: "🤔 I don't know that product. Please use its code, e.g. 2w1f." };
    return { ok: true, data };
}
// The order after a staff member's change message: a whole order replaces the
// saved fields it gives; anything shorter is read by Claude, or by the plain
// patterns (items line, date, total) when Claude can't be reached.
async function orderAfterChange(message, saved) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!message.partial)
        return { data: (0, staff_check_1.fillCorrection)(message, saved), aiItems: false };
    if (!saved)
        return { reply: '⚠️ This order is too old to change with a short message. Please send the whole order.' };
    const patternsFound = Boolean((_b = (_a = message.order) === null || _a === void 0 ? void 0 : _a.order_items) === null || _b === void 0 ? void 0 : _b.length) ||
        Boolean((_c = message.order) === null || _c === void 0 ? void 0 : _c.order_date) ||
        Number((_d = message.order) === null || _d === void 0 ? void 0 : _d.total_amount) > 0;
    if ((_e = message.text) === null || _e === void 0 ? void 0 : _e.trim()) {
        try {
            const read = await readCorrection(message.text, saved);
            if (read.ok) {
                return { data: (0, staff_check_1.fillCorrection)(read.data, saved), aiItems: Boolean((_f = read.data.order.order_items) === null || _f === void 0 ? void 0 : _f.length) };
            }
            if (!read.unavailable || !patternsFound)
                return { reply: read.reply };
        }
        catch (error) {
            console.error('Could not read the change with Claude:', error);
            if (!patternsFound)
                return { reply: "⚠️ Couldn't read that change. Please try again." };
        }
    }
    if (!patternsFound)
        return { reply: '🤔 What should change? E.g. "w + 1", "9/11/26" or "Total RM420".' };
    const items = ((_h = (_g = message.order) === null || _g === void 0 ? void 0 : _g.order_items) === null || _h === void 0 ? void 0 : _h.length)
        ? mergeItems(saved.order.order_items || [], message.order.order_items)
        : [];
    return {
        data: (0, staff_check_1.fillCorrection)(Object.assign(Object.assign({}, message), { order: Object.assign(Object.assign({}, message.order), { order_items: items, shipment_description: '' }) }), saved),
        aiItems: items.length > 0,
    };
}
// An items line sent as a change sets the products it names; the rest stay.
function mergeItems(saved, changed) {
    var _a;
    const byProduct = new Map(saved.map((item) => [String(item.product_id), Object.assign({}, item)]));
    for (const item of changed) {
        const current = byProduct.get(String(item.product_id));
        byProduct.set(String(item.product_id), Object.assign(Object.assign(Object.assign({}, current), item), { product_name: (_a = item.product_name) !== null && _a !== void 0 ? _a : current === null || current === void 0 ? void 0 : current.product_name }));
    }
    return [...byProduct.values()].filter((item) => item.quantity > 0);
}
