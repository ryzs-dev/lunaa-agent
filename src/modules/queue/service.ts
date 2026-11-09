import { Worker } from 'bullmq';
import connection from '.';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';
import { GoogleSheetService } from '../google/service';
import OrderTrackingService from '../order_tracking/service';
import ReceiptService from '../receipts/service';
import {
  orderFailedText,
  orderReceivedText,
  orderRepeatText,
  receiptLine,
  receiptOnlyText,
  replyToStaff,
} from '../receipts/staff-reply';
import { correctOrder, handleOrderButton, previewOrder } from '../orders/staff-actions';
import { announceOrderToConverra } from '../converra/converra-order-event';
import {
  orderBeingChanged,
  orderButtons,
  orderButtonsOn,
  orderSummaryText,
  orderTestOn,
  TEST_ORDER,
  rememberOrderPayload,
} from '../orders/staff-check';
import ReceiptDatabase from '../receipts/database';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const googleSheetService = new GoogleSheetService();
const orderTrackingService = new OrderTrackingService();
const receiptService = new ReceiptService();
const receiptDb = new ReceiptDatabase();

const worker = new Worker(
  'orders',
  async (job) => {
    // A receipt sent on its own, after the order it pays for.
    if (job.name === 'receipt.received') {
      const { media, sender, caption, received_at } = job.data;
      if (orderTestOn(sender)) {
        await replyToStaff(sender, '🧪 Test: receipt received. Nothing was saved.', media.wamid);
        return;
      }
      const receipt = await receiptService.ingestStandalone({ ...media, sender, caption, received_at });
      const order = receipt.order_id ? await receiptDb.getOrderTotal(receipt.order_id) : null;
      await replyToStaff(sender, receiptOnlyText(order?.order_number, receipt), media.wamid);
      return;
    }

    if (job.name === 'order.button') {
      await handleOrderButton(job.data);
      return;
    }

    // Staff chat comes through here too: only answer what looks like an order.
    const lookedLikeOrder = job.data.order?.total_amount || job.data.customer?.phone_number;
    // Only part of an order (items line, date or total): used after Change only.
    const partial = Boolean(job.data.partial);

    // Test numbers only see what the bot read; nothing is saved.
    if (orderTestOn(job.data.sender)) {
      if (lookedLikeOrder || partial) {
        const changing = (await orderBeingChanged(job.data.sender)) === TEST_ORDER;
        await previewOrder(job.data, changing);
      }
      return;
    }

    // The sender tapped Change: this message replaces that order.
    const changing = lookedLikeOrder || partial ? await orderBeingChanged(job.data.sender) : null;
    if (changing) {
      try {
        await correctOrder(job.data, changing);
      } catch (error) {
        console.error('Error correcting order:', changing, error);
        const noItems = error instanceof Error && /order item/i.test(error.message);
        await replyToStaff(
          job.data.sender,
          `⚠️ Order not changed: ${noItems ? 'no products found' : 'some details are missing'}. Please check and send it again.`,
          job.data.wamid
        );
        throw error;
      }
      return;
    }
    if (partial) return;

    let savedOrder: any = null;
    try {
      const customer = await customerService.createCustomer(job.data.customer);
      const existingOrder = await orderService.findSimilarOrder({
        customer_id: customer.id,
        order_date: job.data.order?.order_date,
        total_amount: job.data.order?.total_amount,
        shipment_description: job.data.order?.shipment_description,
      });

      let dbResult = existingOrder;
      savedOrder = existingOrder;
      if (!existingOrder) {
        const address = await addressService.createAddress({
          customer_id: customer.id,
          ...job.data.address,
        });
        dbResult = await orderService.createOrder({
          customer_id: customer.id,
          address_id: address.id,
          remark: job.data.remark,
          created_by_phone: job.data.sender,
          ...job.data.order,
        });
        savedOrder = dbResult;
      }

      // The receipt that came with the order, as the photo it was captioned on.
      // A failure here never loses the order.
      let receipt: any = null;
      if (job.data.receipt && dbResult?.id) {
        try {
          receipt = await receiptService.ingest(
            { ...job.data.receipt, sender: job.data.sender ?? null, caption: null },
            dbResult.id
          );
        } catch (error) {
          console.error('Error saving receipt for job', job.id, error);
        }
      }

      // The same order often arrives twice: pasted as text, then forwarded with
      // its receipt photo. The first copy already wrote the sheet row. On a retry
      // the order may be this job's own from the failed attempt, so write again.
      if (existingOrder && job.attemptsMade === 0) {
        console.log('Order already recorded, skipping sheet row:', existingOrder.id);
        await replyToStaff(job.data.sender, orderRepeatText(existingOrder, receipt), job.data.wamid);
        return;
      }

      const sheetResult = await googleSheetService.createOrder(job.data);

      console.log('Both operations completed:', { dbResult, sheetResult });

      if (!sheetResult.success) {
        throw new Error(
          `Google Sheets write failed after CRM save: ${sheetResult.error}`
        );
      }

      // Converra stops follow-ups and flows still selling to this customer.
      if (dbResult?.id) {
        void announceOrderToConverra({ ...dbResult, phone: customer.phone_number });
      }

      if (!orderButtonsOn(job.data.sender) || !dbResult?.id) {
        await replyToStaff(
          job.data.sender,
          orderReceivedText(dbResult ?? {}, job.data.customer?.name, receipt),
          job.data.wamid
        );
        return;
      }
      // The sheet write filled in product names, which the summary shows.
      await rememberOrderPayload(dbResult.id, job.data).catch((error) =>
        console.error('Could not remember order for corrections:', error)
      );
      await replyToStaff(
        job.data.sender,
        orderSummaryText({
          heading: `✅ *${dbResult.order_number}* saved`,
          orderDate: dbResult?.order_date,
          data: job.data,
          extraLines: [receipt ? receiptLine(receipt) : null],
        }),
        job.data.wamid,
        orderButtons(dbResult.id)
      );
    } catch (error) {
      console.error('Error processing job:', job.id, error);
      if (lookedLikeOrder && job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        const noItems = error instanceof Error && /order item/i.test(error.message);
        await replyToStaff(
          job.data.sender,
          orderFailedText(savedOrder?.order_number, noItems ? 'no products found' : 'some details are missing'),
          job.data.wamid
        );
      }
      throw error;
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`✅ Worker event: Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.log(`❌ Worker event: Job ${job?.id} failed:`, err);
});

const trackingWorker = new Worker(
  'tracking_update_queue',
  async (job) => {
    console.log('Job data:', job.data);

    const { orderTrackingId, status, last_message_sent_at } = job.data;

    await orderTrackingService.updateTrackingEntry(orderTrackingId, {
      message_status: status,
      last_message_sent_at,
    });

    console.log(
      `CRM updated order_tracking ${orderTrackingId} with status ${status}`
    );
  },
  { connection }
);

trackingWorker.on('completed', (job) => {
  console.log(`✅ Tracking status job ${job.id} completed`);
});

trackingWorker.on('failed', (job, err) => {
  console.error(`❌ Tracking status job ${job?.id} failed`, err);
});
