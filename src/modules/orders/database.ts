import { UUID } from 'crypto';
import { supabase } from '../supabase';
import {
  findCustomerIdsBySearch,
  sanitizeSearchTerm,
} from '../shared/customer-search';
import { recalculateCustomerStats } from './customer-stats';
import { generateOrderNumber } from './order-number';
import { validateOrderItems } from './validate-items';
import { OrderInput, UpdateLineItemsInput } from './types';

const EAST_MALAYSIA_STATES = ['Sabah', 'Sarawak', 'Labuan'];
const WEST_MALAYSIA_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Pulau Pinang',
  'Perak',
  'Perlis',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Putrajaya',
];

// Courier and message statuses arrive with inconsistent spelling, so the
// dashboard filters on these groups rather than raw values.
export const ORDER_STATUS_GROUPS: Record<string, string[]> = {
  awaiting_pickup: [
    'pending',
    'Pending',
    'Pending Pickup',
    'Shipment Data Received',
    'sent',
    'read',
  ],
  in_transit: [
    'In Transit',
    'Delivering',
    'shipped',
    'Parcel has been received',
    'Shipment collected',
    'Mainwaybill Pickup',
  ],
  delivered: [
    'Delivered',
    'delivered',
    'Successfully delivered',
    'Delivery Success',
    'special POD',
  ],
  problem: [
    'undelivered',
    'Returned',
    'RTO Success',
    'return success',
    'Return shipment was successfully delivered',
  ],
};

const SORTABLE_ORDER_FIELDS = [
  'created_at',
  'order_date',
  'total_amount',
  'order_number',
];

// Ordering with NULLS LAST on a non-null column skips its index and sorts
// every joined row, so only nullable columns get it.
const NULLABLE_SORT_FIELDS = ['order_date', 'total_amount'];

