import { Worker } from 'bullmq';
import connection from '.';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';
import { GoogleSheetService } from '../google/service';
import OrderTrackingService from '../order_tracking/service';
import ReceiptService from '../receipts/service';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const googleSheetService = new GoogleSheetService();
const orderTrackingService = new OrderTrackingService();
const receiptService = new ReceiptService();

const worker = new Worker(
  'orders',
  async (job) => {
    // A receipt sent on its own, after the order it pays for.
    if (job.name === 'receipt.received') {
      const { media, sender, caption, received_at } = job.data;
      await receiptService.ingestStandalone({ ...media, sender, caption, received_at });
      return;
    }

    try {
      const customer = await customerService.createCustomer(job.data.customer);
      const existingOrder = await orderService.findSimilarOrder({
        customer_id: customer.id,
        order_date: job.data.order?.order_date,
        total_amount: job.data.order?.total_amount,
        shipment_description: job.data.order?.shipment_description,
      });

      let dbResult = existingOrder;
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
      }

      // The receipt that came with the order, as the photo it was captioned on.
      // A failure here never loses the order.
      if (job.data.receipt && dbResult?.id) {
        try {
          await receiptService.ingest(
            { ...job.data.receipt, sender: job.data.sender ?? null, caption: null },
            dbResult.id
          );
        } catch (error) {
          console.error('Error saving receipt for job', job.id, error);
        }
      }

      const sheetResult = await googleSheetService.createOrder(job.data);

      console.log('Both operations completed:', { dbResult, sheetResult });

      if (!sheetResult.success) {
        throw new Error(
          `Google Sheets write failed after CRM save: ${sheetResult.error}`
        );
      }
    } catch (error) {
      console.error('Error processing job:', job.id, error);
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
