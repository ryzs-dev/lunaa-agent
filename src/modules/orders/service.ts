import {UUID} from 'crypto';
import OrderDatabase from './database';
import {OrderInput, OrderItemsInput, UpdateLineItemsInput} from './types';
import {supabase} from "../supabase";

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
            createdAtFilter = {gte: options.dateFrom, lt: options.dateTo};
        }

        const {orders, count} = await this.orderDatabase.getAllOrders({
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

    /**
     * Update order with full reconciliation of line items
     */
    async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
        const {order_items: newItems, ...orderData} = updates;

        // 1️⃣ Update order metadata first
        const updatedOrder = await this.orderDatabase.updateOrder(
            orderId,
            orderData
        );

        if (!newItems) return updatedOrder; // no line item updates

        // 2️⃣ Fetch current items
        const currentOrder = await this.orderDatabase.getOrderById(orderId);
        const oldItems: OrderItemsInput[] = currentOrder.order_items || [];

        // 3️⃣ Map old items for quick lookup
        const oldItemsMap = new Map<string, { id: UUID; quantity: number }>();
        oldItems.forEach((item: any) => {
            oldItemsMap.set(item.product_id, {
                id: item.id,
                quantity: item.quantity,
            });
        });

        const incomingProductIds = new Set<string>();
        const itemsToUpsert: Array<{
            id?: UUID;
            product_id: UUID;
            quantity: number;
            order_id: UUID;
        }> = [];

        // 4️⃣ Prepare upserts: update existing or insert new
        newItems.forEach((item) => {
            incomingProductIds.add(item.product_id);

            if (oldItemsMap.has(item.product_id)) {
                // existing → update quantity
                itemsToUpsert.push({
                    id: oldItemsMap.get(item.product_id)?.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    order_id: orderId,
                });
            } else {
                // new → insert
                itemsToUpsert.push({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    order_id: orderId,
                });
            }
        });

        // 5️⃣ Identify items to delete
        const itemsToDelete = oldItems
            .filter((i: any) => !incomingProductIds.has(i.product_id))
            .map((i: any) => i.id);

        // 6️⃣ Apply changes
        if (itemsToUpsert.length > 0) {
            const cleanedOrderData = Object.fromEntries(
                Object.entries(orderData).filter(([, value]) => value !== undefined)
            );
            await this.orderDatabase.upsertOrder({
                ...cleanedOrderData,
                order_items: itemsToUpsert,
            } as unknown as OrderInput);
        }

        if (itemsToDelete.length > 0) {
            await this.orderDatabase.bulkDeleteOrders(
                itemsToDelete as unknown as UUID[]
            );
        }

        // 7️⃣ Return the final updated order
        return await this.orderDatabase.getOrderById(orderId);
    }

    async deleteOrder(orderId: UUID) {
        return await this.orderDatabase.deleteOrder(orderId);
    }

    async bulkDeleteOrders(orderIds: UUID[]) {
        return await this.orderDatabase.bulkDeleteOrders(orderIds);
    }

    async updateLineItems(orderId: UUID, payload: UpdateLineItemsInput) {
        const {line_items, total_amount} = payload;

        if (!line_items || !line_items.length) {
            throw new Error('Line items cannot be empty');
        }

        // 1️⃣ Validate quantities
        line_items.forEach(item => {
            if (item.quantity <= 0) {
                throw new Error(`Quantity for product ${item.product_id} must be > 0`);
            }
        });

        // 2️⃣ Validate products exist
        const productIds = line_items.map(item => item.product_id);
        const {data: products, error: productError} = await supabase
            .from('products')
            .select('id')
            .in('id', productIds);

        if (productError) throw productError;
        if (products.length !== productIds.length) {
            throw new Error('One or more products do not exist');
        }

        // 3️⃣ Call DB layer to replace all line items
        return await this.orderDatabase.updateLineItems(orderId, {
            line_items,
            total_amount,
        });
    }

}

export default OrderService;
