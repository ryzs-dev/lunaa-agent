import express from 'express';
import StatsService from '../../modules/stats/service';
import { resolveMonthKey } from '../../utils/timezone';

export const statsRouter = express.Router();

const statsService = new StatsService();

statsRouter.get('/dashboard', async (req, res) => {
  try {
    const { month } = req.query;
    const resolvedMonth = resolveMonthKey(
      typeof month === 'string' ? month : undefined
    );

    const { stats, charts } = await statsService.getDashboardStats(resolvedMonth);

    res.status(200).json({
      success: true,
      month: resolvedMonth,
      stats,
      charts,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

statsRouter.get('/products', async (req, res) => {
  try {
    const { month } = req.query;
    const resolvedMonth = resolveMonthKey(
      typeof month === 'string' ? month : undefined
    );

    const products = await statsService.getProductPerformance(resolvedMonth);

    res.status(200).json({
      success: true,
      month: resolvedMonth,
      products,
    });
  } catch (error) {
    console.error('Error fetching product performance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

statsRouter.get('/products/:productId', async (req, res) => {
  try {
    const { month, monthsBack } = req.query;
    const resolvedMonth = resolveMonthKey(
      typeof month === 'string' ? month : undefined
    );
    const parsedMonthsBack =
      typeof monthsBack === 'string' ? Number(monthsBack) : 6;

    const trends = await statsService.getProductMonthlyTrends(
      req.params.productId,
      resolvedMonth,
      Number.isFinite(parsedMonthsBack) ? parsedMonthsBack : 6
    );

    res.status(200).json({
      success: true,
      month: resolvedMonth,
      productId: req.params.productId,
      trends,
    });
  } catch (error) {
    console.error('Error fetching product trends:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});
