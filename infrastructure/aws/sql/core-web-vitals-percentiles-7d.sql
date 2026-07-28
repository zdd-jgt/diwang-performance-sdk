SELECT
  partition_date,
  metricname,
  approx_percentile(metricvalue, 0.50) AS p50,
  approx_percentile(metricvalue, 0.95) AS p95,
  approx_percentile(metricvalue, 0.99) AS p99,
  count(*) AS sample_count
FROM telemetry_deduplicated
WHERE projectid = 'replace_me'
  AND eventtype = 'metric'
  AND metricname IN ('LCP', 'CLS', 'INP')
  AND partition_date BETWEEN
    date_format(current_date - INTERVAL '6' DAY, '%Y-%m-%d')
    AND date_format(current_date, '%Y-%m-%d')
GROUP BY partition_date, metricname
ORDER BY partition_date DESC, metricname;
