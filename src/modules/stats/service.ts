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

  async getProductPerformance(month: string) {
    if (!month) {
      throw new Error('Month is required (YYYY-MM)');
    }

    return this.statsDatabase.getProductPerformance(month);
  }

  async getProductMonthlyTrends(
    productId: string,
    month: string,
    monthsBack = 6
  ) {
    if (!month) {
      throw new Error('Month is required (YYYY-MM)');
    }

    if (!productId) {
      throw new Error('Product ID is required');
    }

    return this.statsDatabase.getProductMonthlyTrends(
      productId,
      month,
      monthsBack
    );
  }
}

export default StatsService;
