import { supabase } from '../supabase';

class StatsDatabase {
  async getDashboardStats() {
    const { count: total_customers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, created_at');

    return { total_customers, orders };
  }
}

export default StatsDatabase;
