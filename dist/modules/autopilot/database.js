"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
const SETTING_FIELDS = [
    'enabled',
    'ship_enabled',
    'ship_time',
    'ship_mode',
    'tracking_enabled',
    'tracking_time',
    'tracking_mode',
    'include_distributors',
    'lookback_days',
    'max_orders_per_run',
    'min_credit',
    'updated_by',
];
const sinceDays = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
class AutopilotDatabase {
    async getSettings() {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_settings')
            .select('*')
            .eq('id', 1)
            .single();
        if (error)
            throw error;
        return Object.assign(Object.assign({}, data), { min_credit: Number(data.min_credit) });
    }
    async updateSettings(input) {
        const patch = { updated_at: new Date().toISOString() };
        for (const field of SETTING_FIELDS) {
            if (input[field] !== undefined)
                patch[field] = input[field];
        }
        const { data, error } = await supabase_1.supabase
            .from('autopilot_settings')
            .update(patch)
            .eq('id', 1)
            .select('*')
            .single();
        if (error)
            throw error;
        return Object.assign(Object.assign({}, data), { min_credit: Number(data.min_credit) });
    }
    async createRun(run) {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .insert(run)
            .select('*')
            .single();
        // Another tick already created today's scheduled run.
        if ((error === null || error === void 0 ? void 0 : error.code) === '23505')
            return null;
        if (error)
            throw error;
        return data;
    }
    async updateRun(id, patch) {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    // Moves a run from one status to another only if it is still in the first,
    // so two people pressing Approve cannot both start it.
    async claimRun(id, from, patch) {
        var _a;
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .update(patch)
            .eq('id', id)
            .eq('status', from)
            .select('*');
        if (error)
            throw error;
        return (_a = data === null || data === void 0 ? void 0 : data[0]) !== null && _a !== void 0 ? _a : null;
    }
    async getRun(id) {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async listRuns(limit) {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    async activeRuns(step) {
        const { data, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .select('*')
            .eq('step', step)
            .in('status', ['awaiting_approval', 'running'])
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []);
    }
    // A run left 'running' by a restart can never finish; close it so the log is honest.
    async failInterruptedRuns() {
        const { error } = await supabase_1.supabase
            .from('autopilot_runs')
            .update({
            status: 'failed',
            error: 'Interrupted by a server restart. Check the orders, then run again.',
            finished_at: new Date().toISOString(),
        })
            .eq('status', 'running');
        if (error)
            throw error;
    }
    // Queued tracking numbers are taken out of the pending pool so a second batch
    // cannot send them again before WhatsApp confirms the first send.
    async markTrackingQueued(trackingIds) {
        if (!trackingIds.length)
            return;
        const { error } = await supabase_1.supabase
            .from('order_tracking')
            .update({ message_status: 'queued' })
            .in('id', trackingIds);
        if (error)
            throw error;
    }
    async hasScheduledRun(step, runDate) {
        const { count, error } = await supabase_1.supabase
            .from('autopilot_runs')
            .select('id', { count: 'exact', head: true })
            .eq('step', step)
            .eq('run_date', runDate)
            .eq('trigger', 'schedule');
        if (error)
            throw error;
        return (count !== null && count !== void 0 ? count : 0) > 0;
    }
    // Recent, non-marketplace orders with no shipment yet.
    async shipCandidates(lookbackDays) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount, shipment_description, source, is_distributor, autopilot_hold, created_at, customers(name, email, phone_number), addresses(full_address, city, postcode, state, country), order_tracking(id, tracking_number)')
            .is('deleted_at', null)
            .not('source', 'in', '(shopee,lazada)')
            .gte('created_at', sinceDays(lookbackDays))
            .order('created_at', { ascending: true })
            .limit(1000);
        if (error)
            throw error;
        return (data !== null && data !== void 0 ? data : []).filter((order) => {
            const tracking = order.order_tracking;
            return !tracking || tracking.length === 0;
        });
    }
    // Recent tracking numbers whose message has not gone out yet.
    async trackingCandidates(lookbackDays) {
        const { data, error } = await supabase_1.supabase
            .from('order_tracking')
            .select('id, tracking_number, courier, message_status, created_at, orders!inner(id, order_number, is_distributor, autopilot_hold, deleted_at, customers(name, phone_number))')
            .not('tracking_number', 'is', null)
            .is('last_message_sent_at', null)
            .or('message_status.is.null,message_status.eq.pending')
            .gte('created_at', sinceDays(lookbackDays))
            .order('created_at', { ascending: true })
            .limit(1000);
        if (error)
            throw error;
        return data !== null && data !== void 0 ? data : [];
    }
    async getOrderForShipping(orderId) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, total_amount, shipment_description, source, autopilot_hold, deleted_at, customers(name, email, phone_number), addresses(full_address, city, postcode, state, country), order_tracking(id, tracking_number)')
            .eq('id', orderId)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async getTrackingForSending(trackingId) {
        const { data, error } = await supabase_1.supabase
            .from('order_tracking')
            .select('id, last_message_sent_at, message_status, orders!inner(autopilot_hold, deleted_at)')
            .eq('id', trackingId)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async setHold(orderId, hold) {
        const { data, error } = await supabase_1.supabase
            .from('orders')
            .update({ autopilot_hold: hold })
            .eq('id', orderId)
            .select('id, order_number, autopilot_hold')
            .single();
        if (error)
            throw error;
        return data;
    }
}
exports.default = AutopilotDatabase;
