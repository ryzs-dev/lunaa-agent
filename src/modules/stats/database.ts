import { supabase } from '../supabase';

export type ProductPerformanceRow = {
  product_id: string;
  product_name: string;
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  quantity_sold: number;
  unique_customers: number;
  repeat_customers: number;
  repeat_customer_rate: number;
  customer_lifetime_value: number;
  previous_month_revenue: number;
  revenue_trend: 'increasing' | 'stable' | 'decreasing';
};

export type ProductMonthlyTrendRow = {
  month_label: string;
  month_start: string;
  revenue: number;
  quantity_sold: number;
  total_orders: number;
  first_time_buyers: number;
  returning_buyers: number;
  repeat_customer_rate: number;
};

class StatsDatabase {
  async getDashboardStats(month: string) {
    const monthStart = `${month}-01`;

    const { count: total_customers, error: customerError } =
      await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

    if (customerError) throw customerError;

    const { data: statsData, error: statsError } = await supabase.rpc(
      'get_dashboard_stats',
      { month_start: monthStart }
    );

    if (statsError) throw statsError;

    const statsRow = statsData?.[0] ?? {};

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

  async getProductPerformance(month: string): Promise<ProductPerformanceRow[]> {
    const monthStart = `${month}-01`;

    const { data, error } = await supabase.rpc('get_product_performance', {
      month_start: monthStart,
    });

    if (error) throw error;

    return (data ?? []).map((row: ProductPerformanceRow) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      total_orders: Number(row.total_orders ?? 0),
      total_revenue: Number(row.total_revenue ?? 0),
      average_order_value: Number(row.average_order_value ?? 0),
      quantity_sold: Number(row.quantity_sold ?? 0),
      unique_customers: Number(row.unique_customers ?? 0),
      repeat_customers: Number(row.repeat_customers ?? 0),
      repeat_customer_rate: Number(row.repeat_customer_rate ?? 0),
      customer_lifetime_value: Number(row.customer_lifetime_value ?? 0),
      previous_month_revenue: Number(row.previous_month_revenue ?? 0),
      revenue_trend: row.revenue_trend ?? 'stable',
    }));
  }

  async getProductMonthlyTrends(
    productId: string,
    month: string,
    monthsBack = 6
  ): Promise<ProductMonthlyTrendRow[]> {
    const monthStart = `${month}-01`;

    const { data, error } = await supabase.rpc('get_product_monthly_trends', {
      p_product_id: productId,
      month_start: monthStart,
      months_back: monthsBack,
    });

    if (error) throw error;

    return (data ?? []).map((row: ProductMonthlyTrendRow) => ({
      month_label: row.month_label,
      month_start: row.month_start,
      revenue: Number(row.revenue ?? 0),
      quantity_sold: Number(row.quantity_sold ?? 0),
      total_orders: Number(row.total_orders ?? 0),
      first_time_buyers: Number(row.first_time_buyers ?? 0),
      returning_buyers: Number(row.returning_buyers ?? 0),
      repeat_customer_rate: Number(row.repeat_customer_rate ?? 0),
    }));
  }
}

export default StatsDatabase;
