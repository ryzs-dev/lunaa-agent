"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthOrdersCsv = monthOrdersCsv;
const supabase_1 = require("../supabase");
function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const CHANNEL = {
    whatsapp: 'WhatsApp',
    shopee: 'Shopee',
    lazada: 'Lazada',
};
async function monthOrdersCsv(month) {
    var _a, _b, _c;
    const [year, monthIndex] = month.split('-').map(Number);
    const nextMonth = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const start = new Date(`${month}-01T00:00:00+08:00`).toISOString();
    const end = new Date(`${nextMonth}-01T00:00:00+08:00`).toISOString();
    const rows = [];
    for (let from = 0;; from += 1000) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('order_date, order_number, source, total_amount, shipment_description, agent_name, buyer_name, customers(name, phone_number)')
            .is('deleted_at', null)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('order_date')
            .order('order_number')
            .range(from, from + 999);
        if (error)
            throw error;
        rows.push(...(data !== null && data !== void 0 ? data : []));
        if (!data || data.length < 1000)
            break;
    }
    const header = ['Date', 'Order', 'Channel', 'Customer', 'Phone', 'Agent', 'Items', 'Total'];
    const lines = [header.join(',')];
    for (const row of rows) {
        const customer = row.customers;
        lines.push([
            String((_a = row.order_date) !== null && _a !== void 0 ? _a : '').slice(0, 10),
            row.order_number,
            (_b = CHANNEL[row.source]) !== null && _b !== void 0 ? _b : 'WhatsApp',
            (customer === null || customer === void 0 ? void 0 : customer.name) || row.buyer_name || '',
            (customer === null || customer === void 0 ? void 0 : customer.phone_number) || '',
            row.agent_name || '',
            row.shipment_description || '',
            (_c = row.total_amount) !== null && _c !== void 0 ? _c : '',
        ]
            .map(csvCell)
            .join(','));
    }
    return lines.join('\n');
}
