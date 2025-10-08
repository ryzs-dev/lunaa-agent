import { Worker } from 'bullmq';
import connection from '.';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();

const worker = new Worker(
  'orders',
  async (job) => {
    console.log('Processing job:', job.data);
    try {
      const customer = await customerService.createCustomer(job.data.customer);
      const address = await addressService.createAddress({
        customer_id: customer.id,
        ...job.data.address,
      });

      const order = await orderService.createOrder({
        customer_id: customer.id,
        address_id: address.id,
        ...job.data.order,
      });

      console.log('Job completed:', job.id);
    } catch (error) {
      console.error('Error processing job:', job.id, error);
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
