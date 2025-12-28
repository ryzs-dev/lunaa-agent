import {UUID} from 'crypto';
import {supabase} from '../supabase';
import {OrderInput, UpdateLineItemsInput} from './types';

interface QueryParams {
    limit: number | undefined;
    offset: number;
    search?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    createdAt?: { gte?: Date; lt?: Date };
}

class OrderDatabase {
    async getAllOrders({
                           limit,
                           offset,
                           search,
                           sortBy,
                           sortOrder,
                           createdAt,
                       }: QueryParams) {
        let query = supabase
            .from('orders')
            .select(
                '*, order_items(*), customers(*), addresses(*), order_tracking(*)',
                {count: 'exact'}
            )
            .order(sortBy, {ascending: sortOrder === 'asc'});

        if (search) query = query.ilike('order_number', `%${search}%`);
        if (createdAt?.gte)
            query = query.gte('created_at', createdAt.gte.toISOString());
        if (createdAt?.lt)
            query = query.lt('created_at', createdAt.lt.toISOString());

        if (limit !== undefined) {
            query = query.range(offset, offset + limit - 1);
        }

        const {data: orders, error, count} = await query;
        if (error) throw error;
        return {orders, count};
    }

    async getOrderById(orderId: UUID) {
        const {data: order, error} = await supabase
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
        const {data: orders, error} = await supabase
            .from('orders')
            .select('*, order_items(*), customers(*), order_tracking(*)')
            .eq('customer_id', customerId);
        if (error) throw error;
        return orders;
    }

    async upsertOrder(orderData: OrderInput) {
        const {order_items, ...order} = orderData;

        // 1️⃣ Upsert the order itself
        const {data: upsertedOrder, error: orderError} = await supabase
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
        const {error: itemsError} = await supabase
            .from('order_items')
            .upsert(itemsToUpsert, {
                onConflict: 'order_id,product_id', // tells Postgres what defines uniqueness
                ignoreDuplicates: false, // ensure conflict triggers update
            })
            .select('*');

        if (itemsError) throw itemsError;

        // 4️⃣ Fetch updated order with order items
        const {data: updatedOrder, error: fetchError} = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', orderId)
            .single();

        if (fetchError) throw fetchError;

        return updatedOrder;
    }

    async deleteOrder(orderId: UUID) {
        const {data: order, error} = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId)
            .single();
        if (error) throw error;
        return order;
    }

    async bulkDeleteOrders(orderIds: UUID[]) {
        if (!orderIds.length) return [];
        const {data: orders, error} = await supabase
            .from('orders')
            .delete()
            .in('id', orderIds);
        if (error) throw error;
        return orders;
    }

    async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
        const {order_items, ...orderData} = updates;

        try {
            // 1️⃣ Fetch existing order items
            const {data: oldItems, error: fetchError} = await supabase
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
                const {error: upsertError} = await supabase
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
                const {error: deleteError} = await supabase
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
            const {data: updatedItems, error: itemsFetchError} = await supabase
                .from('order_items')
                .select('*, products(*)')
                .eq('order_id', orderId);
            if (itemsFetchError) throw itemsFetchError;

            const newTotal = updatedItems.reduce(
                (sum, item) => sum + (item.products?.price || 0) * item.quantity,
                0
            );

            // 6️⃣ Update order total_amount
            const {data: updatedOrder, error: orderError} = await supabase
                .from('orders')
                .update({total_amount: newTotal})
                .eq('id', orderId)
                .select('*')
                .maybeSingle();
            if (orderError) throw orderError;

            return {...updatedOrder, order_items: updatedItems};
        } catch (err) {
            console.error('Failed to update order', err);
            throw err;
        }
    }

    async updateLineItems(orderId: UUID, payload: UpdateLineItemsInput) {
        const {line_items} = payload;

        if (!line_items || !line_items.length) {
            throw new Error(`Line items cannot be empty`);
        }

        //     Check order exist
        const {data: order, error: orderError} = await supabase
            .from('orders')
            .select('id')
            .eq('id', orderId)
            .single();

        if (orderError) throw orderError;
        if (!order) throw Error(`Order Not Found`);


        //     Delete Existing Line Items
        const {error: deleteError} = await supabase
            .from('order_items')
            .delete()
            .eq('order_id', orderId);

        if (deleteError) throw deleteError;

        const itemsToInsert = line_items.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
        }));

        const {error: insertError} = await supabase
            .from('order_items')
            .insert(itemsToInsert);

        if (insertError) throw insertError;

        const {data: updatedOrder, error: updatedOrderError} = await supabase
            .from('orders')
            .update({total_amount: payload.total_amount, created_at: new Date().toISOString()})
            .eq('id', orderId)
            .select('*')
            .single()

        if (updatedOrderError) throw updatedOrderError;

        const {data: updatedItems, error: fetchItemsError} = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);

        if (fetchItemsError) throw fetchItemsError;

        return {
            ...updatedOrder,
            order_items: updatedOrder,
        }

    }
}

export default OrderDatabase;
