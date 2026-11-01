import axios from 'axios';
import ReceiptDatabase, { ReceiptRow } from './database';
import { readReceipt } from './reader';
import { costOf, readingConfig } from './settings';

const GRAPH = 'https://graph.facebook.com/v25.0';
// A receipt sent on its own belongs to the sender's order from shortly before.
const MATCH_BEFORE_MS = 30 * 60 * 1000;
const MATCH_AFTER_MS = 5 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export type IncomingReceipt = {
  wamid: string;
  media_id: string;
  mime_type: string | null;
  sender: string | null;
  caption: string | null;
  received_at?: string;
};

class ReceiptService {
  private db = new ReceiptDatabase();

  private async downloadFromWhatsApp(mediaId: string) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is not set');
    const headers = { Authorization: `Bearer ${token}` };

    const meta = await axios.get(`${GRAPH}/${mediaId}`, { headers });
    const file = await axios.get<ArrayBuffer>(meta.data.url, {
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
  async ingest(receipt: IncomingReceipt, orderId: string | null) {
    const existing = await this.db.getByWamid(receipt.wamid);
    if (existing) return existing;

    const { file, mimeType } = await this.downloadFromWhatsApp(receipt.media_id);
    const type = mimeType.split(';')[0].trim().toLowerCase();
    const path = `${receipt.received_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}/${receipt.wamid}.${EXTENSIONS[type] ?? 'bin'}`;
    await this.db.upload(path, file, type);

    const config = await readingConfig();
    const row = await this.db.insert({
      order_id: orderId,
      wamid: receipt.wamid,
      sender_phone: receipt.sender,
      caption: receipt.caption,
      storage_path: path,
      mime_type: type,
      received_at: receipt.received_at ?? new Date().toISOString(),
      check_status: config.ready ? 'pending' : 'not_checked',
      check_note: config.ready ? null : config.reason,
    });

    return config.ready ? this.read(row, file) : row;
  }

  // A receipt sent without an order caption: attach it to the sender's latest order.
  async ingestStandalone(receipt: IncomingReceipt) {
    const at = new Date(receipt.received_at ?? Date.now()).getTime();
    const order = receipt.sender
      ? await this.db.latestOrderBySender(
          receipt.sender,
          new Date(at - MATCH_BEFORE_MS).toISOString(),
          new Date(at + MATCH_AFTER_MS).toISOString()
        )
      : null;
    return this.ingest(receipt, order?.id ?? null);
  }

  private async read(row: ReceiptRow, file?: Buffer) {
    // Checked again here: the key, the switch or the monthly limit may have
    // changed since the receipt arrived.
    const config = await readingConfig();
    if (!config.ready) {
      return this.db.update(row.id, { check_status: 'not_checked', check_note: config.reason });
    }

    try {
      const data = file ?? (await this.db.download(row.storage_path!));
      const { reading, note, usage } = await readReceipt(
        data,
        row.mime_type ?? 'application/octet-stream',
        config
      );
      const spend = usage
        ? {
            read_model: usage.model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cost_usd: Math.round(costOf(usage) * 1_000_000) / 1_000_000,
          }
        : {};

      if (!reading || !reading.is_payment_receipt) {
        return this.db.update(row.id, {
          ...spend,
          check_status: 'unreadable',
          check_note: note ?? reading?.note ?? 'This does not look like a payment receipt',
          checked_at: new Date().toISOString(),
        });
      }

      const read = await this.db.update(row.id, {
        ...spend,
        amount: reading.amount,
        currency: reading.currency,
        paid_on: /^\d{4}-\d{2}-\d{2}$/.test(reading.paid_on ?? '') ? reading.paid_on : null,
        reference: reading.reference,
        bank: reading.bank,
        payer: reading.payer,
        check_note: reading.note,
        checked_at: new Date().toISOString(),
      });
      return this.compare(read);
    } catch (error) {
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
  private async compare(row: ReceiptRow) {
    if (row.amount === null || !row.order_id) {
      const status = row.amount === null ? 'unreadable' : 'pending';
      return row.check_status === status ? row : this.db.update(row.id, { check_status: status });
    }
    const order = await this.db.getOrderTotal(row.order_id);
    if (!order) return row;

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

  async attach(receiptId: string, orderId: string) {
    const row = await this.db.update(receiptId, { order_id: orderId });
    return row.amount === null ? this.read(row) : this.compare(row);
  }

  findOrderByNumber(orderNumber: string) {
    return this.db.findOrderByNumber(orderNumber);
  }

  async recheck(receiptId: string) {
    const row = await this.db.get(receiptId);
    if (!row) return null;
    return this.read(await this.db.update(row.id, { check_status: 'pending' }));
  }

  private async withUrl(row: ReceiptRow) {
    return { ...row, url: row.storage_path ? await this.db.signedUrl(row.storage_path) : null };
  }

  async listByOrder(orderId: string) {
    return Promise.all((await this.db.listByOrder(orderId)).map((row) => this.withUrl(row)));
  }

  async listUnmatched() {
    return Promise.all((await this.db.listUnmatched()).map((row) => this.withUrl(row)));
  }
}

export default ReceiptService;
