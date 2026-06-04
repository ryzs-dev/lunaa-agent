"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastDB = void 0;
const supabase_1 = require("../supabase");
class BroadcastDB {
    async createBroadcast(broadcastData) {
        const { name, template_id, template_name, status, segment_id, scheduled_at, } = broadcastData;
        const { data: broadcast, error: broadcastError } = await supabase_1.supabase
            .from('broadcasts')
            .insert({
            name,
            template_name,
            template_id,
            segment_id,
            status,
            scheduled_at,
        })
            .select()
            .single();
        if (broadcastError || !broadcast) {
            throw new Error((broadcastError === null || broadcastError === void 0 ? void 0 : broadcastError.message) || 'Failed to create broadcast');
        }
        return broadcast;
    }
    async getBroadcasts() {
        const { data, error } = await supabase_1.supabase.from('broadcasts').select('*');
        if (error) {
            throw new Error(`Failed to fetch broadcasts: ${error.message}`);
        }
        return data;
    }
    async getBroadcastById(broadcastId) {
        const { data, error } = await supabase_1.supabase
            .from('broadcasts')
            .select(`
    *,
    segment:segments (
      id,
      name,

      members:segment_members (
        user_id:customers(
          name,
          phone_number
        )
      )
    )
  `)
            .eq('id', broadcastId)
            .single();
        if (error) {
            throw new Error(`Failed to fetch broadcast: ${error.message}`);
        }
        return data;
    }
    async deleteBroadcastById(broadcastId) {
        const { data, error } = await supabase_1.supabase
            .from('broadcasts')
            .delete()
            .eq('id', broadcastId)
            .single();
        if (error) {
            throw new Error(`Failed to fetch broadcast: ${error.message}`);
        }
        return data;
    }
}
exports.BroadcastDB = BroadcastDB;
