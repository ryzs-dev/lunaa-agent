-- One row per day of the month (Malaysia time): orders and revenue by when the
-- order was created, new customers on the day of their first order, and parcels
-- the courier marked returned on that day, with the value of those orders.
create or replace function public.get_daily_breakdown(month_start date)
returns table(
  day date,
  orders bigint,
  revenue numeric,
  new_customers bigint,
  returns bigint,
  returned_value numeric
)
language sql
stable
as $$
  with days as (
    select generate_series(
      month_start,
      (month_start + interval '1 month')::date - 1,
      interval '1 day'
    )::date as day
  ),
  day_orders as (
    select (o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day,
           count(*) as orders,
           coalesce(sum(o.total_amount), 0) as revenue
    from orders o
    where o.deleted_at is null
      and o.created_at >= (month_start::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 day'
      and o.created_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur') + interval '1 day'
    group by 1
  ),
  first_orders as (
    select min((o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date) as day
    from orders o
    where o.deleted_at is null
    group by o.customer_id
  ),
  day_new as (
    select day, count(*) as new_customers from first_orders group by day
  ),
  day_returns as (
    select (t.updated_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day,
           count(distinct t.order_id) as returns,
           coalesce(sum(distinct_orders.total_amount), 0) as returned_value
    from order_tracking t
    join lateral (
      select o.total_amount from orders o where o.id = t.order_id and o.deleted_at is null
    ) distinct_orders on true
    where lower(t.status) like 'return%'
    group by 1
  )
  select d.day,
         coalesce(o.orders, 0)::bigint,
         coalesce(o.revenue, 0),
         coalesce(n.new_customers, 0)::bigint,
         coalesce(r.returns, 0)::bigint,
         coalesce(r.returned_value, 0)
  from days d
  left join day_orders o on o.day = d.day
  left join day_new n on n.day = d.day
  left join day_returns r on r.day = d.day
  order by d.day;
$$;
