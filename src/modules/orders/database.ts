import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { OrderInput, OrderItemsInput } from './types';

interface QueryParams {
  limit: number;
  offset: number;
  search?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

class OrderDatabase {
  async getAllOrders({
    limit,
    offset,
    search,
    sortBy,
    sortOrder,
  }: QueryParams) {
    let query = supabase
      .from('orders')
      .select(
        '*, order_items(*), customers(*), addresses(*), order_tracking(*)',
        {
          count: 'exact',
        }
      )
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: orders, error, count } = await query;

    if (error) throw error;
    return { orders, count };
  }

  async getOrderById(orderId: UUID) {
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        '*, addresses(*), order_items(*, products(*)), customers(*), order_tracking(*)'
      )
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return order;
  }

  async getOrdersByCustomerId(customerId: UUID) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items(*), customers(*), order_tracking(*)')
      .eq('customer_id', customerId);
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
    const { data: order, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return order;
  }

  async bulkDeleteOrders(orderIds: UUID[]) {
    if (!orderIds.length) return [];
    const { data: orders, error } = await supabase
      .from('orders')
      .delete()
      .in('id', orderIds);
    if (error) throw error;
    return orders;
  }

  async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
    const { order_items, ...orderData } = updates;

    const { data: oldItems, error: fetchError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (fetchError) throw fetchError;

    try {
      const { data: updatedOrder, error: orderError } = await supabase
        .from('orders')
        .update(orderData)
        .eq('id', orderId)
        .select('*')
        .single();
      if (orderError) throw orderError;

      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);
      if (deleteError) throw deleteError;

      // 3️⃣ Insert new order_items
      const itemsToInsert = order_items?.map((item) => ({
        ...item,
        order_id: orderId,
      }));
      if (itemsToInsert?.length || 0 > 0) {
        const { error: insertError } = await supabase
          .from('order_items')
          .insert(itemsToInsert);
        if (insertError) throw insertError;
      }

      const { data: finalItems, error: finalError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);
      if (finalError) throw finalError;

      return { ...updatedOrder, order_items: finalItems };
    } catch (err) {
      if (oldItems && oldItems.length > 0) {
        await supabase.from('order_items').insert(oldItems);
      }
      throw err;
    }
  }
}

export default OrderDatabase;
