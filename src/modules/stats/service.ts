import StatsDatabase from './database';

class StatsService {
  private statsDatabase: StatsDatabase;

  constructor() {
    this.statsDatabase = new StatsDatabase();
  }

  async getDashboardStats(month: string) {
    if (!month) {
      throw new Error('Month is required (YYYY-MM)');
    }

    const result = await this.statsDatabase.getDashboardStats(month);

    return {
      stats: {
        total_customers: result.stats.total_customers ?? 0,
        total_orders: result.stats.total_orders ?? 0,
        total_revenue: result.stats.total_revenue ?? 0,
        average_order_value: result.stats.average_order_value ?? 0,
        mtd_revenue: result.stats.mtd_revenue ?? 0,
      },
      charts: result.charts ?? {},
    };
  }
}

export default StatsService;
