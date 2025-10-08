"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class OrderTrackingDatabase {
    async addTrackingEntry(entry, orderId) {
        const { data: record, error } = await supabase_1.supabase.from("order_tracking").insert(Object.assign(Object.assign({}, entry), { order_id: orderId })).select("*").single();
        if (error)
            throw error;
        return record;
    }
    async getTrackingEntryById(entryId) {
        const { data: record, error } = await supabase_1.supabase.from("order_tracking").select("*").eq("id", entryId).single();
        if (error)
            throw error;
        return record;
    }
    async getTrackingEntriesByOrderId(orderId) {
        const { data: records, error } = await supabase_1.supabase.from("order_tracking").select("*").eq("order_id", orderId);
        if (error)
            throw error;
        return records;
    }
    async updateTrackingEntry(entryId, updates) {
        const { data: record, error } = await supabase_1.supabase.from("order_tracking").update(updates).eq("id", entryId).select("*").single();
        if (error)
            throw error;
        return record;
    }
    async deleteTrackingEntry(entryId) {
        const { data: record, error } = await supabase_1.supabase.from("order_tracking").delete().eq("id", entryId).single();
        if (error)
            throw error;
        return record;
    }
}
exports.default = OrderTrackingDatabase;
