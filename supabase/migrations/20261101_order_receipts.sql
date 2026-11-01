-- Payment receipts staff send on WhatsApp with each order. The image is kept
-- in the private "receipts" storage bucket; Claude reads the amount, date and
-- reference off it and the CRM flags receipts that don't match the order total.

-- Which staff phone sent a WhatsApp order, so a receipt sent on its own can be
-- matched to that person's latest order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_phone text;

CREATE TABLE IF NOT EXISTS order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null until matched to an order ("Receipts to match" in the CRM).
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  wamid text NOT NULL UNIQUE,
  sender_phone text,
  caption text,
  storage_path text,
  mime_type text,
  received_at timestamptz NOT NULL DEFAULT now(),
  -- not_checked: no AI key set; pending: being read; match / mismatch /
  -- unreadable: result; error: the read failed and can be retried.
  check_status text NOT NULL DEFAULT 'pending'
    CHECK (check_status IN ('pending', 'match', 'mismatch', 'unreadable', 'not_checked', 'error')),
  amount numeric,
  currency text,
  paid_on date,
  reference text,
  bank text,
  payer text,
  check_note text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_receipts_order ON order_receipts (order_id);
CREATE INDEX IF NOT EXISTS order_receipts_unmatched ON order_receipts (received_at DESC) WHERE order_id IS NULL;
CREATE INDEX IF NOT EXISTS orders_created_by_phone ON orders (created_by_phone, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;
