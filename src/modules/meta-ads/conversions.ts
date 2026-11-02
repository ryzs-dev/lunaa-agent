import crypto from 'crypto';
import { supabase } from '../supabase';
import { connection } from './settings';
import { graphError, graphPost } from './graph';

// Meta only accepts events up to 7 days old.
const MAX_AGE_MS = 7 * 86400000;
const BATCH = 100;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (value?: string | null) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Meta matches on the full international number, digits only.
export function normalisePhone(raw?: string | null) {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;
  else if (/^1\d{8,9}$/.test(digits)) digits = `60${digits}`;
  return digits.length >= 10 ? digits : null;
}

function buildEvent(order: any) {
  const phone = normalisePhone(order.customers?.phone_number);
  if (!phone) return null;
  const address = order.addresses ?? {};

  const userData: Record<string, string[]> = {
    ph: [sha256(phone)],
    external_id: [sha256(order.customer_id)],
    country: [sha256(clean(address.country) === 'singapore' || phone.startsWith('65') ? 'sg' : 'my')],
  };
  if (address.city) userData.ct = [sha256(clean(address.city))];
  if (address.state) userData.st = [sha256(clean(address.state))];
  if (address.postcode) userData.zp = [sha256(clean(address.postcode))];

  const contents = (order.order_items ?? [])
    .filter((item: any) => item.products?.code || item.product_id)
    .map((item: any) => ({ id: item.products?.code || item.product_id, quantity: item.quantity ?? 1 }));

  return {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
    // The order ID lets Meta drop a duplicate if an order is ever sent twice.
    event_id: order.id,
    action_source: 'chat',
    user_data: userData,
    custom_data: {
      currency: /^[A-Z]{3}$/.test(order.currency ?? '') ? order.currency : 'MYR',
      value: Number(order.total_amount) || 0,
      order_id: order.order_number ?? order.id,
      ...(contents.length ? { contents, num_items: contents.reduce((n: number, c: any) => n + c.quantity, 0) } : {}),
    },
  };
}

async function record(rows: { order_id: string; status: 'sent' | 'failed'; error?: string | null }[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('meta_conversion_events')
    .upsert(rows.map((r) => ({ ...r, error: r.error ?? null, sent_at: new Date().toISOString() })));
  if (error) throw error;
}

// Sends customer WhatsApp orders placed since the switch was turned on (and in
// Meta's 7-day window) that haven't reached Meta yet. Distributor and
// marketplace orders aren't ad sales, so they stay out.
export async function sendPendingConversions() {
  const conn = await connection();
  const row = conn?.row;
  if (!conn || !row?.send_conversions || !row.dataset_id || !row.conversions_since) {
    return { skipped: true as const };
  }

  const since = new Date(Math.max(new Date(row.conversions_since).getTime(), Date.now() - MAX_AGE_MS)).toISOString();
  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, customer_id, created_at, total_amount, currency, order_number, source, is_distributor, customers(phone_number), addresses(city, state, postcode, country), order_items(product_id, quantity, products(code))'
    )
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(1000);
  if (error) throw error;

  const { data: done, error: doneError } = await supabase
    .from('meta_conversion_events')
    .select('order_id')
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - MAX_AGE_MS - 86400000).toISOString());
  if (doneError) throw doneError;
  const sent = new Set((done ?? []).map((d) => d.order_id));

  const pending = (orders ?? []).filter(
    (o: any) => !sent.has(o.id) && !o.is_distributor && (!o.source || o.source === 'whatsapp')
  );

  let sentCount = 0;
  let failedCount = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const events: any[] = [];
    const noPhone: string[] = [];
    for (const order of chunk) {
      const event = buildEvent(order);
      if (event) events.push(event);
      else noPhone.push(order.id);
    }

    await record(noPhone.map((order_id) => ({ order_id, status: 'failed', error: 'No usable phone number' })));
    failedCount += noPhone.length;
    if (!events.length) continue;

    try {
      await graphPost(`${row.dataset_id}/events`, conn.token, { data: events });
      await record(events.map((e) => ({ order_id: e.event_id, status: 'sent' })));
      sentCount += events.length;
    } catch (err) {
      const message = graphError(err);
      await record(events.map((e) => ({ order_id: e.event_id, status: 'failed', error: message })));
      failedCount += events.length;
    }
  }

  return { sent: sentCount, failed: failedCount };
}
