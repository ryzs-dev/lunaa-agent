-- Count every order on the day it was ordered, not the day staff typed it in.
-- Staff often enter orders a day or two late with the real order date; that
-- date is used unless it's clearly a typo (more than a week before entry, or
-- after the next day), in which case the entry day is used.
alter table orders add column if not exists sales_day date generated always as (
  case when order_date is not null
    and order_date <= ((created_at at time zone 'UTC') at time zone 'Asia/Kuala_Lumpur')::date + 1
    and order_date >= ((created_at at time zone 'UTC') at time zone 'Asia/Kuala_Lumpur')::date - 7
  then order_date
  else ((created_at at time zone 'UTC') at time zone 'Asia/Kuala_Lumpur')::date end
) stored;
create index if not exists orders_sales_day_idx on orders (sales_day) where deleted_at is null;

CREATE OR REPLACE FUNCTION public.get_customer_acquisition_6_months(month_start date)
 RETURNS TABLE(month text, new_customers bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH month_series AS (
    SELECT generate_series(
      (month_start - interval '5 months')::date,
      month_start,
      interval '1 month'
    )::date AS month_start
  ),
  first_orders AS (
    SELECT
      o.customer_id,
      MIN(o.sales_day) AS first_order_date
    FROM orders o
    WHERE o.deleted_at IS NULL
    GROUP BY o.customer_id
  )
  SELECT
    to_char(ms.month_start, 'Mon YYYY') AS month,
    COUNT(*) FILTER (
      WHERE fo.first_order_date >= ms.month_start
        AND fo.first_order_date < (ms.month_start + interval '1 month')::date
    )::bigint AS new_customers
  FROM month_series ms
  CROSS JOIN first_orders fo
  GROUP BY ms.month_start
  ORDER BY ms.month_start;
$function$

;

CREATE OR REPLACE FUNCTION public.get_customer_mix(first_day date, last_day date)
 RETURNS TABLE(customers bigint, new_customers bigint, returning_customers bigint, returning_orders bigint, returning_revenue numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with period as (
    select o.customer_id, o.total_amount
    from orders o
    where o.deleted_at is null
      and o.sales_day >= first_day
      and o.sales_day < (last_day + 1)::date
  ),
  earlier as (
    select distinct o.customer_id
    from orders o
    where o.deleted_at is null
      and o.sales_day < first_day
      and o.customer_id in (select customer_id from period)
  )
  select count(distinct p.customer_id),
         count(distinct p.customer_id) filter (where e.customer_id is null),
         count(distinct p.customer_id) filter (where e.customer_id is not null),
         count(*) filter (where e.customer_id is not null),
         coalesce(sum(p.total_amount) filter (where e.customer_id is not null), 0)
  from period p
  left join earlier e on e.customer_id = p.customer_id;
$function$

;

CREATE OR REPLACE FUNCTION public.get_daily_breakdown(month_start date)
 RETURNS TABLE(day date, orders bigint, revenue numeric, new_customers bigint, returning_customers bigint, returning_revenue numeric, returns bigint, returned_value numeric, ad_spend numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with days as (
    select generate_series(month_start, (month_start + interval '1 month')::date - 1, interval '1 day')::date as day
  ),
  month_orders as (
    select o.customer_id, o.total_amount,
           o.sales_day as day
    from orders o
    where o.deleted_at is null
      and o.sales_day >= month_start
      and o.sales_day < (month_start + interval '1 month')::date
  ),
  first_orders as (
    select o.customer_id,
           min(o.sales_day) as day
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
      and ad_account_id is not distinct from (select ad_account_id from meta_ads_settings where id = 1)
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
$function$

;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(month_start date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, average_order_value numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH month_bounds AS (
    SELECT
      month_start AS start_date,
      (month_start + interval '1 month')::date AS end_date
  )
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(o.total_amount), 0),
    CASE
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(o.total_amount), 0) / COUNT(*)
      ELSE 0
    END
  FROM orders o
  CROSS JOIN month_bounds mb
  WHERE o.deleted_at IS NULL
    AND o.sales_day >= mb.start_date
    AND o.sales_day < mb.end_date;
$function$

;

CREATE OR REPLACE FUNCTION public.get_product_monthly_trends(p_product_id uuid, month_start date, months_back integer DEFAULT 6)
 RETURNS TABLE(month_label text, month_start date, revenue numeric, quantity_sold bigint, total_orders bigint, first_time_buyers bigint, returning_buyers bigint, repeat_customer_rate numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH month_series AS (
    SELECT
      generate_series(
        (month_start - ((months_back - 1) || ' months')::interval)::date,
        month_start,
        interval '1 month'
      )::date AS month_start
  ),
  order_item_quantities AS (
    SELECT
      oi.order_id,
      SUM(oi.quantity) AS order_item_quantity
    FROM order_items oi
    GROUP BY oi.order_id
  ),
  order_lines AS (
    SELECT
      ms.month_start,
      o.id AS order_id,
      o.customer_id,
      oi.quantity,
      get_product_line_revenue(
        oi.quantity,
        p.price,
        COALESCE(o.total_amount, 0),
        oiq.order_item_quantity
      ) AS line_revenue,
      o.sales_day AS order_date
    FROM month_series ms
    JOIN orders o
      ON o.deleted_at IS NULL
     AND o.sales_day >= ms.month_start
     AND o.sales_day < (ms.month_start + interval '1 month')::date
    JOIN order_items oi ON oi.order_id = o.id
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE p.id = p_product_id
  ),
  customer_first_purchase AS (
    SELECT
      o.customer_id,
      MIN(o.sales_day) AS first_purchase_date
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.deleted_at IS NULL
      AND oi.product_id = p_product_id
    GROUP BY o.customer_id
  ),
  monthly_agg AS (
    SELECT
      ol.month_start,
      SUM(ol.line_revenue) AS revenue,
      SUM(ol.quantity) AS quantity_sold,
      COUNT(DISTINCT ol.order_id) AS total_orders,
      COUNT(DISTINCT ol.customer_id) FILTER (
        WHERE cfp.first_purchase_date >= ol.month_start
          AND cfp.first_purchase_date < (ol.month_start + interval '1 month')::date
      ) AS first_time_buyers,
      COUNT(DISTINCT ol.customer_id) FILTER (
        WHERE cfp.first_purchase_date < ol.month_start
      ) AS returning_buyers,
      COUNT(DISTINCT ol.customer_id) AS unique_customers
    FROM order_lines ol
    JOIN customer_first_purchase cfp ON cfp.customer_id = ol.customer_id
    GROUP BY ol.month_start
  )
  SELECT
    to_char(ms.month_start, 'Mon YYYY') AS month_label,
    ms.month_start,
    COALESCE(ma.revenue, 0),
    COALESCE(ma.quantity_sold, 0),
    COALESCE(ma.total_orders, 0),
    COALESCE(ma.first_time_buyers, 0),
    COALESCE(ma.returning_buyers, 0),
    CASE
      WHEN COALESCE(ma.unique_customers, 0) > 0 THEN
        ROUND((COALESCE(ma.returning_buyers, 0)::numeric / ma.unique_customers) * 100, 2)
      ELSE 0
    END AS repeat_customer_rate
  FROM month_series ms
  LEFT JOIN monthly_agg ma ON ma.month_start = ms.month_start
  ORDER BY ms.month_start;
$function$

;

CREATE OR REPLACE FUNCTION public.get_product_performance(month_start date)
 RETURNS TABLE(product_id uuid, product_name text, total_orders bigint, total_revenue numeric, average_order_value numeric, quantity_sold bigint, unique_customers bigint, repeat_customers bigint, repeat_customer_rate numeric, customer_lifetime_value numeric, previous_month_revenue numeric, revenue_trend text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH month_bounds AS (
    SELECT
      month_start AS start_date,
      (month_start + interval '1 month')::date AS end_date,
      (month_start - interval '1 month')::date AS prev_start_date
  ),
  order_item_quantities AS (
    SELECT
      oi.order_id,
      SUM(oi.quantity) AS order_item_quantity
    FROM order_items oi
    GROUP BY oi.order_id
  ),
  all_product_lines AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      oi.order_id,
      o.customer_id,
      oi.quantity,
      get_product_line_revenue(
        oi.quantity,
        p.price,
        COALESCE(o.total_amount, 0),
        oiq.order_item_quantity
      ) AS line_revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.deleted_at IS NULL
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
  ),
  lifetime_customer_orders AS (
    SELECT
      product_id,
      customer_id,
      COUNT(DISTINCT order_id) AS lifetime_order_count,
      SUM(line_revenue) AS lifetime_spent
    FROM all_product_lines
    GROUP BY product_id, customer_id
  ),
  lifetime_customer_counts AS (
    SELECT
      product_id,
      COUNT(*) AS unique_customers,
      COUNT(*) FILTER (WHERE lifetime_order_count >= 2) AS repeat_customers,
      AVG(lifetime_spent) AS customer_lifetime_value
    FROM lifetime_customer_orders
    GROUP BY product_id
  ),
  order_in_month AS (
    SELECT o.id, o.customer_id, COALESCE(o.total_amount, 0) AS total_amount
    FROM orders o
    CROSS JOIN month_bounds mb
    WHERE o.deleted_at IS NULL
      AND o.sales_day >= mb.start_date
      AND o.sales_day < mb.end_date
  ),
  line_items AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      oi.order_id,
      oim.customer_id,
      oi.quantity,
      get_product_line_revenue(
        oi.quantity,
        p.price,
        oim.total_amount,
        oiq.order_item_quantity
      ) AS line_revenue
    FROM order_items oi
    JOIN order_in_month oim ON oim.id = oi.order_id
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
  ),
  product_agg AS (
    SELECT
      li.product_id,
      li.product_name,
      COUNT(DISTINCT li.order_id) AS total_orders,
      SUM(li.line_revenue) AS total_revenue,
      SUM(li.quantity) AS quantity_sold
    FROM line_items li
    GROUP BY li.product_id, li.product_name
  ),
  prev_revenue AS (
    SELECT
      p.id AS product_id,
      SUM(
        get_product_line_revenue(
          oi.quantity,
          p.price,
          COALESCE(o.total_amount, 0),
          oiq.order_item_quantity
        )
      ) AS previous_month_revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.deleted_at IS NULL
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    CROSS JOIN month_bounds mb
    WHERE o.sales_day >= mb.prev_start_date
      AND o.sales_day < mb.start_date
    GROUP BY p.id
  )
  SELECT
    pa.product_id,
    pa.product_name,
    pa.total_orders,
    pa.total_revenue,
    CASE
      WHEN pa.total_orders > 0 THEN pa.total_revenue / pa.total_orders
      ELSE 0
    END AS average_order_value,
    pa.quantity_sold,
    COALESCE(lcc.unique_customers, 0),
    COALESCE(lcc.repeat_customers, 0),
    CASE
      WHEN COALESCE(lcc.unique_customers, 0) > 0 THEN
        ROUND((COALESCE(lcc.repeat_customers, 0)::numeric / lcc.unique_customers) * 100, 2)
      ELSE 0
    END AS repeat_customer_rate,
    COALESCE(lcc.customer_lifetime_value, 0),
    COALESCE(pr.previous_month_revenue, 0),
    CASE
      WHEN COALESCE(pr.previous_month_revenue, 0) = 0 AND pa.total_revenue > 0 THEN 'increasing'
      WHEN pa.total_revenue > COALESCE(pr.previous_month_revenue, 0) * 1.05 THEN 'increasing'
      WHEN pa.total_revenue < COALESCE(pr.previous_month_revenue, 0) * 0.95 THEN 'decreasing'
      ELSE 'stable'
    END AS revenue_trend
  FROM product_agg pa
  LEFT JOIN lifetime_customer_counts lcc ON lcc.product_id = pa.product_id
  LEFT JOIN prev_revenue pr ON pr.product_id = pa.product_id
  ORDER BY pa.total_revenue DESC;
$function$

;

CREATE OR REPLACE FUNCTION public.get_revenue_trend(end_month date, months_back integer DEFAULT 6)
 RETURNS TABLE(month text, revenue numeric)
 LANGUAGE sql
AS $function$
  SELECT
    to_char(date_trunc('month', sales_day), 'YYYY-MM') AS month,
    COALESCE(SUM(total_amount), 0) AS revenue
  FROM orders
  WHERE deleted_at IS NULL
    AND sales_day >= date_trunc('month', end_month) - (months_back - 1) * INTERVAL '1 month'
    AND sales_day <  date_trunc('month', end_month) + INTERVAL '1 month'
  GROUP BY 1
  ORDER BY 1;
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
           (not coalesce(o.is_distributor, false) and coalesce(o.source, 'whatsapp') = 'whatsapp') as chat,
           o.sales_day as day
    from orders o
    where o.deleted_at is null
      and o.sales_day >= first_day
      and o.sales_day < (last_day + 1)::date
  ),
  first_orders as (
    select o.customer_id,
           min(o.sales_day) as day
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
$function$

;

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
    where o.deleted_at is null
      and o.sales_day >= first_day
      and o.sales_day < (last_day + 1)::date
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
                   and (p.sales_day, p.created_at, p.id) < (o.sales_day, o.created_at, o.id))
             else
               o.customer_id is not null and exists (
                 select 1 from orders p
                 where p.deleted_at is null
                   and p.customer_id = o.customer_id
                   and (p.sales_day, p.created_at, p.id) < (o.sales_day, o.created_at, o.id))
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
$function$

;

notify pgrst, 'reload schema';
