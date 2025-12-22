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
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const sortBy = options.sortBy ?? 'created_at';
    const sortOrder = options.sortOrder ?? 'desc';

    let createdAtFilter: { gte?: Date; lt?: Date } | undefined;
    if (options.dateFrom && options.dateTo) {
      createdAtFilter = { gte: options.dateFrom, lt: options.dateTo };
    }

    const { orders, count } = await this.orderDatabase.getAllOrders({
      limit: options.limit,
      offset: options.offset ?? 0,
      search: options.search,
      sortBy,
      sortOrder,
      createdAt: createdAtFilter,
    });

    return {
      orders,
      pagination: {
        limit: options.limit ?? count,
        offset: options.offset ?? 0,
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
