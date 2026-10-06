-- COD state and who took the order, copied from the monthly order sheet.
-- cod_collected_at stops a later sync from turning a collected order red again.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_name text;

CREATE INDEX IF NOT EXISTS orders_cod_status_idx ON orders (cod_status) WHERE cod_status IS NOT NULL;

-- Marketplace rows the sheet sync could not read, and COD rows with no CRM order.
CREATE TABLE IF NOT EXISTS sheet_row_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab text NOT NULL,
  row_number integer NOT NULL,
  platform text,
  buyer_name text,
  reason text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sheet_row_issues_tab_idx ON sheet_row_issues (tab, row_number);
