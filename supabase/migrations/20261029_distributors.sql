-- Distributors: phone numbers whose orders are tracked separately from customer orders.
-- Orders placed for a distributor's phone number are flagged with is_distributor
-- and shown in the CRM Distributors tab instead of Orders.

CREATE TABLE IF NOT EXISTS distributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone_number text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_distributor boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_distributor
  ON orders (is_distributor, created_at)
  WHERE deleted_at IS NULL;
