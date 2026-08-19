-- ============================================================================
-- WEB PUSH (VAPID) STACK  -- PepNationLab parity clone for smarter.poker
-- Applied to production 2026-08-19 via Supabase MCP apply_migration.
-- Tier 3 migration. Additive only: no column drops, no renames, no data loss.
--
-- Creates:
--   public.push_subscriptions   -- one row per device endpoint
--   public.push_outbox          -- durable queue + audit trail
--   public.push_dispatch_runs   -- cron slot dedupe + liveness watchdog
--   public.is_admin()           -- shared admin predicate (did not exist)
--   claim_push_outbox_batch()   -- FOR UPDATE SKIP LOCKED claim
--   requeue_stuck_push_outbox() -- crash recovery
--   prune_old_notifications()   -- 90-day retention
-- Extends:
--   notification_preferences  += mute_all, browser_push, push_type_prefs
--   notifications             += read_at (backfilled, kept in sync with is_read)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Admin predicate. smarter.poker treats profiles.role IN ('admin','god')
--    as staff. No is_admin() existed before this migration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'god')
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint            TEXT NOT NULL,
  p256dh              TEXT NOT NULL,
  auth                TEXT NOT NULL,
  user_agent          TEXT,
  device_label        TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  failure_count       INTEGER NOT NULL DEFAULT 0,
  last_failure_reason TEXT,
  last_used_at        TIMESTAMPTZ,
  last_receipt_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_receipt_idx
  ON public.push_subscriptions(last_receipt_at) WHERE is_active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user manages own push subs" ON public.push_subscriptions;
CREATE POLICY "user manages own push subs" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admin reads all push subs" ON public.push_subscriptions;
CREATE POLICY "admin reads all push subs" ON public.push_subscriptions
  FOR SELECT USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. push_outbox
