-- Autopilot: a daily run that ships new WhatsApp orders through Parcel Daily
-- and sends customers their tracking numbers. Staff manage it from the CRM:
-- every setting below is editable there, and any order can be held back.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS autopilot_hold boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS autopilot_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  ship_enabled boolean NOT NULL DEFAULT true,
  ship_time text NOT NULL DEFAULT '14:00' CHECK (ship_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ship_mode text NOT NULL DEFAULT 'review' CHECK (ship_mode IN ('review', 'auto')),
  tracking_enabled boolean NOT NULL DEFAULT true,
  tracking_time text NOT NULL DEFAULT '18:00' CHECK (tracking_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  tracking_mode text NOT NULL DEFAULT 'review' CHECK (tracking_mode IN ('review', 'auto')),
  include_distributors boolean NOT NULL DEFAULT false,
  -- Only orders this recent are picked up, so switching Autopilot on never
  -- works through an old backlog.
  lookback_days integer NOT NULL DEFAULT 3 CHECK (lookback_days BETWEEN 1 AND 30),
  max_orders_per_run integer NOT NULL DEFAULT 50 CHECK (max_orders_per_run BETWEEN 1 AND 500),
  min_credit numeric NOT NULL DEFAULT 50 CHECK (min_credit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO autopilot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS autopilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step text NOT NULL CHECK (step IN ('ship', 'tracking')),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  status text NOT NULL CHECK (status IN ('awaiting_approval', 'running', 'completed', 'failed', 'dismissed')),
  -- The Malaysia calendar day the run belongs to.
  run_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  finished_at timestamptz
);

-- A scheduled step runs at most once per day.
CREATE UNIQUE INDEX IF NOT EXISTS autopilot_runs_one_scheduled_per_day
  ON autopilot_runs (step, run_date)
  WHERE trigger = 'schedule';

CREATE INDEX IF NOT EXISTS autopilot_runs_recent ON autopilot_runs (created_at DESC);
