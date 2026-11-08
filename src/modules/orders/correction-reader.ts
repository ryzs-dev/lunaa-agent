import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { supabase } from '../supabase';
import { readingConfig } from '../receipts/settings';
import { ExtractedData } from '../google/types';
import { displayDate, fillCorrection } from './staff-check';

// After Change, staff write the fix however they like ("w + 1", "add 1 wash",
// "tukar tarikh 9/11", "remove spray"). Claude reads it against the order the
// bot saved; staff see the result and confirm, so nothing is applied unseen.

const Correction = z.object({
  understood: z.boolean(),
  items: z
    .array(z.object({ code: z.string(), quantity: z.number().int() }))
    .nullable(),
  order_date: z.string().nullable(),
  total_amount: z.number().nullable(),
  buyer_name: z.string().nullable(),
  phone_number: z.string().nullable(),
  full_address: z.string().nullable(),
  city: z.string().nullable(),
  postcode: z.string().nullable(),
  state: z.string().nullable(),
  remark: z.string().nullable(),
  question: z.string().nullable(),
});

type Correction = z.infer<typeof Correction>;
type Product = { id: string; code: string; name: string };

const SYSTEM = `Staff of a Malaysian women's care shop record WhatsApp orders. They tapped Change on an order and sent one short message saying what to change. Work out the order after that change.

Products are written as quantity then code, e.g. "2w1f" is 2 Wash and 1 Femlift 30ml. Only the products a message mentions change; every other saved item stays as it is. "3w" or "w 3" sets Wash to 3. "2w1s" sets Wash to 2 and Spray to 1. "w + 1" or "+1w" adds one Wash, "w - 1" takes one away. "remove spray", "no spray" or "s 0" removes Spray. Staff may also write "add 1 wash" or the same in Malay or Chinese.

Return only what changes; null keeps the saved value:
- items: the complete item list after the change (the saved items with the mentioned ones changed), as product codes from the list with quantities, or null if the items don't change. Drop items whose quantity becomes 0 or less.
- order_date: YYYY-MM-DD. Dates are day/month (9/11 is 9 November). Use the year of the saved order unless one is given; "today" and "semalam" are relative to today's date given below.
- total_amount: only if the message states a total or price. Never work one out from the items.
- buyer_name, phone_number, full_address, city, postcode, state, remark: only if the message changes them.
- understood: false if the message isn't a change to this order or you can't tell what to change. Then question: one short question to ask the staff, in the language they wrote in. Otherwise question is null.
Only use codes from the product list. If a product they name isn't in the list, set understood to false.`;

const clients = new Map<string, Anthropic>();
const clientFor = (apiKey: string) => {
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({ apiKey });
    clients.clear();
    clients.set(apiKey, client);
  }
  return client;
};

async function products(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('id, code, name');
  if (error) throw error;
  return (data ?? []).filter((product) => product.code) as Product[];
}

function todayInMalaysia() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function describeOrder(order: ExtractedData) {
  const items = (order.order.order_items || [])
    .map((item) => `${item.quantity}× ${item.product_name ?? item.product_id}`)
    .join(', ');
  return [
    `Date: ${displayDate(order.order.order_date) ?? 'none'} (${order.order.order_date || 'none'})`,
    `Buyer: ${order.customer.name ?? ''} ${order.customer.phone_number ?? ''}`.trim(),
    `Address: ${[order.address.full_address, order.address.postcode, order.address.city, order.address.state].filter(Boolean).join(', ')}`,
    `Items: ${items || 'none'}`,
    `Total: RM ${Number(order.order.total_amount ?? 0).toFixed(2)}`,
    `Remark: ${order.remark || 'none'}`,
  ].join('\n');
}

