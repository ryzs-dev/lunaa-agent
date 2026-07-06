import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { recalculateCustomerStats } from './customer-stats';
import { OrderInput, UpdateLineItemsInput } from './types';

interface QueryParams {
  limit: number;
  offset: number;
  search?: string;
  status: string;
  sortBy: string;
  tracking?: string;
  sortOrder: 'asc' | 'desc';
  createdAt?: { gte?: Date; lt?: Date };
  dateFrom?: Date;
  dateTo?: Date;
}

class OrderDatabase {
  async getAllOrders({
    limit,
    offset,
    search,
    sortBy,
    sortOrder,
    dateFrom,
    dateTo,
    status,
    tracking,
  }: QueryParams) {
    let query = supabase
      .from('orders')
      .select(
        '*, order_items(*), customers(*), addresses(*), order_tracking(*)',
        {
          count: 'exact',
        }
      )
      .is('deleted_at', null)
      .order(sortBy, { ascending: sortOrder === 'asc' });

    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,customers.name.ilike.%${search}%`
      );
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);

      query = query.lte('created_at', endOfDay.toISOString());
    }

    if (tracking) {
      if (tracking === 'with') {
        query = query.not('order_tracking', 'is', null);
      } else if (tracking === 'without') {
        query = query.is('order_tracking', null);
      }
    }
    if (status && status !== 'all') {
      query = query.ilike('order_tracking.status', status);
    }

    // 📄 Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const orders = (data ?? []).map(
      ({ order_tracking: orderTracking, ...rest }: (typeof data)[number]) => {
        const trackingEntry = Array.isArray(orderTracking)
          ? orderTracking[orderTracking.length - 1]
          : orderTracking;

        return {
          ...rest,
          order_tracking: trackingEntry ?? null,
        };
      }
    );

    return {
      orders,
      pagination: {
        pageIndex: offset / limit,
        pageSize: limit,
        total: count ?? 0,
      },
    };
  }

  async getOrderById(orderId: UUID) {
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        '*, addresses(*), order_items(*, products(*)), customers(*), order_tracking(*)'
      )
      .eq('id', orderId)
      .is('deleted_at', null)
      .single();
    if (error) throw error;
    return order;
  }

  async getOrdersByCustomerId(customerId: UUID) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*), customers(*), order_tracking(*)')
      .eq('customer_id', customerId)
      .is('deleted_at', null);
    if (error) throw error;
    return orders;
  }

  async upsertOrder(orderData: OrderInput) {
    const { order_items, ...order } = orderData;

    // 1️⃣ Upsert the order itself
    const { data: upsertedOrder, error: orderError } = await supabase
      .from('orders')
      .upsert([order])
      .select('*')
      .single();

    if (orderError) throw orderError;

    const orderId = upsertedOrder.id;

    // 2️⃣ Prepare the order items with order_id
    const itemsToUpsert = order_items.map((item) => ({
      ...item,
      order_id: orderId,
    }));

    // 3️⃣ Upsert items — update quantity if same order_id + product_id exists
    const { error: itemsError } = await supabase
      .from('order_items')
      .upsert(itemsToUpsert, {
        onConflict: 'order_id,product_id', // tells Postgres what defines uniqueness
        ignoreDuplicates: false, // ensure conflict triggers update
      })
      .select('*');

    if (itemsError) throw itemsError;

    // 4️⃣ Fetch updated order with order items
    const { data: updatedOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (fetchError) throw fetchError;

    return updatedOrder;
  }

  async deleteOrder(orderId: UUID) {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, customer_id, total_amount')
      .eq('id', orderId)
      .is('deleted_at', null)
      .single();

    if (fetchError) throw fetchError;

    const deletedAt = new Date().toISOString();
    const { data: deletedOrder, error } = await supabase
      .from('orders')
      .update({ deleted_at: deletedAt })
      .eq('id', orderId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;

    if (order.customer_id) {
      await recalculateCustomerStats(order.customer_id as UUID);
    }

    return deletedOrder;
  }

  async bulkDeleteOrders(orderIds: UUID[]) {
    if (!orderIds.length) return [];

    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, customer_id')
      .in('id', orderIds)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;
    if (!orders?.length) return [];

    const deletedAt = new Date().toISOString();
    const { data: deletedOrders, error } = await supabase
      .from('orders')
      .update({ deleted_at: deletedAt })
      .in(
        'id',
        orders.map((order) => order.id)
      )
      .is('deleted_at', null)
      .select('*');

    if (error) throw error;

    const customerIds = [
      ...new Set(
        orders
          .map((order) => order.customer_id)
          .filter((customerId): customerId is UUID => Boolean(customerId))
      ),
    ];

    await Promise.all(
      customerIds.map((customerId) => recalculateCustomerStats(customerId))
    );

    return deletedOrders ?? [];
  }

  async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
    const { order_items, ...orderData } = updates;

    try {
      // 1️⃣ Fetch existing order items
      const { data: oldItems, error: fetchError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);
      if (fetchError) throw fetchError;

      // 2️⃣ Prepare new state for items
      const finalItems =
        order_items?.map((item) => ({
          ...item,
          order_id: orderId,
        })) || [];

      // 3️⃣ Upsert new/edited items
      if (finalItems.length > 0) {
        const { error: upsertError } = await supabase
          .from('order_items')
          .upsert(finalItems, {
            onConflict: 'order_id,product_id',
            ignoreDuplicates: false,
          });
        if (upsertError) throw upsertError;
      }

      // 4️⃣ Delete removed items
      const incomingProductIds = finalItems.map((i) => i.product_id);
      const itemsToDelete = oldItems.filter(
        (i) => !incomingProductIds.includes(i.product_id)
      );
      if (itemsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', orderId)
          .in(
            'product_id',
            itemsToDelete.map((i) => i.product_id)
          );
        if (deleteError) throw deleteError;
      }

      // 5️⃣ Recalculate total_amount
      const { data: updatedItems, error: itemsFetchError } = await supabase
        .from('order_items')
        .select('*, products(*)')
        .eq('order_id', orderId);
      if (itemsFetchError) throw itemsFetchError;

      const newTotal = updatedItems.reduce(
        (sum, item) => sum + (item.products?.price || 0) * item.quantity,
        0
      );

      // 6️⃣ Update order total_amount
      const { data: updatedOrder, error: orderError } = await supabase
        .from('orders')
        .update({ total_amount: newTotal })
        .eq('id', orderId)
        .select('*')
        .maybeSingle();
      if (orderError) throw orderError;

      return { ...updatedOrder, order_items: updatedItems };
    } catch (err) {
      console.error('Failed to update order', err);
      throw err;
    }
  }

  async updateLineItems(orderId: UUID, payload: UpdateLineItemsInput) {
    const { line_items } = payload;

    if (!line_items || !line_items.length) {
      throw new Error(`Line items cannot be empty`);
    }

    //     Check order exist
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .is('deleted_at', null)
      .single();

    if (orderError) throw orderError;
    if (!order) throw Error(`Order Not Found`);

    //     Delete Existing Line Items
    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (deleteError) throw deleteError;

    const itemsToInsert = line_items.map((item) => ({
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
    }));

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (insertError) throw insertError;

    const { data: updatedOrder, error: updatedOrderError } = await supabase
      .from('orders')
      .update({
        total_amount: payload.total_amount,
        created_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*')
      .single();

    if (updatedOrderError) throw updatedOrderError;

    const { data: updatedItems, error: fetchItemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (fetchItemsError) throw fetchItemsError;

    return {
      ...updatedOrder,
      order_items: updatedOrder,
    };
  }
}

export default OrderDatabase;
