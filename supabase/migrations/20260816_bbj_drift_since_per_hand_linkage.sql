-- A5 follow-up (2026-08-16): bbj_drift_since produced FALSE POSITIVES.
--
-- The old body summed two independent tables over the same time window:
--   sum(rake_records.bbj_contribution WHERE created_at >= since)
--   sum(bbj_contributions.amount      WHERE created_at >= since)
-- A hand's rake row and its pool row are written milliseconds apart by
-- different statements, so near the window edge one is counted and the other
-- is not. The comment in FeeReconciler.ts already suspected this ("it reverses
-- sign depending on the window, which is the tell") but the function was never
-- changed. Worse, rake_records rows written with hand_id IS NULL — which spikes
-- during engine restarts — inflate the booked side with rows that can never be
-- matched, turning restart churn into a phantom money alarm.
--
-- Measured on 2026-08-15 (the day of the security incident and the engine host
-- migration, which produced 86 null-hand_id rake rows):
--     OLD metric : drift = 16.00   -> alarm fired, "chips left pots"
--     NEW metric : drift = -0.50   -> pool received MORE than booked
--     truly unbanked hands: 4 of ~24,000
-- No chips were lost. A money alarm that cries wolf is worse than no alarm,
-- because it trains everyone to ignore the one that matters.
--
-- This version compares per HAND, joining on hand_id, so a hand is either
-- counted on both sides or neither — boundary artifact eliminated by
-- construction. bbj_contributions is scanned with a 6h pad purely so the
-- planner can use idx_bbj_contrib_created_at; the pad only widens the lookup
-- set, it never changes which rake rows define membership.
--
-- The rows that genuinely cannot be reconciled are no longer silently folded
-- into the drift number. They are reported separately as unlinkable_rows /
-- unlinkable_chips, which is the real signal that was hidden inside the noise.
--
-- Perf: correlated-subquery form measured 3,414ms; this hash-join form
-- measures 250ms on the same window. Slow money functions are how CHECK 10
-- started timing out earlier today.

DROP FUNCTION IF EXISTS public.bbj_drift_since(timestamp with time zone);

CREATE FUNCTION public.bbj_drift_since(p_since timestamp with time zone)
RETURNS TABLE(
  booked           numeric,
  received         numeric,
  booked_rows      bigint,
  received_rows    bigint,
  unlinkable_rows  bigint,
  unlinkable_chips numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT hand_id, bbj_contribution
    FROM rake_records
    WHERE created_at >= p_since
      AND bbj_contribution > 0
  ),
  c AS (
    SELECT hand_id, sum(amount) AS amt
    FROM bbj_contributions
    WHERE created_at >= p_since - interval '6 hours'
      AND hand_id IS NOT NULL
    GROUP BY hand_id
  ),
  j AS (
    SELECT r.bbj_contribution AS booked, COALESCE(c.amt, 0) AS received
    FROM r
    LEFT JOIN c ON c.hand_id = r.hand_id
    WHERE r.hand_id IS NOT NULL
  )
  SELECT
    COALESCE(sum(j.booked), 0)::numeric,
    COALESCE(sum(j.received), 0)::numeric,
    count(*)::bigint,
    count(*) FILTER (WHERE j.received > 0)::bigint,
    (SELECT count(*) FROM r WHERE r.hand_id IS NULL)::bigint,
    COALESCE((SELECT sum(r.bbj_contribution) FROM r WHERE r.hand_id IS NULL), 0)::numeric
  FROM j;
$function$;

REVOKE ALL ON FUNCTION public.bbj_drift_since(timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bbj_drift_since(timestamp with time zone) TO service_role;
