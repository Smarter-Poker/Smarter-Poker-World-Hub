-- Dan, 2026-08-30, from an iPhone: "I'M GETTING DOUBLE NOTIFICATIONS FOR THE
-- SAME OPEN SEAT, AND A PUSH ALERT ABOUT 3 ZOMBIE SUBSCRIPTIONS."
--
-- Both symptoms, one cause. Five active subscriptions for TWO physical devices:
--
--   iPhone  08-26  last_receipt_at NULL   <- never confirmed a delivery
--   iPhone  08-27  last_receipt_at NULL   <- never confirmed a delivery
--   iPhone  08-30  last_receipt_at SET    <- the live one
--   Mac     08-26  last_receipt_at NULL   <- never confirmed a delivery
--   Mac     08-30  (newest)
--
-- Every push fans out to every active row, so ONE push_outbox row arrived on
-- the phone more than once. Proven rather than inferred: in the six hours
-- before he reported it there was exactly ONE 'Push Health Alert' row in
-- push_outbox, and his screenshot shows it twice.
--
-- (The two "Seat Open" notifications in the same screenshot are NOT duplicates.
-- They are different tables -- "Bomb Pot NLH 0.25/0.50" and "NLH 0.25/0.50".
-- That is a copy problem, not a delivery one, and is not addressed here.)
--
-- The same stale rows are what push-health counts as "zombies": active, still
-- being sent to, never returning a receipt. The alert he received was his own
-- watchdog correctly reporting this bug.
--
-- WHY THE EXISTING FIX DID NOT COVER THEM. pages/api/push/subscribe.js already
-- retires prior live rows for the same device, keyed on `device_id` -- a random
-- id the client keeps in localStorage. That is the right key: the endpoint is
-- not stable, and user_agent is not unique (two identical iPhones on one
-- account produce byte-identical strings, so deduping on it would switch off a
-- real device). But it shipped TODAY, and all five rows predate it with
-- `device_id IS NULL`. Prevention works going forward; nothing reaps what was
-- already there.
--
-- WHAT THIS RETIRES, deliberately narrow. A row qualifies only if ALL hold:
--   * device_id IS NULL        -- legacy only; anything the new code manages is
--                                 left alone entirely
--   * last_receipt_at IS NULL  -- never once confirmed a delivery, so it is not
--                                 somebody's working second device
--   * a strictly NEWER active row exists for the same user + device_label
--
-- The newest row per device is never a candidate, so this cannot leave anybody
-- with zero subscriptions. Dry-run before applying returned exactly three rows.
WITH ranked AS (
  SELECT s.id,
         row_number() OVER (PARTITION BY s.user_id, s.device_label ORDER BY s.created_at DESC) AS rn,
         s.device_id, s.last_receipt_at
  FROM public.push_subscriptions s
  WHERE s.is_active
)
UPDATE public.push_subscriptions t
   SET is_active = false,
       last_failure_reason = 'superseded_legacy_no_receipt_20260830',
       updated_at = now()
  FROM ranked r
 WHERE r.id = t.id
   AND r.device_id IS NULL
   AND r.last_receipt_at IS NULL
   AND r.rn > 1;

DO $$
DECLARE v_orphaned int;
BEGIN
  -- Nobody may be left unreachable by this.
  SELECT count(*) INTO v_orphaned FROM (
    SELECT user_id FROM public.push_subscriptions
     GROUP BY user_id
    HAVING count(*) FILTER (WHERE is_active) = 0
       AND count(*) FILTER (WHERE last_failure_reason = 'superseded_legacy_no_receipt_20260830') > 0
  ) x;
  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'this retirement left % user(s) with no active subscription', v_orphaned;
  END IF;
END $$;
