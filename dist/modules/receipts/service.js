"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const database_1 = __importDefault(require("./database"));
const reader_1 = require("./reader");
const settings_1 = require("./settings");
const GRAPH = 'https://graph.facebook.com/v25.0';
// A receipt sent on its own belongs to the sender's order from shortly before.
const MATCH_BEFORE_MS = 30 * 60 * 1000;
const MATCH_AFTER_MS = 5 * 60 * 1000;
const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
};
class ReceiptService {
    constructor() {
        this.db = new database_1.default();
    }
    async downloadFromWhatsApp(mediaId) {
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        if (!token)
            throw new Error('WHATSAPP_ACCESS_TOKEN is not set');
        const headers = { Authorization: `Bearer ${token}` };
        const meta = await axios_1.default.get(`${GRAPH}/${mediaId}`, { headers });
        const file = await axios_1.default.get(meta.data.url, {
            headers,
            responseType: 'arraybuffer',
        });
        return {
            file: Buffer.from(file.data),
            mimeType: String(meta.data.mime_type || file.headers['content-type'] || 'application/octet-stream'),
        };
    }
    // Saves a receipt once (repeat deliveries of the same WhatsApp message are
    // ignored), links it to an order when one is given, then reads it.
    async ingest(receipt, orderId) {
        var _a, _b, _c, _d;
        const existing = await this.db.getByWamid(receipt.wamid);
        if (existing)
            return existing;
        const { file, mimeType } = await this.downloadFromWhatsApp(receipt.media_id);
        const type = mimeType.split(';')[0].trim().toLowerCase();
        const path = `${(_b = (_a = receipt.received_at) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) !== null && _b !== void 0 ? _b : new Date().toISOString().slice(0, 10)}/${receipt.wamid}.${(_c = EXTENSIONS[type]) !== null && _c !== void 0 ? _c : 'bin'}`;
        await this.db.upload(path, file, type);
        const config = await (0, settings_1.readingConfig)();
        const row = await this.db.insert({
            order_id: orderId,
            wamid: receipt.wamid,
            sender_phone: receipt.sender,
            caption: receipt.caption,
            storage_path: path,
            mime_type: type,
            received_at: (_d = receipt.received_at) !== null && _d !== void 0 ? _d : new Date().toISOString(),
            check_status: config.ready ? 'pending' : 'not_checked',
            check_note: config.ready ? null : config.reason,
        });
        return config.ready ? this.read(row, file) : row;
    }
    // A receipt sent without an order caption: attach it to the sender's latest order.
    async ingestStandalone(receipt) {
        var _a, _b;
        const at = new Date((_a = receipt.received_at) !== null && _a !== void 0 ? _a : Date.now()).getTime();
        const order = receipt.sender
            ? await this.db.latestOrderBySender(receipt.sender, new Date(at - MATCH_BEFORE_MS).toISOString(), new Date(at + MATCH_AFTER_MS).toISOString())
            : null;
        return this.ingest(receipt, (_b = order === null || order === void 0 ? void 0 : order.id) !== null && _b !== void 0 ? _b : null);
    }
    async read(row, file) {
        var _a, _b, _c;
        // Checked again here: the key, the switch or the monthly limit may have
        // changed since the receipt arrived.
        const config = await (0, settings_1.readingConfig)();
        if (!config.ready) {
            return this.db.update(row.id, { check_status: 'not_checked', check_note: config.reason });
        }
        try {
            const data = file !== null && file !== void 0 ? file : (await this.db.download(row.storage_path));
            const { reading, note, usage } = await (0, reader_1.readReceipt)(data, (_a = row.mime_type) !== null && _a !== void 0 ? _a : 'application/octet-stream', config);
            const spend = usage
                ? {
                    read_model: usage.model,
                    input_tokens: usage.input_tokens,
                    output_tokens: usage.output_tokens,
                    cost_usd: Math.round((0, settings_1.costOf)(usage) * 1000000) / 1000000,
                }
                : {};
            if (!reading || !reading.is_payment_receipt) {
                return this.db.update(row.id, Object.assign(Object.assign({}, spend), { check_status: 'unreadable', check_note: (_b = note !== null && note !== void 0 ? note : reading === null || reading === void 0 ? void 0 : reading.note) !== null && _b !== void 0 ? _b : 'This does not look like a payment receipt', checked_at: new Date().toISOString() }));
            }
            const read = await this.db.update(row.id, Object.assign(Object.assign({}, spend), { amount: reading.amount, currency: reading.currency, paid_on: /^\d{4}-\d{2}-\d{2}$/.test((_c = reading.paid_on) !== null && _c !== void 0 ? _c : '') ? reading.paid_on : null, reference: reading.reference, bank: reading.bank, payer: reading.payer, check_note: reading.note, checked_at: new Date().toISOString() }));
            return this.compare(read);
        }
        catch (error) {
            console.error(`[receipts] reading ${row.id} failed:`, error);
            return this.db.update(row.id, {
                check_status: 'error',
                check_note: 'Reading failed. Try Check again.',
                checked_at: new Date().toISOString(),
            });
        }
    }
    // Match or mismatch against the linked order's total. Unlinked or unread
    // receipts stay pending until both sides are known.
    async compare(row) {
        if (row.amount === null || !row.order_id) {
            const status = row.amount === null ? 'unreadable' : 'pending';
            return row.check_status === status ? row : this.db.update(row.id, { check_status: status });
        }
        const order = await this.db.getOrderTotal(row.order_id);
        if (!order)
            return row;
        const total = Number(order.total_amount);
        const amount = Number(row.amount);
        const matches = Math.abs(total - amount) < 0.005;
        return this.db.update(row.id, {
            check_status: matches ? 'match' : 'mismatch',
            check_note: matches
                ? row.check_note
                : `Receipt shows RM ${amount.toFixed(2)}, order total is RM ${total.toFixed(2)}`,
        });
    }
    async attach(receiptId, orderId) {
        const row = await this.db.update(receiptId, { order_id: orderId });
        return row.amount === null ? this.read(row) : this.compare(row);
    }
    findOrderByNumber(orderNumber) {
        return this.db.findOrderByNumber(orderNumber);
    }
    async recheck(receiptId) {
        const row = await this.db.get(receiptId);
        if (!row)
            return null;
        return this.read(await this.db.update(row.id, { check_status: 'pending' }));
    }
    async withUrl(row) {
        return Object.assign(Object.assign({}, row), { url: row.storage_path ? await this.db.signedUrl(row.storage_path) : null });
    }
    async listByOrder(orderId) {
        return Promise.all((await this.db.listByOrder(orderId)).map((row) => this.withUrl(row)));
    }
    async listUnmatched() {
        return Promise.all((await this.db.listUnmatched()).map((row) => this.withUrl(row)));
    }
}
exports.default = ReceiptService;
