"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTab = parseTab;
exports.listSheetIssues = listSheetIssues;
exports.recentTabs = recentTabs;
exports.sheetSyncStatus = sheetSyncStatus;
exports.syncSheetTabs = syncSheetTabs;
const googleapis_1 = require("googleapis");
const supabase_1 = require("../supabase");
const monthlySheet_1 = require("../../utils/monthlySheet");
// Staff colour rows in the monthly order tabs:
// orange = Shopee, dark blue = Lazada.
// Cyan (light blue) = COD already out, red = COD payment still pending.
// Those two are WhatsApp orders that already exist in the CRM.
const ROW_COLOURS = [
    { platform: 'shopee', rgb: [0xff, 0x99, 0x00] },
    { platform: 'lazada', rgb: [0x4a, 0x86, 0xe8] },
];
const COD_COLOURS = [
    { status: 'out', rgb: [0x00, 0xff, 0xff] },
    { status: 'pending', rgb: [0xff, 0x00, 0x00] },
];
const COLOUR_TOLERANCE = 40;
const PRODUCT_COLUMNS = {
    wash: 'w',
    'femlift 30ml': 'f',
    'femlift 10ml': 'f10ml',
    'wash 30ml': 'w30ml',
    spray: 's',
    bloom: 'b',
    femrose: 'rose',
};
const NUMBER_PREFIX = { shopee: 'SHP', lazada: 'LZD' };
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;
function sheetsClient() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
    const auth = new googleapis_1.google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return googleapis_1.google.sheets({ version: 'v4', auth });
}
function cellRgb(cell) {
    var _a, _b, _c, _d;
    const bg = (_a = cell === null || cell === void 0 ? void 0 : cell.effectiveFormat) === null || _a === void 0 ? void 0 : _a.backgroundColor;
    if (!bg)
        return null;
    return [(_b = bg.red) !== null && _b !== void 0 ? _b : 0, (_c = bg.green) !== null && _c !== void 0 ? _c : 0, (_d = bg.blue) !== null && _d !== void 0 ? _d : 0].map((v) => Math.round(v * 255));
}
function near(rgb, target) {
    return !!rgb && target.every((value, i) => Math.abs(value - rgb[i]) <= COLOUR_TOLERANCE);
}
function rowPlatform(cell) {
    var _a, _b;
    const rgb = cellRgb(cell);
    return (_b = (_a = ROW_COLOURS.find(({ rgb: target }) => near(rgb, target))) === null || _a === void 0 ? void 0 : _a.platform) !== null && _b !== void 0 ? _b : null;
}
function rowCodStatus(cell) {
    var _a, _b;
    const rgb = cellRgb(cell);
    return (_b = (_a = COD_COLOURS.find(({ rgb: target }) => near(rgb, target))) === null || _a === void 0 ? void 0 : _a.status) !== null && _b !== void 0 ? _b : null;
}
function normalizePhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits)
        return null;
    if (digits.startsWith('60') || digits.startsWith('65'))
        return digits;
    if (digits.startsWith('0'))
        return `60${digits.slice(1)}`;
    if (/^[89]\d{7}$/.test(digits))
        return `65${digits}`;
    return digits.length >= 8 ? digits : null;
}
function parseDate(value) {
    const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
    if (!parts)
        return null;
    const [y, m, d] = parts;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? null : date;
}
const PRODUCT_CODES = new Set(Object.values(PRODUCT_COLUMNS));
// Some rows only have the shipment code ("2w2f1a"); gift codes are dropped.
function itemsFromDescription(description) {
    var _a, _b;
    const totals = new Map();
    for (const token of (_a = description === null || description === void 0 ? void 0 : description.replace(/\s+/g, '').match(/\d+[a-z]+(?:\d+ml)?/gi)) !== null && _a !== void 0 ? _a : []) {
        const [, qty, code] = token.match(/^(\d+)(.+)$/);
        const key = code.toLowerCase();
        if (PRODUCT_CODES.has(key))
            totals.set(key, ((_b = totals.get(key)) !== null && _b !== void 0 ? _b : 0) + Number(qty));
    }
    return [...totals].map(([code, quantity]) => ({ code, quantity }));
}
// A wrong year is a typo when the month matches the tab, e.g. 2025-06-03 in "June 26".
function fixYear(date, tab) {
    const month = (0, monthlySheet_1.parseMonthSheetName)(tab);
    if (!month || Number(date.slice(5, 7)) - 1 !== month.month)
        return date;
    return `${month.year}${date.slice(4)}`;
}
const text = (cell) => { var _a; return ((_a = cell === null || cell === void 0 ? void 0 : cell.formattedValue) === null || _a === void 0 ? void 0 : _a.trim()) || null; };
const number = (cell) => {
    var _a;
    const parsed = Number(String((_a = cell === null || cell === void 0 ? void 0 : cell.formattedValue) !== null && _a !== void 0 ? _a : '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};
function parseTab(tab, rows) {
    var _a, _b;
    const header = ((_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.values) !== null && _b !== void 0 ? _b : []).map((cell) => { var _a; return ((_a = cell.formattedValue) !== null && _a !== void 0 ? _a : '').trim().toLowerCase(); });
    const col = (name) => header.indexOf(name);
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
        phone: col('phone number'),
        agent: header.findIndex((h) => h.includes('agent')),
    };
    if (columns.date < 0 || columns.total < 0) {
        return { orders: [], skipped: 0, issues: [], annotations: [] };
    }
    const productColumns = Object.entries(PRODUCT_COLUMNS)
        .map(([name, code]) => ({ index: col(name), code }))
        .filter(({ index }) => index >= 0);
    const orders = [];
    const issues = [];
    const annotations = [];
    const seen = new Map();
    let skipped = 0;
    rows.slice(1).forEach((row, index) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const cells = (_a = row.values) !== null && _a !== void 0 ? _a : [];
        const rowNumber = index + 2;
        const platform = rowPlatform(cells[columns.date]);
        const parsedDate = parseDate((_b = text(cells[columns.date])) !== null && _b !== void 0 ? _b : '');
        const orderDate = parsedDate && fixYear(parsedDate, tab);
        const fbName = text(cells[columns.fbName]);
        const name = text(cells[columns.name]);
        const agentName = columns.agent >= 0 ? text(cells[columns.agent]) : null;
        if (!platform) {
            const phone = normalizePhone(text(cells[columns.phone]));
            if (phone && orderDate) {
                annotations.push({
                    phone,
                    orderDate,
                    totalAmount: Math.round(number(cells[columns.total]) * 100) / 100,
                    agentName,
                    codStatus: rowCodStatus(cells[columns.date]),
                    buyerName: name || fbName,
                    rowNumber,
                });
            }
            return;
        }
        const fromColumns = productColumns
            .map(({ index, code }) => ({ code, quantity: Math.round(number(cells[index])) }))
            .filter((item) => item.quantity > 0);
        const items = fromColumns.length
            ? fromColumns
            : itemsFromDescription(text(cells[columns.description]));
        if (!orderDate || !items.length) {
            skipped++;
            issues.push({
                tab,
                rowNumber,
                platform,
                buyerName: name || fbName,
                reason: !orderDate
                    ? 'No order date'
                    : 'No products in the quantity columns or the shipment description',
            });
            return;
        }
        // Rows have no order ID, so they're keyed by tab, date and buyer; a buyer
        // with two orders on the same day gets a running suffix.
        const baseKey = `${tab}|${orderDate}|${(fbName !== null && fbName !== void 0 ? fbName : '').toLowerCase()}|${(name !== null && name !== void 0 ? name : '').toLowerCase()}`;
        const occurrence = ((_c = seen.get(baseKey)) !== null && _c !== void 0 ? _c : 0) + 1;
        seen.set(baseKey, occurrence);
        const fullAddress = text(cells[columns.address]);
        orders.push({
            platform,
            externalRef: occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey,
            orderDate,
            buyerName: name || fbName,
            items,
            totalAmount: Math.round(number(cells[columns.total]) * 100) / 100,
            shipmentDescription: ((_d = text(cells[columns.description])) === null || _d === void 0 ? void 0 : _d.replace(/\s+/g, '')) ||
                items.map((item) => `${item.quantity}${item.code}`).join(''),
            remark: text(cells[columns.remark]),
            agentName,
            address: fullAddress
                ? {
                    full_address: fullAddress,
                    postcode: (_g = (_e = text(cells[columns.postcode])) !== null && _e !== void 0 ? _e : (_f = fullAddress.match(/\b\d{5}\b/)) === null || _f === void 0 ? void 0 : _f[0]) !== null && _g !== void 0 ? _g : null,
                    city: text(cells[columns.city]),
                    state: text(cells[columns.state]),
                }
                : null,
        });
    });
    return { orders, skipped, issues, annotations };
}
async function readTab(tab) {
    var _a, _b, _c, _d, _e;
    const { data } = await sheetsClient().spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        ranges: [`'${tab.replace(/'/g, "''")}'!A1:AF3000`],
        fields: 'sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)',
    });
    return parseTab(tab, (_e = (_d = (_c = (_b = (_a = data.sheets) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.rowData) !== null && _e !== void 0 ? _e : []);
}
async function nextNumbers() {
    var _a, _b;
    const next = { shopee: 1, lazada: 1 };
    for (const platform of Object.keys(NUMBER_PREFIX)) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('order_number')
            .like('order_number', `${NUMBER_PREFIX[platform]}-%`)
            .order('order_number', { ascending: false })
            .limit(1);
        if (error)
            throw error;
        const last = Number((_b = (_a = data === null || data === void 0 ? void 0 : data[0]) === null || _a === void 0 ? void 0 : _a.order_number) === null || _b === void 0 ? void 0 : _b.split('-')[1]);
        next[platform] = Number.isFinite(last) ? last + 1 : 1;
    }
    return next;
}
// Noon Malaysia time on the order date, so imported orders sit in date order
// in the Orders list instead of all at the top.
function createdAtFor(orderDate) {
    const noon = new Date(`${orderDate}T12:00:00Z`).getTime() - MALAYSIA_OFFSET_MS;
    return new Date(Math.min(noon, Date.now())).toISOString();
}
const itemsKey = (items) => items
    .map((item) => `${item.product_id}:${item.quantity}`)
    .sort()
    .join('|');
async function reconcileTab(tab, products, numbers) {
    var _a, _b, _c, _d, _e;
    const { orders, skipped, issues, annotations } = await readTab(tab);
    const result = { created: 0, updated: 0, removed: 0, skipped, issues, annotations };
    const { data: existingRows, error } = await supabase_1.supabase
        .from('orders')
        .select('id, source, external_ref, deleted_at, order_date, total_amount, buyer_name, shipment_description, remark, agent_name, address_id, addresses(full_address, postcode), order_items(product_id, quantity)')
        .in('source', ['shopee', 'lazada'])
        .like('external_ref', `${tab}|%`);
    if (error)
        throw error;
    const existing = new Map((existingRows !== null && existingRows !== void 0 ? existingRows : []).map((row) => [row.external_ref, row]));
    for (const order of orders) {
        const items = order.items
            .map((item) => ({ product_id: products.get(item.code), quantity: item.quantity }))
            .filter((item) => item.product_id);
        const fields = Object.assign(Object.assign({ source: order.platform, order_date: order.orderDate, total_amount: order.totalAmount, buyer_name: order.buyerName, shipment_description: order.shipmentDescription, remark: order.remark }, (order.agentName ? { agent_name: order.agentName } : {})), { status: 'paid', payment_method: order.platform, currency: 'MYR' });
        const current = existing.get(order.externalRef);
        existing.delete(order.externalRef);
        if (!current) {
            let addressId = null;
            if (order.address) {
                const { data: address, error: addressError } = await supabase_1.supabase
                    .from('addresses')
                    .insert(Object.assign(Object.assign({}, order.address), { country: 'Malaysia' }))
                    .select('id')
                    .single();
                if (addressError)
                    throw addressError;
                addressId = address.id;
            }
            const orderNumber = `${NUMBER_PREFIX[order.platform]}-${String(numbers[order.platform]++).padStart(5, '0')}`;
            const { data: created, error: insertError } = await supabase_1.supabase
                .from('orders')
                .insert(Object.assign(Object.assign({}, fields), { external_ref: order.externalRef, order_number: orderNumber, address_id: addressId, created_at: createdAtFor(order.orderDate) }))
                .select('id')
                .single();
            if (insertError)
                throw insertError;
            if (items.length) {
                const { error: itemsError } = await supabase_1.supabase
                    .from('order_items')
                    .insert(items.map((item) => (Object.assign(Object.assign({}, item), { order_id: created.id }))));
                if (itemsError)
                    throw itemsError;
            }
            result.created++;
            continue;
        }
        const changed = current.deleted_at !== null ||
            current.source !== fields.source ||
            String(current.order_date).slice(0, 10) !== fields.order_date ||
            Number(current.total_amount) !== fields.total_amount ||
            current.buyer_name !== fields.buyer_name ||
            current.shipment_description !== fields.shipment_description ||
            current.remark !== fields.remark ||
            (order.agentName != null && current.agent_name !== order.agentName);
        const itemsChanged = itemsKey((_a = current.order_items) !== null && _a !== void 0 ? _a : []) !== itemsKey(items);
        const addressChanged = ((_c = (_b = current.addresses) === null || _b === void 0 ? void 0 : _b.full_address) !== null && _c !== void 0 ? _c : null) !== ((_e = (_d = order.address) === null || _d === void 0 ? void 0 : _d.full_address) !== null && _e !== void 0 ? _e : null);
        if (changed) {
            const { error: updateError } = await supabase_1.supabase
                .from('orders')
                .update(Object.assign(Object.assign({}, fields), { payment_method: order.platform, deleted_at: null }))
                .eq('id', current.id);
            if (updateError)
                throw updateError;
        }
        if (itemsChanged) {
            const { error: deleteError } = await supabase_1.supabase.from('order_items').delete().eq('order_id', current.id);
            if (deleteError)
                throw deleteError;
            if (items.length) {
                const { error: itemsError } = await supabase_1.supabase
                    .from('order_items')
                    .insert(items.map((item) => (Object.assign(Object.assign({}, item), { order_id: current.id }))));
                if (itemsError)
                    throw itemsError;
            }
        }
        if (addressChanged && order.address) {
            if (current.address_id) {
                const { error: addressError } = await supabase_1.supabase
                    .from('addresses')
                    .update(order.address)
                    .eq('id', current.address_id);
                if (addressError)
                    throw addressError;
            }
            else {
                const { data: address, error: addressError } = await supabase_1.supabase
                    .from('addresses')
                    .insert(Object.assign(Object.assign({}, order.address), { country: 'Malaysia' }))
                    .select('id')
                    .single();
                if (addressError)
                    throw addressError;
                await supabase_1.supabase.from('orders').update({ address_id: address.id }).eq('id', current.id);
            }
        }
        if (changed || itemsChanged || addressChanged)
            result.updated++;
    }
    // Rows deleted from the sheet (or recoloured to a non-marketplace colour).
    const gone = [...existing.values()].filter((row) => row.deleted_at === null).map((row) => row.id);
    if (gone.length) {
        const { error: removeError } = await supabase_1.supabase
            .from('orders')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', gone);
        if (removeError)
            throw removeError;
        result.removed = gone.length;
    }
    return result;
}
async function applyAnnotations(tab, annotations) {
    var _a, _b, _c;
    const unmatched = [];
    const phones = [...new Set(annotations.map((row) => row.phone))];
    const customerByPhone = new Map();
    for (let i = 0; i < phones.length; i += 200) {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select('id, phone_number')
            .in('phone_number', phones.slice(i, i + 200));
        if (error)
            throw error;
        for (const customer of data !== null && data !== void 0 ? data : [])
            customerByPhone.set(customer.phone_number, customer.id);
    }
    const customerIds = [...customerByPhone.values()];
    const ordersByCustomer = new Map();
    for (let i = 0; i < customerIds.length; i += 100) {
        const chunk = customerIds.slice(i, i + 100);
        for (let from = 0;; from += 1000) {
            const { data, error } = await supabase_1.supabase
                .from('orders')
                .select('id, customer_id, order_date, total_amount, cod_collected_at, agent_name, cod_status')
                .in('customer_id', chunk)
                .is('deleted_at', null)
                .order('id')
                .range(from, from + 999);
            if (error)
                throw error;
            for (const order of data !== null && data !== void 0 ? data : []) {
                const list = (_a = ordersByCustomer.get(order.customer_id)) !== null && _a !== void 0 ? _a : [];
                list.push(order);
                ordersByCustomer.set(order.customer_id, list);
            }
            if (!data || data.length < 1000)
                break;
        }
    }
    for (const row of annotations) {
        const customerId = customerByPhone.get(row.phone);
        const sameDay = (customerId ? (_b = ordersByCustomer.get(customerId)) !== null && _b !== void 0 ? _b : [] : []).filter((order) => String(order.order_date).slice(0, 10) === row.orderDate);
        const match = (_c = sameDay.find((order) => Math.abs(Number(order.total_amount) - row.totalAmount) < 0.5)) !== null && _c !== void 0 ? _c : (sameDay.length === 1 ? sameDay[0] : undefined);
        if (!match) {
            if (row.codStatus) {
                unmatched.push({
                    tab,
                    rowNumber: row.rowNumber,
                    platform: 'cod',
                    buyerName: row.buyerName,
                    reason: 'COD row has no matching WhatsApp order',
                });
            }
            continue;
        }
        const update = {};
        if (row.agentName && match.agent_name !== row.agentName)
            update.agent_name = row.agentName;
        if (row.codStatus && !match.cod_collected_at && match.cod_status !== row.codStatus) {
            update.cod_status = row.codStatus;
        }
        if (!Object.keys(update).length)
            continue;
        const { error } = await supabase_1.supabase.from('orders').update(update).eq('id', match.id);
        if (error)
            throw error;
        Object.assign(match, update);
    }
    return unmatched;
}
async function replaceIssues(tabs, issues) {
    const { error: deleteError } = await supabase_1.supabase.from('sheet_row_issues').delete().in('tab', tabs);
    if (deleteError) {
        if (deleteError.code === '42P01' || deleteError.code === 'PGRST205')
            return;
        throw deleteError;
    }
    if (!issues.length)
        return;
    const { error } = await supabase_1.supabase.from('sheet_row_issues').insert(issues.map((issue) => ({
        tab: issue.tab,
        row_number: issue.rowNumber,
        platform: issue.platform,
        buyer_name: issue.buyerName,
        reason: issue.reason,
    })));
    if (error)
        throw error;
}
async function listSheetIssues() {
    const { data, error } = await supabase_1.supabase
        .from('sheet_row_issues')
        .select('tab, row_number, platform, buyer_name, reason')
        .order('tab')
        .order('row_number');
    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205')
            return [];
        throw error;
    }
    return data !== null && data !== void 0 ? data : [];
}
function recentTabs(now = new Date()) {
    const local = new Date(now.getTime() + MALAYSIA_OFFSET_MS);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    return [
        (0, monthlySheet_1.monthSheetName)({ year, month }),
        (0, monthlySheet_1.monthSheetName)(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }),
    ];
}
let running = null;
let lastResult = null;
let lastError = null;
function sheetSyncStatus() {
    return { running: !!running, lastResult, lastError };
}
function syncSheetTabs(tabs = recentTabs()) {
    if (running)
        return running;
    running = (async () => {
        const { error: columnsError } = await supabase_1.supabase.from('orders').select('source, external_ref, buyer_name').limit(1);
        if (columnsError) {
            throw new Error('The orders table is missing the source columns. Run the order_source migration first.');
        }
        const { data: products, error } = await supabase_1.supabase.from('products').select('id, code');
        if (error)
            throw error;
        const byCode = new Map((products !== null && products !== void 0 ? products : []).filter((p) => p.code).map((p) => [String(p.code).trim().toLowerCase(), p.id]));
        const numbers = await nextNumbers();
        const totals = { created: 0, updated: 0, removed: 0, skipped: 0 };
        const issues = [];
        for (const tab of tabs) {
            const result = await reconcileTab(tab, byCode, numbers);
            totals.created += result.created;
            totals.updated += result.updated;
            totals.removed += result.removed;
            totals.skipped += result.skipped;
            issues.push(...result.issues, ...(await applyAnnotations(tab, result.annotations)));
        }
        await replaceIssues(tabs, issues);
        lastResult = Object.assign(Object.assign({ tabs }, totals), { finishedAt: new Date() });
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
