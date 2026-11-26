-- Orders can now be sold on Messenger and Instagram as well as WhatsApp
-- (orders.source is free text with default 'whatsapp', so the column itself
-- needs no change). The sales report's "message order" figures and the
-- dashboard's chat sales counted source = 'whatsapp' only, which would leave
-- Messenger and Instagram orders in the totals but out of those figures.
-- Both now count every order that isn't from a marketplace.
-- Function bodies are the live ones on 2026-11-26 with only that test changed.

CREATE OR REPLACE FUNCTION public.get_sales_report(first_day date, last_day date)
 RETURNS TABLE(day date, ad_spend numeric, messages bigint, wa_orders bigint, wa_new bigint, wa_repeat bigint, wa_sales numeric, distributor_orders bigint, distributor_sales numeric, shopee_orders bigint, lazada_orders bigint, mp_new bigint, mp_repeat bigint, mp_sales numeric, orders bigint, sales numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with days as (
    select generate_series(first_day, last_day, interval '1 day')::date as day
  ),
  o as (
    select o.id, o.customer_id, o.created_at, o.sales_day, o.total_amount,
           coalesce(o.source, 'whatsapp') as source,
           coalesce(o.is_distributor, false) as distributor,
           nullif(lower(btrim(o.buyer_name)), '') as buyer,
           o.sales_day as day
    from orders o
    where o.deleted_at is null and not coalesce(o.is_distributor, false)
      and o.sales_day >= first_day
      and o.sales_day < (last_day + 1)::date
  ),
  tagged as (
    select o.*,
           case
             when o.source in ('shopee', 'lazada') then
               o.buyer is not null and exists (
                 select 1 from orders p
                 where p.deleted_at is null and not coalesce(p.is_distributor, false)
                   and p.source in ('shopee', 'lazada')
                   and lower(btrim(p.buyer_name)) = o.buyer
                   and (p.sales_day, p.created_at, p.id) < (o.sales_day, o.created_at, o.id))
             else
               o.customer_id is not null and exists (
                 select 1 from orders p
                 where p.deleted_at is null and not coalesce(p.is_distributor, false)
                   and p.customer_id = o.customer_id
                   and (p.sales_day, p.created_at, p.id) < (o.sales_day, o.created_at, o.id))
           end as repeat
    from o
    where o.day between first_day and last_day
  ),
  by_day as (
    select day,
      count(*) filter (where source not in ('shopee', 'lazada') and not distributor) as wa_orders,
      count(*) filter (where source not in ('shopee', 'lazada') and not distributor and not repeat) as wa_new,
      count(*) filter (where source not in ('shopee', 'lazada') and not distributor and repeat) as wa_repeat,
      coalesce(sum(total_amount) filter (where source not in ('shopee', 'lazada') and not distributor), 0) as wa_sales,
      count(*) filter (where source not in ('shopee', 'lazada') and distributor) as distributor_orders,
      coalesce(sum(total_amount) filter (where source not in ('shopee', 'lazada') and distributor), 0) as distributor_sales,
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_sales_by_day(first_day date, last_day date)
 RETURNS TABLE(day date, orders bigint, revenue numeric, chat_orders bigint, chat_revenue numeric, new_customers bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with days as (
    select generate_series(first_day, last_day, interval '1 day')::date as day
  ),
  period as (
    select o.customer_id, o.total_amount,
           (not coalesce(o.is_distributor, false) and coalesce(o.source, 'whatsapp') not in ('shopee', 'lazada')) as chat,
           o.sales_day as day
    from orders o
    where o.deleted_at is null and not coalesce(o.is_distributor, false)
      and o.sales_day >= first_day
      and o.sales_day < (last_day + 1)::date
  ),
  first_orders as (
    select o.customer_id,
           min(o.sales_day) as day
    from orders o
    where o.deleted_at is null and not coalesce(o.is_distributor, false)
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
$function$
;
