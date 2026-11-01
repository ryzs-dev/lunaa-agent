import { supabase } from '../supabase';

const BUCKET = 'receipts';

export interface ReceiptRow {
  id: string;
  order_id: string | null;
  wamid: string;
  sender_phone: string | null;
  caption: string | null;
  storage_path: string | null;
  mime_type: string | null;
  received_at: string;
  check_status: 'pending' | 'match' | 'mismatch' | 'unreadable' | 'not_checked' | 'error';
  amount: number | null;
  currency: string | null;
  paid_on: string | null;
  reference: string | null;
  bank: string | null;
  payer: string | null;
  check_note: string | null;
  checked_at: string | null;
  created_at: string;
}

class ReceiptDatabase {
  async getByWamid(wamid: string) {
    const { data, error } = await supabase
      .from('order_receipts')
      .select('*')
      .eq('wamid', wamid)
      .maybeSingle();
    if (error) throw error;
    return data as ReceiptRow | null;
  }

  async get(id: string) {
    const { data, error } = await supabase
      .from('order_receipts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as ReceiptRow | null;
  }

  async insert(row: Partial<ReceiptRow>) {
    const { data, error } = await supabase
      .from('order_receipts')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    return data as ReceiptRow;
  }

  async update(id: string, patch: Partial<ReceiptRow>) {
    const { data, error } = await supabase
      .from('order_receipts')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ReceiptRow;
  }

  async listByOrder(orderId: string) {
    const { data, error } = await supabase
      .from('order_receipts')
      .select('*')
      .eq('order_id', orderId)
      .order('received_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReceiptRow[];
  }

  async listUnmatched(limit = 50) {
    const { data, error } = await supabase
      .from('order_receipts')
      .select('*')
      .is('order_id', null)
      .order('received_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ReceiptRow[];
  }

  async getOrderTotal(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findOrderByNumber(orderNumber: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount')
      .ilike('order_number', orderNumber.trim())
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // The sender's most recent order in the window, preferring one with no receipt yet.
  async latestOrderBySender(sender: string, from: string, to: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, created_at, order_receipts(id)')
      .eq('created_by_phone', sender)
      .is('deleted_at', null)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    const orders = data ?? [];
    return (
      orders.find((o) => !(o.order_receipts as unknown[] | null)?.length) ?? orders[0] ?? null
    );
  }

  async upload(path: string, file: Buffer, contentType: string) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType, upsert: true });
    if (error) throw error;
  }

  async download(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async signedUrl(path: string) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  }
}

export default ReceiptDatabase;
