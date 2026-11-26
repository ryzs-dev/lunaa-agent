"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readItems = readItems;
exports.matchItems = matchItems;
exports.locateAddress = locateAddress;
exports.orderFromConverra = orderFromConverra;
const supabase_1 = require("../supabase");
const service_1 = __importDefault(require("../customer/service"));
const service_2 = __importDefault(require("../address/service"));
const service_3 = __importDefault(require("../orders/service"));
const service_4 = require("../google/service");
const database_1 = require("../orders/database");
const channels_1 = require("../orders/channels");
const malaysia_postcodes_1 = require("malaysia-postcodes");
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
let sheetService = null;
function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function readItems(raw) {
    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        }
        catch (_a) {
            list = [];
        }
    }
    if (!Array.isArray(list))
        return [];
    return list
        .map((entry) => ({
        name: text(entry === null || entry === void 0 ? void 0 : entry.name, 120),
        quantity: Math.floor(Number(entry === null || entry === void 0 ? void 0 : entry.quantity)) || 1,
    }))
        .filter((item) => item.name && item.quantity > 0);
}
// "2a1b" typed as one item, the way staff write the order line today.
const CODE_LINE = /^(?:\d+[a-z]+(?:\d+ml)?)+$/i;
/**
 * Match what staff typed to the CRM's products: by product code or by product name,
 * whatever the capitals. Returns the names that match nothing.
 */
