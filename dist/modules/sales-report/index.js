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
exports.getTarget = getTarget;
exports.setTarget = setTarget;
exports.salesReport = salesReport;
exports.reportXlsx = reportXlsx;
const XLSX = __importStar(require("xlsx"));
const supabase_1 = require("../supabase");
const settings_1 = require("../meta-ads/settings");
const timezone_1 = require("../../utils/timezone");
const KEYS = [
    'ad_spend',
    'messages',
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
const div = (a, b) => (b ? a / b : null);
const round = (n, places = 2) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);
// Her formulas: cost per message = spend ÷ messages; cost per conversion =
// spend ÷ new WhatsApp orders; conversion = new WhatsApp orders ÷ messages;
// repeat % = repeat WhatsApp orders ÷ WhatsApp orders; ROAS = all sales ÷
// spend; AOV = all sales ÷ all orders.
function derive(c) {
    const marketplace = c.shopee_orders + c.lazada_orders;
    return Object.assign(Object.assign({}, c), { marketplace_orders: marketplace, cost_per_message: round(div(c.ad_spend, c.messages)), repeat_pct: round(div(c.wa_repeat * 100, c.wa_orders)), mp_repeat_pct: round(div(c.mp_repeat * 100, marketplace)), cost_per_conversion: c.ad_spend ? round(div(c.ad_spend, c.wa_new)) : null, conversion_rate: round(div(c.wa_new * 100, c.messages)), roas: round(div(c.sales, c.ad_spend)), aov: round(div(c.sales, c.orders)) });
}
function todayInMalaysia() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone_1.APP_TIMEZONE }).format(new Date());
}
function monthBounds(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { first: `${month}-01`, last, daysInMonth: Number(last.slice(8)) };
}
async function getTarget(month) {
    const { data, error } = await supabase_1.supabase.from('sales_targets').select('target').eq('month', `${month}-01`).maybeSingle();
    if (error)
        throw error;
    return data ? Number(data.target) : null;
}
async function setTarget(month, target) {
    if (target == null) {
        const { error } = await supabase_1.supabase.from('sales_targets').delete().eq('month', `${month}-01`);
        if (error)
            throw error;
        return;
    }
    const { error } = await supabase_1.supabase
        .from('sales_targets')
        .upsert({ month: `${month}-01`, target, updated_at: new Date().toISOString() });
    if (error)
        throw error;
}
async function salesReport(month) {
    const today = todayInMalaysia();
    const { first, last, daysInMonth } = monthBounds(month);
    if (first > today)
        throw new Error('That month hasn’t started yet');
    const until = last < today ? last : today;
    const [{ data, error }, target, ads] = await Promise.all([
        supabase_1.supabase.rpc('get_sales_report', { first_day: first, last_day: until }),
        getTarget(month),
        (0, settings_1.getRow)().catch(() => null),
    ]);
    if (error)
        throw error;
    const days = (data !== null && data !== void 0 ? data : []).map((r) => {
        var _a;
        const c = {};
        for (const k of KEYS)
            c[k] = Number((_a = r[k]) !== null && _a !== void 0 ? _a : 0);
        return Object.assign({ date: String(r.day) }, derive(c));
    });
    const sum = {};
    for (const k of KEYS)
        sum[k] = days.reduce((n, d) => n + d[k], 0);
    sum.ad_spend = round(sum.ad_spend);
    sum.sales = round(sum.sales);
    const totals = derive(sum);
    // What's left to reach the target, and per remaining day (today counts).
    const daysLeft = last < today ? 0 : daysInMonth - Number(today.slice(8)) + 1;
    const toPickUp = target == null ? null : Math.max(0, round(target - totals.sales));
    return {
        month,
        from: first,
        to: until,
        ad_account: (ads === null || ads === void 0 ? void 0 : ads.ad_account_id)
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
const COLUMNS = [
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
function reportXlsx(r) {
    var _a, _b, _c, _d;
    const t = r.totals;
    const pct = (n) => (n == null ? null : n / 100);
    const top = [
        ['Lunaa Sales Report', r.month],
        [],
        ['Total Sales (RM)', t.sales, '', 'Target Sales (RM)', r.target],
        ['Total Ad Spent (RM)', t.ad_spend, '', 'Sales to pick up (RM)', r.to_pick_up],
        ['ROAS', t.roas, '', 'Sales / day needed (RM)', r.sales_per_day_needed],
        ['Repeat Order', pct(t.repeat_pct), '', 'Closing Rate', pct(t.conversion_rate)],
        ['AOV (RM)', t.aov, '', 'Shopee/LZD Repeat', pct(t.mp_repeat_pct)],
        ['Total Orders', t.orders, '', 'Ad account', (_b = (_a = r.ad_account) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Not connected'],
        [],
    ];
    const headerRow = top.length;
    const rows = [
        ...top,
        ['Date', ...COLUMNS.map((c) => c.label)],
        ...r.days.map((d) => [d.date, ...COLUMNS.map((c) => c.value(d))]),
        ['Total', ...COLUMNS.map((c) => c.value(t))],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    // Number formats so it reads like her sheet.
    const fmt = (row, col, z) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell && typeof cell.v === 'number')
            cell.z = z;
    };
    const TOP_FMT = {
        ROAS: '0.00',
        'Repeat Order': '0.00%',
        'Closing Rate': '0.00%',
        'Shopee/LZD Repeat': '0.00%',
        'Total Orders': '0',
    };
    for (let row = 2; row < headerRow; row++) {
        fmt(row, 1, (_c = TOP_FMT[String(rows[row][0])]) !== null && _c !== void 0 ? _c : '#,##0.00');
        fmt(row, 4, (_d = TOP_FMT[String(rows[row][3])]) !== null && _d !== void 0 ? _d : '#,##0.00');
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
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
