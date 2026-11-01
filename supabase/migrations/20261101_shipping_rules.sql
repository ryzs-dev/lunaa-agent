-- Courier rules on top of the Parcel Daily defaults (the primary courier,
-- handover and parcel weight stay in Parcel Daily's own settings):
--   fallback_courier: tried once when booking with the chosen courier fails;
--   cod_courier: used for cash-on-delivery orders, which also collect the
--   order total. Null means "use the primary courier".

CREATE TABLE IF NOT EXISTS shipping_rules (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fallback_courier text,
  cod_courier text,
  -- Staff mark COD by writing "COD" after the customer's name ("Irene COD").
  detect_cod boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO shipping_rules (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE shipping_rules ENABLE ROW LEVEL SECURITY;
