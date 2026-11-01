import { supabase } from '../supabase';
import {
  AutopilotRun,
  AutopilotSettings,
  AutopilotSettingsInput,
  AutopilotStep,
  AutopilotTrigger,
  RunItem,
  RunStatus,
} from './types';

const SETTING_FIELDS: (keyof AutopilotSettingsInput)[] = [
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

const sinceDays = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

class AutopilotDatabase {
  async getSettings(): Promise<AutopilotSettings> {
    const { data, error } = await supabase
      .from('autopilot_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return { ...data, min_credit: Number(data.min_credit) };
  }

  async updateSettings(input: AutopilotSettingsInput) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of SETTING_FIELDS) {
      if (input[field] !== undefined) patch[field] = input[field];
    }
    const { data, error } = await supabase
      .from('autopilot_settings')
      .update(patch)
      .eq('id', 1)
      .select('*')
      .single();
    if (error) throw error;
    return { ...data, min_credit: Number(data.min_credit) } as AutopilotSettings;
  }

  async createRun(run: {
    step: AutopilotStep;
    trigger: AutopilotTrigger;
    status: RunStatus;
    run_date: string;
    items: RunItem[];
    summary: Record<string, number | string>;
  }): Promise<AutopilotRun | null> {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .insert(run)
      .select('*')
      .single();
    // Another tick already created today's scheduled run.
    if (error?.code === '23505') return null;
    if (error) throw error;
    return data;
  }

  async updateRun(id: string, patch: Partial<AutopilotRun>) {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as AutopilotRun;
  }

  // Moves a run from one status to another only if it is still in the first,
  // so two people pressing Approve cannot both start it.
  async claimRun(id: string, from: RunStatus, patch: Partial<AutopilotRun>) {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .update(patch)
      .eq('id', id)
      .eq('status', from)
      .select('*');
    if (error) throw error;
    return (data?.[0] as AutopilotRun | undefined) ?? null;
  }

  async getRun(id: string) {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as AutopilotRun | null;
  }

  async listRuns(limit: number) {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AutopilotRun[];
  }

  async activeRuns(step: AutopilotStep) {
    const { data, error } = await supabase
      .from('autopilot_runs')
      .select('*')
      .eq('step', step)
      .in('status', ['awaiting_approval', 'running'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AutopilotRun[];
  }

  // A run left 'running' by a restart can never finish; close it so the log is honest.
  async failInterruptedRuns() {
    const { error } = await supabase
      .from('autopilot_runs')
      .update({
        status: 'failed',
        error: 'Interrupted by a server restart. Check the orders, then run again.',
        finished_at: new Date().toISOString(),
      })
      .eq('status', 'running');
    if (error) throw error;
  }

  // Queued tracking numbers are taken out of the pending pool so a second batch
  // cannot send them again before WhatsApp confirms the first send.
  async markTrackingQueued(trackingIds: string[]) {
    if (!trackingIds.length) return;
    const { error } = await supabase
      .from('order_tracking')
      .update({ message_status: 'queued' })
      .in('id', trackingIds);
    if (error) throw error;
  }

  async hasScheduledRun(step: AutopilotStep, runDate: string) {
    const { count, error } = await supabase
      .from('autopilot_runs')
      .select('id', { count: 'exact', head: true })
      .eq('step', step)
      .eq('run_date', runDate)
      .eq('trigger', 'schedule');
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  // Recent, non-marketplace orders with no shipment yet.
  async shipCandidates(lookbackDays: number) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, total_amount, payment_method, shipment_description, source, is_distributor, autopilot_hold, created_at, customers(name, email, phone_number), addresses(full_address, city, postcode, state, country), order_tracking(id, tracking_number)'
      )
      .is('deleted_at', null)
      .not('source', 'in', '(shopee,lazada)')
      .gte('created_at', sinceDays(lookbackDays))
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    return (data ?? []).filter((order) => {
      const tracking = order.order_tracking as unknown as unknown[] | null;
      return !tracking || tracking.length === 0;
    });
  }

  // Recent tracking numbers whose message has not gone out yet.
  async trackingCandidates(lookbackDays: number) {
    const { data, error } = await supabase
      .from('order_tracking')
      .select(
        'id, tracking_number, courier, message_status, created_at, orders!inner(id, order_number, is_distributor, autopilot_hold, deleted_at, customers(name, phone_number))'
      )
      .not('tracking_number', 'is', null)
      .is('last_message_sent_at', null)
      .or('message_status.is.null,message_status.eq.pending')
      .gte('created_at', sinceDays(lookbackDays))
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  }

  async getOrderForShipping(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, total_amount, payment_method, shipment_description, source, autopilot_hold, deleted_at, customers(name, email, phone_number), addresses(full_address, city, postcode, state, country), order_tracking(id, tracking_number)'
      )
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getTrackingForSending(trackingId: string) {
    const { data, error } = await supabase
      .from('order_tracking')
      .select('id, last_message_sent_at, message_status, orders!inner(autopilot_hold, deleted_at)')
      .eq('id', trackingId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async setHold(orderId: string, hold: boolean) {
    const { data, error } = await supabase
      .from('orders')
      .update({ autopilot_hold: hold })
      .eq('id', orderId)
      .select('id, order_number, autopilot_hold')
      .single();
    if (error) throw error;
    return data;
  }
}

export default AutopilotDatabase;
