"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const _1 = __importDefault(require("."));
const service_1 = __importDefault(require("../customer/service"));
const service_2 = __importDefault(require("../address/service"));
const service_3 = __importDefault(require("../orders/service"));
const service_4 = require("../google/service");
const service_5 = __importDefault(require("../order_tracking/service"));
const service_6 = __importDefault(require("../receipts/service"));
const staff_reply_1 = require("../receipts/staff-reply");
const staff_actions_1 = require("../orders/staff-actions");
const staff_check_1 = require("../orders/staff-check");
const database_1 = __importDefault(require("../receipts/database"));
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const googleSheetService = new service_4.GoogleSheetService();
const orderTrackingService = new service_5.default();
const receiptService = new service_6.default();
const receiptDb = new database_1.default();
const worker = new bullmq_1.Worker('orders', async (job) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // A receipt sent on its own, after the order it pays for.
    if (job.name === 'receipt.received') {
        const { media, sender, caption, received_at } = job.data;
        if ((0, staff_check_1.orderTestOn)(sender)) {
            await (0, staff_reply_1.replyToStaff)(sender, '🧪 Test: receipt received. Nothing was saved.', media.wamid);
            return;
        }
        const receipt = await receiptService.ingestStandalone(Object.assign(Object.assign({}, media), { sender, caption, received_at }));
        const order = receipt.order_id ? await receiptDb.getOrderTotal(receipt.order_id) : null;
        await (0, staff_reply_1.replyToStaff)(sender, (0, staff_reply_1.receiptOnlyText)(order === null || order === void 0 ? void 0 : order.order_number, receipt), media.wamid);
        return;
    }
    if (job.name === 'order.button') {
        await (0, staff_actions_1.handleOrderButton)(job.data);
        return;
    }
    // Staff chat comes through here too: only answer what looks like an order.
    const lookedLikeOrder = ((_a = job.data.order) === null || _a === void 0 ? void 0 : _a.total_amount) || ((_b = job.data.customer) === null || _b === void 0 ? void 0 : _b.phone_number);
    // Test numbers only see what the bot read; nothing is saved.
    if ((0, staff_check_1.orderTestOn)(job.data.sender)) {
        if (lookedLikeOrder) {
            const changing = (await (0, staff_check_1.orderBeingChanged)(job.data.sender)) === staff_check_1.TEST_ORDER;
            await (0, staff_actions_1.previewOrder)(job.data, changing);
        }
        return;
    }
    // The sender tapped Change: this message replaces that order.
    const changing = lookedLikeOrder ? await (0, staff_check_1.orderBeingChanged)(job.data.sender) : null;
    if (changing) {
        try {
            await (0, staff_actions_1.correctOrder)(job.data, changing);
        }
        catch (error) {
            console.error('Error correcting order:', changing, error);
            const noItems = error instanceof Error && /order item/i.test(error.message);
            await (0, staff_reply_1.replyToStaff)(job.data.sender, `⚠️ Order not changed: ${noItems ? 'no products found' : 'some details are missing'}. Please check and send it again.`, job.data.wamid);
            throw error;
        }
        return;
    }
    let savedOrder = null;
    try {
        const customer = await customerService.createCustomer(job.data.customer);
        const existingOrder = await orderService.findSimilarOrder({
            customer_id: customer.id,
            order_date: (_c = job.data.order) === null || _c === void 0 ? void 0 : _c.order_date,
            total_amount: (_d = job.data.order) === null || _d === void 0 ? void 0 : _d.total_amount,
            shipment_description: (_e = job.data.order) === null || _e === void 0 ? void 0 : _e.shipment_description,
        });
        let dbResult = existingOrder;
        savedOrder = existingOrder;
        if (!existingOrder) {
            const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, job.data.address));
            dbResult = await orderService.createOrder(Object.assign({ customer_id: customer.id, address_id: address.id, remark: job.data.remark, created_by_phone: job.data.sender }, job.data.order));
            savedOrder = dbResult;
        }
        // The receipt that came with the order, as the photo it was captioned on.
        // A failure here never loses the order.
        let receipt = null;
        if (job.data.receipt && (dbResult === null || dbResult === void 0 ? void 0 : dbResult.id)) {
            try {
                receipt = await receiptService.ingest(Object.assign(Object.assign({}, job.data.receipt), { sender: (_f = job.data.sender) !== null && _f !== void 0 ? _f : null, caption: null }), dbResult.id);
            }
            catch (error) {
                console.error('Error saving receipt for job', job.id, error);
            }
        }
        // The same order often arrives twice: pasted as text, then forwarded with
        // its receipt photo. The first copy already wrote the sheet row. On a retry
        // the order may be this job's own from the failed attempt, so write again.
        if (existingOrder && job.attemptsMade === 0) {
            console.log('Order already recorded, skipping sheet row:', existingOrder.id);
            await (0, staff_reply_1.replyToStaff)(job.data.sender, (0, staff_reply_1.orderRepeatText)(existingOrder, receipt), job.data.wamid);
            return;
        }
        const sheetResult = await googleSheetService.createOrder(job.data);
        console.log('Both operations completed:', { dbResult, sheetResult });
        if (!sheetResult.success) {
            throw new Error(`Google Sheets write failed after CRM save: ${sheetResult.error}`);
        }
        if (!(0, staff_check_1.orderButtonsOn)(job.data.sender) || !(dbResult === null || dbResult === void 0 ? void 0 : dbResult.id)) {
            await (0, staff_reply_1.replyToStaff)(job.data.sender, (0, staff_reply_1.orderReceivedText)(dbResult !== null && dbResult !== void 0 ? dbResult : {}, (_g = job.data.customer) === null || _g === void 0 ? void 0 : _g.name, receipt), job.data.wamid);
            return;
        }
        // The sheet write filled in product names, which the summary shows.
        await (0, staff_check_1.rememberOrderPayload)(dbResult.id, job.data).catch((error) => console.error('Could not remember order for corrections:', error));
        await (0, staff_reply_1.replyToStaff)(job.data.sender, (0, staff_check_1.orderSummaryText)({
            heading: '✅ Order saved',
            orderNumber: dbResult === null || dbResult === void 0 ? void 0 : dbResult.order_number,
            orderDate: dbResult === null || dbResult === void 0 ? void 0 : dbResult.order_date,
            data: job.data,
            extraLines: [receipt ? (0, staff_reply_1.receiptLine)(receipt) : null],
        }), job.data.wamid, (0, staff_check_1.orderButtons)(dbResult.id));
    }
    catch (error) {
        console.error('Error processing job:', job.id, error);
        if (lookedLikeOrder && job.attemptsMade + 1 >= ((_h = job.opts.attempts) !== null && _h !== void 0 ? _h : 1)) {
            const noItems = error instanceof Error && /order item/i.test(error.message);
            await (0, staff_reply_1.replyToStaff)(job.data.sender, (0, staff_reply_1.orderFailedText)(savedOrder === null || savedOrder === void 0 ? void 0 : savedOrder.order_number, noItems ? 'no products found' : 'some details are missing'), job.data.wamid);
        }
        throw error;
    }
}, { connection: _1.default });
worker.on('completed', (job) => {
    console.log(`✅ Worker event: Job ${job.id} completed`);
});
worker.on('failed', (job, err) => {
    console.log(`❌ Worker event: Job ${job === null || job === void 0 ? void 0 : job.id} failed:`, err);
});
const trackingWorker = new bullmq_1.Worker('tracking_update_queue', async (job) => {
    console.log('Job data:', job.data);
    const { orderTrackingId, status, last_message_sent_at } = job.data;
    await orderTrackingService.updateTrackingEntry(orderTrackingId, {
        message_status: status,
        last_message_sent_at,
    });
    console.log(`CRM updated order_tracking ${orderTrackingId} with status ${status}`);
}, { connection: _1.default });
trackingWorker.on('completed', (job) => {
    console.log(`✅ Tracking status job ${job.id} completed`);
});
trackingWorker.on('failed', (job, err) => {
    console.error(`❌ Tracking status job ${job === null || job === void 0 ? void 0 : job.id} failed`, err);
});
