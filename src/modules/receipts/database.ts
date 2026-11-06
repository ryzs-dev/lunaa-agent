import crypto from 'crypto';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { supabase } from '../supabase';

// Receipts live on the server's disk; the CRM opens them through a link that
// expires after an hour.
const RECEIPTS_DIR = process.env.RECEIPTS_DIR || '/var/lib/lunaa/receipts';
const LINK_TTL_SECONDS = 60 * 60;

function receiptFile(path: string) {
  const target = resolve(RECEIPTS_DIR, path);
  if (!target.startsWith(`${resolve(RECEIPTS_DIR)}/`)) throw new Error('Invalid receipt path');
  return target;
}

function linkSignature(path: string, expires: number) {
  const key = Buffer.from(process.env.RECEIPTS_SECRET ?? '', 'base64');
  return crypto.createHmac('sha256', key).update(`${path}|${expires}`).digest('base64url');
}

function signedReceiptUrl(path: string) {
  const base = process.env.AGENT_PUBLIC_URL || 'https://agent.lunaawomencare.com';
  const expires = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const query = new URLSearchParams({ path, expires: String(expires), sig: linkSignature(path, expires) });
  return `${base}/api/receipts/file?${query}`;
}

// The file behind a signed link, or null if the link is wrong or has expired.
export async function readSignedReceipt(path: string, expires: number, sig: string) {
  if (!process.env.RECEIPTS_SECRET || !Number.isFinite(expires) || expires < Date.now() / 1000) return null;
  const expected = Buffer.from(linkSignature(path, expires));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    return await fs.readFile(receiptFile(path));
  } catch {
    return null;
  }
}

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
  read_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
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

  async upload(path: string, file: Buffer, _contentType: string) {
    const target = receiptFile(path);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, file);
  }

  async download(path: string) {
    return fs.readFile(receiptFile(path));
  }

  async signedUrl(path: string) {
    return signedReceiptUrl(path);
  }
}

export default ReceiptDatabase;