function matchItems(items, products) {
    var _a;
    const byKey = new Map();
    for (const product of products) {
        if (product.name)
            byKey.set(product.name.trim().toLowerCase(), product);
    }
    // Codes win over names when both exist.
    for (const product of products) {
        if (product.code)
            byKey.set(product.code.trim().toLowerCase(), product);
    }
    const quantities = new Map();
    const unknown = [];
    // Things on an order line that are not products (free gifts such as "3sachet"): kept in the
    // order's description, the way the WhatsApp order line keeps them.
    const extras = [];
    const add = (product, quantity) => { var _a; return quantities.set(product.id, ((_a = quantities.get(product.id)) !== null && _a !== void 0 ? _a : 0) + quantity); };
    for (const item of items) {
        const key = item.name.trim().toLowerCase();
        const direct = (_a = byKey.get(key)) !== null && _a !== void 0 ? _a : byKey.get(key.replace(/\s+/g, ''));
        if (direct) {
            add(direct, item.quantity);
            continue;
        }
        const compact = key.replace(/\s+/g, '');
        if (CODE_LINE.test(compact)) {
            const parts = [...compact.matchAll(/(\d+)([a-z]+(?:\d+ml)?)/gi)];
            const found = parts.map((part) => ({
                token: part[0],
                product: byKey.get(part[2].toLowerCase()),
                quantity: Number(part[1]),
            }));
            if (found.some((part) => part.product && part.quantity > 0)) {
                for (const part of found) {
                    if (part.product && part.quantity > 0)
                        add(part.product, part.quantity * item.quantity);
                    else
                        extras.push(part.token);
                }
                continue;
            }
        }
        unknown.push(item.name);
    }
    return {
        items: [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
        unknown,
        extras,
    };
}
/** Postcode, city and state from an address as the customer wrote it. */
function locateAddress(addressText) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const flat = addressText.replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').trim();
    // The postcode sits near the end; a house or lot number can also be five digits.
    const fiveDigit = ((_a = flat.match(/\b\d{5}\b/g)) !== null && _a !== void 0 ? _a : []).reverse();
    for (const postcode of fiveDigit) {
        const result = (0, malaysia_postcodes_1.findPostcode)(postcode, true);
        if (result === null || result === void 0 ? void 0 : result.found) {
            return {
                full_address: flat,
                postcode,
                city: (_e = (_b = result.city) !== null && _b !== void 0 ? _b : (_d = (_c = result.results) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.city) !== null && _e !== void 0 ? _e : '',
                state: (_j = (_f = result.state) !== null && _f !== void 0 ? _f : (_h = (_g = result.results) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.state) !== null && _j !== void 0 ? _j : '',
                country: 'Malaysia',
            };
        }
    }
    const sixDigit = flat.match(/\b\d{6}\b/);
    if (sixDigit && /singapore|\bsg\b/i.test(flat)) {
        return { full_address: flat, postcode: sixDigit[0], city: 'Singapore', state: '', country: 'Singapore' };
    }
    return { full_address: flat, postcode: (_k = fiveDigit[0]) !== null && _k !== void 0 ? _k : '', city: '', state: '', country: '' };
}
/** Today's date in Malaysia, the way order dates are stored. */
function todayInMalaysia() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
async function orderFromConverra(raw) {
    var _a, _b, _c;
    const body = (raw && typeof raw === 'object' ? raw : {});
    const fail = (error, status = 422) => ({ status, body: { success: false, error } });
    const channel = channels_1.CHAT_CHANNELS.includes(String(body.channel))
        ? body.channel
        : 'whatsapp';
    const name = text(body.name, 120);
    const phone = text(body.phone, 30).replace(/\D/g, '');
    const addressText = text(body.address, 500);
    const amount = Number(String((_a = body.amount) !== null && _a !== void 0 ? _a : '').replace(/[^0-9.]/g, ''));
    const payment = body.payment === 'cod' ? 'cod' : 'paid';
    const incoming = readItems(body.items);
    if (!phone)
        return fail("The order has no phone number. Add the customer's phone and log the sale again.");
    if (!addressText)
        return fail('The order has no delivery address. Add the address and log the sale again.');
    if (!incoming.length)
        return fail('The order has no items. Add what the customer bought and log the sale again.');
    const { data: products, error: productsError } = await supabase_1.supabase.from('products').select('id, code, name');
    if (productsError)
        throw productsError;
    const matched = matchItems(incoming, (products !== null && products !== void 0 ? products : []));
    if (matched.unknown.length) {
        const codes = (products !== null && products !== void 0 ? products : []).map((p) => p.code).filter(Boolean).join(', ');
        return fail(`Not a product in the CRM: ${matched.unknown.join(', ')}. Use a product name or code (${codes}).`);
    }
    // A test from Converra: say what would be saved, save nothing.
    if (body.dry_run === true || body.dry_run === 'true') {
        return {
            status: 200,
            body: {
                success: true,
                dry_run: true,
                order_number: 'TEST',
                would_save: {
                    channel,
                    name,
                    phone,
                    address: locateAddress(addressText),
                    items: matched.items,
                    amount: Number.isFinite(amount) ? amount : 0,
                    payment,
                },
            },
        };
    }
    const customer = await customerService.createCustomer({ name: name || undefined, phone_number: phone });
    const orderDate = todayInMalaysia();
    const totalAmount = Number.isFinite(amount) ? amount : 0;
    const shipmentDescription = (0, database_1.shipmentDescriptionFor)(matched.items, new Map((products !== null && products !== void 0 ? products : []).map((p) => [p.id, p])), matched.extras.join(''));
    // The very same sale sent again (a retry from Converra).
    const saleId = text(body.sale_id, 64);
    const externalRef = saleId ? `converra:${saleId}` : null;
    if (externalRef) {
        const { data: sameSale, error: sameSaleError } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number')
            .eq('external_ref', externalRef)
            .is('deleted_at', null)
            .limit(1);
        if (sameSaleError)
            throw sameSaleError;
        if (sameSale === null || sameSale === void 0 ? void 0 : sameSale[0]) {
            return {
                status: 200,
                body: { success: true, duplicate: true, order_id: sameSale[0].id, order_number: sameSale[0].order_number },
            };
        }
    }
    // The same order already typed on the WhatsApp order line today.
    const existing = await orderService.findSimilarOrder({
        customer_id: customer.id,
        order_date: orderDate,
        total_amount: totalAmount,
        shipment_description: shipmentDescription,
    });
    if (existing) {
        return {
            status: 200,
            body: { success: true, duplicate: true, order_id: existing.id, order_number: existing.order_number },
        };
    }
    const addressFields = locateAddress(addressText);
    const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, addressFields));
    const remark = text(body.note, 500) || undefined;
    const order = await orderService.createOrder(Object.assign(Object.assign(Object.assign({ customer_id: customer.id, address_id: address.id, order_date: orderDate, total_amount: totalAmount, order_items: matched.items, shipment_description: shipmentDescription }, (payment === 'cod' ? { payment_method: 'COD' } : {})), { remark, source: channel }), (externalRef ? { external_ref: externalRef } : {})));
    // The order sheet staff work from, written the same way as an order from the WhatsApp order line.
    let warning;
    try {
        sheetService = sheetService !== null && sheetService !== void 0 ? sheetService : new service_4.GoogleSheetService();
        const sheetResult = await sheetService.createOrder({
            customer: { name: (_b = customer.name) !== null && _b !== void 0 ? _b : name, phone_number: (_c = customer.phone_number) !== null && _c !== void 0 ? _c : phone },
            order: Object.assign({ order_date: orderDate, order_items: matched.items.map((item) => (Object.assign({}, item))), shipment_description: shipmentDescription, total_amount: totalAmount }, (payment === 'cod' ? { payment_method: 'COD' } : {})),
            address: addressFields,
            remark,
        });
        if (!(sheetResult === null || sheetResult === void 0 ? void 0 : sheetResult.success))
            warning = 'Saved in the CRM, but the order sheet row was not written.';
    }
    catch (error) {
        console.error('[converra] Sheet row failed for order from Converra:', order === null || order === void 0 ? void 0 : order.id, error);
        warning = 'Saved in the CRM, but the order sheet row was not written.';
    }
    console.log('[converra] Order from Converra saved:', { order: order === null || order === void 0 ? void 0 : order.order_number, channel, sale: saleId });
    return {
        status: 200,
        body: Object.assign({ success: true, order_id: order === null || order === void 0 ? void 0 : order.id, order_number: order === null || order === void 0 ? void 0 : order.order_number }, (warning ? { warning } : {})),
    };
}
