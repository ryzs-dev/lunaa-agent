-- Settings for reading receipts with Claude, edited from the CRM's Settings page.
-- The Anthropic key is stored encrypted (AES-256-GCM, key in the server's
-- RECEIPTS_SECRET) and never returned to the browser; only a short hint is.

CREATE TABLE IF NOT EXISTS receipt_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  api_key_encrypted text,
  api_key_hint text,
  model text NOT NULL DEFAULT 'claude-opus-5-5'
    CHECK (model IN ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
  -- Reading pauses for the rest of the month once this much has been spent.
  monthly_cap_usd numeric NOT NULL DEFAULT 15 CHECK (monthly_cap_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO receipt_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- What each read actually cost, from the API's usage figures.
ALTER TABLE order_receipts ADD COLUMN IF NOT EXISTS read_model text;
ALTER TABLE order_receipts ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE order_receipts ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE order_receipts ADD COLUMN IF NOT EXISTS cost_usd numeric;

-- Only the backend (service role) reads or writes these tables; with row-level
-- security on and no policies, the public browser key gets nothing.
ALTER TABLE receipt_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
