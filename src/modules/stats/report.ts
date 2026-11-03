import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { campaignTotals } from '../../routes/meta-ads';
import StatsDatabase from './database';

const statsDb = new StatsDatabase();
const customerMix = (firstDay: string, lastDay: string) => statsDb.getCustomerMix(firstDay, lastDay);

// A report staff build themselves: one day or one month, the sections they
// tick, and for the order list, the columns they want.

export const REPORT_SECTIONS = ['summary', 'daily', 'orders', 'products', 'new_customers', 'returning_customers', 'ads'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const ORDER_COLUMNS = {
  date: 'Date',
  time: 'Time',
  order: 'Order',
  channel: 'Channel',
  type: 'Type',
  customer: 'Customer',
  phone: 'Phone',
  address: 'Address',
  state: 'State',
  agent: 'Agent',
  items: 'Items',
  total: 'Total (RM)',
  payment: 'Payment',
  status: 'Status',
  courier: 'Courier',
  tracking: 'Tracking number',
  delivery: 'Delivery status',
  remark: 'Remark',
} as const;
export type OrderColumn = keyof typeof ORDER_COLUMNS;

export type ReportPeriod = { kind: 'day'; date: string } | { kind: 'month'; month: string };

export type ReportRequest = {
  period: ReportPeriod;
  sections: ReportSection[];
  orderColumns: OrderColumn[];
  format: 'xlsx' | 'csv';
};

const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', shopee: 'Shopee', lazada: 'Lazada' };
const SECTION_TITLE: Record<ReportSection, string> = {
  summary: 'Summary',
  daily: 'Day by day',
  orders: 'Orders',
  products: 'Products',
  new_customers: 'New customers',
  returning_customers: 'Returning customers',
  ads: 'Meta ads',
};

type Table = { title: ReportSection; rows: (string | number | null)[][] };

const money = (n: number) => Math.round(n * 100) / 100;
const myt = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600000).toISOString();

