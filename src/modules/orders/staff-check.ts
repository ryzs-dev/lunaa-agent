import connection from '../queue';
import { ExtractedData } from '../google/types';

// After the bot saves a WhatsApp order it shows staff what it read, with
// Confirm and Change. Change makes that staff member's next order message
// replace this order instead of adding a new one.

const FIX_SECONDS = 30 * 60;
const PAYLOAD_SECONDS = 14 * 24 * 60 * 60;

const fixKey = (sender: string) => `order-bot:fix:${sender}`;
const payloadKey = (orderId: string) => `order-bot:order:${orderId}`;

// ORDER_BUTTONS is "all", or a comma list of staff numbers to try it with.
// Unset, staff get the old one-line reply.
export function orderButtonsOn(sender: string | null | undefined, setting = process.env.ORDER_BUTTONS) {
  return numberListed(sender, setting);
}

// ORDER_TEST_NUMBERS: staff numbers whose orders are only read back with the
// buttons, never saved to the CRM or the sheet.
export function orderTestOn(sender: string | null | undefined, setting = process.env.ORDER_TEST_NUMBERS) {
  return setting?.trim() !== 'all' && numberListed(sender, setting);
}

function numberListed(sender: string | null | undefined, setting: string | undefined) {
  const value = (setting ?? '').trim();
  if (!value || !sender) return false;
  if (value === 'all') return true;
  const digits = sender.replace(/\D/g, '');
  return value.split(',').some((phone) => phone.replace(/\D/g, '') === digits);
}

// Stands in for the order id on a test reply's buttons.
export const TEST_ORDER = 'test';

export type OrderButton = { action: 'confirm' | 'change'; orderId: string };

export function orderButtons(orderId: string) {
  return [
    { id: `order_ok:${orderId}`, title: 'Confirm' },
    { id: `order_fix:${orderId}`, title: 'Change' },
  ];
}

export function parseOrderButton(id: unknown): OrderButton | null {
  const match = /^order_(ok|fix):([0-9a-f-]{36}|test)$/i.exec(String(id ?? ''));
  if (!match) return null;
  return { action: match[1] === 'ok' ? 'confirm' : 'change', orderId: match[2] };
}

const money = (value: unknown) => `RM ${Number(value ?? 0).toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function displayDate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : null;
}

// Malaysian numbers as staff write them (014-331 0771); others keep their country code.
export function displayPhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (!digits.startsWith('60')) return `+${digits}`;
  const local = `0${digits.slice(2)}`;
  if (local.length === 11) return `${local.slice(0, 3)}-${local.slice(3, 7)} ${local.slice(7)}`;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6)}`;
  return local;
}

// What the bot read, short enough to check at a glance. WhatsApp shows *x* in bold.
export function orderSummaryText(input: {
  heading: string;
  orderDate?: unknown;
  data: ExtractedData;
  extraLines?: Array<string | null | undefined>;
}) {
  const { customer, address, order } = input.data;
  const items = (order.order_items || []).map(
    (item) => `${item.quantity}× ${item.product_name || 'Unknown product'}`
  );
  const buyer = [customer.name, displayPhone(customer.phone_number)].filter(Boolean).join(' · ');
  const place = [address.city, address.state].filter(Boolean).join(', ');
  return [
    input.heading,
    `📅 ${displayDate(input.orderDate) ?? displayDate(order.order_date) ?? 'No date'}`,
    buyer ? `👤 ${buyer}` : null,
    place ? `📍 ${place}` : null,
    '',
    ...(items.length ? items : ['No products']),
    ...(input.extraLines ?? []),
    `💰 *${money(order.total_amount)}*`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');
}

// A correction often leaves out what didn't change; the saved order fills it in.
export function fillCorrection(next: ExtractedData, previous: ExtractedData | null): ExtractedData {
  if (!previous) return next;
  const pick = <T>(value: T | undefined | null, fallback: T | undefined) =>
    value === undefined || value === null || (value as unknown) === '' ? fallback : value;
  return {
    ...next,
    customer: {
      name: pick(next.customer?.name, previous.customer.name),
      phone_number: pick(next.customer?.phone_number, previous.customer.phone_number),
      email: pick(next.customer?.email, previous.customer.email),
    },
    address: {
      full_address: pick(next.address?.full_address, previous.address.full_address),
      city: pick(next.address?.city, previous.address.city),
      postcode: pick(next.address?.postcode, previous.address.postcode),
      state: pick(next.address?.state, previous.address.state),
    },
    order: {
      ...next.order,
      order_date: pick(next.order?.order_date, previous.order.order_date),
      payment_method: pick(next.order?.payment_method, previous.order.payment_method),
    },
    remark: pick(next.remark, previous.remark),
  };
}

// The order as it was written to the sheet, so a correction can find its row.
export async function rememberOrderPayload(orderId: string, data: ExtractedData) {
  const { customer, address, order, remark } = data;
  await connection.set(
    payloadKey(orderId),
    JSON.stringify({ customer, address, order, remark }),
    'EX',
    PAYLOAD_SECONDS
  );
}

export async function orderPayload(orderId: string): Promise<ExtractedData | null> {
  const raw = await connection.get(payloadKey(orderId));
  return raw ? (JSON.parse(raw) as ExtractedData) : null;
}

export async function startChange(sender: string, orderId: string) {
  await connection.set(fixKey(sender), orderId, 'EX', FIX_SECONDS);
}

export async function orderBeingChanged(sender: string | null | undefined) {
  return sender ? connection.get(fixKey(sender)) : null;
}

export async function endChange(sender: string, orderId?: string) {
  if (orderId && (await connection.get(fixKey(sender))) !== orderId) return;
  await connection.del(fixKey(sender));
}
