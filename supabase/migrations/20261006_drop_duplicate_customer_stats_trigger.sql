-- trg_update_customer_after_order incremented the customer's order count on
-- every insert. orders_sync_customer_stats already recounts from the orders
-- table, and it runs first, so the old trigger added the new order a second
-- time. A customer's first order was stored as two and they were marked
-- returning.

DROP TRIGGER IF EXISTS trg_update_customer_after_order ON public.orders;
DROP FUNCTION IF EXISTS public.update_customer_after_order();

SELECT recalculate_customer_order_stats(id) FROM customers;
