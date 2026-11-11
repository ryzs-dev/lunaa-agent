import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { getRow } from '../meta-ads/settings';
import { APP_TIMEZONE } from '../../utils/timezone';

// Lunaa's daily sales report (her "5m Sales Report" sheet), filled from orders
// and the main Meta ad account so nobody types it in.

type Counts = {
  ad_spend: number;
  messages: number;
  ad_comments: number;
  wa_orders: number;
  wa_new: number;
  wa_repeat: number;
  wa_sales: number;
  distributor_orders: number;
  distributor_sales: number;
  shopee_orders: number;
  lazada_orders: number;
  mp_new: number;
  mp_repeat: number;
  mp_sales: number;
  orders: number;
  sales: number;
};

const KEYS: (keyof Counts)[] = [
  'ad_spend',
  'messages',
  'ad_comments',
  'wa_orders',
  'wa_new',
  'wa_repeat',
  'wa_sales',
  'distributor_orders',
  'distributor_sales',
  'shopee_orders',
  'lazada_orders',
  'mp_new',
  'mp_repeat',
  'mp_sales',
  'orders',
  'sales',
];

const div = (a: number, b: number) => (b ? a / b : null);
const round = (n: number | null, places = 2) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);

// Her formulas: cost per message = spend ÷ messages; cost per conversion =
// spend ÷ new WhatsApp orders; conversion = new WhatsApp orders ÷ messages;
// repeat % = repeat WhatsApp orders ÷ WhatsApp orders; ROAS = all sales ÷
// spend; AOV = all sales ÷ all orders.
function derive(c: Counts) {
  const marketplace = c.shopee_orders + c.lazada_orders;
  return {
    ...c,
    marketplace_orders: marketplace,
    cost_per_message: round(div(c.ad_spend, c.messages)),
    repeat_pct: round(div(c.wa_repeat * 100, c.wa_orders)),
    mp_repeat_pct: round(div(c.mp_repeat * 100, marketplace)),
    cost_per_conversion: c.ad_spend ? round(div(c.ad_spend, c.wa_new)) : null,
    conversion_rate: round(div(c.wa_new * 100, c.messages)),
    roas: round(div(c.sales, c.ad_spend)),
    aov: round(div(c.sales, c.orders)),
  };
}

export type ReportRow = ReturnType<typeof derive> & { date: string };

function todayInMalaysia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date());
}

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: `${month}-01`, last, daysInMonth: Number(last.slice(8)) };
}

type MarketplaceOrder = {
  id: string;
  sales_day: string;
  created_at: string;
  buyer_name: string | null;
  addresses: { full_address: string | null } | null;
};

const SHORT_FORMS: [RegExp, string][] = [
  [/\bjln\b/g, 'jalan'],
  [/\blrg\b/g, 'lorong'],
  [/\btmn\b/g, 'taman'],
];

// The same address however it was typed; too little text to tell apart gives null.
export function addressKey(address: string | null | undefined) {
  let text = (address ?? '').toLowerCase();
  for (const [short, full] of SHORT_FORMS) text = text.replace(short, full);
  const key = text.replace(/[^a-z0-9]/g, '');
  return key.length >= 12 ? key : null;
}

