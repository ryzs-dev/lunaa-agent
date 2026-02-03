import express from 'express';
import StatsService from '../../modules/stats/service';

export const statsRouter = express.Router();

const statsService = new StatsService();

statsRouter.get('/dashboard', async (req, res) => {
  try {
    const { month } = req.query;

    // Default → current month (YYYY-MM)
    const resolvedMonth =
      typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
        ? month
        : new Date().toISOString().slice(0, 7);

    const {stats, charts} = await statsService.getDashboardStats(resolvedMonth);

    res.status(200).json({
      success: true,
      month: resolvedMonth,
      stats,
      charts
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});
