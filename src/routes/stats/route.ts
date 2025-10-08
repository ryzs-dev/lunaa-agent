import express from 'express';
import { Stats } from 'fs';
import StatsService from '../../modules/stats/service';

export const statsRouter = express.Router();

const statsService = new StatsService();

statsRouter.get('/dashboard', async (req, res) => {
  try {
    const stats = await statsService.getDashboardStats();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
