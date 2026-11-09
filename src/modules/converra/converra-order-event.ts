import { supabase } from '../supabase';
import { forwardToConverra } from './converra-forwarder';

// Tells Converra a customer ordered, with their phone so Converra can find the chat.
// Converra then stops follow-ups and flows still selling to them. Never blocks the order.
export async function announceOrderToConverra(order: {
  id?: string | null;
  customer_id?: string | null;
  total_amount?: unknown;
  status?: string | null;
  payment_method?: string | null;
  order_date?: unknown;
  phone?: string | null;
}) {
  try {
    let phone = order.phone ?? null;
    if (!phone && order.customer_id) {
      const { data } = await supabase.from('customers').select('phone_number').eq('id', order.customer_id).maybeSingle();
      phone = data?.phone_number ?? null;
    }
    const orderId = order.id ?? `manual-${Date.now()}`;
    await forwardToConverra({
      event_type: 'order.created',
      external_event_id: `order-${orderId}`,
      timestamp: new Date().toISOString(),
      payload: {
        order_id: orderId,
        customer_id: order.customer_id ?? null,
        ...(phone ? { customer_phone: String(phone).replace(/\D/g, '') } : {}),
        total_amount: order.total_amount ?? null,
        amount: order.total_amount ?? null,
        status: order.status ?? 'unpaid',
        payment_method: order.payment_method ?? '',
        order_date: order.order_date ?? null,
      },
    });
  } catch (error) {
    console.error('[converra] Could not announce the order:', error);
  }
}
