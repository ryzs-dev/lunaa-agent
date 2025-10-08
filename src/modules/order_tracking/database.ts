import { UUID } from "crypto";
import { supabase } from "../supabase";
import { OrderTrackingInput } from "./types";

class OrderTrackingDatabase {
    async addTrackingEntry(entry: OrderTrackingInput, orderId: UUID) {
        const { data: record, error } = await supabase.from("order_tracking").insert({
            ...entry,
            order_id: orderId
        }).select("*").single();
        if (error) throw error;
        return record;
    }

    async getTrackingEntryById(entryId: string) {
        const { data: record, error } = await supabase.from("order_tracking").select("*").eq("id", entryId).single();
        if (error) throw error;
        return record;
    }

    async getTrackingEntriesByOrderId(orderId: string) {
        const { data: records, error } = await supabase.from("order_tracking").select("*").eq("order_id", orderId);
        if (error) throw error;
        return records;
    }

    async updateTrackingEntry(entryId: string, updates: Partial<OrderTrackingInput>) {
        const { data: record, error } = await supabase.from("order_tracking").update(updates).eq("id", entryId).select("*").single();
        if (error) throw error;
        return record;
    }

    async deleteTrackingEntry(entryId: UUID) {
        const { data: record, error } = await supabase.from("order_tracking").delete().eq("id", entryId).single();
        if (error) throw error;
        return record;
    }
}

export default OrderTrackingDatabase;