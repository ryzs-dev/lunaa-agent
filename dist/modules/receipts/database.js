"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSignedReceipt = readSignedReceipt;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = require("fs");
const path_1 = require("path");
const supabase_1 = require("../supabase");
// Receipts live on the server's disk; the CRM opens them through a link that
// expires after an hour.
const RECEIPTS_DIR = process.env.RECEIPTS_DIR || '/var/lib/lunaa/receipts';
const LINK_TTL_SECONDS = 60 * 60;
function receiptFile(path) {
    const target = (0, path_1.resolve)(RECEIPTS_DIR, path);
    if (!target.startsWith(`${(0, path_1.resolve)(RECEIPTS_DIR)}/`))
        throw new Error('Invalid receipt path');
    return target;
}
function linkSignature(path, expires) {
    var _a;
    const key = Buffer.from((_a = process.env.RECEIPTS_SECRET) !== null && _a !== void 0 ? _a : '', 'base64');
    return crypto_1.default.createHmac('sha256', key).update(`${path}|${expires}`).digest('base64url');
}
function signedReceiptUrl(path) {
    const base = process.env.AGENT_PUBLIC_URL || 'https://agent.lunaawomencare.com';
    const expires = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    const query = new URLSearchParams({ path, expires: String(expires), sig: linkSignature(path, expires) });
    return `${base}/api/receipts/file?${query}`;
}
// The file behind a signed link, or null if the link is wrong or has expired.
async function readSignedReceipt(path, expires, sig) {
    if (!process.env.RECEIPTS_SECRET || !Number.isFinite(expires) || expires < Date.now() / 1000)
        return null;
    const expected = Buffer.from(linkSignature(path, expires));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto_1.default.timingSafeEqual(expected, given))
        return null;
    try {
        return await fs_1.promises.readFile(receiptFile(path));
    }
    catch (_a) {
        return null;
    }
}
class ReceiptDatabase {
    async getByWamid(wamid) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('wamid', wamid)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async get(id) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async insert(row) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .insert(row)
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async update(id, patch) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async listByOrder(orderId) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .eq('order_id', orderId)
            .order('received_at', { ascending: false });
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    async listUnmatched(limit = 50) {
        const { data, error } = await supabase_1.supabase
            .from('order_receipts')
            .select('*')
            .is('order_id', null)
            .order('received_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    async getOrderTotal(orderId) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount')
            .eq('id', orderId)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async findOrderByNumber(orderNumber) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount')
            .ilike('order_number', orderNumber.trim())
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    // The sender's most recent order in the window, preferring one with no receipt yet.
    async latestOrderBySender(sender, from, to) {
        var _a, _b;
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount, created_at, order_receipts(id)')
            .eq('created_by_phone', sender)
            .is('deleted_at', null)
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: false })
            .limit(5);
        if (error)
            throw error;
        const orders = data !== null && data !== void 0 ? data : [];
        return ((_b = (_a = orders.find((o) => { var _a; return !((_a = o.order_receipts) === null || _a === void 0 ? void 0 : _a.length); })) !== null && _a !== void 0 ? _a : orders[0]) !== null && _b !== void 0 ? _b : null);
    }
    async upload(path, file, _contentType) {
        const target = receiptFile(path);
        await fs_1.promises.mkdir((0, path_1.dirname)(target), { recursive: true });
        await fs_1.promises.writeFile(target, file);
    }
    async download(path) {
        return fs_1.promises.readFile(receiptFile(path));
    }
    async signedUrl(path) {
        return signedReceiptUrl(path);
    }
}
exports.default = ReceiptDatabase;
