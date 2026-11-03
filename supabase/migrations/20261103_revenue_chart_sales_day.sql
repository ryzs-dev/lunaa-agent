-- Dashboard sales chart: by order day, without distributor orders.
CREATE OR REPLACE FUNCTION public.get_monthly_revenue_chart(month_start date)
 RETURNS TABLE(label text, value numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH month_bounds AS (
    SELECT
      month_start AS start_date,
      (month_start + interval '1 month')::date AS end_date
  ),
  days AS (
    SELECT generate_series(
      (SELECT start_date FROM month_bounds),
      (SELECT end_date FROM month_bounds) - interval '1 day',
      interval '1 day'
    )::date AS day
  )
  SELECT
    to_char(d.day, 'DD Mon') AS label,
    COALESCE(SUM(o.total_amount), 0) AS value
  FROM days d
  LEFT JOIN orders o
    ON o.deleted_at IS NULL
   AND NOT coalesce(o.is_distributor, false)
   AND o.sales_day = d.day
  GROUP BY d.day
  ORDER BY d.day;
$function$

;
