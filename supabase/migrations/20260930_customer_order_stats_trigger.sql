-- Keep per-customer order stats in sync with their active orders.
-- Order inserts from the WhatsApp bot, manual creation and imports previously
-- left total_purchase_count and repeat_customer stale.

CREATE OR REPLACE FUNCTION recalculate_customer_order_stats(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_count integer;
  v_amount_spent numeric;
  v_last_order_date timestamptz;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(total_amount), 0),
    MAX(COALESCE(order_date, created_at))
  INTO v_order_count, v_amount_spent, v_last_order_date
  FROM orders
  WHERE customer_id = p_customer_id
    AND deleted_at IS NULL;

  -- Separate statements so the literal adapts to repeat_customer's column type.
  IF v_order_count > 1 THEN
    UPDATE customers
    SET total_purchase_count = v_order_count,
        total_amount_spent = v_amount_spent,
        last_order_date = v_last_order_date,
        repeat_customer = 'returning'
    WHERE id = p_customer_id;
  ELSE
    UPDATE customers
    SET total_purchase_count = v_order_count,
        total_amount_spent = v_amount_spent,
        last_order_date = v_last_order_date,
        repeat_customer = 'new'
    WHERE id = p_customer_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION orders_sync_customer_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM recalculate_customer_order_stats(NEW.customer_id);
  END IF;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
    PERFORM recalculate_customer_order_stats(OLD.customer_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_customer_stats ON orders;

CREATE TRIGGER orders_sync_customer_stats
AFTER INSERT OR DELETE OR UPDATE OF customer_id, total_amount, order_date, deleted_at
ON orders
FOR EACH ROW
EXECUTE FUNCTION orders_sync_customer_stats();

-- Backfill every customer once.
SELECT recalculate_customer_order_stats(id) FROM customers;
