-- The daily sales report Lunaa used to fill in by hand (her "5m Sales
-- Report" sheet): per Malaysia day, ad spend and chats from the main Meta ad
-- account, and orders split by channel and by new versus repeat buyer.
--
-- WhatsApp: repeat when the customer has an earlier order of any kind.
-- Shopee/Lazada orders have no customer record, so repeat means an earlier
-- marketplace order under the same buyer name (history starts when the
-- marketplace sync started).

create table if not exists public.sales_targets (
  month date primary key,
  target numeric not null,
  updated_at timestamptz not null default now()
);

create or replace function public.get_sales_report(first_day date, last_day date)
returns table(
  day date,
  ad_spend numeric,
  messages bigint,
  wa_orders bigint,
  wa_new bigint,
  wa_repeat bigint,
  wa_sales numeric,
  distributor_orders bigint,
  distributor_sales numeric,
  shopee_orders bigint,
  lazada_orders bigint,
  mp_new bigint,
  mp_repeat bigint,
  mp_sales numeric,
  orders bigint,
  sales numeric
)
language sql
stable
as $$
  with days as (
    select generate_series(first_day, last_day, interval '1 day')::date as day
  ),
  o as (
    select o.id, o.customer_id, o.created_at, o.total_amount,
           coalesce(o.source, 'whatsapp') as source,
           coalesce(o.is_distributor, false) as distributor,
           nullif(lower(btrim(o.buyer_name)), '') as buyer,
           (o.created_at at time zone 'UTC' at time zone 'Asia/Kuala_Lumpur')::date as day
    from orders o
    where o.deleted_at is null
      and o.created_at >= (first_day::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 day'
      and o.created_at < ((last_day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') + interval '1 day'
  ),
  tagged as (
    select o.*,
           case
             when o.source in ('shopee', 'lazada') then
               o.buyer is not null and exists (
                 select 1 from orders p
                 where p.deleted_at is null
                   and p.source in ('shopee', 'lazada')
                   and lower(btrim(p.buyer_name)) = o.buyer
                   and (p.created_at, p.id) < (o.created_at, o.id))
             else
               o.customer_id is not null and exists (
                 select 1 from orders p
                 where p.deleted_at is null
                   and p.customer_id = o.customer_id
                   and (p.created_at, p.id) < (o.created_at, o.id))
           end as repeat
    from o
    where o.day between first_day and last_day
  ),
  by_day as (
    select day,
      count(*) filter (where source = 'whatsapp' and not distributor) as wa_orders,
      count(*) filter (where source = 'whatsapp' and not distributor and not repeat) as wa_new,
      count(*) filter (where source = 'whatsapp' and not distributor and repeat) as wa_repeat,
      coalesce(sum(total_amount) filter (where source = 'whatsapp' and not distributor), 0) as wa_sales,
      count(*) filter (where source = 'whatsapp' and distributor) as distributor_orders,
      coalesce(sum(total_amount) filter (where source = 'whatsapp' and distributor), 0) as distributor_sales,
      count(*) filter (where source = 'shopee') as shopee_orders,
      count(*) filter (where source = 'lazada') as lazada_orders,
      count(*) filter (where source in ('shopee', 'lazada') and not repeat) as mp_new,
      count(*) filter (where source in ('shopee', 'lazada') and repeat) as mp_repeat,
      coalesce(sum(total_amount) filter (where source in ('shopee', 'lazada')), 0) as mp_sales,
      count(*) as orders,
      coalesce(sum(total_amount), 0) as sales
    from tagged
    group by day
  ),
  ads as (
    select i.date as day, sum(i.spend) as spend, sum(i.conversations) as messages
    from meta_ad_insights i
    where i.date between first_day and last_day
      and i.ad_account_id is not distinct from (select ad_account_id from meta_ads_settings where id = 1)
    group by i.date
  )
  select d.day,
         coalesce(a.spend, 0),
         coalesce(a.messages, 0)::bigint,
         coalesce(b.wa_orders, 0)::bigint,
         coalesce(b.wa_new, 0)::bigint,
         coalesce(b.wa_repeat, 0)::bigint,
         coalesce(b.wa_sales, 0),
         coalesce(b.distributor_orders, 0)::bigint,
         coalesce(b.distributor_sales, 0),
         coalesce(b.shopee_orders, 0)::bigint,
         coalesce(b.lazada_orders, 0)::bigint,
         coalesce(b.mp_new, 0)::bigint,
         coalesce(b.mp_repeat, 0)::bigint,
         coalesce(b.mp_sales, 0),
         coalesce(b.orders, 0)::bigint,
         coalesce(b.sales, 0)
  from days d
  left join by_day b on b.day = d.day
  left join ads a on a.day = d.day
  order by d.day;
$$;
