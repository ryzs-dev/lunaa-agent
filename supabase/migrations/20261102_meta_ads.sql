-- Meta ads: one connected ad account, its daily numbers per campaign, and the
-- orders sent back to Meta so Ads Manager can attribute sales to campaigns.

create table if not exists public.meta_ads_settings (
  id int primary key default 1 check (id = 1),
  ad_account_id text,
  account_name text,
  currency text,
  timezone text,
  token_encrypted text,
  token_hint text,
  dataset_id text,
  send_conversions boolean not null default false,
  conversions_since timestamptz,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now()
);
insert into public.meta_ads_settings (id) values (1) on conflict do nothing;

create table if not exists public.meta_ad_insights (
  date date not null,
  campaign_id text not null,
  campaign_name text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  conversations bigint not null default 0,
  purchases numeric not null default 0,
  purchase_value numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, campaign_id)
);

create table if not exists public.meta_conversion_events (
  order_id uuid primary key references public.orders(id) on delete cascade,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now()
);

alter table public.meta_ads_settings enable row level security;
alter table public.meta_ad_insights enable row level security;
alter table public.meta_conversion_events enable row level security;

-- The daily breakdown gains ad spend (the ad account's own day, which for a
-- Malaysian account is Malaysia time).
drop function if exists public.get_daily_breakdown(date);
create function public.get_daily_breakdown(month_start date)
returns table(
  day date,
  orders bigint,
  revenue numeric,
  new_customers bigint,
  returns bigint,
  returned_value numeric,
  ad_spend numeric
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
    group by date
  )
  select d.day,
         coalesce(o.orders, 0)::bigint,
         coalesce(o.revenue, 0),
         coalesce(n.new_customers, 0)::bigint,
         coalesce(r.returns, 0)::bigint,
         coalesce(r.returned_value, 0),
         a.ad_spend
  from days d
  left join day_orders o on o.day = d.day
  left join day_new n on n.day = d.day
  left join day_returns r on r.day = d.day
  left join day_ads a on a.day = d.day
  order by d.day;
$$;
