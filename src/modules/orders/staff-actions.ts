import { supabase } from '../supabase';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from './service';
import { GoogleSheetService } from '../google/service';
import ReceiptService from '../receipts/service';
import ProductService from '../product/service';
import { receiptLine, replyToStaff } from '../receipts/staff-reply';
import { ExtractedData } from '../google/types';
import {
  endChange,
  fillCorrection,
  orderButtons,
  orderPayload,
  orderSummaryText,
  parseOrderButton,
  rememberOrderPayload,
  startChange,
  TEST_ORDER,
} from './staff-check';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const googleSheetService = new GoogleSheetService();
const receiptService = new ReceiptService();
const productService = new ProductService();

async function findOrder(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, order_date, deleted_at')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data && !data.deleted_at ? data : null;
}

// Confirm or Change, tapped under an order summary.
export async function handleOrderButton(tap: { sender: string; wamid: string; id: string }) {
  const button = parseOrderButton(tap.id);
  if (!button) return;
  if (button.orderId === TEST_ORDER) {
    if (button.action === 'confirm') {
      await endChange(tap.sender, TEST_ORDER);
      await replyToStaff(tap.sender, '👍 Test confirmed. Nothing was saved.', tap.wamid);
    } else {
      await startChange(tap.sender, TEST_ORDER);
      await replyToStaff(
        tap.sender,
        '✏️ Test: send what to change: the items line (3w2f2s), the date (9/11/26), ' +
          'the total (Total: RM399), or the whole order. You have 30 minutes.',
        tap.wamid
      );
    }
    return;
  }
  const order = await findOrder(button.orderId);
  if (!order) {
    await replyToStaff(tap.sender, '⚠️ That order was deleted in the CRM.', tap.wamid);
    return;
  }

  if (button.action === 'confirm') {
    const { error } = await supabase
      .from('orders')
      .update({ staff_confirmed_at: new Date().toISOString(), staff_confirmed_by: tap.sender })
      .eq('id', order.id);
    if (error) throw error;
    await endChange(tap.sender, order.id);
    await replyToStaff(tap.sender, `👍 ${order.order_number} confirmed`, tap.wamid);
    return;
  }

  await startChange(tap.sender, order.id);
  await replyToStaff(
    tap.sender,
    `✏️ Send what to change for ${order.order_number}: the items line (3w2f2s), ` +
      'the date (9/11/26), the total (Total: RM399), or the whole order. You have 30 minutes.',
    tap.wamid
  );
}

// The staff member tapped Change: this order message replaces the saved order.
export async function correctOrder(job: ExtractedData & { sender: string; wamid?: string; receipt?: any }, orderId: string) {
  const order = await findOrder(orderId);
  if (!order) {
    await endChange(job.sender);
    await replyToStaff(job.sender, '⚠️ That order was deleted in the CRM, so nothing was changed.', job.wamid);
    return;
  }

  const previous = await orderPayload(orderId);
  const data = fillCorrection(job, previous);
  if (!data.order.order_items?.length) {
    await replyToStaff(
      job.sender,
      `⚠️ ${order.order_number} not changed: no products found. Please send the whole order again.`,
      job.wamid
    );
    return;
  }

  const customer = await customerService.createCustomer(data.customer as any);
  const address = await addressService.createAddress({ customer_id: customer.id, ...data.address } as any);
  const updated = await orderService.updateOrder(orderId as any, {
    customer_id: customer.id,
    address_id: address.id,
    order_items: data.order.order_items as any,
    total_amount: data.order.total_amount,
    shipment_description: data.order.shipment_description,
    payment_method: data.order.payment_method,
    remark: data.remark,
    ...(data.order.order_date ? { order_date: data.order.order_date } : {}),
  } as any);
  const { error } = await supabase
    .from('orders')
    .update({
      staff_corrected_at: new Date().toISOString(),
      staff_corrected_by: job.sender,
      staff_confirmed_at: null,
      staff_confirmed_by: null,
    })
    .eq('id', orderId);
  if (error) throw error;
  await endChange(job.sender);

  let receipt: any = null;
  if (job.receipt) {
    try {
      receipt = await receiptService.ingest({ ...job.receipt, sender: job.sender, caption: null }, orderId);
    } catch (receiptError) {
      console.error('Error saving receipt for corrected order', orderId, receiptError);
    }
  }

  let sheetLine: string | null = null;
  if (previous) {
    const sheet = await googleSheetService.replaceOrder(previous, data);
    if (!sheet.success) sheetLine = '⚠️ The Google Sheet row was not updated. Please fix it there.';
    else if (sheet.missingOldRow) sheetLine = '⚠️ Could not find the old sheet row. Please delete it.';
  } else {
    const sheet = await googleSheetService.createOrder(data);
    sheetLine = sheet.success
      ? '⚠️ Added a new sheet row. Please delete the old one.'
      : '⚠️ The Google Sheet row was not updated. Please fix it there.';
  }
  await rememberOrderPayload(orderId, data);

  await replyToStaff(
    job.sender,
    orderSummaryText({
      heading: `✏️ *${updated.order_number}* updated`,
      orderDate: updated.order_date,
      data,
      extraLines: [receipt ? receiptLine(receipt) : null, sheetLine],
    }),
    job.wamid,
    orderButtons(orderId)
  );
}

// A test number: read the order back with the buttons, save nothing. After
// Change, a partial message is filled in from the last test order.
export async function previewOrder(
  job: ExtractedData & { sender: string; wamid?: string; partial?: boolean },
  changing: boolean
) {
  const testKey = `${TEST_ORDER}:${job.sender}`;
  if (job.partial && !changing) return;
  const data = changing ? fillCorrection(job, await orderPayload(testKey)) : job;
  const items = await Promise.all(
    (data.order?.order_items || []).map(async (item) => {
      if (item.product_name) return item;
      const product = await productService.getProductById(item.product_id as any).catch(() => null);
      return { ...item, product_name: product?.name || 'Unknown product' };
    })
  );
  if (!items.length) {
    await replyToStaff(job.sender, '⚠️ Test: no products found in that order. Nothing was saved.', job.wamid);
    return;
  }
  const shown = { ...data, order: { ...data.order, order_items: items } };
  if (changing) await endChange(job.sender, TEST_ORDER);
  await rememberOrderPayload(testKey, shown);
  await replyToStaff(
    job.sender,
    orderSummaryText({
      heading: changing ? '✏️ *Test order* updated · not saved' : '🧪 *Test order* · not saved',
      data: shown,
    }),
    job.wamid,
    orderButtons(TEST_ORDER)
  );
}
