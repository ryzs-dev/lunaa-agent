"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
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
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const googleSheetService = new service_4.GoogleSheetService();
const worker = new bullmq_1.Worker('orders', async (job) => {
    try {
        const customer = await customerService.createCustomer(job.data.customer);
        const address = await addressService.createAddress(Object.assign({ customer_id: customer.id }, job.data.address));
        const _a = job.data.order, { shipment_description } = _a, orderData = __rest(_a, ["shipment_description"]);
        // Run DB + Google Sheets concurrently
        const [dbResult, sheetResult] = await Promise.all([
            orderService.createOrder(Object.assign({ customer_id: customer.id, address_id: address.id }, orderData)),
            googleSheetService.createOrder(job.data),
        ]);
        console.log('Both operations completed:', { dbResult, sheetResult });
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
