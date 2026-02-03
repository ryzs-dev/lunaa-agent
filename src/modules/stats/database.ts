import { supabase } from '../supabase';

class StatsDatabase {
  async getDashboardStats(month: string) {
    const monthStart = `${month}-01`;

    // 1️⃣ total customers (all-time)
    const { count: total_customers, error: customerError } =
      await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

    if (customerError) throw customerError;

    // 2️⃣ KPI stats
    const { data: statsData, error: statsError } = await supabase.rpc(
      'get_dashboard_stats',
      { month_start: monthStart }
    );

    if (statsError) throw statsError;

    const statsRow = statsData?.[0] ?? {};

    // 3️⃣ Revenue chart (weekly)
    const { data: revenueChart, error: chartError } = await supabase.rpc(
      'get_monthly_revenue_chart',
      { month_start: monthStart }
    );

    if (chartError) throw chartError;

    const { data: customerAcquisition, error: customerAcquisitionError } =
      await supabase.rpc('get_customer_acquisition_6_months', {
        month_start: monthStart,
      });

    if (customerAcquisitionError) throw customerAcquisitionError;


    return {
      stats: {
        total_customers,
        total_orders: statsRow.total_orders ?? 0,
        total_revenue: statsRow.total_revenue ?? 0,
        average_order_value: statsRow.average_order_value ?? 0,
        mtd_revenue: statsRow.total_revenue ?? 0,
      },
      charts: {
        revenue: revenueChart ?? [],
        customer_acquisition: customerAcquisition ?? [],
      },
    };
  }
}

export default StatsDatabase;
