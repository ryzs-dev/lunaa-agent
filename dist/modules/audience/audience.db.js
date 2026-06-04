"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudienceDB = void 0;
const supabase_1 = require("../supabase");
class AudienceDB {
    async createSegment(segmentData) {
        var _a, _b;
        const { data, error } = await supabase_1.supabase
            .from('segments')
            .insert({
            name: segmentData.name,
            description: (_a = segmentData.description) !== null && _a !== void 0 ? _a : null,
            created_by: (_b = segmentData.created_by) !== null && _b !== void 0 ? _b : null,
        })
            .select()
            .single();
        if (error) {
            throw new Error(`Failed to create segment: ${error.message}`);
        }
        return data;
    }
    async addSegmentMembers(segmentId, userIds) {
        if (!userIds || userIds.length === 0) {
            throw new Error('user_ids cannot be empty');
        }
        const rows = userIds.map((userId) => ({
            segment_id: segmentId,
            user_id: userId,
        }));
        const { data, error } = await supabase_1.supabase
            .from('segment_members')
            .insert(rows)
            .select();
        if (error) {
            throw new Error(`Failed to add segment members: ${error.message}`);
        }
        return data;
    }
    async getSegments() {
        const { data, error } = await supabase_1.supabase.from('segments').select(`
    *,
    segment_members(count)
  `);
        if (error) {
            throw new Error(`Failed to fetch segments: ${error.message}`);
        }
        return data;
    }
    async getSegmentMembers(segmentId) {
        const { data, error } = await supabase_1.supabase
            .from('segment_members')
            .select(`
      user_id,
      customers (
        id,
        name,
        phone_number,
        email,
        created_at
      )
    `)
            .eq('segment_id', segmentId);
        if (error) {
            throw new Error(`Failed to fetch segment members: ${error.message}`);
        }
        return data.map((row) => row.customers);
    }
    async deleteSegment(segmentId) {
        const { data, error } = await supabase_1.supabase
            .from('segments')
            .delete()
            .eq('id', segmentId)
            .single();
        if (error) {
            throw new Error(`Failed to delete segment: ${error.message}`);
        }
        return data;
    }
    async removeCustomerFromSegment(segmentId, userId) {
        const { error } = await supabase_1.supabase
            .from('segment_members')
            .delete()
            .eq('segment_id', segmentId)
            .eq('user_id', userId);
        if (error) {
            throw new Error(error.message);
        }
        return true;
    }
}
exports.AudienceDB = AudienceDB;
