import { Worker } from 'bullmq';
import connection from '.';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';
import { GoogleSheetService } from '../google/service';
import OrderTrackingService from '../order_tracking/service';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const googleSheetService = new GoogleSheetService();
const orderTrackingService = new OrderTrackingService();

const worker = new Worker(
  'orders',
  async (job) => {
    try {
      const customer = await customerService.createCustomer(job.data.customer);
      const address = await addressService.createAddress({
        customer_id: customer.id,
        ...job.data.address,
      });

      const [dbResult, sheetResult] = await Promise.all([
        orderService.createOrder({
          customer_id: customer.id,
          address_id: address.id,
          remark: job.data.remark,
          ...job.data.order,
        }),
        googleSheetService.createOrder(job.data),
      ]);

      console.log('Both operations completed:', { dbResult, sheetResult });
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
