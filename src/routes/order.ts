import express from 'express';
import OrderService from '../modules/orders/service';
import { UUID } from 'crypto';
import OrderTrackingService from '../modules/order_tracking/service';

export const orderRouter = express.Router();

const orderService = new OrderService();
const orderTrackingService = new OrderTrackingService();

// GET /api/orders - Get all orders with optional pagination, search, and sorting
orderRouter.get('/', async (req, res) => {
  const { limit, offset, search, sortBy, sortOrder } = req.query;

  try {
    const { orders, pagination } = await orderService.getAllOrders({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });
    res.status(200).json({
      success: true,
      orders: orders,
      pagination,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id - Get order by ID
orderRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const orderId = id as UUID;

  try {
    const order = await orderService.getOrderById(orderId);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

orderRouter.get('/customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const custId = customerId as UUID;

  try {
    const orders = await orderService.getOrdersByCustomerId(custId);
    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders by customer ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders - Create a new order
orderRouter.post('/', async (req, res) => {
  const orderData = req.body;

  try {
    const newOrder = await orderService.createOrder(orderData);
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: newOrder,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id - Update an existing order
orderRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const orderId = id as UUID;
  const updates = req.body;

  try {
    const updatedOrder = await orderService.updateOrder(orderId, updates);
    res.status(200).json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/orders/bulk - Bulk delete orders
orderRouter.delete('/bulk', async (req, res) => {
  console.log('Bulk delete request body:', req.body);
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    const deletedOrders = await orderService.bulkDeleteOrders(ids);

    res.json({
      success: true,
      deletedCount: deletedOrders?.length || 0,
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/orders/:id - Delete an order
orderRouter.delete('/:id', async (req, res) => {
  console.log('Bulk delete request body from /:id:', req.body);

  const { id } = req.params;
  const orderId = id as UUID;
  try {
    await orderService.deleteOrder(orderId);
    res
      .status(200)
      .json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id/tracking - Get tracking info for an order
orderRouter.get('/:id/tracking', async (req, res) => {
  const { id } = req.params;
  const orderId = id as UUID;

  try {
    const trackingEntries =
      await orderTrackingService.getTrackingEntriesByOrderId(orderId);
    res.status(200).json({
      success: true,
      tracking_entries: trackingEntries,
      total: trackingEntries.length,
    });
  } catch (error) {
    console.error('Error fetching tracking entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

orderRouter.post('/:id/tracking', async (req, res) => {
  const { id } = req.params;
  const orderId = id as UUID;
  const trackingData = req.body;

  try {
    const newTrackingEntry = await orderTrackingService.addTrackingEntry(
      trackingData,
      orderId
    );
    res.status(201).json({
      success: true,
      message: 'Tracking entry created successfully',
      tracking_entry: newTrackingEntry,
    });
  } catch (error) {
    console.error('Error creating tracking entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
