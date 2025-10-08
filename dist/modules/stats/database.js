"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class StatsDatabase {
    async getDashboardStats() {
        const { count: total_customers } = await supabase_1.supabase
            .from('customers')
            .select('*', { count: 'exact', head: true });
        const { data: orders } = await supabase_1.supabase
            .from('orders')
            .select('total_amount, created_at');
        return { total_customers, orders };
    }
}
exports.default = StatsDatabase;
