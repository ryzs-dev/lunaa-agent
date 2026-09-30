-- Every orders list/count embeds tracking, items and addresses per order;
-- without these, each embed scans its whole table.
create index if not exists order_tracking_order_id_idx on public.order_tracking (order_id);
create index if not exists order_tracking_status_idx on public.order_tracking (status);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_total_amount_idx on public.orders (total_amount);
create index if not exists orders_order_date_idx on public.orders (order_date);
