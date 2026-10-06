import { google } from 'googleapis';
import { supabase } from '../supabase';
import { monthSheetName } from '../../utils/monthlySheet';
import { Platform } from './types';

// Staff colour marketplace rows in the monthly order tabs:
// orange = Shopee, dark blue = Lazada. Light blue (COD) and red (pending COD)
// are WhatsApp orders that already exist in the CRM.
const ROW_COLOURS: { platform: Platform; rgb: [number, number, number] }[] = [
  { platform: 'shopee', rgb: [0xff, 0x99, 0x00] },
  { platform: 'lazada', rgb: [0x4a, 0x86, 0xe8] },
];
const COLOUR_TOLERANCE = 40;

const PRODUCT_COLUMNS: Record<string, string> = {
  wash: 'w',
  'femlift 30ml': 'f',
  'femlift 10ml': 'f10ml',
  'wash 30ml': 'w30ml',
  spray: 's',
  bloom: 'b',
  femrose: 'rose',
};

const NUMBER_PREFIX: Record<Platform, string> = { shopee: 'SHP', lazada: 'LZD' };
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

type Cell = {
  formattedValue?: string | null;
  effectiveFormat?: { backgroundColor?: { red?: number | null; green?: number | null; blue?: number | null } | null } | null;
};

export interface SheetOrder {
  platform: Platform;
  externalRef: string;
  orderDate: string;
  buyerName: string | null;
  items: { code: string; quantity: number }[];
  totalAmount: number;
  shipmentDescription: string | null;
  remark: string | null;
  address: { full_address: string; postcode: string | null; city: string | null; state: string | null } | null;
}

export interface SheetSyncResult {
  tabs: string[];
  created: number;
  updated: number;
  removed: number;
  skipped: number;
  finishedAt: Date;
}

function sheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

function rowPlatform(cell: Cell | undefined): Platform | null {
  const bg = cell?.effectiveFormat?.backgroundColor;
  if (!bg) return null;
  const rgb = [bg.red ?? 0, bg.green ?? 0, bg.blue ?? 0].map((v) => Math.round(v * 255));
  const match = ROW_COLOURS.find(({ rgb: target }) =>
    target.every((value, i) => Math.abs(value - rgb[i]) <= COLOUR_TOLERANCE)
  );
  return match?.platform ?? null;
}

function parseDate(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? null : date;
}

