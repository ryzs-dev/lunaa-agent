import { supabase } from '../supabase';

export async function generateOrderNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', 'ORD-%')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  let maxSequence = 0;

  for (const row of data ?? []) {
    const orderNumber = row.order_number as string | undefined;
    if (!orderNumber) continue;

    const simpleMatch = orderNumber.match(/^ORD-(\d+)$/);
    if (simpleMatch) {
      maxSequence = Math.max(maxSequence, Number(simpleMatch[1]));
      continue;
    }

    const datedMatch = orderNumber.match(/^ORD-\d{6}-(\d+)$/);
    if (datedMatch) {
      maxSequence = Math.max(maxSequence, Number(datedMatch[1]));
    }
  }

  return `ORD-${String(maxSequence + 1).padStart(5, '0')}`;
}
