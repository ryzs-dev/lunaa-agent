"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parcelDailyRouter = void 0;
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const service_1 = require("../../modules/parcel-daily/service");
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
exports.parcelDailyRouter = express_1.default.Router();
const PARCEL_DAILY_API_URL = process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';
const parcelDailyService = new service_1.ParcelDailyService(PARCEL_DAILY_API_URL);
// GET /account-info - Fetch account information from Parcel Daily
exports.parcelDailyRouter.get('/account-info', async (req, res) => {
    try {
        const { data } = await parcelDailyService.getAccountInfo();
        return res.status(200).json({ success: true, data: data });
    }
    catch (error) {
        console.error('Error fetching account info:', error);
        return res.status(500).json({ error: 'Failed to fetch account info' });
    }
});
// POST /order/create - Create a new shipment
exports.parcelDailyRouter.post('/order/create', async (req, res) => {
    var _a;
    const { shipmentData, orderId } = req.body;
    const result = await parcelDailyService.createShipment(shipmentData, orderId);
    // 👇 IMPORTANT: do not wrap failures as success
    if ((result === null || result === void 0 ? void 0 : result.success) === false) {
        return res
            .status(result.status || 400)
            .json(result);
    }
    return res.status(200).json({
        success: true,
        data: (_a = result.data) !== null && _a !== void 0 ? _a : result,
    });
});
// POST /order/create/bulk - Create multiple shipments in bulk
exports.parcelDailyRouter.post('/order/create/bulk', async (req, res) => {
    const orders = req.body.shipments;
    if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ error: 'Invalid orders array' });
    }
    try {
        const results = await parcelDailyService.createBulkShipments(orders);
        return res.status(200).json({ success: true, data: results });
    }
    catch (error) {
        console.error('Error creating bulk shipments:', error);
        return res.status(500).json({ error: 'Failed to create bulk shipments' });
    }
});
// GET /order/status
exports.parcelDailyRouter.get('/order/:id', async (req, res) => {
    const { id } = req.params;
    const orderId = id;
    try {
        const result = await parcelDailyService.getOrderStatus(orderId);
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        console.error('Error fetching order status:', error);
        return res.status(500).json({ error: 'Failed to fetch order status' });
    }
});