const text = (cell: Cell | undefined) => cell?.formattedValue?.trim() || null;
const number = (cell: Cell | undefined) => {
  const parsed = Number(String(cell?.formattedValue ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parseTab(tab: string, rows: { values?: Cell[] | null }[]): { orders: SheetOrder[]; skipped: number } {
  const header = (rows[0]?.values ?? []).map((cell) => (cell.formattedValue ?? '').trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const columns = {
    date: col('order date'),
    fbName: col('fb name'),
    name: col('name'),
    remark: col('remark'),
    total: header.findIndex((h) => h.startsWith('total paid')),
    description: col('shipment description'),
    address: col('address'),
    city: col('city'),
    postcode: col('postcode'),
    state: col('state'),
  };
  if (columns.date < 0 || columns.total < 0) return { orders: [], skipped: 0 };
  const productColumns = Object.entries(PRODUCT_COLUMNS)
    .map(([name, code]) => ({ index: col(name), code }))
    .filter(({ index }) => index >= 0);

  const orders: SheetOrder[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const cells = row.values ?? [];
    const platform = rowPlatform(cells[columns.date]);
    if (!platform) continue;

    const orderDate = parseDate(text(cells[columns.date]) ?? '');
    const items = productColumns
      .map(({ index, code }) => ({ code, quantity: Math.round(number(cells[index])) }))
      .filter((item) => item.quantity > 0);
    if (!orderDate || !items.length) {
      skipped++;
      continue;
    }

    const fbName = text(cells[columns.fbName]);
    const name = text(cells[columns.name]);
    // Rows have no order ID, so they're keyed by tab, date and buyer; a buyer
    // with two orders on the same day gets a running suffix.
    const baseKey = `${tab}|${orderDate}|${(fbName ?? '').toLowerCase()}|${(name ?? '').toLowerCase()}`;
    const occurrence = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, occurrence);

    const fullAddress = text(cells[columns.address]);
    orders.push({
      platform,
      externalRef: occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey,
      orderDate,
      buyerName: name || fbName,
      items,
      totalAmount: Math.round(number(cells[columns.total]) * 100) / 100,
      shipmentDescription:
        text(cells[columns.description])?.replace(/\s+/g, '') ||
        items.map((item) => `${item.quantity}${item.code}`).join(''),
      remark: text(cells[columns.remark]),
      address: fullAddress
        ? {
            full_address: fullAddress,
            postcode: text(cells[columns.postcode]) ?? fullAddress.match(/\b\d{5}\b/)?.[0] ?? null,
            city: text(cells[columns.city]),
            state: text(cells[columns.state]),
          }
        : null,
    });
  }
  return { orders, skipped };
}

async function readTab(tab: string) {
  const { data } = await sheetsClient().spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    ranges: [`'${tab.replace(/'/g, "''")}'!A1:AF3000`],
    fields: 'sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)',
  });
  return parseTab(tab, data.sheets?.[0]?.data?.[0]?.rowData ?? []);
}

async function nextNumbers() {
  const next: Record<Platform, number> = { shopee: 1, lazada: 1 };
  for (const platform of Object.keys(NUMBER_PREFIX) as Platform[]) {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number')
      .like('order_number', `${NUMBER_PREFIX[platform]}-%`)
      .order('order_number', { ascending: false })
      .limit(1);
    if (error) throw error;
    const last = Number(data?.[0]?.order_number?.split('-')[1]);
    next[platform] = Number.isFinite(last) ? last + 1 : 1;
  }
  return next;
}

// Noon Malaysia time on the order date, so imported orders sit in date order
// in the Orders list instead of all at the top.
function createdAtFor(orderDate: string) {
  const noon = new Date(`${orderDate}T12:00:00Z`).getTime() - MALAYSIA_OFFSET_MS;
  return new Date(Math.min(noon, Date.now())).toISOString();
}

const itemsKey = (items: { product_id: string; quantity: number }[]) =>
  items
    .map((item) => `${item.product_id}:${item.quantity}`)
    .sort()
    .join('|');

async function reconcileTab(
  tab: string,
  products: Map<string, string>,
  numbers: Record<Platform, number>
) {
  const { orders, skipped } = await readTab(tab);
  const result = { created: 0, updated: 0, removed: 0, skipped };

  const { data: existingRows, error } = await supabase
    .from('orders')
    .select(
      'id, source, external_ref, deleted_at, order_date, total_amount, buyer_name, shipment_description, remark, address_id, addresses(full_address, postcode), order_items(product_id, quantity)'
    )
    .in('source', ['shopee', 'lazada'])
    .like('external_ref', `${tab}|%`);
  if (error) throw error;
  const existing = new Map((existingRows ?? []).map((row: any) => [row.external_ref as string, row]));

  for (const order of orders) {
    const items = order.items
      .map((item) => ({ product_id: products.get(item.code)!, quantity: item.quantity }))
      .filter((item) => item.product_id);
    const fields = {
      source: order.platform,
      order_date: order.orderDate,
      total_amount: order.totalAmount,
      buyer_name: order.buyerName,
      shipment_description: order.shipmentDescription,
      remark: order.remark,
      status: 'paid',
      payment_method: order.platform,
      currency: 'MYR',
    };
    const current = existing.get(order.externalRef);
    existing.delete(order.externalRef);

    if (!current) {
      let addressId: string | null = null;
      if (order.address) {
        const { data: address, error: addressError } = await supabase
          .from('addresses')
          .insert({ ...order.address, country: 'Malaysia' })
          .select('id')
          .single();
        if (addressError) throw addressError;
        addressId = address.id;
      }
      const orderNumber = `${NUMBER_PREFIX[order.platform]}-${String(numbers[order.platform]++).padStart(5, '0')}`;
      const { data: created, error: insertError } = await supabase
        .from('orders')
        .insert({
          ...fields,
          external_ref: order.externalRef,
          order_number: orderNumber,
          address_id: addressId,
          created_at: createdAtFor(order.orderDate),
        })
        .select('id')
        .single();
      if (insertError) throw insertError;
      if (items.length) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(items.map((item) => ({ ...item, order_id: created.id })));
        if (itemsError) throw itemsError;
      }
      result.created++;
      continue;
    }

    const changed =
      current.deleted_at !== null ||
      current.source !== fields.source ||
      String(current.order_date).slice(0, 10) !== fields.order_date ||
      Number(current.total_amount) !== fields.total_amount ||
      current.buyer_name !== fields.buyer_name ||
      current.shipment_description !== fields.shipment_description ||
      current.remark !== fields.remark;
    const itemsChanged = itemsKey(current.order_items ?? []) !== itemsKey(items);
    const addressChanged =
      (current.addresses?.full_address ?? null) !== (order.address?.full_address ?? null);

    if (changed) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ ...fields, payment_method: order.platform, deleted_at: null })
        .eq('id', current.id);
      if (updateError) throw updateError;
    }
    if (itemsChanged) {
      const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', current.id);
      if (deleteError) throw deleteError;
      if (items.length) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(items.map((item) => ({ ...item, order_id: current.id })));
        if (itemsError) throw itemsError;
      }
    }
    if (addressChanged && order.address) {
      if (current.address_id) {
        const { error: addressError } = await supabase
          .from('addresses')
          .update(order.address)
          .eq('id', current.address_id);
        if (addressError) throw addressError;
      } else {
        const { data: address, error: addressError } = await supabase
          .from('addresses')
          .insert({ ...order.address, country: 'Malaysia' })
          .select('id')
          .single();
        if (addressError) throw addressError;
        await supabase.from('orders').update({ address_id: address.id }).eq('id', current.id);
      }
    }
    if (changed || itemsChanged || addressChanged) result.updated++;
  }

  // Rows deleted from the sheet (or recoloured to a non-marketplace colour).
  const gone = [...existing.values()].filter((row: any) => row.deleted_at === null).map((row: any) => row.id);
  if (gone.length) {
    const { error: removeError } = await supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', gone);
    if (removeError) throw removeError;
    result.removed = gone.length;
  }
  return result;
}

