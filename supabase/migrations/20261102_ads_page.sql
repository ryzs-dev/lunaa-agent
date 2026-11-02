-- Sales per day for the Ads page, Malaysia days. "Chat" sales are the ones
-- ads can bring in: WhatsApp orders that aren't distributor orders. Shopee,
-- Lazada and distributor orders count only in the overall figures.
create or replace function public.get_sales_by_day(first_day date, last_day date)
returns table(
  day date,
  orders bigint,
  revenue numeric,
  chat_orders bigint,
  chat_revenue numeric,
  new_customers bigint
)
language sql
stable
as $$
  with days as (
    select generate_series(first_day, last_day, interval '1 day')::date as day
  ),
  period as (
    select o.customer_id, o.total_amount,
           (not coalesce(o.is_distributor, false) and coalesce(o.source, 'whatsapp') = 'whatsapp') as chat,
           (o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day
    from orders o
    where o.deleted_at is null
      and o.created_at >= (first_day::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 day'
      and o.created_at < ((last_day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') + interval '1 day'
  ),
  first_orders as (
    select o.customer_id,
           min((o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date) as day
    from orders o
    where o.deleted_at is null
    group by o.customer_id
  ),
  by_day as (
    select day,
           count(*) as orders,
           coalesce(sum(total_amount), 0) as revenue,
           count(*) filter (where chat) as chat_orders,
           coalesce(sum(total_amount) filter (where chat), 0) as chat_revenue
    from period
    group by day
  ),
  new_by_day as (
    select day, count(*) as new_customers
    from first_orders
    where day between first_day and last_day
    group by day
  )
  select d.day,
         coalesce(b.orders, 0)::bigint,
         coalesce(b.revenue, 0),
         coalesce(b.chat_orders, 0)::bigint,
         coalesce(b.chat_revenue, 0),
         coalesce(n.new_customers, 0)::bigint
  from days d
  left join by_day b on b.day = d.day
  left join new_by_day n on n.day = d.day
  order by d.day;
$$;
