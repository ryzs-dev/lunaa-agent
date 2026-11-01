"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../modules/receipts/service"));
const settings_1 = require("../modules/receipts/settings");
exports.receiptRouter = express_1.default.Router();
const receipts = new service_1.default();
// GET /api/receipts/settings - reading switch, key hint (never the key), model, limit, this month's spend
exports.receiptRouter.get('/settings', async (_req, res) => {
    try {
        res.json({ success: true, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        console.error('Error fetching receipt settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/receipts/settings { enabled?, api_key?, clear_key?, model?, monthly_cap_usd?, updated_by? }
exports.receiptRouter.put('/settings', async (req, res) => {
    var _a;
    try {
        res.json({ success: true, settings: await (0, settings_1.updateSettings)((_a = req.body) !== null && _a !== void 0 ? _a : {}) });
    }
    catch (error) {
        if (error instanceof settings_1.SettingsError)
            return res.status(400).json({ error: error.message });
        console.error('Error saving receipt settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/receipts/order/:orderId - receipts for one order, with view links
exports.receiptRouter.get('/order/:orderId', async (req, res) => {
    try {
        res.json({
            success: true,
            reading_enabled: (await (0, settings_1.readingConfig)()).ready,
            receipts: await receipts.listByOrder(req.params.orderId),
        });
    }
    catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/receipts/unmatched - receipts not linked to any order yet
exports.receiptRouter.get('/unmatched', async (_req, res) => {
    try {
        res.json({ success: true, receipts: await receipts.listUnmatched() });
    }
    catch (error) {
        console.error('Error fetching unmatched receipts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/receipts/:id/attach { order_number } or { order_id }
exports.receiptRouter.post('/:id/attach', async (req, res) => {
    var _a;
    const { order_id: orderId, order_number: orderNumber } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
    try {
        let target = typeof orderId === 'string' ? orderId : null;
        if (!target && typeof orderNumber === 'string' && orderNumber.trim()) {
            const order = await receipts.findOrderByNumber(orderNumber);
            if (!order)
                return res.status(404).json({ error: `No order ${orderNumber.trim()}` });
            target = order.id;
        }
        if (!target)
            return res.status(400).json({ error: 'order_number is required' });
        res.json({ success: true, receipt: await receipts.attach(req.params.id, target) });
    }
    catch (error) {
        console.error('Error attaching receipt:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/receipts/:id/recheck - read the receipt again
exports.receiptRouter.post('/:id/recheck', async (req, res) => {
    try {
        const receipt = await receipts.recheck(req.params.id);
        if (!receipt)
            return res.status(404).json({ error: 'Receipt not found' });
        res.json({ success: true, receipt });
    }
    catch (error) {
        console.error('Error re-checking receipt:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