export function recentTabs(now = new Date()) {
  const local = new Date(now.getTime() + MALAYSIA_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return [
    monthSheetName({ year, month }),
    monthSheetName(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }),
  ];
}

let running: Promise<SheetSyncResult> | null = null;
let lastResult: SheetSyncResult | null = null;
let lastError: { message: string; at: Date } | null = null;

export function sheetSyncStatus() {
  return { running: !!running, lastResult, lastError };
}

export function syncSheetTabs(tabs = recentTabs()) {
  if (running) return running;
  running = (async () => {
    const { error: columnsError } = await supabase.from('orders').select('source, external_ref, buyer_name').limit(1);
    if (columnsError) {
      throw new Error('The orders table is missing the source columns. Run the order_source migration first.');
    }
    const { data: products, error } = await supabase.from('products').select('id, code');
    if (error) throw error;
    const byCode = new Map(
      (products ?? []).filter((p) => p.code).map((p) => [String(p.code).trim().toLowerCase(), p.id as string])
    );
    const numbers = await nextNumbers();
    const totals = { created: 0, updated: 0, removed: 0, skipped: 0 };
    for (const tab of tabs) {
      const result = await reconcileTab(tab, byCode, numbers);
      totals.created += result.created;
      totals.updated += result.updated;
      totals.removed += result.removed;
      totals.skipped += result.skipped;
    }
    lastResult = { tabs, ...totals, finishedAt: new Date() };
    lastError = null;
    return lastResult;
  })()
    .catch((error) => {
      lastError = { message: error.message || 'Sheet sync failed', at: new Date() };
      throw error;
    })
    .finally(() => {
      running = null;
    });
  return running;
}
