"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class OrderDatabase {
    async getAllOrders({ limit, offset, search, sortBy, sortOrder, createdAt, }) {
        let query = supabase_1.supabase
            .from('orders_with_customers')
            .select('*, order_items(*), customers(*), addresses(*), order_tracking(*)', { count: 'exact' })
            .order(sortBy, { ascending: sortOrder === 'asc' });
        if (search) {
            query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%`);
        }
        if (createdAt === null || createdAt === void 0 ? void 0 : createdAt.gte)
            query = query.gte('created_at', createdAt.gte.toISOString());
        if (createdAt === null || createdAt === void 0 ? void 0 : createdAt.lt)
            query = query.lt('created_at', createdAt.lt.toISOString());
        if (limit !== undefined) {
            query = query.range(offset, offset + limit - 1);
        }
        const { data: orders, error, count } = await query;
        if (error)
            throw error;
        return { orders, count };
    }
    async getOrderById(orderId) {
        const { data: order, error } = await supabase_1.supabase
            .from('orders')
            .select('*, addresses(*), order_items(*, products(*)), customers(*), order_tracking(*)')
            .eq('id', orderId)
            .single();
        if (error)
            throw error;
        return order;
    }
    async getOrdersByCustomerId(customerId) {
        const { data: orders, error } = await supabase_1.supabase
            .from('orders')
            .select('*, order_items(*), customers(*), order_tracking(*)')
            .eq('customer_id', customerId);
        if (error)
            throw error;
        return orders;
    }
    async upsertOrder(orderData) {
        const { order_items } = orderData, order = __rest(orderData, ["order_items"]);
        // 1️⃣ Upsert the order itself
        const { data: upsertedOrder, error: orderError } = await supabase_1.supabase
            .from('orders')
            .upsert([order])
            .select('*')
            .single();
        if (orderError)
            throw orderError;
        const orderId = upsertedOrder.id;
        // 2️⃣ Prepare the order items with order_id
        const itemsToUpsert = order_items.map((item) => (Object.assign(Object.assign({}, item), { order_id: orderId })));
        // 3️⃣ Upsert items — update quantity if same order_id + product_id exists
        const { error: itemsError } = await supabase_1.supabase
            .from('order_items')
            .upsert(itemsToUpsert, {
            onConflict: 'order_id,product_id', // tells Postgres what defines uniqueness
            ignoreDuplicates: false, // ensure conflict triggers update
        })
            .select('*');
        if (itemsError)
            throw itemsError;
        // 4️⃣ Fetch updated order with order items
        const { data: updatedOrder, error: fetchError } = await supabase_1.supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', orderId)
            .single();
        if (fetchError)
            throw fetchError;
        return updatedOrder;
    }
    async deleteOrder(orderId) {
        const { data: order, error } = await supabase_1.supabase
            .from('orders')
            .delete()
            .eq('id', orderId)
            .single();
        if (error)
            throw error;
        return order;
    }
    async bulkDeleteOrders(orderIds) {
        if (!orderIds.length)
            return [];
        const { data: orders, error } = await supabase_1.supabase
            .from('orders')
            .delete()
            .in('id', orderIds);
        if (error)
            throw error;
        return orders;
    }
    async updateOrder(orderId, updates) {
        const { order_items } = updates, orderData = __rest(updates, ["order_items"]);
        try {
            // 1️⃣ Fetch existing order items
            const { data: oldItems, error: fetchError } = await supabase_1.supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);
            if (fetchError)
                throw fetchError;
            // 2️⃣ Prepare new state for items
            const finalItems = (order_items === null || order_items === void 0 ? void 0 : order_items.map((item) => (Object.assign(Object.assign({}, item), { order_id: orderId })))) || [];
            // 3️⃣ Upsert new/edited items
            if (finalItems.length > 0) {
                const { error: upsertError } = await supabase_1.supabase
                    .from('order_items')
                    .upsert(finalItems, {
                    onConflict: 'order_id,product_id',
                    ignoreDuplicates: false,
                });
                if (upsertError)
                    throw upsertError;
            }
            // 4️⃣ Delete removed items
            const incomingProductIds = finalItems.map((i) => i.product_id);
            const itemsToDelete = oldItems.filter((i) => !incomingProductIds.includes(i.product_id));
            if (itemsToDelete.length > 0) {
                const { error: deleteError } = await supabase_1.supabase
                    .from('order_items')
                    .delete()
                    .eq('order_id', orderId)
                    .in('product_id', itemsToDelete.map((i) => i.product_id));
                if (deleteError)
                    throw deleteError;
            }
            // 5️⃣ Recalculate total_amount
            const { data: updatedItems, error: itemsFetchError } = await supabase_1.supabase
                .from('order_items')
                .select('*, products(*)')
                .eq('order_id', orderId);
            if (itemsFetchError)
                throw itemsFetchError;
            const newTotal = updatedItems.reduce((sum, item) => { var _a; return sum + (((_a = item.products) === null || _a === void 0 ? void 0 : _a.price) || 0) * item.quantity; }, 0);
            // 6️⃣ Update order total_amount
            const { data: updatedOrder, error: orderError } = await supabase_1.supabase
                .from('orders')
                .update({ total_amount: newTotal })
                .eq('id', orderId)
                .select('*')
                .maybeSingle();
            if (orderError)
                throw orderError;
            return Object.assign(Object.assign({}, updatedOrder), { order_items: updatedItems });
        }
        catch (err) {
            console.error('Failed to update order', err);
            throw err;
        }
    }
    async updateLineItems(orderId, payload) {
        const { line_items } = payload;
        if (!line_items || !line_items.length) {
            throw new Error(`Line items cannot be empty`);
        }
        //     Check order exist
        const { data: order, error: orderError } = await supabase_1.supabase
            .from('orders')
            .select('id')
            .eq('id', orderId)
            .single();
        if (orderError)
            throw orderError;
        if (!order)
            throw Error(`Order Not Found`);
        //     Delete Existing Line Items
        const { error: deleteError } = await supabase_1.supabase
            .from('order_items')
            .delete()
            .eq('order_id', orderId);
        if (deleteError)
            throw deleteError;
        const itemsToInsert = line_items.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
        }));
        const { error: insertError } = await supabase_1.supabase
            .from('order_items')
            .insert(itemsToInsert);
        if (insertError)
            throw insertError;
        const { data: updatedOrder, error: updatedOrderError } = await supabase_1.supabase
            .from('orders')
            .update({ total_amount: payload.total_amount, created_at: new Date().toISOString() })
            .eq('id', orderId)
            .select('*')
            .single();
        if (updatedOrderError)
            throw updatedOrderError;
        const { data: updatedItems, error: fetchItemsError } = await supabase_1.supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);
        if (fetchItemsError)
            throw fetchItemsError;
        return Object.assign(Object.assign({}, updatedOrder), { order_items: updatedOrder });
    }
}
exports.default = OrderDatabase;
