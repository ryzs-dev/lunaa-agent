-- Lifetime repeat customer metrics:
-- - Repeat customer = buyer with 2+ lifetime orders for the product
-- - Return rate = repeat customers / all lifetime buyers
-- - Customer LTV = average lifetime spend on the product per buyer

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
    JOIN orders o ON o.id = oi.order_id
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
    JOIN orders o ON o.id = oi.order_id
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    CROSS JOIN month_bounds mb
    WHERE (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= mb.prev_start_date
      AND (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < mb.start_date
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
      (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS order_date
    FROM month_series ms
    JOIN orders o
      ON (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= ms.month_start
     AND (o.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date < (ms.month_start + interval '1 month')::date
    JOIN order_items oi ON oi.order_id = o.id
    JOIN order_item_quantities oiq ON oiq.order_id = oi.order_id
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
$$;
