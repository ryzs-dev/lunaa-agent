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
  receiptOnlyText,
  replyToStaff,
} from '../receipts/staff-reply';
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
      const receipt = await receiptService.ingestStandalone({ ...media, sender, caption, received_at });
      const order = receipt.order_id ? await receiptDb.getOrderTotal(receipt.order_id) : null;
      await replyToStaff(sender, receiptOnlyText(order?.order_number, receipt), media.wamid);
      return;
    }

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

      await replyToStaff(
        job.data.sender,
        orderReceivedText(dbResult ?? {}, job.data.customer?.name, receipt),
        job.data.wamid
      );
    } catch (error) {
      console.error('Error processing job:', job.id, error);
      // Staff chat comes through here too: only answer what looks like an order.
      const lookedLikeOrder = job.data.order?.total_amount || job.data.customer?.phone_number;
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
