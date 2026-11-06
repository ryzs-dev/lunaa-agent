import { sendThroughConverra } from '../converra/converra-send';
import { ReceiptRow } from './database';

const money = (value: unknown) => `RM ${Number(value ?? 0).toFixed(2)}`;

// WhatsApp can deliver a message twice; each one gets one reply.
const replied = new Set<string>();
const REMEMBERED = 2000;

export function receiptLine(receipt: Pick<ReceiptRow, 'check_status' | 'amount' | 'check_note'>) {
  switch (receipt.check_status) {
    case 'match':
      return `🧾 Receipt matches: ${money(receipt.amount)}`;
    case 'mismatch':
      return `⚠️ ${receipt.check_note ?? 'Receipt does not match the order total'}. Please check.`;
    case 'unreadable':
    case 'error':
      return '⚠️ Could not read the receipt. Please check it.';
    default:
      return '🧾 Receipt saved, not checked.';
  }
}

export function orderReceivedText(
  order: { order_number?: string | null; total_amount?: unknown },
  buyer?: string | null,
  receipt?: Parameters<typeof receiptLine>[0] | null
) {
  const summary = [money(order.total_amount), buyer].filter(Boolean).join(' · ');
  return [`✅ Order received: ${order.order_number ?? ''}`.trim(), summary, receipt ? receiptLine(receipt) : null]
    .filter(Boolean)
    .join('\n');
}

export function orderRepeatText(
  order: { order_number?: string | null },
  receipt?: Parameters<typeof receiptLine>[0] | null
) {
  return [`ℹ️ Already recorded: ${order.order_number ?? ''}`.trim(), receipt ? receiptLine(receipt) : null]
    .filter(Boolean)
    .join('\n');
}

export function receiptOnlyText(orderNumber: string | null | undefined, receipt: Parameters<typeof receiptLine>[0]) {
  return orderNumber
    ? `${orderNumber}\n${receiptLine(receipt)}`
    : '⚠️ Receipt saved, but no recent order of yours to match it to. Please link it in the CRM.';
}

export function orderFailedText(savedAs: string | null | undefined, reason: string) {
  return savedAs
    ? `⚠️ ${savedAs} is saved, but the Google Sheet row failed. Please add it to the sheet.`
    : `⚠️ Order not saved: ${reason}. Please check and send it again.`;
}

// Answers only the staff member who sent the message, through Converra so it
// shows in their thread. It is a chat reply inside their open window, so it
// never needs a template. A failed reply is logged and never affects the order.
export async function replyToStaff(to: string | null | undefined, text: string, wamid?: string | null) {
  if (!to) return;
  if (wamid) {
    if (replied.has(wamid)) return;
    replied.add(wamid);
    if (replied.size > REMEMBERED) replied.delete(replied.values().next().value as string);
  }
  try {
    await sendThroughConverra({ to, text: { body: text } }, wamid ? `staff-reply:${wamid}` : undefined);
  } catch (error: any) {
    console.error('[staff-reply] could not reply:', error.response?.data?.error ?? error.message);
  }
}