function bounds(period: ReportPeriod) {
  if (period.kind === 'day') {
    const next = new Date(`${period.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDay = next.toISOString().slice(0, 10);
    return {
      firstDay: period.date,
      lastDay: period.date,
      month: period.date.slice(0, 7),
      start: new Date(`${period.date}T00:00:00+08:00`).toISOString(),
      end: new Date(`${nextDay}T00:00:00+08:00`).toISOString(),
      label: period.date,
    };
  }
  const [y, m] = period.month.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return {
    firstDay: `${period.month}-01`,
    lastDay: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    month: period.month,
    start: new Date(`${period.month}-01T00:00:00+08:00`).toISOString(),
    end: new Date(`${nextMonth}-01T00:00:00+08:00`).toISOString(),
    label: period.month,
  };
}

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

type DayRow = {
  day: string;
  orders: number;
  revenue: number;
  new_customers: number;
  returning_customers: number;
  returning_revenue: number;
  ad_spend: number | null;
};

async function dailyRows(b: ReturnType<typeof bounds>): Promise<DayRow[]> {
  const { data, error } = await supabase.rpc('get_daily_breakdown', { month_start: `${b.month}-01` });
  if (error) throw error;
  return (data ?? [])
    .filter((d: any) => d.day >= b.firstDay && d.day <= b.lastDay)
    .map((d: any) => ({
      day: d.day as string,
      orders: Number(d.orders),
      revenue: Number(d.revenue),
      new_customers: Number(d.new_customers),
      returning_customers: Number(d.returning_customers),
      returning_revenue: Number(d.returning_revenue),
      ad_spend: d.ad_spend == null ? null : Number(d.ad_spend),
    }));
}

async function fetchOrders(b: ReturnType<typeof bounds>) {
  return pageAll<any>((from, to) =>
    supabase
      .from('orders')
      .select(
        'id, customer_id, created_at, sales_day, order_number, source, is_distributor, total_amount, payment_method, status, agent_name, buyer_name, remark, shipment_description, customers(name, phone_number), addresses(full_address, postcode, city, state), order_items(quantity, products(name, price)), order_tracking(courier, tracking_number, status)'
      )
      .is('deleted_at', null)
      .or('is_distributor.is.null,is_distributor.eq.false')
      .gte('sales_day', b.firstDay)
      .lte('sales_day', b.lastDay)
      .order('sales_day')
      .order('created_at')
      .range(from, to)
  );
}

function orderCell(o: any, column: OrderColumn): string | number | null {
  const tracking = Array.isArray(o.order_tracking) ? o.order_tracking[0] : o.order_tracking;
  const address = o.addresses;
  switch (column) {
    case 'date': return o.sales_day ?? myt(o.created_at).slice(0, 10);
    case 'time': return myt(o.created_at).slice(11, 16);
    case 'order': return o.order_number ?? '';
    case 'channel': return CHANNEL[o.source] ?? 'WhatsApp';
    case 'type': return o.is_distributor ? 'Distributor' : 'Customer';
    case 'customer': return o.customers?.name || o.buyer_name || '';
    case 'phone': return o.customers?.phone_number ?? '';
    case 'address': return address ? [address.full_address, address.postcode, address.city].filter(Boolean).join(', ') : '';
    case 'state': return address?.state ?? '';
    case 'agent': return o.agent_name ?? '';
    case 'items': return o.shipment_description ?? '';
    case 'total': return money(Number(o.total_amount) || 0);
    case 'payment': return o.payment_method ?? '';
    case 'status': return o.status ?? '';
    case 'courier': return tracking?.courier ?? '';
    case 'tracking': return tracking?.tracking_number ?? '';
    case 'delivery': return tracking?.status ?? '';
    case 'remark': return o.remark ?? '';
  }
}

// Same split as the dashboard: list price × quantity, or the order total shared
// across its items when the product has no price.
function productRows(orders: any[]) {
  const byProduct = new Map<string, { units: number; orders: number; revenue: number }>();
  for (const o of orders) {
    const items = o.order_items ?? [];
    const totalQty = items.reduce((n: number, i: any) => n + (i.quantity || 0), 0);
    for (const item of items) {
      const name = item.products?.name ?? 'Unknown product';
      const price = Number(item.products?.price) || 0;
      const qty = item.quantity || 0;
      const revenue = price > 0 ? price * qty : totalQty > 0 ? ((Number(o.total_amount) || 0) / totalQty) * qty : 0;
      const p = byProduct.get(name) ?? { units: 0, orders: 0, revenue: 0 };
      p.units += qty;
      p.orders += 1;
      p.revenue += revenue;
      byProduct.set(name, p);
    }
  }
  return [...byProduct.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([name, p]) => [name, p.units, p.orders, money(p.revenue)]);
}

// Customers whose first-ever order falls inside the period.
async function newCustomerRows(orders: any[], start: string) {
  const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const returning = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_id')
      .in('customer_id', ids.slice(i, i + 200))
      .is('deleted_at', null)
      .or('is_distributor.is.null,is_distributor.eq.false')
      .lt('sales_day', start);
    if (error) throw error;
    for (const r of data ?? []) returning.add(r.customer_id);
  }
  const seen = new Set<string>();
  const rows: (string | number)[][] = [];
  for (const o of orders) {
    if (!o.customer_id || returning.has(o.customer_id) || seen.has(o.customer_id)) continue;
    seen.add(o.customer_id);
    rows.push([
      o.sales_day,
      o.customers?.name || o.buyer_name || '',
      o.customers?.phone_number ?? '',
      o.addresses?.state ?? '',
      o.order_number ?? '',
      money(Number(o.total_amount) || 0),
    ]);
  }
  return rows;
}

// Customers who had ordered before the period and ordered again in it.
async function returningRows(orders: any[], start: string) {
  const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const before = new Map<string, { count: number; first: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_id, sales_day')
      .in('customer_id', ids.slice(i, i + 200))
      .is('deleted_at', null)
      .or('is_distributor.is.null,is_distributor.eq.false')
      .lt('sales_day', start)
      .limit(10000);
    if (error) throw error;
    for (const r of data ?? []) {
      const b = before.get(r.customer_id) ?? { count: 0, first: r.sales_day };
      b.count += 1;
      if (r.sales_day < b.first) b.first = r.sales_day;
      before.set(r.customer_id, b);
    }
  }
  return orders
    .filter((o) => o.customer_id && before.has(o.customer_id))
    .map((o) => {
      const b = before.get(o.customer_id)!;
      return [
        o.sales_day,
        o.customers?.name || o.buyer_name || '',
        o.customers?.phone_number ?? '',
        o.order_number ?? '',
        money(Number(o.total_amount) || 0),
        b.first,
        b.count,
      ];
    });
}

const ratio = (a: number, b: number | null) => (b ? Math.round((a / b) * 100) / 100 : null);

export async function buildReport(req: ReportRequest) {
  const b = bounds(req.period);
  const wants = (s: ReportSection) => req.sections.includes(s);
  const needOrders = wants('orders') || wants('products') || wants('new_customers') || wants('returning_customers');
  const [days, orders]: [DayRow[], any[]] = await Promise.all([
    wants('summary') || wants('daily') ? dailyRows(b) : Promise.resolve([] as DayRow[]),
    needOrders ? fetchOrders(b) : Promise.resolve([] as any[]),
  ]);

  const tables: Table[] = [];

  if (wants('summary')) {
    const t = days.reduce(
      (s, d) => ({
        orders: s.orders + d.orders,
        revenue: s.revenue + d.revenue,
        ad_spend: d.ad_spend == null ? s.ad_spend : (s.ad_spend ?? 0) + d.ad_spend,
      }),
      { orders: 0, revenue: 0, ad_spend: null as number | null }
    );
    const mix = await customerMix(b.firstDay, b.lastDay);
    const rows: (string | number | null)[][] = [
      ['Period', req.period.kind === 'day' ? b.firstDay : `${b.firstDay} to ${b.lastDay}`],
      ['Orders', t.orders],
      ['Revenue (RM)', money(t.revenue)],
      ['Average order (RM)', t.orders ? money(t.revenue / t.orders) : 0],
      ['Customers', mix.customers],
      ['New customers', mix.new_customers],
      ['Returning customers', mix.returning_customers],
      ['Orders from returning customers', mix.returning_orders],
      ['Revenue from returning customers (RM)', money(mix.returning_revenue)],
    ];
    if (t.ad_spend != null) {
      rows.push(
        ['Ad spend', money(t.ad_spend)],
        ['ROAS (revenue ÷ ad spend)', ratio(t.revenue, t.ad_spend)],
        ['Ad spend per new customer', mix.new_customers ? money(t.ad_spend / mix.new_customers) : null]
      );
    }
    tables.push({ title: 'summary', rows: [['Measure', 'Value'], ...rows] });
  }

  if (wants('daily') && req.period.kind === 'month') {
    const hasAds = days.some((d) => d.ad_spend != null);
    tables.push({
      title: 'daily',
      rows: [
        ['Date', 'Orders', 'Revenue (RM)', 'New customers', 'Returning customers', 'Revenue from returning (RM)', ...(hasAds ? ['Ad spend', 'ROAS'] : [])],
        ...days.map((d) => [
          d.day,
          d.orders,
          money(d.revenue),
          d.new_customers,
          d.returning_customers,
          money(d.returning_revenue),
          ...(hasAds ? [d.ad_spend == null ? null : money(d.ad_spend), ratio(d.revenue, d.ad_spend)] : []),
        ]),
      ],
    });
  }

  if (wants('orders')) {
    const columns = req.orderColumns.length ? req.orderColumns : (Object.keys(ORDER_COLUMNS) as OrderColumn[]);
    tables.push({
      title: 'orders',
      rows: [columns.map((c) => ORDER_COLUMNS[c]), ...orders.map((o) => columns.map((c) => orderCell(o, c)))],
    });
  }

  if (wants('products')) {
    tables.push({ title: 'products', rows: [['Product', 'Units', 'Orders', 'Revenue (RM)'], ...productRows(orders)] });
  }

  if (wants('new_customers')) {
    tables.push({
      title: 'new_customers',
      rows: [['First order', 'Customer', 'Phone', 'State', 'Order', 'Value (RM)'], ...(await newCustomerRows(orders, b.firstDay))],
    });
  }

  if (wants('returning_customers')) {
    tables.push({
      title: 'returning_customers',
      rows: [
        ['Date', 'Customer', 'Phone', 'Order', 'Value (RM)', 'First ordered', 'Orders before'],
        ...(await returningRows(orders, b.firstDay)),
      ],
    });
  }

  if (wants('ads')) {
    const campaigns = await campaignTotals(b.firstDay, b.lastDay);
    tables.push({
      title: 'ads',
      rows: [
        ['Campaign', 'Spend', 'Impressions', 'Reach', 'Clicks', 'Conversations started', 'Cost per conversation', 'Purchases (Meta)', 'Purchase value (Meta)', 'ROAS (Meta)'],
        ...campaigns.map((c) => [
          c.campaign_name ?? c.campaign_id,
          c.spend,
          c.impressions,
          c.reach,
          c.clicks,
          c.conversations,
          c.cost_per_conversation,
          c.purchases,
          money(c.purchase_value),
          c.roas,
        ]),
      ],
    });
  }

  const filename = `lunaa-report-${b.label}.${req.format}`;
  return req.format === 'xlsx'
    ? { filename, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: toXlsx(tables) }
    : { filename, contentType: 'text/csv; charset=utf-8', body: Buffer.from(`﻿${toCsv(tables)}`, 'utf8') };
}

function toXlsx(tables: Table[]) {
  const book = XLSX.utils.book_new();
  for (const table of tables) {
    const sheet = XLSX.utils.aoa_to_sheet(table.rows);
    sheet['!cols'] = table.rows[0].map((_, col) => ({
      wch: Math.min(48, Math.max(8, ...table.rows.map((r) => String(r[col] ?? '').length + 2))),
    }));
    XLSX.utils.book_append_sheet(book, sheet, SECTION_TITLE[table.title]);
  }
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One file, sections stacked with their title and a blank line between.
function toCsv(tables: Table[]) {
  return tables
    .map((t) => [SECTION_TITLE[t.title], ...t.rows.map((r) => r.map(csvCell).join(','))].join('\n'))
    .join('\n\n');
}
