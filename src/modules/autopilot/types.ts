export type AutopilotStep = 'ship' | 'tracking';
export type AutopilotMode = 'review' | 'auto';
export type AutopilotTrigger = 'schedule' | 'manual';

export interface AutopilotSettings {
  enabled: boolean;
  ship_enabled: boolean;
  ship_time: string; // HH:MM, Malaysia time
  ship_mode: AutopilotMode;
  tracking_enabled: boolean;
  tracking_time: string;
  tracking_mode: AutopilotMode;
  include_distributors: boolean;
  lookback_days: number;
  max_orders_per_run: number;
  min_credit: number;
  updated_at: string;
  updated_by: string | null;
}

export type AutopilotSettingsInput = Partial<
  Omit<AutopilotSettings, 'updated_at'>
>;

export type RunStatus =
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'dismissed';

// ready → shipped/queued/skipped/failed once the run executes.
export type ItemState =
  | 'ready'
  | 'needs_attention'
  | 'on_hold'
  | 'over_limit'
  | 'shipped'
  | 'queued'
  | 'skipped'
  | 'failed';

export interface RunItem {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  phone: string | null;
  amount?: number;
  order_tracking_id?: string;
  tracking_number?: string | null;
  courier?: string | null;
  state: ItemState;
  reason?: string;
}

export interface AutopilotRun {
  id: string;
  step: AutopilotStep;
  trigger: AutopilotTrigger;
  status: RunStatus;
  run_date: string;
  items: RunItem[];
  summary: Record<string, number | string>;
  error: string | null;
  approved_by: string | null;
  created_at: string;
  approved_at: string | null;
  finished_at: string | null;
}
