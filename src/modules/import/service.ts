import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { ImportPayload } from './types';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import { UUID } from 'crypto';
import OrderService from '../orders/service';
import ProductService from '../product/service';
import OrderTrackingService from '../order_tracking/service';
import { CustomerInput } from '../customer/types';

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
const productService = new ProductService();
const orderTrackingService = new OrderTrackingService();

export class ImportService {
  constructor(private importServiceUrl: string) {}

  private getProducts = async () => {
    const products = await productService.getAllProducts();
    return products;
  };

  async mapProductNamesToIds(items: ImportPayload['order']['order_items']) {
    const products = await this.getProducts();
    return items.map((item) => {
      const product = products.find(
        (p) => p.name.toLowerCase() === item.product.name.toLowerCase()
      );
      return {
        product_id: product ? product.id : null,
        quantity: item.quantity,
      };
    });
  }

  /**
   * Send CSV file to import microservice and get parsed payload
   */
  async fetchImportPayload(filePath: string): Promise<ImportPayload[]> {
    // Ensure the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const res = await axios.post(
      `${this.importServiceUrl}/import/file`,
      formData,
      {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity, // for large files
        maxContentLength: Infinity,
      }
    );

    // import microservice should return { success: true, data: [...] }
    return res.data.data || [];
  }

  /**
   * Persist payloads to CRM database
   */
  async savePayloadToDatabase(payload: ImportPayload) {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ customer: CustomerInput; error: string }>,
    };

    try {
      // 1. create/find customer
      const customer = await customerService.createCustomer(payload.customer);

      // 2. create address
      const address = await addressService.createAddress({
        ...payload.address,
        postcode: payload.address.postcode || '',
        city: payload.address.city || '',
        state: payload.address.state || '',
        customer_id: customer.id as UUID,
      });

      // 3. create order
      const order = await orderService.createOrder({
        customer_id: customer.id as UUID,
        ...payload.order,
        status:
          (payload.order.status as 'unpaid' | 'paid' | 'refunded') || 'unpaid',
        order_items: await this.mapProductNamesToIds(payload.order.order_items),
        address_id: address.id as UUID,
      });

      // 4. create order_tracking
      if (payload.tracking && payload.tracking.courier) {
        await orderTrackingService.addTrackingEntry(
          {
            ...payload.tracking,
            courier: payload.tracking.courier || '',
            status:
              (payload.tracking.status as
                | 'pending'
                | 'shipped'
                | 'delivered'
                | 'returned') || 'pending',
          },
          order.id as UUID
        );
      }

      // mark as success
      result.success += 1;
    } catch (err: any) {
      // clean error message
      const customerName = payload.customer?.name || 'Unknown';
      const phone = payload.customer?.phone_number || 'Unknown';
      const message = err.message || err.toString();

      console.error(`Failed (phone: ${phone}): ${message}`);

      // record failure
      result.failed += 1;
      result.errors.push({
        customer: payload.customer,
        error: message,
      });
    }

    return result;
  }

  /**
   * End-to-end CSV processing
   */
  async importCsv(filePath: string) {
    try {
      const payloads = await this.fetchImportPayload(filePath);

      for (const payload of payloads) {
        await this.savePayloadToDatabase(payload);
      }

      // Optionally, remove temp file after processing
      fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });

      return payloads.length;
    } catch (err: any) {
      console.error('Failed to import CSV:', err.message);
      throw err;
    }
  }
}
