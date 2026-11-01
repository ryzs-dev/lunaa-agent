import express from 'express';
import ReceiptService from '../modules/receipts/service';
import { receiptReadingEnabled } from '../modules/receipts/reader';

export const receiptRouter = express.Router();

const receipts = new ReceiptService();

// GET /api/receipts/order/:orderId - receipts for one order, with view links
receiptRouter.get('/order/:orderId', async (req, res) => {
  try {
    res.json({
      success: true,
      reading_enabled: receiptReadingEnabled(),
      receipts: await receipts.listByOrder(req.params.orderId),
    });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/receipts/unmatched - receipts not linked to any order yet
receiptRouter.get('/unmatched', async (_req, res) => {
  try {
    res.json({ success: true, receipts: await receipts.listUnmatched() });
  } catch (error) {
    console.error('Error fetching unmatched receipts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/receipts/:id/attach { order_number } or { order_id }
receiptRouter.post('/:id/attach', async (req, res) => {
  const { order_id: orderId, order_number: orderNumber } = req.body ?? {};
  try {
    let target = typeof orderId === 'string' ? orderId : null;
    if (!target && typeof orderNumber === 'string' && orderNumber.trim()) {
      const order = await receipts.findOrderByNumber(orderNumber);
      if (!order) return res.status(404).json({ error: `No order ${orderNumber.trim()}` });
      target = order.id;
    }
    if (!target) return res.status(400).json({ error: 'order_number is required' });

    res.json({ success: true, receipt: await receipts.attach(req.params.id, target) });
  } catch (error) {
    console.error('Error attaching receipt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/receipts/:id/recheck - read the receipt again
receiptRouter.post('/:id/recheck', async (req, res) => {
  try {
    const receipt = await receipts.recheck(req.params.id);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ success: true, receipt });
  } catch (error) {
    console.error('Error re-checking receipt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
