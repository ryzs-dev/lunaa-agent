import express from 'express';
import { UUID } from 'crypto';
import DistributorService from '../modules/distributor/service';

export const distributorRouter = express.Router();

const distributorService = new DistributorService();

// GET /api/distributors - List distributors with their order counts
distributorRouter.get('/', async (_req, res) => {
  try {
    const distributors = await distributorService.getAllDistributors();
    res.status(200).json({ success: true, distributors });
  } catch (error) {
    console.error('Error fetching distributors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/distributors - Add a distributor by phone number
distributorRouter.post('/', async (req, res) => {
  const { name, phone_number, notes } = req.body ?? {};

  if (!phone_number || typeof phone_number !== 'string') {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const result = await distributorService.createDistributor({
      name,
      phone_number,
      notes,
    });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Error creating distributor:', error);
    if (error instanceof Error && error.message === 'Invalid phone number') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/distributors/:id - Remove a distributor; their orders move back to customer orders
distributorRouter.delete('/:id', async (req, res) => {
  try {
    const result = await distributorService.deleteDistributor(
      req.params.id as UUID
    );
    if (!result) {
      return res.status(404).json({ error: 'Distributor not found' });
    }
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error deleting distributor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