// The change as an order message would carry it: only changed fields are set,
// fillCorrection keeps the rest from the saved order.
export function correctionToOrder(correction: Correction, list: Product[]): ExtractedData | null {
  const byCode = new Map(list.map((product) => [product.code.toLowerCase(), product]));
  let items: NonNullable<ExtractedData['order']['order_items']> | undefined;
  let shipment: string | undefined;
  if (correction.items) {
    const kept = correction.items.filter((item) => item.quantity > 0);
    if (kept.some((item) => !byCode.has(item.code.toLowerCase()))) return null;
    const merged = new Map<string, number>();
    for (const item of kept) {
      const code = item.code.toLowerCase();
      merged.set(code, (merged.get(code) ?? 0) + item.quantity);
    }
    if (!merged.size) return null;
    items = [...merged].map(([code, quantity]) => {
      const product = byCode.get(code)!;
      return { product_id: product.id as any, quantity, product_name: product.name };
    });
    shipment = [...merged].map(([code, quantity]) => `${quantity}${code}`).join('');
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(correction.order_date ?? '') ? correction.order_date! : '';
  return {
    customer: {
      name: correction.buyer_name ?? undefined,
      phone_number: correction.phone_number?.replace(/\D/g, '') || undefined,
    },
    address: {
      full_address: correction.full_address ?? undefined,
      city: correction.city ?? undefined,
      postcode: correction.postcode ?? undefined,
      state: correction.state ?? undefined,
    },
    order: {
      order_date: date,
      order_items: items ?? [],
      shipment_description: shipment ?? '',
      total_amount: correction.total_amount ?? 0,
    },
    remark: correction.remark ?? undefined,
  };
}

export type ReadCorrection =
  | { ok: true; data: ExtractedData }
  | { ok: false; reply: string; unavailable?: boolean };

export async function readCorrection(text: string, saved: ExtractedData): Promise<ReadCorrection> {
  const config = await readingConfig();
  if (!config.ready) {
    return { ok: false, reply: `⚠️ Couldn't read the change: ${config.reason}`, unavailable: true };
  }
  const list = await products();
  const fallback =
    config.model === 'claude-haiku-5-5'
      ? {}
      : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  const response = await clientFor(config.apiKey).beta.messages.parse({
    model: config.model,
    max_tokens: 4000,
    ...fallback,
    output_config: { effort: 'low', format: betaZodOutputFormat(Correction) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `Today: ${todayInMalaysia()}`,
          `Products (code: name):\n${list.map((product) => `${product.code}: ${product.name}`).join('\n')}`,
          `Saved order:\n${describeOrder(saved)}`,
          `Staff message:\n${text}`,
        ].join('\n\n'),
      },
    ],
  });

  const correction = response.stop_reason === 'refusal' ? null : response.parsed_output;
  if (!correction) return { ok: false, reply: "⚠️ Couldn't read that change. Please write it another way." };
  if (!correction.understood) {
    return { ok: false, reply: `🤔 ${correction.question || 'What should change?'}` };
  }
  const data = correctionToOrder(correction, list);
  if (!data) return { ok: false, reply: "🤔 I don't know that product. Please use its code, e.g. 2w1f." };
  return { ok: true, data };
}

type StaffMessage = ExtractedData & { partial?: boolean; text?: string | null };

// The order after a staff member's change message: a whole order replaces the
// saved fields it gives; anything shorter is read by Claude, or by the plain
// patterns (items line, date, total) when Claude can't be reached.
export async function orderAfterChange(
  message: StaffMessage,
  saved: ExtractedData | null
): Promise<{ data: ExtractedData; aiItems: boolean } | { reply: string }> {
  if (!message.partial) return { data: fillCorrection(message, saved), aiItems: false };
  if (!saved) return { reply: '⚠️ This order is too old to change with a short message. Please send the whole order.' };

  const patternsFound =
    Boolean(message.order?.order_items?.length) ||
    Boolean(message.order?.order_date) ||
    Number(message.order?.total_amount) > 0;
  if (message.text?.trim()) {
    try {
      const read = await readCorrection(message.text, saved);
      if (read.ok) {
        return { data: fillCorrection(read.data, saved), aiItems: Boolean(read.data.order.order_items?.length) };
      }
      if (!read.unavailable || !patternsFound) return { reply: read.reply };
    } catch (error) {
      console.error('Could not read the change with Claude:', error);
      if (!patternsFound) return { reply: "⚠️ Couldn't read that change. Please try again." };
    }
  }
  if (!patternsFound) return { reply: '🤔 What should change? E.g. "w + 1", "9/11/26" or "Total RM420".' };
  const items = message.order?.order_items?.length
    ? mergeItems(saved.order.order_items || [], message.order.order_items)
    : [];
  return {
    data: fillCorrection({ ...message, order: { ...message.order, order_items: items, shipment_description: '' } }, saved),
    aiItems: items.length > 0,
  };
}

// An items line sent as a change sets the products it names; the rest stay.
export function mergeItems(
  saved: NonNullable<ExtractedData['order']['order_items']>,
  changed: NonNullable<ExtractedData['order']['order_items']>
) {
  const byProduct = new Map(saved.map((item) => [String(item.product_id), { ...item }]));
  for (const item of changed) {
    const current = byProduct.get(String(item.product_id));
    byProduct.set(String(item.product_id), { ...current, ...item, product_name: item.product_name ?? current?.product_name });
  }
  return [...byProduct.values()].filter((item) => item.quantity > 0);
}
