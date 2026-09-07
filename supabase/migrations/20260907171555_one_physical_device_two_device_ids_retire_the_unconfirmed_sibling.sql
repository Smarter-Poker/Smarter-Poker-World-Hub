-- ONE PHYSICAL DEVICE, TWO device_ids, TWO BANNERS (2026-09-07)
--
-- Applied to production as version 20260907171555. This file is the record of
-- it, and it is written to be safely re-runnable: it re-derives its targets
-- from current state, so on a database that is already clean it updates nothing.
--
-- ── WHAT HAPPENED ─────────────────────────────────────────────────────────
--
-- Dan received the Estate Digest and the engine-break alert twice, on one
-- phone. His four ACTIVE rows were two pairs, and each pair was ONE physical
-- device wearing two identities:
--
--   iPhone, web.push.apple.com, identical user_agent
--     ff4645d3...  last_receipt_at 2026-09-07 17:12:02   <- delivering
--     657b16e5...  last_receipt_at NULL since 2026-08-26 <- never once acked
--
--   Mac, fcm.googleapis.com, identical user_agent
--     ec90f0f1...  last_receipt_at 2026-09-07 17:12:01   <- delivering
--     f902fc7b...  last_receipt_at 2026-09-01 02:11      <- six days stale
--
-- `push_subscriptions_one_active_per_device_uidx` is UNIQUE (user_id,
-- device_id), so two rows with DIFFERENT device_ids are both legal, and every
-- retire in the codebase matches on device_id too — so none of them can see
-- across the pair. `deviceId` is minted into localStorage, and an installed PWA
-- and a browser tab on one phone do not share that storage: a single device
-- mints two ids and keeps both lineages alive for ever, each dutifully retiring
-- only its own predecessors. `push-dispatch` then fans one outbox row out to
-- every active row, and one notification becomes two banners.
--
-- ── WHY last_receipt_at IS THE RIGHT SIGNAL ───────────────────────────────
--
-- It does not care about identity. A row the device has never acknowledged,
-- whose sibling on the same push host with the same user_agent acknowledged
-- seconds ago, is not a second device. Retiring on "no receipt" ALONE would be
-- a guess — a receipt can be missing because the phone is asleep — which is why
-- the sibling proof is required and why a device whose only live row is silent
-- is never touched here.
--
-- The code that should have done this on its own is
-- `pages/api/cron/push-health.js`; the reason it did not is fixed in the same
-- pull request as this file, and pinned by
-- `__tests__/zombie-endpoint-retirement.test.mjs`.

BEGIN;

WITH grouped AS (
  SELECT id,
         count(*) OVER w AS siblings,
         last_receipt_at,
         max(last_receipt_at) OVER w AS best_receipt
  FROM public.push_subscriptions
  WHERE is_active
  WINDOW w AS (PARTITION BY user_id,
                            split_part(replace(endpoint, 'https://', ''), '/', 1),
                            user_agent)
),
losers AS (
  SELECT id FROM grouped
   WHERE siblings > 1
     AND best_receipt IS NOT NULL
     AND (last_receipt_at IS NULL OR last_receipt_at < best_receipt)
)
UPDATE public.push_subscriptions s
   SET is_active = false,
       last_failure_reason = 'no_receipt_while_sibling_confirmed',
       updated_at = now()
  FROM losers l
 WHERE s.id = l.id;

-- Nobody is left with two live rows on one push host with one user agent where
-- the platform has proof that only one of them delivers. Stated as an invariant
-- rather than as a count, so this file stays true after Dan adds a device.
DO $$
DECLARE
  v_dupe INTEGER;
BEGIN
  SELECT count(*) INTO v_dupe FROM (
    SELECT user_id
      FROM public.push_subscriptions
     WHERE is_active
     GROUP BY user_id, split_part(replace(endpoint, 'https://', ''), '/', 1), user_agent
    HAVING count(*) > 1 AND count(last_receipt_at) > 0
  ) d;
  IF v_dupe > 0 THEN
    RAISE EXCEPTION '% device group(s) still hold two live subscriptions with proof only one delivers', v_dupe;
  END IF;
END $$;

COMMIT;
