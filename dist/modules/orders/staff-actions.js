"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOrderButton = handleOrderButton;
exports.correctOrder = correctOrder;
exports.previewOrder = previewOrder;
const supabase_1 = require("../supabase");
const service_1 = __importDefault(require("../customer/service"));
const service_2 = __importDefault(require("../address/service"));
const service_3 = __importDefault(require("./service"));
const service_4 = require("../google/service");
const service_5 = __importDefault(require("../receipts/service"));
const service_6 = __importDefault(require("../product/service"));
const staff_reply_1 = require("../receipts/staff-reply");
const staff_check_1 = require("./staff-check");
const correction_reader_1 = require("./correction-reader");
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const googleSheetService = new service_4.GoogleSheetService();
const receiptService = new service_5.default();
const productService = new service_6.default();
async function findOrder(orderId) {
    const { data, error } = await supabase_1.supabase
        .from('orders')
        .select('id, order_number, order_date, deleted_at')
        .eq('id', orderId)
        .maybeSingle();
    if (error)
        throw error;
    return data && !data.deleted_at ? data : null;
}
// Confirm or Change, tapped under an order summary.
async function handleOrderButton(tap) {
    const button = (0, staff_check_1.parseOrderButton)(tap.id);
    if (!button)
        return;
    if (button.orderId === staff_check_1.TEST_ORDER) {
        if (button.action === 'confirm') {
            await (0, staff_check_1.endChange)(tap.sender, staff_check_1.TEST_ORDER);
            await (0, staff_reply_1.replyToStaff)(tap.sender, '👍 Test confirmed. Nothing was saved.', tap.wamid);
        }
        else {
            await (0, staff_check_1.startChange)(tap.sender, staff_check_1.TEST_ORDER);
            await (0, staff_reply_1.replyToStaff)(tap.sender, '✏️ Test: what should change? Write it your way, e.g. "w + 1", "remove spray", ' +
                '"date 9/11" or "total 420", or send the whole order. You have 30 minutes.', tap.wamid);
        }
        return;
    }
    const order = await findOrder(button.orderId);
    if (!order) {
        await (0, staff_reply_1.replyToStaff)(tap.sender, '⚠️ That order was deleted in the CRM.', tap.wamid);
        return;
    }
    if (button.action === 'confirm') {
        const { error } = await supabase_1.supabase
            .from('orders')
            .update({ staff_confirmed_at: new Date().toISOString(), staff_confirmed_by: tap.sender })
            .eq('id', order.id);
        if (error)
            throw error;
        await (0, staff_check_1.endChange)(tap.sender, order.id);
        await (0, staff_reply_1.replyToStaff)(tap.sender, `👍 ${order.order_number} confirmed`, tap.wamid);
        return;
    }
    await (0, staff_check_1.startChange)(tap.sender, order.id);
    await (0, staff_reply_1.replyToStaff)(tap.sender, `✏️ What should change in ${order.order_number}? Write it your way, e.g. "w + 1", ` +
        '"remove spray", "date 9/11" or "total 420", or send the whole order. You have 30 minutes.', tap.wamid);
}
// The staff member tapped Change: this order message replaces the saved order.
async function correctOrder(job, orderId) {
    var _a;
    const order = await findOrder(orderId);
    if (!order) {
        await (0, staff_check_1.endChange)(job.sender);
        await (0, staff_reply_1.replyToStaff)(job.sender, '⚠️ That order was deleted in the CRM, so nothing was changed.', job.wamid);
        return;
    }
    const previous = await (0, staff_check_1.orderPayload)(orderId);
    const change = await (0, correction_reader_1.orderAfterChange)(job, previous);
    if ('reply' in change) {
        // Still in Change: they can try again.
        await (0, staff_reply_1.replyToStaff)(job.sender, change.reply, job.wamid);
        return;
    }
    const data = change.data;
    if (!((_a = data.order.order_items) === null || _a === void 0 ? void 0 : _a.length)) {
        await (0, staff_reply_1.replyToStaff)(job.sender, `⚠️ ${order.order_number} not changed: no products found. Please send the whole order again.`, job.wamid);
        return;
    }
    const customer = await customerService.createCustomer(data.customer);
    const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, data.address));
    const updated = await orderService.updateOrder(orderId, Object.assign({ customer_id: customer.id, address_id: address.id, order_items: data.order.order_items, total_amount: data.order.total_amount, 
        // Items read by Claude: the CRM writes the shipment code, keeping free gifts.
        shipment_description: change.aiItems ? undefined : data.order.shipment_description, payment_method: data.order.payment_method, remark: data.remark }, (data.order.order_date ? { order_date: data.order.order_date } : {})));
    const { error } = await supabase_1.supabase
        .from('orders')
        .update({
        staff_corrected_at: new Date().toISOString(),
        staff_corrected_by: job.sender,
        staff_confirmed_at: null,
        staff_confirmed_by: null,
    })
        .eq('id', orderId);
    if (error)
        throw error;
    if (change.aiItems && updated.shipment_description) {
        data.order.shipment_description = updated.shipment_description;
    }
    await (0, staff_check_1.endChange)(job.sender);
    let receipt = null;
    if (job.receipt) {
        try {
            receipt = await receiptService.ingest(Object.assign(Object.assign({}, job.receipt), { sender: job.sender, caption: null }), orderId);
        }
        catch (receiptError) {
            console.error('Error saving receipt for corrected order', orderId, receiptError);
        }
    }
    let sheetLine = null;
    if (previous) {
        const sheet = await googleSheetService.replaceOrder(previous, data);
        if (!sheet.success)
            sheetLine = '⚠️ The Google Sheet row was not updated. Please fix it there.';
        else if (sheet.missingOldRow)
            sheetLine = '⚠️ Could not find the old sheet row. Please delete it.';
    }
    else {
        const sheet = await googleSheetService.createOrder(data);
        sheetLine = sheet.success
            ? '⚠️ Added a new sheet row. Please delete the old one.'
            : '⚠️ The Google Sheet row was not updated. Please fix it there.';
    }
    await (0, staff_check_1.rememberOrderPayload)(orderId, data);
    await (0, staff_reply_1.replyToStaff)(job.sender, (0, staff_check_1.orderSummaryText)({
        heading: `✏️ *${updated.order_number}* updated`,
        orderDate: updated.order_date,
        data,
        extraLines: [receipt ? (0, staff_reply_1.receiptLine)(receipt) : null, sheetLine],
    }), job.wamid, (0, staff_check_1.orderButtons)(orderId));
}
// A test number: read the order back with the buttons, save nothing. After
// Change, a partial message is filled in from the last test order.
async function previewOrder(job, changing) {
    var _a;
    const testKey = `${staff_check_1.TEST_ORDER}:${job.sender}`;
    if (job.partial && !changing)
        return;
    let data = job;
    if (changing) {
        const change = await (0, correction_reader_1.orderAfterChange)(job, await (0, staff_check_1.orderPayload)(testKey));
        if ('reply' in change) {
            await (0, staff_reply_1.replyToStaff)(job.sender, `${change.reply}\n(Test, nothing saved.)`, job.wamid);
            return;
        }
        data = change.data;
    }
    const items = await Promise.all((((_a = data.order) === null || _a === void 0 ? void 0 : _a.order_items) || []).map(async (item) => {
        if (item.product_name)
            return item;
        const product = await productService.getProductById(item.product_id).catch(() => null);
        return Object.assign(Object.assign({}, item), { product_name: (product === null || product === void 0 ? void 0 : product.name) || 'Unknown product' });
    }));
    if (!items.length) {
        await (0, staff_reply_1.replyToStaff)(job.sender, '⚠️ Test: no products found in that order. Nothing was saved.', job.wamid);
        return;
    }
    const shown = Object.assign(Object.assign({}, data), { order: Object.assign(Object.assign({}, data.order), { order_items: items }) });
    if (changing)
        await (0, staff_check_1.endChange)(job.sender, staff_check_1.TEST_ORDER);
    await (0, staff_check_1.rememberOrderPayload)(testKey, shown);
    await (0, staff_reply_1.replyToStaff)(job.sender, (0, staff_check_1.orderSummaryText)({
        heading: changing ? '✏️ *Test order* updated · not saved' : '🧪 *Test order* · not saved',
        data: shown,
    }), job.wamid, (0, staff_check_1.orderButtons)(staff_check_1.TEST_ORDER));
}
