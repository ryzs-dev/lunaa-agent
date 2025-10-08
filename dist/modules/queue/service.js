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
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const worker = new bullmq_1.Worker('orders', async (job) => {
    console.log('Processing job:', job.data);
    try {
        const customer = await customerService.createCustomer(job.data.customer);
        const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, job.data.address));
        const order = await orderService.createOrder(Object.assign({ customer_id: customer.id, address_id: address.id }, job.data.order));
        console.log('Job completed:', job.id);
    }
    catch (error) {
        console.error('Error processing job:', job.id, error);
    }
}, { connection: _1.default });
worker.on('completed', (job) => {
    console.log(`✅ Worker event: Job ${job.id} completed`);
});
worker.on('failed', (job, err) => {
    console.log(`❌ Worker event: Job ${job === null || job === void 0 ? void 0 : job.id} failed:`, err);
});
