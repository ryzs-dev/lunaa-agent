import { UUID } from 'crypto';
import { supabase } from '../supabase';

export async function recalculateCustomerStats(customerId: UUID): Promise<void> {
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('total_amount, created_at, order_date')
    .eq('customer_id', customerId)
    .is('deleted_at', null);

  if (fetchError) throw fetchError;

  const activeOrders = orders ?? [];
  const totalOrders = activeOrders.length;
  const totalSpent = activeOrders.reduce(
    (sum, order) => sum + (order.total_amount || 0),
    0
  );
  const lastOrderDate =
    totalOrders > 0
      ? activeOrders.sort((a, b) => {
          const dateA = new Date(a.order_date ?? a.created_at).getTime();
          const dateB = new Date(b.order_date ?? b.created_at).getTime();
          return dateB - dateA;
        })[0].order_date ?? activeOrders[0].created_at
      : null;

  const { error: updateError } = await supabase
    .from('customers')
    .update({
      total_purchase_count: totalOrders,
      total_amount_spent: totalSpent,
      last_order_date: lastOrderDate,
      repeat_customer: totalOrders > 1 ? 'returning' : 'new',
    })
    .eq('id', customerId);

  if (updateError) throw updateError;
}
