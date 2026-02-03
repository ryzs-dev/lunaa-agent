"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
class StatsService {
    constructor() {
        this.statsDatabase = new database_1.default();
    }
    async getDashboardStats(month) {
        var _a, _b, _c, _d, _e, _f;
        if (!month) {
            throw new Error('Month is required (YYYY-MM)');
        }
        const result = await this.statsDatabase.getDashboardStats(month);
        return {
            stats: {
                total_customers: (_a = result.stats.total_customers) !== null && _a !== void 0 ? _a : 0,
                total_orders: (_b = result.stats.total_orders) !== null && _b !== void 0 ? _b : 0,
                total_revenue: (_c = result.stats.total_revenue) !== null && _c !== void 0 ? _c : 0,
                average_order_value: (_d = result.stats.average_order_value) !== null && _d !== void 0 ? _d : 0,
                mtd_revenue: (_e = result.stats.mtd_revenue) !== null && _e !== void 0 ? _e : 0,
            },
            charts: (_f = result.charts) !== null && _f !== void 0 ? _f : {},
        };
    }
}
exports.default = StatsService;
