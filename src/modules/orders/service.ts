import { UUID } from 'crypto';
import OrderDatabase from './database';
import {
  GetAllOrdersOptions,
  OrderInput,
  OrderItemsInput,
  UpdateLineItemsInput,
} from './types';
import { supabase } from '../supabase';

type OrderStatusSummary = Awaited<
  ReturnType<OrderDatabase['getOrderStatusSummary']>
>;

// Status counts join every order to its tracking and take ~3s, so they are
// served from memory and refreshed in the background once stale.
const SUMMARY_TTL_MS = 60_000;
let summaryCache: { value: OrderStatusSummary; fetchedAt: number } | null =
  null;
let summaryRefresh: Promise<OrderStatusSummary> | null = null;

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
      status: options.status ?? 'all',
      search: options.search,
      sortBy: options.sortBy ?? 'created_at',
      sortOrder: options.sortOrder ?? 'desc',
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      tracking: options.tracking,
      location: options.location,
    });
  }

  async getOrderStatusSummary() {
    const cached = summaryCache;
    if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL_MS) {
      return cached.value;
    }

    if (!summaryRefresh) {
      summaryRefresh = this.orderDatabase
        .getOrderStatusSummary()
        .then((value) => {
          summaryCache = { value, fetchedAt: Date.now() };
          return value;
        })
        .finally(() => {
          summaryRefresh = null;
        });
    }

    if (cached) {
      summaryRefresh.catch((error) =>
        console.error('Error refreshing order summary:', error)
      );
      return cached.value;
    }
    return summaryRefresh;
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

  async findSimilarOrder(orderData: {
    customer_id: UUID;
    order_date?: Date | string;
    total_amount?: number;
    shipment_description?: string;
  }) {
    return this.orderDatabase.findSimilarOrder(orderData);
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
