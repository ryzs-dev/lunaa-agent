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
    async getAllOrders({ limit, offset, search, sortBy, sortOrder, }) {
        let query = supabase_1.supabase
            .from('orders')
            .select('*, order_items(*), customers(*), addresses(*), order_tracking(*)', {
            count: 'exact',
        })
            .order(sortBy, { ascending: sortOrder === 'asc' })
            .range(offset, offset + limit - 1);
        if (search) {
            query = query.ilike('name', `%${search}%`);
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
        const { data: oldItems, error: fetchError } = await supabase_1.supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);
        if (fetchError)
            throw fetchError;
        try {
            const { data: updatedOrder, error: orderError } = await supabase_1.supabase
                .from('orders')
                .update(orderData)
                .eq('id', orderId)
                .select('*')
                .single();
            if (orderError)
                throw orderError;
            const { error: deleteError } = await supabase_1.supabase
                .from('order_items')
                .delete()
                .eq('order_id', orderId);
            if (deleteError)
                throw deleteError;
            // 3️⃣ Insert new order_items
            const itemsToInsert = order_items === null || order_items === void 0 ? void 0 : order_items.map((item) => (Object.assign(Object.assign({}, item), { order_id: orderId })));
            if ((itemsToInsert === null || itemsToInsert === void 0 ? void 0 : itemsToInsert.length) || 0 > 0) {
                const { error: insertError } = await supabase_1.supabase
                    .from('order_items')
                    .insert(itemsToInsert);
                if (insertError)
                    throw insertError;
            }
            const { data: finalItems, error: finalError } = await supabase_1.supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);
            if (finalError)
                throw finalError;
            return Object.assign(Object.assign({}, updatedOrder), { order_items: finalItems });
        }
        catch (err) {
            if (oldItems && oldItems.length > 0) {
                await supabase_1.supabase.from('order_items').insert(oldItems);
            }
            throw err;
        }
    }
}
exports.default = OrderDatabase;
