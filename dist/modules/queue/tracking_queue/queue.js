"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueTrackingJobs = enqueueTrackingJobs;
exports.enqueueTrackingFromAdmin = enqueueTrackingFromAdmin;
const bullmq_1 = require("bullmq");
const __1 = __importDefault(require(".."));
const service_1 = require("../../google/service");
const googleSheetService = new service_1.GoogleSheetService();
const trackingQueue = new bullmq_1.Queue('tracking_queue', {
    connection: __1.default,
});
async function enqueueTrackingJobs() {
    var _a, _b, _c, _d;
    const rows = await googleSheetService.getSheetData('Test');
    const header = rows[0];
    const nameCol = header.findIndex((c) => c.toLowerCase().includes('name'));
    const phoneCol = header.findIndex((c) => c.toLowerCase().includes('phone'));
    const trackingCol = header.findIndex((c) => c.toLowerCase().includes('tracking'));
    const courierCol = header.findIndex((c) => c.toLowerCase().includes('couriers company') ||
        c.toLowerCase().includes('courier company') ||
        c.toLowerCase().includes('courier'));
    const jobs = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = (_a = row[nameCol]) === null || _a === void 0 ? void 0 : _a.trim();
        const phone = (_b = row[phoneCol]) === null || _b === void 0 ? void 0 : _b.trim();
        const tracking = (_c = row[trackingCol]) === null || _c === void 0 ? void 0 : _c.trim();
        const courier = (_d = row[courierCol]) === null || _d === void 0 ? void 0 : _d.trim();
        if (!phone || !tracking)
            continue;
        jobs.push({
            name,
            phone,
            tracking,
            courier,
            createdAt: new Date().toISOString(),
        });
    }
    await trackingQueue.addBulk(jobs.map((data) => ({ name: 'sendTracking', data })));
    console.log(`📦 Enqueued ${jobs.length} tracking jobs`);
}
async function enqueueTrackingFromAdmin(body) {
    // Normalize to array
    const items = Array.isArray(body) ? body : [body];
    // Build jobs
    const jobs = items
        .filter((item) => item.phone && item.tracking)
        .map((item) => ({
        name: 'sendTracking',
        data: {
            orderTrackingId: item.orderTrackingId,
            name: item.name,
            phone: item.phone,
            tracking: item.tracking,
            courier: item.courier,
            createdAt: new Date().toISOString(),
        },
    }));
    if (jobs.length === 0) {
        throw new Error('No valid tracking jobs to enqueue');
    }
    // Enqueue
    if (jobs.length === 1) {
        await trackingQueue.add(jobs[0].name, jobs[0].data);
    }
    else {
        await trackingQueue.addBulk(jobs);
    }
    console.log(`📦 Enqueued ${jobs.length} tracking job(s)`);
}