--    No orders FK (smarter.poker has no orders table). related_entity_id is a
--    free-form uuid so callers can attach a hand, table, club or post id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  url               TEXT,
  icon_url          TEXT,
  badge_url         TEXT,
  tag               TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','sent','failed','skipped')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  failure_reason    TEXT,
  related_entity_id UUID,
  event             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_outbox_pending_idx
  ON public.push_outbox(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS push_outbox_recipient_idx
  ON public.push_outbox(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_outbox_event_idx
  ON public.push_outbox(event, created_at DESC);

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads push outbox" ON public.push_outbox;
CREATE POLICY "admin reads push outbox" ON public.push_outbox
  FOR SELECT USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. push_dispatch_runs -- dedupe slot + liveness signal for push-health.
--    Open Claw can double-fire if two dispatchers are alive; the unique slot
--    key makes the second insert a no-op instead of a double send.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_dispatch_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job         TEXT NOT NULL,
  slot        TIMESTAMPTZ NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  claimed     INTEGER NOT NULL DEFAULT 0,
  sent        INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  UNIQUE (job, slot)
);

CREATE INDEX IF NOT EXISTS push_dispatch_runs_job_time_idx
  ON public.push_dispatch_runs(job, started_at DESC);

ALTER TABLE public.push_dispatch_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin reads dispatch runs" ON public.push_dispatch_runs;
CREATE POLICY "admin reads dispatch runs" ON public.push_dispatch_runs
  FOR SELECT USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. notification_preferences extensions
--    push_enabled already exists here and already defaults TRUE, which matches
--    PepNationLab's default-ON opt-out model. Only the missing bits are added.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS mute_all BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS browser_push BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_type_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_uniq
  ON public.notification_preferences(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user manages own notification prefs" ON public.notification_preferences;
CREATE POLICY "user manages own notification prefs" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. notifications.read_at  (additive parity column)
--    smarter.poker has BOTH `read` and `is_read` booleans. read_at becomes the
--    timestamp form PepNationLab code expects. A BEFORE trigger keeps all three
--    consistent no matter which one a writer sets, so every existing reader in
--    the repo (Club Arena, Commander, social feed) keeps working untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE public.notifications
   SET read_at = COALESCE(updated_at, created_at, now())
 WHERE read_at IS NULL
   AND (is_read IS TRUE OR read IS TRUE);

CREATE OR REPLACE FUNCTION public.sync_notification_read_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_read boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_read := COALESCE(NEW.read_at IS NOT NULL, false)
              OR COALESCE(NEW.is_read, false)
              OR COALESCE(NEW.read, false);
  ELSE
    -- Whichever representation the writer touched wins.
    IF (NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
      v_read := NEW.read_at IS NOT NULL;
    ELSIF (NEW.is_read IS DISTINCT FROM OLD.is_read) THEN
      v_read := COALESCE(NEW.is_read, false);
    ELSIF (NEW.read IS DISTINCT FROM OLD.read) THEN
      v_read := COALESCE(NEW.read, false);
    ELSE
      v_read := COALESCE(NEW.read_at IS NOT NULL, false)
                OR COALESCE(NEW.is_read, false)
                OR COALESCE(NEW.read, false);
    END IF;
  END IF;

  NEW.is_read := v_read;
  NEW.read    := v_read;
  IF v_read THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
  ELSE
    NEW.read_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_notification_read_state ON public.notifications;
CREATE TRIGGER trg_sync_notification_read_state
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_notification_read_state();

CREATE INDEX IF NOT EXISTS notifications_user_unread_at_idx
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Realtime: table is already published with REPLICA IDENTITY FULL. Assert it.
DO $$
BEGIN
  IF (SELECT relreplident FROM pg_class WHERE oid = 'public.notifications'::regclass) <> 'f' THEN
    EXECUTE 'ALTER TABLE public.notifications REPLICA IDENTITY FULL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. RPCs. PostgREST cannot express FOR UPDATE SKIP LOCKED, so the dispatcher
--    claims work through these SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_push_outbox_batch(
  p_limit int DEFAULT 100,
  p_max_attempts int DEFAULT 5
)
RETURNS SETOF public.push_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.push_outbox
     SET status = 'processing',
         attempts = attempts + 1
   WHERE id IN (
     SELECT id FROM public.push_outbox
      WHERE status = 'pending'
        AND attempts < p_max_attempts
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.requeue_stuck_push_outbox(
  p_stale_minutes int DEFAULT 15
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count int;
BEGIN
  UPDATE public.push_outbox
     SET status = 'pending'
   WHERE status = 'processing'
     AND sent_at IS NULL
     AND created_at < now() - make_interval(mins => p_stale_minutes);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.prune_old_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.notifications WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM public.push_outbox
   WHERE created_at < now() - INTERVAL '30 days'
     AND status IN ('sent','skipped','failed');
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_push_outbox_batch(int, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_stuck_push_outbox(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_old_notifications() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox_batch(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_stuck_push_outbox(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_old_notifications() TO service_role;

-- ---------------------------------------------------------------------------
-- 7. POST-APPLY ASSERTIONS -- abort if any assumption was violated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'push_subscriptions was not created';
  END IF;
  IF to_regclass('public.push_outbox') IS NULL THEN
    RAISE EXCEPTION 'push_outbox was not created';
  END IF;
  IF to_regclass('public.push_dispatch_runs') IS NULL THEN
    RAISE EXCEPTION 'push_dispatch_runs was not created';
  END IF;

  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['mute_all','browser_push','push_type_prefs']) c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_preferences' AND column_name=c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'notification_preferences missing columns: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='read_at'
  ) THEN
    RAISE EXCEPTION 'notifications.read_at was not created';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE (is_read IS TRUE OR read IS TRUE) AND read_at IS NULL
  ) THEN
    RAISE EXCEPTION 'read_at backfill incomplete: read rows still have NULL read_at';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_push_outbox_batch') THEN
    RAISE EXCEPTION 'claim_push_outbox_batch RPC missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (Tier 3 requirement -- paste to revert)
-- ---------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_sync_notification_read_state ON public.notifications;
-- DROP FUNCTION IF EXISTS public.sync_notification_read_state();
-- DROP FUNCTION IF EXISTS public.claim_push_outbox_batch(int,int);
-- DROP FUNCTION IF EXISTS public.requeue_stuck_push_outbox(int);
-- DROP FUNCTION IF EXISTS public.prune_old_notifications();
-- DROP TABLE IF EXISTS public.push_dispatch_runs;
-- DROP TABLE IF EXISTS public.push_outbox;
-- DROP TABLE IF EXISTS public.push_subscriptions;
-- ALTER TABLE public.notifications DROP COLUMN IF EXISTS read_at;
-- ALTER TABLE public.notification_preferences
--   DROP COLUMN IF EXISTS mute_all,
--   DROP COLUMN IF EXISTS browser_push,
--   DROP COLUMN IF EXISTS push_type_prefs;
-- DROP FUNCTION IF EXISTS public.is_admin();
