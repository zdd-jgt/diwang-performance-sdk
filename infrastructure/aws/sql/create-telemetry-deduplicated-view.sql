CREATE OR REPLACE VIEW telemetry_deduplicated AS
SELECT
  schemaversion, receivedat, partitiondate, requestid, batchid,
  recordid, eventid, projectid, sessionid, clienttimestamp,
  sdkversion, release, traceid, samplerate, pageurl, referrer,
  browsername, browserversion, osname, osversion, platformtype,
  eventtype, metricname, metricvalue, metricrating, errorkind,
  errormessage, errorstack, errorsourceurl, errorline, errorcolumn,
  partition_date
FROM (
  SELECT raw.*,
    row_number() OVER (
      PARTITION BY projectid, partition_date, recordid
      ORDER BY from_iso8601_timestamp(receivedat) DESC, requestid DESC
    ) AS duplicate_rank
  FROM telemetry_raw AS raw
)
WHERE duplicate_rank = 1;
