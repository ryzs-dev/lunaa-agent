"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../modules/orders/service"));
const service_2 = __importDefault(require("../modules/order_tracking/service"));
exports.orderRouter = express_1.default.Router();
const orderService = new service_1.default();
const orderTrackingService = new service_2.default();
// GET /api/orders - Get all orders with optional pagination, search, and sorting
exports.orderRouter.get('/', async (req, res) => {
    const { limit, offset, search, sortBy, sortOrder: sortOrderQuery, dateFrom, dateTo, } = req.query;
    try {
        const { orders, pagination } = await orderService.getAllOrders({
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : 0,
            search: search,
            sortBy: sortBy || 'created_at',
            sortOrder: (sortOrderQuery === 'asc' ? 'asc' : 'desc'),
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
        });
        res.status(200).json({
            success: true,
            orders,
            pagination,
        });
    }
    catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/orders/:id - Get order by ID
exports.orderRouter.get('/:id', async (req, res) => {
    const { id } = req.params;
    const orderId = id;
    try {
        const order = await orderService.getOrderById(orderId);
        res.status(200).json({ success: true, order });
    }
    catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.orderRouter.get('/customer/:customerId', async (req, res) => {
    const { customerId } = req.params;
    const custId = customerId;
    try {
        const orders = await orderService.getOrdersByCustomerId(custId);
        res.status(200).json({ success: true, orders });
    }
    catch (error) {
        console.error('Error fetching orders by customer ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/orders - Create a new order
exports.orderRouter.post('/', async (req, res) => {
    const orderData = req.body;
    try {
        const newOrder = await orderService.createOrder(orderData);
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            order: newOrder,
        });
    }
    catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/orders/:id - Update an existing order
exports.orderRouter.patch('/:id', async (req, res) => {
    var _a;
    const { id } = req.params;
    console.log('Update request for order ID:', id);
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid order ID' });
    }
    const orderId = id;
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Invalid update payload' });
    }
    try {
        const updatedOrder = await orderService.updateOrder(orderId, updates);
        res.status(200).json({ success: true, order: updatedOrder });
    }
    catch (error) {
        console.error('Error updating order:', error);
        if (error instanceof Error && ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('duplicate key'))) {
            return res.status(400).json({ error: 'Duplicate order item detected' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/orders/bulk - Bulk delete orders
exports.orderRouter.delete('/bulk', async (req, res) => {
    console.log('Bulk delete request body:', req.body);
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Invalid ids array' });
        }
        const deletedOrders = await orderService.bulkDeleteOrders(ids);
        res.json({
            success: true,
            deletedCount: (deletedOrders === null || deletedOrders === void 0 ? void 0 : deletedOrders.length) || 0,
        });
    }
    catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/orders/:id - Delete an order
exports.orderRouter.delete('/:id', async (req, res) => {
    console.log('Bulk delete request body from /:id:', req.body);
    const { id } = req.params;
    const orderId = id;
    try {
        await orderService.deleteOrder(orderId);
        res
            .status(200)
            .json({ success: true, message: 'Order deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/orders/:id/tracking - Get tracking info for an order
exports.orderRouter.get('/:id/tracking', async (req, res) => {
    const { id } = req.params;
    const orderId = id;
    try {
        const trackingEntries = await orderTrackingService.getTrackingEntriesByOrderId(orderId);
        res.status(200).json({
            success: true,
            tracking_entries: trackingEntries,
            total: trackingEntries.length,
        });
    }
    catch (error) {
        console.error('Error fetching tracking entries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.orderRouter.post('/:id/tracking', async (req, res) => {
    const { id } = req.params;
    const orderId = id;
    const trackingData = req.body;
    try {
        const newTrackingEntry = await orderTrackingService.addTrackingEntry(trackingData, orderId);
        res.status(201).json({
            success: true,
            message: 'Tracking entry created successfully',
            tracking_entry: newTrackingEntry,
        });
    }
    catch (error) {
        console.error('Error creating tracking entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Order Line Items
exports.orderRouter.patch('/:order_id/line-items', async (req, res) => {
    try {
        const { order_id } = req.params;
        const payload = req.body;
        if (!payload.line_items || !Array.isArray(payload.line_items)) {
            return res.status(400).json({ error: 'line_items is required' });
        }
        if (payload.total_amount === undefined || payload.total_amount < 0) {
            return res.status(400).json({ error: 'total_amount is required' });
        }
        const updatedOrder = await orderService.updateLineItems(order_id, payload);
        return res.status(200).json({ data: updatedOrder });
    }
    catch (err) {
        console.error('Failed to update line items:', err);
        return res
            .status(500)
            .json({ error: err.message || 'Internal server error' });
    }
});
