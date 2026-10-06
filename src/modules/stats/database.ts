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

export type RepeatOrderValue = {
  repeatCustomers: number;
  repeatOrders: number;
  repeatRevenue: number;
  repeatAverageOrderValue: number;
  repeatRevenueShare: number;
  newOrders: number;
  newRevenue: number;
  newAverageOrderValue: number;
};

const CUSTOMER_ID_CHUNK_SIZE = 200;

// An order counts as a repeat order when the same customer has an earlier active order.
export async function getRepeatOrderValue(
  start: Date,
  end?: Date
): Promise<RepeatOrderValue> {
  let periodQuery = supabase
    .from('orders')
    .select('id, customer_id, total_amount, created_at')
    .is('deleted_at', null)
    .gte('created_at', start.toISOString());

  if (end) {
    periodQuery = periodQuery.lt('created_at', end.toISOString());
  }

  const { data: periodOrders, error: periodError } = await periodQuery.order(
    'created_at',
    { ascending: true }
  );

  if (periodError) throw periodError;

  const orders = (periodOrders || []).filter((order) => order.customer_id);
  const customerIds = [...new Set(orders.map((order) => order.customer_id))];

  const customersWithPriorOrders = new Set<string>();
  for (let i = 0; i < customerIds.length; i += CUSTOMER_ID_CHUNK_SIZE) {
    const chunk = customerIds.slice(i, i + CUSTOMER_ID_CHUNK_SIZE);
    const { data: priorOrders, error: priorError } = await supabase
      .from('orders')
      .select('customer_id')
      .is('deleted_at', null)
      .lt('created_at', start.toISOString())
      .in('customer_id', chunk);

    if (priorError) throw priorError;
    priorOrders?.forEach((order) => customersWithPriorOrders.add(order.customer_id));
  }

  const seenCustomers = new Set<string>(customersWithPriorOrders);
  const repeatCustomerIds = new Set<string>();
  let repeatOrders = 0;
  let repeatRevenue = 0;
  let newOrders = 0;
  let newRevenue = 0;

  for (const order of orders) {
    const amount = Number(order.total_amount || 0);
    if (seenCustomers.has(order.customer_id)) {
      repeatOrders += 1;
      repeatRevenue += amount;
      repeatCustomerIds.add(order.customer_id);
    } else {
      newOrders += 1;
      newRevenue += amount;
      seenCustomers.add(order.customer_id);
    }
  }

  const totalRevenue = repeatRevenue + newRevenue;
  const round = (value: number) => parseFloat(value.toFixed(2));

  return {
    repeatCustomers: repeatCustomerIds.size,
    repeatOrders,
    repeatRevenue: round(repeatRevenue),
    repeatAverageOrderValue: round(repeatOrders > 0 ? repeatRevenue / repeatOrders : 0),
    repeatRevenueShare: round(totalRevenue > 0 ? (repeatRevenue / totalRevenue) * 100 : 0),
    newOrders,
    newRevenue: round(newRevenue),
    newAverageOrderValue: round(newOrders > 0 ? newRevenue / newOrders : 0),
  };
}

// Month boundaries follow Malaysia time (UTC+8, no DST).
function getMonthRange(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const nextMonth = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  return {
    start: new Date(`${month}-01T00:00:00+08:00`),
    end: new Date(`${nextMonth}-01T00:00:00+08:00`),
  };
}

export type ChannelTotals = Record<
  'whatsapp' | 'shopee' | 'lazada',
  { orders: number; revenue: number }
>;

const PAGE_SIZE = 1000;

export async function getChannelTotals(start: Date, end: Date): Promise<ChannelTotals> {
  const totals: ChannelTotals = {
    whatsapp: { orders: 0, revenue: 0 },
    shopee: { orders: 0, revenue: 0 },
    lazada: { orders: 0, revenue: 0 },
  };

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('orders')
      .select('source, total_amount')
      .is('deleted_at', null)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    for (const row of data ?? []) {
      const key = (row.source in totals ? row.source : 'whatsapp') as keyof ChannelTotals;
      totals[key].orders += 1;
      totals[key].revenue += Number(row.total_amount || 0);
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  for (const channel of Object.values(totals)) {
    channel.revenue = parseFloat(channel.revenue.toFixed(2));
  }

  return totals;
}

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

    const { start, end } = getMonthRange(month);
    const [repeatOrderValue, channels] = await Promise.all([
      getRepeatOrderValue(start, end),
      getChannelTotals(start, end),
    ]);

    return {
      repeatOrderValue,
      channels,
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
