"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOrderButton = handleOrderButton;
exports.correctOrder = correctOrder;
const supabase_1 = require("../supabase");
const service_1 = __importDefault(require("../customer/service"));
const service_2 = __importDefault(require("../address/service"));
const service_3 = __importDefault(require("./service"));
const service_4 = require("../google/service");
const service_5 = __importDefault(require("../receipts/service"));
const staff_reply_1 = require("../receipts/staff-reply");
const staff_check_1 = require("./staff-check");
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const googleSheetService = new service_4.GoogleSheetService();
const receiptService = new service_5.default();
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
    await (0, staff_reply_1.replyToStaff)(tap.sender, `✏️ Send the corrected order for ${order.order_number} now, as the whole order message. ` +
        'It will replace this order and its sheet row. You have 30 minutes.', tap.wamid);
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
    const data = (0, staff_check_1.fillCorrection)(job, previous);
    if (!((_a = data.order.order_items) === null || _a === void 0 ? void 0 : _a.length)) {
        await (0, staff_reply_1.replyToStaff)(job.sender, `⚠️ ${order.order_number} not changed: no products found. Please send the whole order again.`, job.wamid);
        return;
    }
    const customer = await customerService.createCustomer(data.customer);
    const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, data.address));
    const updated = await orderService.updateOrder(orderId, Object.assign({ customer_id: customer.id, address_id: address.id, order_items: data.order.order_items, total_amount: data.order.total_amount, shipment_description: data.order.shipment_description, payment_method: data.order.payment_method, remark: data.remark }, (data.order.order_date ? { order_date: data.order.order_date } : {})));
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
        heading: '✏️ Order updated',
        orderNumber: updated.order_number,
        orderDate: updated.order_date,
        data,
        extraLines: [receipt ? (0, staff_reply_1.receiptLine)(receipt) : null, sheetLine],
    }), job.wamid, (0, staff_check_1.orderButtons)(orderId));
}
