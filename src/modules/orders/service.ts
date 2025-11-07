import { UUID } from 'crypto';
import OrderDatabase from './database';
import { OrderInput } from './types';

class OrderService {
  private orderDatabase: OrderDatabase;

  constructor() {
    this.orderDatabase = new OrderDatabase();
  }

  async getAllOrders(options: {
    limit?: number;
    offset?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const limit = !options.limit ? 20 : options.limit;
    const offset = options.offset ?? 0;
    const sortBy = options.sortBy ?? 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';

    const { orders, count } = await this.orderDatabase.getAllOrders({
      limit,
      offset,
      search: options.search,
      sortBy,
      sortOrder,
    });

    return {
      orders,
      pagination: {
        limit,
        offset,
        total: count ?? 0,
      },
    };
  }

  async getOrderById(orderId: UUID) {
    return await this.orderDatabase.getOrderById(orderId);
  }

  async getOrdersByCustomerId(customerId: UUID) {
    return await this.orderDatabase.getOrdersByCustomerId(customerId);
  }

  async createOrder(orderData: OrderInput) {
    return await this.orderDatabase.upsertOrder(orderData);
  }

  async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
    return await this.orderDatabase.updateOrder(orderId, updates);
  }

  async deleteOrder(orderId: UUID) {
    return await this.orderDatabase.deleteOrder(orderId);
  }

  async bulkDeleteOrders(orderIds: UUID[]) {
    return await this.orderDatabase.bulkDeleteOrders(orderIds);
  }
}

export default OrderService;
