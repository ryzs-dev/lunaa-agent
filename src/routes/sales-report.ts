import express from 'express';
import { reportXlsx, salesReport, setTarget } from '../modules/sales-report';
import { resolveMonthKey } from '../utils/timezone';

export const salesReportRouter = express.Router();

const monthOf = (v: unknown) => resolveMonthKey(typeof v === 'string' ? v : undefined);

salesReportRouter.get('/', async (req, res) => {
  try {
    res.json({ success: true, ...(await salesReport(monthOf(req.query.month))) });
  } catch (error: any) {
    console.error('Error building sales report:', error);
    res.status(400).json({ success: false, message: error.message ?? 'Could not build the report' });
  }
});

salesReportRouter.get('/export', async (req, res) => {
  try {
    const report = await salesReport(monthOf(req.query.month));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lunaa-sales-report-${report.month}.xlsx"`);
    res.status(200).send(reportXlsx(report));
  } catch (error: any) {
    console.error('Error exporting sales report:', error);
    res.status(400).json({ success: false, message: error.message ?? 'Could not build the report' });
  }
});

// { month: 'YYYY-MM', target: number | null }
salesReportRouter.put('/target', async (req, res) => {
  try {
    const month = req.body?.month;
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) throw new Error('Pick a month');
    const raw = req.body?.target;
    const target = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (target != null && (!Number.isFinite(target) || target < 0 || target > 100_000_000)) {
      throw new Error('Enter a target in ringgit');
    }
    await setTarget(month, target);
    res.json({ success: true, ...(await salesReport(month)) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message ?? 'Could not save the target' });
  }
});
