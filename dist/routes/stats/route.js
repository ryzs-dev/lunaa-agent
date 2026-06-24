"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../../modules/stats/service"));
const timezone_1 = require("../../utils/timezone");
exports.statsRouter = express_1.default.Router();
const statsService = new service_1.default();
exports.statsRouter.get('/dashboard', async (req, res) => {
    try {
        const { month } = req.query;
        const resolvedMonth = (0, timezone_1.resolveMonthKey)(typeof month === 'string' ? month : undefined);
        const { stats, charts } = await statsService.getDashboardStats(resolvedMonth);
        res.status(200).json({
            success: true,
            month: resolvedMonth,
            stats,
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
