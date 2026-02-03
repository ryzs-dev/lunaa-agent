import { UUID } from 'crypto';
import OrderDatabase from './database';
import {
  GetAllOrdersOptions,
  OrderInput,
  OrderItemsInput,
  UpdateLineItemsInput,
} from './types';
import { supabase } from '../supabase';

class OrderService {
  private orderDatabase: OrderDatabase;

  constructor() {
    this.orderDatabase = new OrderDatabase();
  }

  async getAllOrders(options: GetAllOrdersOptions) {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;

    return this.orderDatabase.getAllOrders({
      limit,
      offset,
      search: options.search,
      sortBy: options.sortBy ?? 'created_at',
      sortOrder: options.sortOrder ?? 'desc',
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });
  }

  async getOrderById(orderId: UUID) {
    return this.orderDatabase.getOrderById(orderId);
  }

  async getOrdersByCustomerId(customerId: UUID) {
    return this.orderDatabase.getOrdersByCustomerId(customerId);
  }

  async createOrder(orderData: OrderInput) {
    return this.orderDatabase.upsertOrder(orderData);
  }

  async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
    return this.orderDatabase.updateOrder(orderId, updates);
  }

  async deleteOrder(orderId: UUID) {
    return this.orderDatabase.deleteOrder(orderId);
  }

  async bulkDeleteOrders(orderIds: UUID[]) {
    return this.orderDatabase.bulkDeleteOrders(orderIds);
  }

  async updateLineItems(orderId: UUID, payload: UpdateLineItemsInput) {
    return this.orderDatabase.updateLineItems(orderId, payload);
  }
}

export default OrderService;
