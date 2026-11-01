import express from 'express';
import { getShippingRules, ShippingRulesError, updateShippingRules } from '../modules/shipping/rules';

export const shippingRouter = express.Router();

// GET /api/shipping/rules - fallback courier, COD courier, COD detection
shippingRouter.get('/rules', async (_req, res) => {
  try {
    res.json({ success: true, rules: await getShippingRules() });
  } catch (error) {
    console.error('Error fetching shipping rules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/shipping/rules { fallback_courier?, cod_courier?, detect_cod?, updated_by? }
shippingRouter.put('/rules', async (req, res) => {
  try {
    res.json({ success: true, rules: await updateShippingRules(req.body ?? {}) });
  } catch (error) {
    if (error instanceof ShippingRulesError) return res.status(400).json({ error: error.message });
    console.error('Error saving shipping rules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
