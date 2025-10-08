"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
class StatsService {
    constructor() {
        this.StatsDatabase = new database_1.default();
    }
    async getDashboardStats() {
        var _a, _b;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { total_customers, orders } = await this.StatsDatabase.getDashboardStats();
        const total_orders = (orders === null || orders === void 0 ? void 0 : orders.length) || 0;
        const total_revenue = (orders === null || orders === void 0 ? void 0 : orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)) || 0;
        const average_order_value = total_orders > 0 ? total_revenue / total_orders : 0;
        const mtd_revenue = (_b = (_a = orders === null || orders === void 0 ? void 0 : orders.filter((o) => new Date(o.created_at) >= new Date(startOfMonth))) === null || _a === void 0 ? void 0 : _a.reduce((sum, o) => sum + o.total_amount, 0)) !== null && _b !== void 0 ? _b : 0;
        return {
            total_customers,
            total_orders,
            total_revenue,
            average_order_value,
            mtd_revenue,
        };
    }
}
exports.default = StatsService;
