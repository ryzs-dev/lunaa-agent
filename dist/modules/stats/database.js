"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class StatsDatabase {
    async getDashboardStats(month) {
        var _a, _b, _c, _d, _e;
        const monthStart = `${month}-01`;
        // 1️⃣ total customers (all-time)
        const { count: total_customers, error: customerError } = await supabase_1.supabase
            .from('customers')
            .select('*', { count: 'exact', head: true });
        if (customerError)
            throw customerError;
        // 2️⃣ KPI stats
        const { data: statsData, error: statsError } = await supabase_1.supabase.rpc('get_dashboard_stats', { month_start: monthStart });
        if (statsError)
            throw statsError;
        const statsRow = (_a = statsData === null || statsData === void 0 ? void 0 : statsData[0]) !== null && _a !== void 0 ? _a : {};
        // 3️⃣ Revenue chart (weekly)
        const { data: revenueChart, error: chartError } = await supabase_1.supabase.rpc('get_monthly_revenue_chart', { month_start: monthStart });
        if (chartError)
            throw chartError;
        const { data: customerAcquisition, error: customerAcquisitionError } = await supabase_1.supabase.rpc('get_customer_acquisition_6_months', {
            month_start: monthStart,
        });
        if (customerAcquisitionError)
            throw customerAcquisitionError;
        return {
            stats: {
                total_customers,
                total_orders: (_b = statsRow.total_orders) !== null && _b !== void 0 ? _b : 0,
                total_revenue: (_c = statsRow.total_revenue) !== null && _c !== void 0 ? _c : 0,
                average_order_value: (_d = statsRow.average_order_value) !== null && _d !== void 0 ? _d : 0,
                mtd_revenue: (_e = statsRow.total_revenue) !== null && _e !== void 0 ? _e : 0,
            },
            charts: {
                revenue: revenueChart !== null && revenueChart !== void 0 ? revenueChart : [],
                customer_acquisition: customerAcquisition !== null && customerAcquisition !== void 0 ? customerAcquisition : [],
            },
        };
    }
}
exports.default = StatsDatabase;
