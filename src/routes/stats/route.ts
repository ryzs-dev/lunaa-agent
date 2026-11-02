import express from 'express';
import StatsService from '../../modules/stats/service';
import { monthOrdersCsv } from '../../modules/stats/export';
import { buildReport, ORDER_COLUMNS, OrderColumn, REPORT_SECTIONS, ReportSection } from '../../modules/stats/report';
import { resolveMonthKey } from '../../utils/timezone';

export const statsRouter = express.Router();

const statsService = new StatsService();

statsRouter.get('/dashboard', async (req, res) => {
  try {
    const { month } = req.query;
    const resolvedMonth = resolveMonthKey(
      typeof month === 'string' ? month : undefined
    );

    const { stats, repeat_order_value, channels, charts } =
      await statsService.getDashboardStats(resolvedMonth);

    res.status(200).json({
      success: true,
      month: resolvedMonth,
      stats,
      repeat_order_value,
      channels,
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

// One row per day of the month: orders, revenue, new and returning customers,
// plus month totals with each customer counted once.
statsRouter.get('/daily', async (req, res) => {
  try {
    const month = resolveMonthKey(typeof req.query.month === 'string' ? req.query.month : undefined);
    const { days, totals } = await statsService.getDailyBreakdown(month);
    res.status(200).json({ success: true, month, days, totals });
  } catch (error) {
    console.error('Error fetching daily breakdown:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// A report staff put together: ?period=day&date=YYYY-MM-DD or
// ?period=month&month=YYYY-MM, sections=a,b,c, columns=a,b,c, format=xlsx|csv.
statsRouter.get('/report', async (req, res) => {
  try {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
    const list = (k: string) => q(k).split(',').map((s) => s.trim()).filter(Boolean);

    const period =
      q('period') === 'day'
        ? (() => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(q('date'))) throw new Error('Pick a day');
            return { kind: 'day' as const, date: q('date') };
          })()
        : { kind: 'month' as const, month: resolveMonthKey(q('month') || undefined) };

    const sections = list('sections').filter((s): s is ReportSection => (REPORT_SECTIONS as readonly string[]).includes(s));
    if (!sections.length) throw new Error('Choose at least one thing to include');
    const orderColumns = list('columns').filter((c): c is OrderColumn => c in ORDER_COLUMNS);

    const report = await buildReport({
      period,
      sections,
      orderColumns,
      format: q('format') === 'csv' ? 'csv' : 'xlsx',
    });
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.status(200).send(report.body);
  } catch (error: any) {
    console.error('Error building report:', error);
    res.status(400).json({ success: false, message: error.message ?? 'Could not build the report' });
  }
});

statsRouter.get('/export', async (req, res) => {
  try {
    const month = resolveMonthKey(typeof req.query.month === 'string' ? req.query.month : undefined);
    const csv = await monthOrdersCsv(month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lunaa-sales-${month}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting month:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
