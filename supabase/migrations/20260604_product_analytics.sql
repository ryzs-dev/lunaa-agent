-- Product performance analytics for Converra dashboard
-- Run in Supabase SQL editor or via migration tooling

CREATE OR REPLACE FUNCTION get_product_performance(month_start date)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  total_orders bigint,
  total_revenue numeric,
  average_order_value numeric,
  quantity_sold bigint,
  unique_customers bigint,
  repeat_customers bigint,
  repeat_customer_rate numeric,
  customer_lifetime_value numeric,
  previous_month_revenue numeric,
  revenue_trend text
)
LANGUAGE sql
STABLE
AS $$
  WITH month_bounds AS (
    SELECT
      month_start AS start_date,
      (month_start + interval '1 month')::date AS end_date,
      (month_start - interval '1 month')::date AS prev_start_date
  ),
  order_in_month AS (
    SELECT o.id, o.customer_id
    FROM orders o
    CROSS JOIN month_bounds mb
    WHERE (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= mb.start_date
      AND (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < mb.end_date
  ),
  line_items AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      oi.order_id,
      oim.customer_id,
      oi.quantity,
      COALESCE(p.price, 0) * oi.quantity AS line_revenue
    FROM order_items oi
    JOIN order_in_month oim ON oim.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
  ),
  customer_product_orders AS (
    SELECT product_id, customer_id, COUNT(DISTINCT order_id) AS order_count
    FROM line_items
    GROUP BY product_id, customer_id
  ),
  customer_counts AS (
    SELECT
      product_id,
      COUNT(*) AS unique_customers,
      COUNT(*) FILTER (WHERE order_count > 1) AS repeat_customers
    FROM customer_product_orders
    GROUP BY product_id
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
      SUM(COALESCE(p.price, 0) * oi.quantity) AS previous_month_revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    CROSS JOIN month_bounds mb
    WHERE (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= mb.prev_start_date
      AND (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < mb.start_date
    GROUP BY p.id
  ),
  clv AS (
    SELECT
      li.product_id,
      AVG(COALESCE(c.total_amount_spent, 0)) AS customer_lifetime_value
    FROM line_items li
    JOIN customers c ON c.id = li.customer_id
    GROUP BY li.product_id
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
    COALESCE(cc.unique_customers, 0),
    COALESCE(cc.repeat_customers, 0),
    CASE
      WHEN COALESCE(cc.unique_customers, 0) > 0 THEN
        ROUND((COALESCE(cc.repeat_customers, 0)::numeric / cc.unique_customers) * 100, 2)
      ELSE 0
    END AS repeat_customer_rate,
    COALESCE(clv.customer_lifetime_value, 0),
    COALESCE(pr.previous_month_revenue, 0),
    CASE
      WHEN COALESCE(pr.previous_month_revenue, 0) = 0 AND pa.total_revenue > 0 THEN 'increasing'
      WHEN pa.total_revenue > COALESCE(pr.previous_month_revenue, 0) * 1.05 THEN 'increasing'
      WHEN pa.total_revenue < COALESCE(pr.previous_month_revenue, 0) * 0.95 THEN 'decreasing'
      ELSE 'stable'
    END AS revenue_trend
  FROM product_agg pa
  LEFT JOIN customer_counts cc ON cc.product_id = pa.product_id
  LEFT JOIN prev_revenue pr ON pr.product_id = pa.product_id
  LEFT JOIN clv ON clv.product_id = pa.product_id
  ORDER BY pa.total_revenue DESC;
$$;

CREATE OR REPLACE FUNCTION get_product_monthly_trends(
  p_product_id uuid,
  month_start date,
  months_back int DEFAULT 6
)
RETURNS TABLE (
  month_label text,
  month_start date,
  revenue numeric,
  quantity_sold bigint,
  total_orders bigint,
  first_time_buyers bigint,
  returning_buyers bigint,
  repeat_customer_rate numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH month_series AS (
    SELECT
      generate_series(
        (month_start - ((months_back - 1) || ' months')::interval)::date,
        month_start,
        interval '1 month'
      )::date AS month_start
  ),
  order_lines AS (
    SELECT
      ms.month_start,
      o.id AS order_id,
      o.customer_id,
      oi.quantity,
      COALESCE(p.price, 0) * oi.quantity AS line_revenue,
      (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS order_date
    FROM month_series ms
    JOIN orders o
      ON (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= ms.month_start
     AND (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < (ms.month_start + interval '1 month')::date
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    WHERE p.id = p_product_id
  ),
  customer_first_purchase AS (
    SELECT
      o.customer_id,
      MIN((o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date) AS first_purchase_date
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.product_id = p_product_id
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
      COUNT(DISTINCT ol.customer_id) AS unique_customers,
      COUNT(DISTINCT ol.customer_id) FILTER (
        WHERE (
          SELECT COUNT(DISTINCT o2.id)
          FROM orders o2
          JOIN order_items oi2 ON oi2.order_id = o2.id
          WHERE oi2.product_id = p_product_id
            AND o2.customer_id = ol.customer_id
            AND (o2.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= ol.month_start
            AND (o2.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < (ol.month_start + interval '1 month')::date
        ) > 1
      ) AS repeat_customers
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
        ROUND((COALESCE(ma.repeat_customers, 0)::numeric / ma.unique_customers) * 100, 2)
      ELSE 0
    END AS repeat_customer_rate
  FROM month_series ms
  LEFT JOIN monthly_agg ma ON ma.month_start = ms.month_start
  ORDER BY ms.month_start;
$$;
