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
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const googleSheetService = new service_4.GoogleSheetService();
const orderTrackingService = new service_5.default();
const worker = new bullmq_1.Worker('orders', async (job) => {
    var _a, _b, _c;
    try {
        const customer = await customerService.createCustomer(job.data.customer);
        const existingOrder = await orderService.findSimilarOrder({
            customer_id: customer.id,
            order_date: (_a = job.data.order) === null || _a === void 0 ? void 0 : _a.order_date,
            total_amount: (_b = job.data.order) === null || _b === void 0 ? void 0 : _b.total_amount,
            shipment_description: (_c = job.data.order) === null || _c === void 0 ? void 0 : _c.shipment_description,
        });
        let dbResult = existingOrder;
        if (!existingOrder) {
            const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, job.data.address));
            dbResult = await orderService.createOrder(Object.assign({ customer_id: customer.id, address_id: address.id, remark: job.data.remark }, job.data.order));
        }
        const sheetResult = await googleSheetService.createOrder(job.data);
        console.log('Both operations completed:', { dbResult, sheetResult });
        if (!sheetResult.success) {
            throw new Error(`Google Sheets write failed after CRM save: ${sheetResult.error}`);
        }
    }
    catch (error) {
        console.error('Error processing job:', job.id, error);
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