// Shopee and Lazada orders have no customer record, so a repeat buyer is
// someone whose delivery address was used on an earlier order. Names alone
// join strangers who share one; they're only the fallback for orders without
// a usable address.
export function marketplaceCounts(orders: MarketplaceOrder[], first: string, last: string) {
  const sorted = [...orders].sort(
    (a, b) =>
      a.sales_day.localeCompare(b.sales_day) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
  const seen = new Set<string>();
  const byDay = new Map<string, { mp_new: number; mp_repeat: number }>();
  for (const order of sorted) {
    const address = addressKey(order.addresses?.full_address);
    const name = (order.buyer_name ?? '').trim().toLowerCase();
    const repeat = address ? seen.has(`a:${address}`) : Boolean(name) && seen.has(`n:${name}`);
    if (address) seen.add(`a:${address}`);
    if (name) seen.add(`n:${name}`);
    if (order.sales_day < first || order.sales_day > last) continue;
    const day = byDay.get(order.sales_day) ?? { mp_new: 0, mp_repeat: 0 };
    if (repeat) day.mp_repeat += 1;
    else day.mp_new += 1;
    byDay.set(order.sales_day, day);
  }
  return byDay;
}

async function marketplaceOrders(until: string) {
  const out: MarketplaceOrder[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, sales_day, created_at, buyer_name, addresses(full_address)')
      .in('source', ['shopee', 'lazada'])
      .is('deleted_at', null)
      .or('is_distributor.is.null,is_distributor.eq.false')
      .lte('sales_day', until)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as MarketplaceOrder[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function getTarget(month: string): Promise<number | null> {
  const { data, error } = await supabase.from('sales_targets').select('target').eq('month', `${month}-01`).maybeSingle();
  if (error) throw error;
  return data ? Number(data.target) : null;
}

export async function setTarget(month: string, target: number | null) {
  if (target == null) {
    const { error } = await supabase.from('sales_targets').delete().eq('month', `${month}-01`);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('sales_targets')
    .upsert({ month: `${month}-01`, target, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Comments on the main ad account's ads per day, from the synced ad numbers.
async function adComments(accountId: string | null, first: string, last: string) {
  const byDay = new Map<string, number>();
  if (!accountId) return byDay;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('meta_ad_insights')
      .select('date, comments')
      .eq('ad_account_id', accountId)
      .gte('date', first)
      .lte('date', last)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.comments ?? 0));
    if (!data || data.length < 1000) break;
  }
  return byDay;
}

export async function salesReport(month: string) {
  const today = todayInMalaysia();
  const { first, last, daysInMonth } = monthBounds(month);
  if (first > today) throw new Error('That month hasn’t started yet');
  const until = last < today ? last : today;

  const [{ data, error }, target, ads, marketplace] = await Promise.all([
    supabase.rpc('get_sales_report', { first_day: first, last_day: until }),
    getTarget(month),
    getRow().catch(() => null),
    marketplaceOrders(until),
  ]);
  if (error) throw error;
  const comments = await adComments(ads?.ad_account_id ?? null, first, until);
  const mpCounts = marketplaceCounts(marketplace, first, until);

  const days: ReportRow[] = (data ?? []).map((r: Record<string, unknown>) => {
    const c = {} as Counts;
    for (const k of KEYS) c[k] = Number(r[k] ?? 0);
    const mp = mpCounts.get(String(r.day));
    c.mp_new = mp?.mp_new ?? 0;
    c.mp_repeat = mp?.mp_repeat ?? 0;
    c.ad_comments = comments.get(String(r.day)) ?? 0;
    return { date: String(r.day), ...derive(c) };
  });

  const sum = {} as Counts;
  for (const k of KEYS) sum[k] = days.reduce((n, d) => n + d[k], 0);
  sum.ad_spend = round(sum.ad_spend)!;
  sum.sales = round(sum.sales)!;
  const totals = derive(sum);

  // What's left to reach the target, and per remaining day (today counts).
  const daysLeft = last < today ? 0 : daysInMonth - Number(today.slice(8)) + 1;
  const toPickUp = target == null ? null : Math.max(0, round(target - totals.sales)!);

  return {
    month,
    from: first,
    to: until,
    ad_account: ads?.ad_account_id
      ? { id: ads.ad_account_id, name: ads.account_name, currency: ads.currency }
      : null,
    target,
    to_pick_up: toPickUp,
    days_left: daysLeft,
    sales_per_day_needed: toPickUp != null && daysLeft ? round(toPickUp / daysLeft) : null,
    totals,
    days,
  };
}

type Report = Awaited<ReturnType<typeof salesReport>>;

const COLUMNS: { label: string; value: (r: ReturnType<typeof derive>) => number | null }[] = [
  { label: 'Ads Cost Spend (RM)', value: (r) => r.ad_spend },
  { label: 'Total Messages', value: (r) => r.messages },
  { label: 'Avg Cost / Message', value: (r) => r.cost_per_message },
  { label: 'Message Order Received (Pax)', value: (r) => r.wa_orders },
  { label: 'FB New Order', value: (r) => r.wa_new },
  { label: 'FB Repeat Order', value: (r) => r.wa_repeat },
  { label: 'Message Sales (RM)', value: (r) => r.wa_sales },
  { label: 'Shopee', value: (r) => r.shopee_orders },
  { label: 'LZD', value: (r) => r.lazada_orders },
  { label: 'Shopee/LZD New Order', value: (r) => r.mp_new },
  { label: 'Shopee/LZD Repeat Order', value: (r) => r.mp_repeat },
  { label: 'TOTAL ORDER', value: (r) => r.orders },
  { label: 'Repeat Order %', value: (r) => (r.repeat_pct == null ? null : r.repeat_pct / 100) },
  { label: 'Cost / Conversion (RM)', value: (r) => r.cost_per_conversion },
  { label: 'Conversion Rate', value: (r) => (r.conversion_rate == null ? null : r.conversion_rate / 100) },
  { label: 'Sales Amount', value: (r) => r.sales },
  { label: 'ROAS', value: (r) => r.roas },
  { label: 'AOV', value: (r) => r.aov },
];
const PERCENT = new Set(['Repeat Order %', 'Conversion Rate']);
const COUNT = new Set([
  'Total Messages',
  'Message Order Received (Pax)',
  'FB New Order',
  'FB Repeat Order',
  'Shopee',
  'LZD',
  'Shopee/LZD New Order',
  'Shopee/LZD Repeat Order',
  'TOTAL ORDER',
]);

// One sheet laid out like hers: the summary block on top, then a row a day.
export function reportXlsx(r: Report) {
  const t = r.totals;
  const pct = (n: number | null) => (n == null ? null : n / 100);
  const top: (string | number | null)[][] = [
    ['Lunaa Sales Report', r.month],
    [],
    ['Total Sales (RM)', t.sales, '', 'Target Sales (RM)', r.target],
    ['Total Ad Spent (RM)', t.ad_spend, '', 'Sales to pick up (RM)', r.to_pick_up],
    ['ROAS', t.roas, '', 'Sales / day needed (RM)', r.sales_per_day_needed],
    ['Repeat Order', pct(t.repeat_pct), '', 'Closing Rate', pct(t.conversion_rate)],
    ['AOV (RM)', t.aov, '', 'Shopee/LZD Repeat', pct(t.mp_repeat_pct)],
    ['Total Orders', t.orders, '', 'Ad account', r.ad_account?.name ?? 'Not connected'],
    [],
  ];
  const headerRow = top.length;
  const rows: (string | number | null)[][] = [
    ...top,
    ['Date', ...COLUMNS.map((c) => c.label)],
    ...r.days.map((d) => [d.date, ...COLUMNS.map((c) => c.value(d))]),
    ['Total', ...COLUMNS.map((c) => c.value(t))],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // Number formats so it reads like her sheet.
  const fmt = (row: number, col: number, z: string) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    if (cell && typeof cell.v === 'number') cell.z = z;
  };
  const TOP_FMT: Record<string, string> = {
    ROAS: '0.00',
    'Repeat Order': '0.00%',
    'Closing Rate': '0.00%',
    'Shopee/LZD Repeat': '0.00%',
    'Total Orders': '0',
  };
  for (let row = 2; row < headerRow; row++) {
    fmt(row, 1, TOP_FMT[String(rows[row][0])] ?? '#,##0.00');
    fmt(row, 4, TOP_FMT[String(rows[row][3])] ?? '#,##0.00');
  }
  for (let row = headerRow + 1; row < rows.length; row++) {
    COLUMNS.forEach((c, i) => {
      fmt(row, i + 1, PERCENT.has(c.label) ? '0.00%' : COUNT.has(c.label) ? '0' : c.label === 'ROAS' ? '0.00' : '#,##0.00');
    });
  }
  sheet['!cols'] = [{ wch: 22 }, ...COLUMNS.map((c) => ({ wch: Math.max(12, c.label.length + 2) }))];
  sheet['!cols'][3] = { wch: 26 };

  const book = XLSX.utils.book_new();
  const [y, m] = r.month.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) + String(y).slice(2);
  XLSX.utils.book_append_sheet(book, sheet, name);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
