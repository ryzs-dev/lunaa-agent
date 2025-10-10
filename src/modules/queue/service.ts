import { Worker } from 'bullmq';
import connection from '.';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';
import { GoogleSheetService } from '../google/service';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const googleSheetService = new GoogleSheetService();

const worker = new Worker(
  'orders',
  async (job) => {
    try {
      const customer = await customerService.createCustomer(job.data.customer);
      const address = await addressService.createAddress({
        customer_id: customer.id,
        ...job.data.address,
      });

      const { shipment_description, ...orderData } = job.data.order;

      // Run DB + Google Sheets concurrently
      const [dbResult, sheetResult] = await Promise.all([
        orderService.createOrder({
          customer_id: customer.id,
          address_id: address.id,
          ...orderData,
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
