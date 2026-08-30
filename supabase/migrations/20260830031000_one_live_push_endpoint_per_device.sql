-- ─────────────────────────────────────────────────────────────────────────────
-- ONE LIVE PUSH ENDPOINT PER DEVICE (Dan 2026-08-30)
--
-- MEASURED BEFORE WRITING THIS. The whole platform had 11 active
-- push_subscriptions rows belonging to ONE user. Nine of them were redundant:
-- three live Apple endpoints for the same iPhone and six FCM endpoints for the
-- same Mac Chrome. On 2026-08-29 at 16:54:00 a single seat offer updated
-- last_used_at on two of that phone's three endpoints at once — one push,
-- delivered twice to one device.
--
-- WHY THE EXISTING DEFENCE DOES NOT COVER IT. `push-client.js` already sends
-- `replacesEndpoint` when it re-subscribes, and `subscribe.js` retires that
-- row. That works only while the CLIENT still knows the endpoint it is
-- replacing. It does not after a service-worker reinstall, cleared site data, a
-- PWA re-add, or any path where `pushManager.getSubscription()` comes back null
-- and the browser mints a fresh endpoint. The old row is then unreferenced and
-- perfectly healthy from the push service's point of view, so it is never 410'd
-- and never reaped. It just sits there, and every send pays for it.
--
-- WHY NOT DEDUPE ON (user_id, user_agent). Tempting, and wrong: two identical
-- iPhones on the same account produce byte-identical user_agent strings, and
-- deduping on it would silently switch one of the person's real devices off.
-- The endpoint is not stable and the user agent is not unique, so neither can
-- be the key.
--
-- `device_id` is a random identifier the client mints once and keeps in
-- localStorage. It is stable across re-subscribes on the same browser profile
-- and different between two devices, which is exactly the property needed. It
-- carries no personal information — it is a random string, not a fingerprint.
--
-- Nullable on purpose: rows written before the client change, and any future
-- caller that does not send one, keep working unchanged and simply do not
-- participate in the dedupe. Failing open here is right — the cost of a missing
-- device_id is a duplicate banner, and the cost of guessing one wrong is a
-- person's phone going silent.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.push_subscriptions_one_active_per_device_uidx;
--   ALTER TABLE public.push_subscriptions DROP COLUMN IF EXISTS device_id;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_id text;

COMMENT ON COLUMN public.push_subscriptions.device_id IS
  'Random per-browser-profile id minted by push-client.js and kept in localStorage. Stable across re-subscribes on one device, different between devices, so it is the only safe key for retiring a superseded endpoint (the endpoint itself is not stable and user_agent is not unique). Nullable: pre-2026-08-30 rows keep working and simply do not dedupe. Added 2026-08-30.';

-- One LIVE endpoint per device. Partial by design: retired rows are history and
-- may repeat, and a NULL device_id is exempt (a unique index ignores NULLs, and
-- that is the fail-open behaviour described above).
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_one_active_per_device_uidx
  ON public.push_subscriptions (user_id, device_id)
  WHERE is_active AND device_id IS NOT NULL;

COMMENT ON INDEX public.push_subscriptions_one_active_per_device_uidx IS
  'A device holds at most one live push endpoint. subscribe.js retires the previous one in the same request; this makes it structural rather than remembered. Added 2026-08-30.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-TIME CLEANUP of the nine rows already measured.
--
-- Scoped hard, because deactivating a real device's endpoint makes a person's
-- phone go quiet and they have no way to tell why:
--
--   - only rows with NO device_id (nothing new can be caught by this);
--   - only where the SAME (user_id, user_agent) holds more than one active row,
--     which is the redundancy actually observed;
--   - the newest row per group is KEPT — it is the one the browser most
--     recently minted and therefore the one it will actually deliver to;
--   - only rows that have never received anything (`last_used_at IS NULL`) OR
--     are strictly older than the keeper's last delivery. A row still being
--     delivered to more recently than the keeper is not obviously dead, and is
--     left alone for the 410 reaper rather than guessed at.
--
-- Two identical iPhones on one account WOULD be caught by the user_agent
-- grouping — which is why that risk is bounded to this single backfill on a
-- population of eleven rows and one user, and never becomes a running rule. The
-- running rule is the index above, which cannot make that mistake.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT id, user_id, user_agent, last_used_at,
         row_number() OVER (
           PARTITION BY user_id, user_agent
           ORDER BY created_at DESC
         ) AS rn,
         max(last_used_at) OVER (PARTITION BY user_id, user_agent) AS group_last_used
    FROM public.push_subscriptions
   WHERE is_active
     AND device_id IS NULL
),
dupes AS (
  SELECT id FROM ranked
   WHERE rn > 1
     AND (last_used_at IS NULL OR group_last_used IS NULL OR last_used_at < group_last_used)
)
UPDATE public.push_subscriptions s
   SET is_active = false,
       last_failure_reason = 'superseded_same_device_backfill_20260830',
       updated_at = now()
  FROM dupes d
 WHERE s.id = d.id;

-- Post-apply assertions.
DO $$
DECLARE
  v_remaining bigint;
  v_users     bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
       AND column_name = 'device_id'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: push_subscriptions.device_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'push_subscriptions_one_active_per_device_uidx'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: the per-device unique index did not take';
  END IF;

  -- NOBODY MAY BE LEFT WITH NO WAY TO BE REACHED. This is the assertion that
  -- matters: the cleanup above must never take a user's LAST active endpoint.
  SELECT count(*) INTO v_users
    FROM (
      SELECT s.user_id
        FROM public.push_subscriptions s
       GROUP BY s.user_id
      HAVING count(*) FILTER (WHERE s.is_active) = 0
         AND count(*) FILTER (WHERE s.last_failure_reason = 'superseded_same_device_backfill_20260830') > 0
    ) x;
  IF v_users > 0 THEN
    RAISE EXCEPTION 'post-apply failed: % user(s) were left with no active endpoint by the backfill', v_users;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM (
      SELECT 1 FROM public.push_subscriptions
       WHERE is_active AND device_id IS NULL
       GROUP BY user_id, user_agent
      HAVING count(*) > 1
    ) y;
  RAISE NOTICE 'push subscription dedupe: % same-device group(s) still hold more than one active row (expected 0 unless a row was newer than its keeper)', v_remaining;
END $$;
