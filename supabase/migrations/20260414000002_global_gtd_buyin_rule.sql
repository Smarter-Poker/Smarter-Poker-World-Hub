BEGIN;

WITH Contaminated_Events AS (
  SELECT pe.id, pe.buy_in, pe.guarantee
  FROM poker_events pe
  LEFT JOIN poker_series ON poker_series.series_uid = pe.series_uid
  WHERE pe.buy_in >= 10000
    AND pe.event_name NOT ILIKE '%High Roller%'
    AND pe.event_name NOT ILIKE '%Super High%'
    AND pe.event_name NOT ILIKE '%Triton%'
    AND pe.event_name NOT ILIKE '%WSOP%'
    AND pe.event_name NOT ILIKE '%WPT%'
    AND COALESCE(poker_series.tour_code, '') NOT ILIKE '%WSOP%'
    AND COALESCE(poker_series.tour_code, '') NOT ILIKE '%WPT%'
    AND COALESCE(poker_series.tour_code, '') NOT ILIKE '%PGT%'
    AND COALESCE(poker_series.tour_code, '') NOT ILIKE '%Triton%'
    AND COALESCE(poker_series.series_name, '') NOT ILIKE '%High Roller%'
    AND COALESCE(poker_series.series_name, '') NOT ILIKE '%U.S. Poker Open%'
    AND COALESCE(poker_series.series_name, '') NOT ILIKE '%Poker Masters%'
    AND COALESCE(poker_series.series_name, '') NOT ILIKE '%Super High Roller%'
)
UPDATE poker_events
SET
  guarantee = COALESCE(poker_events.guarantee, poker_events.buy_in),
  buy_in = NULL
FROM Contaminated_Events ce
WHERE poker_events.id = ce.id;

UPDATE poker_events
SET event_name = REGEXP_REPLACE(event_name, '\s*-\s*\$\d{5,}\s*Event$', '')
WHERE event_name ~ '\s*-\s*\$\d{5,}\s*Event$';

UPDATE poker_series
SET main_event_buyin = (
  SELECT MAX(buy_in)
  FROM poker_events
  WHERE series_uid = poker_series.series_uid
    AND buy_in < 10000
)
WHERE main_event_buyin >= 10000
  AND COALESCE(tour_code, '') NOT ILIKE '%WSOP%'
  AND COALESCE(tour_code, '') NOT ILIKE '%WPT%'
  AND COALESCE(tour_code, '') NOT ILIKE '%PGT%'
  AND COALESCE(tour_code, '') NOT ILIKE '%Triton%'
  AND COALESCE(series_name, '') NOT ILIKE '%High Roller%'
  AND COALESCE(series_name, '') NOT ILIKE '%U.S. Poker Open%'
  AND COALESCE(series_name, '') NOT ILIKE '%Poker Masters%'
  AND COALESCE(series_name, '') NOT ILIKE '%Super High Roller%';

COMMIT;
