"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class StatsDatabase {
    async getDashboardStats(month) {
        var _a, _b, _c, _d, _e;
        const monthStart = `${month}-01`;
        const { count: total_customers, error: customerError } = await supabase_1.supabase
            .from('customers')
            .select('*', { count: 'exact', head: true });
        if (customerError)
            throw customerError;
        const { data: statsData, error: statsError } = await supabase_1.supabase.rpc('get_dashboard_stats', { month_start: monthStart });
        if (statsError)
            throw statsError;
        const statsRow = (_a = statsData === null || statsData === void 0 ? void 0 : statsData[0]) !== null && _a !== void 0 ? _a : {};
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
    async getProductPerformance(month) {
        const monthStart = `${month}-01`;
        const { data, error } = await supabase_1.supabase.rpc('get_product_performance', {
            month_start: monthStart,
        });
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []).map((row) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            return ({
                product_id: row.product_id,
                product_name: row.product_name,
                total_orders: Number((_a = row.total_orders) !== null && _a !== void 0 ? _a : 0),
                total_revenue: Number((_b = row.total_revenue) !== null && _b !== void 0 ? _b : 0),
                average_order_value: Number((_c = row.average_order_value) !== null && _c !== void 0 ? _c : 0),
                quantity_sold: Number((_d = row.quantity_sold) !== null && _d !== void 0 ? _d : 0),
                unique_customers: Number((_e = row.unique_customers) !== null && _e !== void 0 ? _e : 0),
                repeat_customers: Number((_f = row.repeat_customers) !== null && _f !== void 0 ? _f : 0),
                repeat_customer_rate: Number((_g = row.repeat_customer_rate) !== null && _g !== void 0 ? _g : 0),
                customer_lifetime_value: Number((_h = row.customer_lifetime_value) !== null && _h !== void 0 ? _h : 0),
                previous_month_revenue: Number((_j = row.previous_month_revenue) !== null && _j !== void 0 ? _j : 0),
                revenue_trend: (_k = row.revenue_trend) !== null && _k !== void 0 ? _k : 'stable',
            });
        });
    }
    async getProductMonthlyTrends(productId, month, monthsBack = 6) {
        const monthStart = `${month}-01`;
        const { data, error } = await supabase_1.supabase.rpc('get_product_monthly_trends', {
            p_product_id: productId,
            month_start: monthStart,
            months_back: monthsBack,
        });
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []).map((row) => {
            var _a, _b, _c, _d, _e, _f;
            return ({
                month_label: row.month_label,
                month_start: row.month_start,
                revenue: Number((_a = row.revenue) !== null && _a !== void 0 ? _a : 0),
                quantity_sold: Number((_b = row.quantity_sold) !== null && _b !== void 0 ? _b : 0),
                total_orders: Number((_c = row.total_orders) !== null && _c !== void 0 ? _c : 0),
                first_time_buyers: Number((_d = row.first_time_buyers) !== null && _d !== void 0 ? _d : 0),
                returning_buyers: Number((_e = row.returning_buyers) !== null && _e !== void 0 ? _e : 0),
                repeat_customer_rate: Number((_f = row.repeat_customer_rate) !== null && _f !== void 0 ? _f : 0),
            });
        });
    }
}
exports.default = StatsDatabase;
