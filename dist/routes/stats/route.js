"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../../modules/stats/service"));
const export_1 = require("../../modules/stats/export");
const report_1 = require("../../modules/stats/report");
const timezone_1 = require("../../utils/timezone");
exports.statsRouter = express_1.default.Router();
const statsService = new service_1.default();
exports.statsRouter.get('/dashboard', async (req, res) => {
    try {
        const { month } = req.query;
        const resolvedMonth = (0, timezone_1.resolveMonthKey)(typeof month === 'string' ? month : undefined);
        const { stats, repeat_order_value, channels, charts } = await statsService.getDashboardStats(resolvedMonth);
        res.status(200).json({
            success: true,
            month: resolvedMonth,
            stats,
            repeat_order_value,
            channels,
            charts,
        });
    }
    catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
// One row per day of the month: orders, revenue, new and returning customers,
// plus month totals with each customer counted once.
exports.statsRouter.get('/daily', async (req, res) => {
    try {
        const month = (0, timezone_1.resolveMonthKey)(typeof req.query.month === 'string' ? req.query.month : undefined);
        const { days, totals } = await statsService.getDailyBreakdown(month);
        res.status(200).json({ success: true, month, days, totals });
    }
    catch (error) {
        console.error('Error fetching daily breakdown:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
// A report staff put together: ?period=day&date=YYYY-MM-DD or
// ?period=month&month=YYYY-MM, sections=a,b,c, columns=a,b,c, format=xlsx|csv.
exports.statsRouter.get('/report', async (req, res) => {
    var _a;
    try {
        const q = (k) => (typeof req.query[k] === 'string' ? req.query[k] : '');
        const list = (k) => q(k).split(',').map((s) => s.trim()).filter(Boolean);
        const period = q('period') === 'day'
            ? (() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(q('date')))
                    throw new Error('Pick a day');
                return { kind: 'day', date: q('date') };
            })()
            : { kind: 'month', month: (0, timezone_1.resolveMonthKey)(q('month') || undefined) };
        const sections = list('sections').filter((s) => report_1.REPORT_SECTIONS.includes(s));
        if (!sections.length)
            throw new Error('Choose at least one thing to include');
        const orderColumns = list('columns').filter((c) => c in report_1.ORDER_COLUMNS);
        const report = await (0, report_1.buildReport)({
            period,
            sections,
            orderColumns,
            format: q('format') === 'csv' ? 'csv' : 'xlsx',
        });
        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
        res.status(200).send(report.body);
    }
    catch (error) {
        console.error('Error building report:', error);
        res.status(400).json({ success: false, message: (_a = error.message) !== null && _a !== void 0 ? _a : 'Could not build the report' });
    }
});
exports.statsRouter.get('/export', async (req, res) => {
    try {
        const month = (0, timezone_1.resolveMonthKey)(typeof req.query.month === 'string' ? req.query.month : undefined);
        const csv = await (0, export_1.monthOrdersCsv)(month);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="lunaa-sales-${month}.csv"`);
        res.status(200).send(csv);
    }
    catch (error) {
        console.error('Error exporting month:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
exports.statsRouter.get('/products', async (req, res) => {
    try {
        const { month } = req.query;
        const resolvedMonth = (0, timezone_1.resolveMonthKey)(typeof month === 'string' ? month : undefined);
        const products = await statsService.getProductPerformance(resolvedMonth);
        res.status(200).json({
            success: true,
            month: resolvedMonth,
            products,
        });
    }
    catch (error) {
        console.error('Error fetching product performance:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
exports.statsRouter.get('/products/:productId', async (req, res) => {
    try {
        const { month, monthsBack } = req.query;
        const resolvedMonth = (0, timezone_1.resolveMonthKey)(typeof month === 'string' ? month : undefined);
        const parsedMonthsBack = typeof monthsBack === 'string' ? Number(monthsBack) : 6;
        const trends = await statsService.getProductMonthlyTrends(req.params.productId, resolvedMonth, Number.isFinite(parsedMonthsBack) ? parsedMonthsBack : 6);
        res.status(200).json({
            success: true,
            month: resolvedMonth,
            productId: req.params.productId,
            trends,
        });
    }
    catch (error) {
        console.error('Error fetching product trends:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
