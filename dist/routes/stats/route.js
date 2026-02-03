"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../../modules/stats/service"));
exports.statsRouter = express_1.default.Router();
const statsService = new service_1.default();
exports.statsRouter.get('/dashboard', async (req, res) => {
    try {
        const { month } = req.query;
        // Default → current month (YYYY-MM)
        const resolvedMonth = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
            ? month
            : new Date().toISOString().slice(0, 7);
        const { stats, charts } = await statsService.getDashboardStats(resolvedMonth);
        res.status(200).json({
            success: true,
            month: resolvedMonth,
            stats,
            charts
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
