"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_COLUMNS = exports.REPORT_SECTIONS = void 0;
exports.buildReport = buildReport;
const XLSX = __importStar(require("xlsx"));
const supabase_1 = require("../supabase");
const meta_ads_1 = require("../../routes/meta-ads");
// A report staff build themselves: one day or one month, the sections they
// tick, and for the order list, the columns they want.
exports.REPORT_SECTIONS = ['summary', 'daily', 'orders', 'products', 'new_customers', 'returns', 'ads'];
exports.ORDER_COLUMNS = {
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
};
const CHANNEL = { whatsapp: 'WhatsApp', shopee: 'Shopee', lazada: 'Lazada' };
const SECTION_TITLE = {
    summary: 'Summary',
    daily: 'Day by day',
    orders: 'Orders',
    products: 'Products',
    new_customers: 'New customers',
    returns: 'Returns',
    ads: 'Meta ads',
};
const money = (n) => Math.round(n * 100) / 100;
const myt = (iso) => new Date(new Date(iso).getTime() + 8 * 3600000).toISOString();
function bounds(period) {
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
async function pageAll(build) {
    const out = [];
    for (let from = 0;; from += 1000) {
        const { data, error } = await build(from, from + 999);
        if (error)
            throw error;
        out.push(...(data !== null && data !== void 0 ? data : []));
        if (!data || data.length < 1000)
            return out;
    }
}
async function dailyRows(b) {
    const { data, error } = await supabase_1.supabase.rpc('get_daily_breakdown', { month_start: `${b.month}-01` });
    if (error)
        throw error;
    return (data !== null && data !== void 0 ? data : [])
        .filter((d) => d.day >= b.firstDay && d.day <= b.lastDay)
        .map((d) => ({
        day: d.day,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
        new_customers: Number(d.new_customers),
        returns: Number(d.returns),
        returned_value: Number(d.returned_value),
        ad_spend: d.ad_spend == null ? null : Number(d.ad_spend),
    }));
}
async function fetchOrders(b) {
    return pageAll((from, to) => supabase_1.supabase
        .from('orders')
        .select('id, customer_id, created_at, order_number, source, is_distributor, total_amount, payment_method, status, agent_name, buyer_name, remark, shipment_description, customers(name, phone_number), addresses(full_address, postcode, city, state), order_items(quantity, products(name, price)), order_tracking(courier, tracking_number, status)')
        .is('deleted_at', null)
        .gte('created_at', b.start)
        .lt('created_at', b.end)
        .order('created_at')
        .range(from, to));
}
function orderCell(o, column) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const tracking = Array.isArray(o.order_tracking) ? o.order_tracking[0] : o.order_tracking;
    const address = o.addresses;
    switch (column) {
        case 'date': return myt(o.created_at).slice(0, 10);
        case 'time': return myt(o.created_at).slice(11, 16);
        case 'order': return (_a = o.order_number) !== null && _a !== void 0 ? _a : '';
        case 'channel': return (_b = CHANNEL[o.source]) !== null && _b !== void 0 ? _b : 'WhatsApp';
        case 'type': return o.is_distributor ? 'Distributor' : 'Customer';
        case 'customer': return ((_c = o.customers) === null || _c === void 0 ? void 0 : _c.name) || o.buyer_name || '';
        case 'phone': return (_e = (_d = o.customers) === null || _d === void 0 ? void 0 : _d.phone_number) !== null && _e !== void 0 ? _e : '';
        case 'address': return address ? [address.full_address, address.postcode, address.city].filter(Boolean).join(', ') : '';
        case 'state': return (_f = address === null || address === void 0 ? void 0 : address.state) !== null && _f !== void 0 ? _f : '';
        case 'agent': return (_g = o.agent_name) !== null && _g !== void 0 ? _g : '';
        case 'items': return (_h = o.shipment_description) !== null && _h !== void 0 ? _h : '';
        case 'total': return money(Number(o.total_amount) || 0);
        case 'payment': return (_j = o.payment_method) !== null && _j !== void 0 ? _j : '';
        case 'status': return (_k = o.status) !== null && _k !== void 0 ? _k : '';
        case 'courier': return (_l = tracking === null || tracking === void 0 ? void 0 : tracking.courier) !== null && _l !== void 0 ? _l : '';
        case 'tracking': return (_m = tracking === null || tracking === void 0 ? void 0 : tracking.tracking_number) !== null && _m !== void 0 ? _m : '';
        case 'delivery': return (_o = tracking === null || tracking === void 0 ? void 0 : tracking.status) !== null && _o !== void 0 ? _o : '';
        case 'remark': return (_p = o.remark) !== null && _p !== void 0 ? _p : '';
    }
}
// Same split as the dashboard: list price × quantity, or the order total shared
// across its items when the product has no price.
function productRows(orders) {
    var _a, _b, _c, _d, _e;
    const byProduct = new Map();
    for (const o of orders) {
        const items = (_a = o.order_items) !== null && _a !== void 0 ? _a : [];
        const totalQty = items.reduce((n, i) => n + (i.quantity || 0), 0);
        for (const item of items) {
            const name = (_c = (_b = item.products) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : 'Unknown product';
            const price = Number((_d = item.products) === null || _d === void 0 ? void 0 : _d.price) || 0;
            const qty = item.quantity || 0;
            const revenue = price > 0 ? price * qty : totalQty > 0 ? ((Number(o.total_amount) || 0) / totalQty) * qty : 0;
            const p = (_e = byProduct.get(name)) !== null && _e !== void 0 ? _e : { units: 0, orders: 0, revenue: 0 };
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
async function newCustomerRows(orders, start) {
    var _a, _b, _c, _d, _e, _f;
    const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
    const returning = new Set();
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('customer_id')
            .in('customer_id', ids.slice(i, i + 200))
            .is('deleted_at', null)
            .lt('created_at', start);
        if (error)
            throw error;
        for (const r of data !== null && data !== void 0 ? data : [])
            returning.add(r.customer_id);
    }
    const seen = new Set();
    const rows = [];
    for (const o of orders) {
        if (!o.customer_id || returning.has(o.customer_id) || seen.has(o.customer_id))
            continue;
        seen.add(o.customer_id);
        rows.push([
            myt(o.created_at).slice(0, 10),
            ((_a = o.customers) === null || _a === void 0 ? void 0 : _a.name) || o.buyer_name || '',
            (_c = (_b = o.customers) === null || _b === void 0 ? void 0 : _b.phone_number) !== null && _c !== void 0 ? _c : '',
            (_e = (_d = o.addresses) === null || _d === void 0 ? void 0 : _d.state) !== null && _e !== void 0 ? _e : '',
            (_f = o.order_number) !== null && _f !== void 0 ? _f : '',
            money(Number(o.total_amount) || 0),
        ]);
    }
    return rows;
}
async function returnRows(b) {
    const { data, error } = await supabase_1.supabase
        .from('order_tracking')
        .select('updated_at, courier, tracking_number, status, orders!inner(order_number, total_amount, deleted_at, customers(name, phone_number))')
        .ilike('status', 'return%')
        .gte('updated_at', b.start)
        .lt('updated_at', b.end)
        .order('updated_at');
    if (error)
        throw error;
    return (data !== null && data !== void 0 ? data : [])
        .filter((r) => { var _a; return !((_a = r.orders) === null || _a === void 0 ? void 0 : _a.deleted_at); })
        .map((r) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        return [
            myt(r.updated_at).slice(0, 10),
            (_b = (_a = r.orders) === null || _a === void 0 ? void 0 : _a.order_number) !== null && _b !== void 0 ? _b : '',
            (_e = (_d = (_c = r.orders) === null || _c === void 0 ? void 0 : _c.customers) === null || _d === void 0 ? void 0 : _d.name) !== null && _e !== void 0 ? _e : '',
            (_h = (_g = (_f = r.orders) === null || _f === void 0 ? void 0 : _f.customers) === null || _g === void 0 ? void 0 : _g.phone_number) !== null && _h !== void 0 ? _h : '',
            (_j = r.courier) !== null && _j !== void 0 ? _j : '',
            (_k = r.tracking_number) !== null && _k !== void 0 ? _k : '',
            money(Number((_l = r.orders) === null || _l === void 0 ? void 0 : _l.total_amount) || 0),
        ];
    });
}
const ratio = (a, b) => (b ? Math.round((a / b) * 100) / 100 : null);
async function buildReport(req) {
    const b = bounds(req.period);
    const wants = (s) => req.sections.includes(s);
    const needOrders = wants('orders') || wants('products') || wants('new_customers');
    const [days, orders] = await Promise.all([
        wants('summary') || wants('daily') ? dailyRows(b) : Promise.resolve([]),
        needOrders ? fetchOrders(b) : Promise.resolve([]),
    ]);
    const tables = [];
    if (wants('summary')) {
        const t = days.reduce((s, d) => {
            var _a;
            return ({
                orders: s.orders + d.orders,
                revenue: s.revenue + d.revenue,
                new_customers: s.new_customers + d.new_customers,
                returns: s.returns + d.returns,
                returned_value: s.returned_value + d.returned_value,
                ad_spend: d.ad_spend == null ? s.ad_spend : ((_a = s.ad_spend) !== null && _a !== void 0 ? _a : 0) + d.ad_spend,
            });
        }, { orders: 0, revenue: 0, new_customers: 0, returns: 0, returned_value: 0, ad_spend: null });
        const rows = [
            ['Period', req.period.kind === 'day' ? b.firstDay : `${b.firstDay} to ${b.lastDay}`],
            ['Orders', t.orders],
            ['Revenue (RM)', money(t.revenue)],
            ['Average order (RM)', t.orders ? money(t.revenue / t.orders) : 0],
            ['New customers', t.new_customers],
            ['Returns', t.returns],
            ['Returned value (RM)', money(t.returned_value)],
        ];
        if (t.ad_spend != null) {
            rows.push(['Ad spend', money(t.ad_spend)], ['ROAS (revenue ÷ ad spend)', ratio(t.revenue, t.ad_spend)], ['Ad spend per new customer', t.new_customers ? money(t.ad_spend / t.new_customers) : null]);
        }
        tables.push({ title: 'summary', rows: [['Measure', 'Value'], ...rows] });
    }
    if (wants('daily') && req.period.kind === 'month') {
        const hasAds = days.some((d) => d.ad_spend != null);
        tables.push({
            title: 'daily',
            rows: [
                ['Date', 'Orders', 'Revenue (RM)', 'New customers', 'Returns', 'Returned value (RM)', ...(hasAds ? ['Ad spend', 'ROAS'] : [])],
                ...days.map((d) => [
                    d.day,
                    d.orders,
                    money(d.revenue),
                    d.new_customers,
                    d.returns,
                    money(d.returned_value),
                    ...(hasAds ? [d.ad_spend == null ? null : money(d.ad_spend), ratio(d.revenue, d.ad_spend)] : []),
                ]),
            ],
        });
    }
    if (wants('orders')) {
        const columns = req.orderColumns.length ? req.orderColumns : Object.keys(exports.ORDER_COLUMNS);
        tables.push({
            title: 'orders',
            rows: [columns.map((c) => exports.ORDER_COLUMNS[c]), ...orders.map((o) => columns.map((c) => orderCell(o, c)))],
        });
    }
    if (wants('products')) {
        tables.push({ title: 'products', rows: [['Product', 'Units', 'Orders', 'Revenue (RM)'], ...productRows(orders)] });
    }
    if (wants('new_customers')) {
        tables.push({
            title: 'new_customers',
            rows: [['First order', 'Customer', 'Phone', 'State', 'Order', 'Value (RM)'], ...(await newCustomerRows(orders, b.start))],
        });
    }
    if (wants('returns')) {
        tables.push({
            title: 'returns',
            rows: [['Returned on', 'Order', 'Customer', 'Phone', 'Courier', 'Tracking number', 'Value (RM)'], ...(await returnRows(b))],
        });
    }
    if (wants('ads')) {
        const campaigns = await (0, meta_ads_1.campaignTotals)(b.firstDay, b.lastDay);
        tables.push({
            title: 'ads',
            rows: [
                ['Campaign', 'Spend', 'Impressions', 'Reach', 'Clicks', 'Conversations started', 'Cost per conversation', 'Purchases (Meta)', 'Purchase value (Meta)', 'ROAS (Meta)'],
                ...campaigns.map((c) => {
                    var _a;
                    return [
                        (_a = c.campaign_name) !== null && _a !== void 0 ? _a : c.campaign_id,
                        c.spend,
                        c.impressions,
                        c.reach,
                        c.clicks,
                        c.conversations,
                        c.cost_per_conversation,
                        c.purchases,
                        money(c.purchase_value),
                        c.roas,
                    ];
                }),
            ],
        });
    }
    const filename = `lunaa-report-${b.label}.${req.format}`;
    return req.format === 'xlsx'
        ? { filename, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: toXlsx(tables) }
        : { filename, contentType: 'text/csv; charset=utf-8', body: Buffer.from(`﻿${toCsv(tables)}`, 'utf8') };
}
function toXlsx(tables) {
    const book = XLSX.utils.book_new();
    for (const table of tables) {
        const sheet = XLSX.utils.aoa_to_sheet(table.rows);
        sheet['!cols'] = table.rows[0].map((_, col) => ({
            wch: Math.min(48, Math.max(8, ...table.rows.map((r) => { var _a; return String((_a = r[col]) !== null && _a !== void 0 ? _a : '').length + 2; }))),
        }));
        XLSX.utils.book_append_sheet(book, sheet, SECTION_TITLE[table.title]);
    }
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
// One file, sections stacked with their title and a blank line between.
function toCsv(tables) {
    return tables
        .map((t) => [SECTION_TITLE[t.title], ...t.rows.map((r) => r.map(csvCell).join(','))].join('\n'))
        .join('\n\n');
}
