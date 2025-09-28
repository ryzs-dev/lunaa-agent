import { UUID } from "crypto";
import { supabase } from "../supabase";
import { OrderInput } from "./types";

class OrderDatabase {
    async getAllOrders(){
        const { data: orders, error } = await supabase.from("orders").select("*, order_items(*), customers(*), order_tracking(*)");
        if (error) throw error;
        return orders;
    }

    async getOrderById(orderId:UUID) {
        const { data: order, error } = await supabase.from("orders").select("*, addresses(*), order_items(*, products(*)), customers(*), order_tracking(*)").eq("id", orderId).single();
        if (error) throw error;
        return order;
    }

    async getOrdersByCustomerId(customerId:UUID){
        const { data: orders, error } = await supabase.from("orders").select("*, order_items(*), customers(*), order_tracking(*)").eq("customer_id", customerId);
        if (error) throw error;
        return orders;
    }

    async upsertOrder(orderData: OrderInput){
        const {order_items, ...order} = orderData;

        const { data, error } = await supabase.from("orders").upsert([order]).select("*").single();
        if (error) throw error;

        const orderId = data.id
        const itemsToInsert = order_items.map(item => ({ ...item, order_id: orderId }));

        const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
        if (itemsError) throw itemsError;

        const { data:updatedOrder} = await supabase.from("orders").select("* , order_items(*)").eq("id", orderId).single();
    
        return updatedOrder;
    }

    async deleteOrder(orderId:UUID){
        const { data: order, error } = await supabase.from("orders").delete().eq("id", orderId).single();
        if (error) throw error;
        return order;
    }

    async updateOrder(orderId:UUID, updates: Partial<OrderInput>){
        const { data: order, error } = await supabase.from("orders").update(updates).eq("id", orderId).select("*").single();
        if (error) throw error;
        return order;
    }
}

export default OrderDatabase;
