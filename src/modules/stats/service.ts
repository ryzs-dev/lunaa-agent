import StatsDatabase from './database';

class StatsService {
  private StatsDatabase: StatsDatabase;

  constructor() {
    this.StatsDatabase = new StatsDatabase();
  }

  async getDashboardStats() {
    const now = new Date();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const { total_customers, orders } =
      await this.StatsDatabase.getDashboardStats();

    const total_orders = orders?.length || 0;
    const total_revenue =
      orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const average_order_value =
      total_orders > 0 ? total_revenue / total_orders : 0;

    const mtd_revenue =
      orders
        ?.filter((o) => new Date(o.created_at) >= new Date(startOfMonth))
        ?.reduce((sum, o) => sum + o.total_amount, 0) ?? 0;

    return {
      total_customers,
      total_orders,
      total_revenue,
      average_order_value,
      mtd_revenue,
    };
  }
}

export default StatsService;
