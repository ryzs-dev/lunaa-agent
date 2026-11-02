-- More than one ad account. The main account (meta_ads_settings.ad_account_id)
-- is still the one orders are sent for; extra_accounts are also synced so the
-- Ads page can show them. Each insights row says which account it came from
-- and in what currency; sales figures only add up spend in the main account's
-- currency, so a USD account never gets summed into ringgit.
alter table public.meta_ads_settings
  add column if not exists extra_accounts jsonb not null default '[]'::jsonb;

alter table public.meta_ad_insights
  add column if not exists ad_account_id text,
  add column if not exists currency text;

update public.meta_ad_insights i
set ad_account_id = s.ad_account_id, currency = s.currency
from public.meta_ads_settings s
where s.id = 1 and i.ad_account_id is null;

create index if not exists meta_ad_insights_account_date on public.meta_ad_insights (ad_account_id, date);

create or replace function public.get_daily_breakdown(month_start date)
returns table(
  day date,
  orders bigint,
  revenue numeric,
  new_customers bigint,
  returning_customers bigint,
  returning_revenue numeric,
  returns bigint,
  returned_value numeric,
  ad_spend numeric
)
language sql
stable
as $$
  with days as (
    select generate_series(month_start, (month_start + interval '1 month')::date - 1, interval '1 day')::date as day
  ),
  month_orders as (
    select o.customer_id, o.total_amount,
           (o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day
    from orders o
    where o.deleted_at is null
      and o.created_at >= (month_start::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 day'
      and o.created_at < ((month_start + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur') + interval '1 day'
  ),
  first_orders as (
    select o.customer_id,
           min((o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date) as day
    from orders o
    where o.deleted_at is null
    group by o.customer_id
  ),
  day_orders as (
    select day, count(*) as orders, coalesce(sum(total_amount), 0) as revenue from month_orders group by day
  ),
  day_new as (
    select day, count(*) as new_customers from first_orders group by day
  ),
  day_returning as (
    select m.day, count(distinct m.customer_id) as returning_customers, coalesce(sum(m.total_amount), 0) as returning_revenue
    from month_orders m
    join first_orders f on f.customer_id = m.customer_id
    where f.day < m.day
    group by m.day
  ),
  day_returns as (
    select (t.updated_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day,
           count(distinct t.order_id) as returns,
           coalesce(sum(o.total_amount), 0) as returned_value
    from order_tracking t
    join orders o on o.id = t.order_id and o.deleted_at is null
    where lower(t.status) like 'return%'
    group by 1
  ),
  day_ads as (
    select date as day, sum(spend) as ad_spend
    from meta_ad_insights
    where date >= month_start and date < (month_start + interval '1 month')::date
      and currency is not distinct from (select currency from meta_ads_settings where id = 1)
    group by date
  )
  select d.day,
         coalesce(o.orders, 0)::bigint,
         coalesce(o.revenue, 0),
         coalesce(n.new_customers, 0)::bigint,
         coalesce(rc.returning_customers, 0)::bigint,
         coalesce(rc.returning_revenue, 0),
         coalesce(r.returns, 0)::bigint,
         coalesce(r.returned_value, 0),
         a.ad_spend
  from days d
  left join day_orders o on o.day = d.day
  left join day_new n on n.day = d.day
  left join day_returning rc on rc.day = d.day
  left join day_returns r on r.day = d.day
  left join day_ads a on a.day = d.day
  order by d.day;
$$;
