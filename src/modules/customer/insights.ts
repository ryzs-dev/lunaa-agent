import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { recalculateCustomerStats } from '../orders/customer-stats';

const PAGE_SIZE = 1000;

export async function getFollowUps(days: number, offset: number, limit: number) {
  const safeDays = Math.min(Math.max(days, 7), 365);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const cutoff = new Date(Date.now() - safeDays * 86_400_000).toISOString();

  const { count, error: countError } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gt('total_purchase_count', 0)
    .lt('last_order_date', cutoff);
  if (countError) throw countError;

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, phone_number, last_order_date, total_purchase_count, total_amount_spent')
    .gt('total_purchase_count', 0)
    .lt('last_order_date', cutoff)
    .order('last_order_date', { ascending: true })
    .range(offset, offset + safeLimit - 1);
  if (error) throw error;

  const ids = (customers ?? []).map((customer) => customer.id);
  const latest = new Map<string, { id: string; order_number: string; shipment_description: string | null }>();
  if (ids.length) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, customer_id, order_number, order_date, shipment_description, created_at')
      .in('customer_id', ids)
      .is('deleted_at', null)
      .order('order_date', { ascending: false });
    if (ordersError) throw ordersError;
    for (const order of orders ?? []) {
      if (!latest.has(order.customer_id)) latest.set(order.customer_id, order);
    }
  }

  return {
    days: safeDays,
    total: count ?? 0,
    customers: (customers ?? []).map((customer) => {
      const order = latest.get(customer.id);
      const last = customer.last_order_date ? new Date(customer.last_order_date) : null;
      const daysSince = last ? Math.max(0, Math.floor((Date.now() - last.getTime()) / 86_400_000)) : null;
      return {
        id: customer.id,
        name: customer.name,
        phone_number: customer.phone_number,
        last_order_date: customer.last_order_date,
        days_since: daysSince,
        total_purchase_count: customer.total_purchase_count,
        total_amount_spent: customer.total_amount_spent,
        last_order_id: order?.id ?? null,
        last_order_number: order?.order_number ?? null,
        last_items: order?.shipment_description ?? null,
      };
    }),
  };
}

function nameKey(name: string | null) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(cod|self[\s-]*pick[\s-]*up)\b/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function findDuplicateCustomers() {
  const customers: {
    id: string;
    name: string | null;
    phone_number: string;
    total_purchase_count: number | null;
    total_amount_spent: number | null;
    created_at: string;
  }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone_number, total_purchase_count, total_amount_spent, created_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    customers.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const groups = new Map<string, typeof customers>();
  for (const customer of customers) {
    const key = nameKey(customer.name);
    // A single given name matches too many different people.
    if (key.length < 4 || !key.includes(' ')) continue;
    const list = groups.get(key) ?? [];
    list.push(customer);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1 && list.length <= 8)
    .map(([key, list]) => ({
      key,
      customers: list.sort(
        (a, b) =>
          Number(b.total_purchase_count ?? 0) - Number(a.total_purchase_count ?? 0) ||
          a.created_at.localeCompare(b.created_at)
      ),
    }))
    .sort((a, b) => b.customers.length - a.customers.length || a.key.localeCompare(b.key));
}

export async function mergeCustomers(keepId: UUID, mergeId: UUID) {
  if (keepId === mergeId) throw new Error('Choose two different customers');

  const { data: rows, error } = await supabase
    .from('customers')
    .select('id, email, fb_name')
    .in('id', [keepId, mergeId]);
  if (error) throw error;
  if (!rows || rows.length !== 2) throw new Error('Customer not found');

  const keep = rows.find((row) => row.id === keepId)!;
  const merge = rows.find((row) => row.id === mergeId)!;
  const patch: Record<string, string> = {};
  if (!keep.email && merge.email) patch.email = merge.email;
  if (!keep.fb_name && merge.fb_name) patch.fb_name = merge.fb_name;
  if (Object.keys(patch).length) {
    const { error: updateError } = await supabase.from('customers').update(patch).eq('id', keepId);
    if (updateError) throw updateError;
  }

  for (const table of ['orders', 'addresses', 'contacts'] as const) {
    const { error: moveError } = await supabase.from(table).update({ customer_id: keepId }).eq('customer_id', mergeId);
    if (moveError) throw moveError;
  }

  const { data: members, error: membersError } = await supabase
    .from('segment_members')
    .select('id, segment_id')
    .eq('user_id', mergeId);
  if (membersError && membersError.code !== '42P01' && membersError.code !== 'PGRST205') {
    // Segment membership is optional; orders still move if this table isn't usable.
    console.error('Skipping segment members during merge:', membersError.message);
  }
  for (const member of members ?? []) {
    const { data: existing } = await supabase
      .from('segment_members')
      .select('id')
      .eq('user_id', keepId)
      .eq('segment_id', member.segment_id)
      .maybeSingle();
    if (existing) {
      await supabase.from('segment_members').delete().eq('id', member.id);
    } else {
      await supabase.from('segment_members').update({ user_id: keepId }).eq('id', member.id);
    }
  }

  const { error: deleteError } = await supabase.from('customers').delete().eq('id', mergeId);
  if (deleteError) throw deleteError;

  await recalculateCustomerStats(keepId);
  return { kept: keepId, merged: mergeId };
}