interface QueryParams {
  limit: number;
  offset: number;
  search?: string;
  status: string;
  sortBy: string;
  tracking?: string;
  location?: string;
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
    location,
  }: QueryParams) {
    const applyLocation =
      location === 'east' || location === 'west';
    const statusValues =
      status && status !== 'all' && status !== 'needs_shipment'
        ? ORDER_STATUS_GROUPS[status] ?? [status]
        : null;
    const filtersOnTracking =
      Boolean(statusValues) ||
      status === 'needs_shipment' ||
      tracking === 'with' ||
      tracking === 'without';
    const filterSelect = [
      'id',
      applyLocation && 'addresses!inner(state)',
      filtersOnTracking &&
        `order_tracking${statusValues ? '!inner' : ''}(id, status)`,
    ]
      .filter(Boolean)
      .join(', ');
    const sortField = SORTABLE_ORDER_FIELDS.includes(sortBy)
      ? sortBy
      : 'created_at';

    // Only ids are paged here: embedding items/customer/tracking makes
    // Postgres build them for every row before sorting.
    let query = supabase
      .from('orders')
      .select(filterSelect, { count: 'exact' })
      .is('deleted_at', null)
      .order(sortField, {
        ascending: sortOrder === 'asc',
        ...(NULLABLE_SORT_FIELDS.includes(sortField) && { nullsFirst: false }),
      })
      .order('id');

    if (search) {
      const term = sanitizeSearchTerm(search);
      if (term) {
        const customerIds = await findCustomerIdsBySearch(term);
        const orParts: string[] = [];
        if (!term.includes('@')) {
          orParts.push(`order_number.ilike."%${term}%"`);
        }
        if (customerIds.length) {
          orParts.push(`customer_id.in.(${customerIds.join(',')})`);
        }
        if (orParts.length) {
          query = query.or(orParts.join(','));
        } else {
          return {
            orders: [],
            pagination: {
              pageIndex: offset / limit,
              pageSize: limit,
              total: 0,
            },
          };
        }
      }
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);

      query = query.lte('created_at', endOfDay.toISOString());
    }

    if (tracking && tracking !== 'all') {
      if (tracking === 'with') {
        query = query.not('order_tracking', 'is', null);
      } else if (tracking === 'without') {
        query = query.is('order_tracking', null);
      }
    }
    if (status === 'needs_shipment') {
      query = query.is('order_tracking', null);
    } else if (statusValues) {
      query = query.in('order_tracking.status', statusValues);
    }

    if (applyLocation) {
      const states =
        location === 'east' ? EAST_MALAYSIA_STATES : WEST_MALAYSIA_STATES;
      query = query.or(
        states.map((state) => `state.eq."${state}"`).join(','),
        { referencedTable: 'addresses' }
      );
    }

    // 📄 Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: page, error, count } = await query;
    if (error) throw error;

    const ids = ((page ?? []) as unknown as { id: string }[]).map(
      (row) => row.id
    );
    const { data, error: detailsError } = ids.length
      ? await supabase
          .from('orders')
          .select(
            '*, order_items(*, products(name, code)), customers(*), addresses(*), order_tracking(*)'
          )
          .in('id', ids)
      : { data: [], error: null };
    if (detailsError) throw detailsError;

    const position = new Map(ids.map((id, index) => [id, index]));
    const sorted = [...(data ?? [])].sort(
      (a, b) => position.get(a.id)! - position.get(b.id)!
    );

    const orders = sorted.map(
      ({ order_tracking: orderTracking, ...rest }: (typeof sorted)[number]) => {
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

  async getOrderStatusSummary() {
    const countOrders = async (group?: string) => {
      let query;
      if (group === 'needs_shipment') {
        query = supabase
          .from('orders')
          .select('id, order_tracking(id)', { count: 'exact', head: true })
          .is('order_tracking', null);
      } else if (group) {
        query = supabase
          .from('orders')
          .select('id, order_tracking!inner(status)', {
            count: 'exact',
            head: true,
          })
          .in('order_tracking.status', ORDER_STATUS_GROUPS[group]);
      } else {
        query = supabase
          .from('orders')
          .select('id', { count: 'exact', head: true });
      }

      const { count, error } = await query.is('deleted_at', null);
      if (error) throw error;
      return count ?? 0;
    };

    const groups = ['needs_shipment', ...Object.keys(ORDER_STATUS_GROUPS)];
    const [all, ...counts] = await Promise.all([
      countOrders(),
      ...groups.map((group) => countOrders(group)),
    ]);

    return {
      all,
      ...Object.fromEntries(groups.map((group, i) => [group, counts[i]])),
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

  async findSimilarOrder(orderData: {
    customer_id: UUID;
    order_date?: Date | string;
    total_amount?: number;
    shipment_description?: string;
  }) {
    const date = String(orderData.order_date || '').slice(0, 10);
    if (!orderData.customer_id || !date) return null;

    const { data: orders, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, order_date, total_amount, shipment_description, address_id'
      )
      .eq('customer_id', orderData.customer_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return (
      (orders || []).find((order) => {
        const sameDate = String(order.order_date || '').slice(0, 10) === date;
        const sameTotal =
          Number(order.total_amount) === Number(orderData.total_amount);
        const sameShipment =
          String(order.shipment_description || '').replace(/\s+/g, '') ===
          String(orderData.shipment_description || '').replace(/\s+/g, '');
        return sameDate && sameTotal && sameShipment;
      }) || null
    );
  }

  async upsertOrder(orderData: OrderInput) {
    const validatedItems = validateOrderItems(orderData.order_items);
    const { order_items: _orderItems, ...order } = orderData;
    const orderNumber =
      (order as { order_number?: string }).order_number ??
      (await generateOrderNumber());

    const orderPayload = {
      ...order,
      order_number: orderNumber,
      order_date: order.order_date ?? new Date().toISOString(),
      status: order.status ?? 'unpaid',
      currency: order.currency ?? 'MYR',
    };

    // 1️⃣ Upsert the order itself
    const { data: upsertedOrder, error: orderError } = await supabase
      .from('orders')
      .upsert([orderPayload])
      .select('*')
      .single();

    if (orderError) throw orderError;

    const orderId = upsertedOrder.id;

    // 2️⃣ Prepare the order items with order_id
    const itemsToUpsert = validatedItems.map((item) => ({
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
      try {
        await recalculateCustomerStats(order.customer_id as UUID);
      } catch (statsError) {
        console.error('Failed to recalculate customer stats after delete:', statsError);
      }
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
      customerIds.map(async (customerId) => {
        try {
          await recalculateCustomerStats(customerId);
        } catch (statsError) {
          console.error(
            'Failed to recalculate customer stats after bulk delete:',
            statsError
          );
        }
      })
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
    const validatedItems = validateOrderItems(
      payload.line_items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }))
    );

    if (!validatedItems.length) {
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

    const itemsToInsert = validatedItems.map((item) => ({
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
