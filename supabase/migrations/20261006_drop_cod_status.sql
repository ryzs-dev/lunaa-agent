-- The COD list was removed. Orders stay; only the colour tags go.

DROP INDEX IF EXISTS orders_cod_status_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_status;
ALTER TABLE orders DROP COLUMN IF EXISTS cod_collected_at;
DELETE FROM sheet_row_issues WHERE platform = 'cod';
