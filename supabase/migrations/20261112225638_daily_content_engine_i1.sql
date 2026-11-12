-- ═══════════════════════════════════════════════════════════════════════
-- 20261112225638_daily_content_engine_i1.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (Daily Content Engine, Gate 3 Implementation I-1)
-- AFFECTS:     new tables public.daily_content_*, new RPCs
--              public.fn_daily_content_*, new NOLOGIN role
--              daily_content_reporter, new private storage bucket
--              daily-content. No existing table, function or policy changes.
-- IRREVERSIBLE: no (new objects only; rollback section below)
--
-- WHY:
--   Dan approved Gate 3 (I-1) of the Smarter.Poker daily content engine on
--   Nov 12, 2026: build the system with no public output. The worker needs
--   job state that survives restarts (leases), frozen snapshots with their
--   SHA-256, editions per daily slot, renders, per-destination posts with an
--   idempotency key, append-only receipts and pause switches the dashboard
--   can flip. Publishing stays off: every destination is seeded disabled and
--   the global pause is seeded ON.
--
-- HOW (high level):
--   * daily_content_* tables, RLS enabled with no policies, no grants to
--     anon or authenticated (service_role only).
--   * fn_daily_content_source / fn_daily_content_schedule: read-only,
--     bounded source reads for snapshots (SECURITY DEFINER, service_role).
--   * fn_daily_content_claim_job: lease-based job claim (FOR UPDATE SKIP
--     LOCKED) so a crashed worker's job resumes on the next tick and two
--     workers never run the same job at once.
--   * daily_content_reporter: NOLOGIN read-only reporting role.
--   * storage bucket daily-content: private, 50 MB, mp4/png/json only.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
BEGIN
  IF to_regclass('public.daily_content_snapshots') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: daily_content_snapshots already exists';
  END IF;
  IF to_regclass('public.tournaments') IS NULL
     OR to_regclass('public.tournament_players') IS NULL
     OR to_regclass('public.tournament_payouts') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.clubs') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a source table is missing';
  END IF;
END $$;

-- 2. TABLES
CREATE TABLE public.daily_content_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key        text NOT NULL,
  revision            integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  family              text NOT NULL,
  slot                text NOT NULL CHECK (slot IN ('today','top10','feature','tonight')),
  period_start        timestamptz,
  period_end          timestamptz,
  taken_at            timestamptz NOT NULL DEFAULT now(),
  scoring_version     text,
  eligibility_version text,
  completeness        text NOT NULL CHECK (completeness IN ('FINAL','PROVISIONAL','HELD','NOT_APPLICABLE')),
  payload             jsonb NOT NULL,
  sha256              text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  supersedes          uuid REFERENCES public.daily_content_snapshots(id),
  dry_run             boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_key, revision)
);

CREATE TABLE public.daily_content_editions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_date  date NOT NULL,
  slot          text NOT NULL CHECK (slot IN ('today','top10','feature','tonight')),
  revision      integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  family        text NOT NULL,
  snapshot_id   uuid REFERENCES public.daily_content_snapshots(id),
  status        text NOT NULL DEFAULT 'building'
                CHECK (status IN ('building','rendered','held','skipped','failed','superseded')),
  status_reason text,
  headline      text,
  caption       text,
  slot_at       timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  dry_run       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_date, slot, revision)
);

CREATE TABLE public.daily_content_renders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id       uuid NOT NULL REFERENCES public.daily_content_editions(id),
  kind             text NOT NULL CHECK (kind IN ('video_9x16','still_9x16','still_4x5')),
  storage_path     text NOT NULL,
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes            bigint NOT NULL CHECK (bytes > 0),
  width            integer NOT NULL,
  height           integer NOT NULL,
  duration_s       numeric,
  renderer_version text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, kind)
);

CREATE TABLE public.daily_content_destinations (
  destination      text PRIMARY KEY CHECK (destination IN ('internal_feed','facebook','instagram','youtube')),
  enabled          boolean NOT NULL DEFAULT false,
  connection_state text NOT NULL DEFAULT 'not_connected'
                   CHECK (connection_state IN ('not_connected','connected','needs_attention','revoked')),
  daily_cap        integer NOT NULL DEFAULT 4 CHECK (daily_cap BETWEEN 0 AND 4),
  account_ref      text,
  notes            text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_content_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id       uuid NOT NULL REFERENCES public.daily_content_editions(id),
  destination      text NOT NULL REFERENCES public.daily_content_destinations(destination),
  idempotency_key  text NOT NULL UNIQUE,
  state            text NOT NULL DEFAULT 'candidate' CHECK (state IN (
                     'candidate','validated','rendered','authorized','scheduled','submitting',
                     'processing','published','held','expired','failed','uncertain',
                     'cancelled','superseded')),
  state_reason     text,
  scheduled_for    timestamptz NOT NULL,
  expires_at       timestamptz NOT NULL,
  attempts         integer NOT NULL DEFAULT 0,
  remote_id        text,
  remote_url       text,
  account_ref      text,
  published_at     timestamptz,
  authorized_by    uuid,
  authorized_at    timestamptz,
  dry_run          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_content_receipts (
  id         bigserial PRIMARY KEY,
  post_id    uuid NOT NULL REFERENCES public.daily_content_posts(id),
  kind       text NOT NULL CHECK (kind IN ('submit','status','proof','error','pause_stop','expired')),
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_content_pauses (
  scope      text PRIMARY KEY CHECK (scope = 'global' OR scope ~ '^(destination|series):[a-z0-9_]+$'),
  paused     boolean NOT NULL,
  reason     text,
  set_by     text NOT NULL,
  set_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_content_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key          text NOT NULL UNIQUE,
  kind             text NOT NULL CHECK (kind IN ('build','render','submit')),
  edition_date     date NOT NULL,
  slot             text NOT NULL CHECK (slot IN ('today','top10','feature','tonight')),
  edition_id       uuid REFERENCES public.daily_content_editions(id),
  post_id          uuid REFERENCES public.daily_content_posts(id),
  state            text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','done','failed','cancelled')),
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 3,
  run_after        timestamptz NOT NULL DEFAULT now(),
  lease_owner      text,
  lease_expires_at timestamptz,
  checkpoint       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result           jsonb,
  last_error       text,
  dry_run          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_content_events (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  event      text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX daily_content_jobs_claim_idx ON public.daily_content_jobs (state, run_after);
CREATE INDEX daily_content_editions_date_idx ON public.daily_content_editions (edition_date DESC, slot);
CREATE INDEX daily_content_posts_edition_idx ON public.daily_content_posts (edition_id);
CREATE INDEX daily_content_receipts_post_idx ON public.daily_content_receipts (post_id);
CREATE INDEX daily_content_events_at_idx ON public.daily_content_events (at DESC);

-- 3. ACCESS: RLS on with no policies; service_role gets only the operations the
--    worker and dashboard use (no DELETE anywhere; receipts and events are append-only).
ALTER TABLE public.daily_content_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_snapshots TO service_role;
ALTER TABLE public.daily_content_editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_editions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_editions TO service_role;
ALTER TABLE public.daily_content_renders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_renders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_renders TO service_role;
ALTER TABLE public.daily_content_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_destinations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.daily_content_destinations TO service_role;
ALTER TABLE public.daily_content_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_posts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_posts TO service_role;
ALTER TABLE public.daily_content_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_receipts TO service_role;
ALTER TABLE public.daily_content_pauses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_pauses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_pauses TO service_role;
ALTER TABLE public.daily_content_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_jobs TO service_role;
ALTER TABLE public.daily_content_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_content_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_events TO service_role;
REVOKE ALL ON SEQUENCE public.daily_content_receipts_id_seq, public.daily_content_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.daily_content_receipts_id_seq, public.daily_content_events_id_seq TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daily_content_reporter') THEN
    CREATE ROLE daily_content_reporter NOLOGIN;
  END IF;
END $$;
GRANT SELECT ON public.daily_content_snapshots, public.daily_content_editions, public.daily_content_renders,
  public.daily_content_destinations, public.daily_content_posts, public.daily_content_receipts,
  public.daily_content_pauses, public.daily_content_jobs, public.daily_content_events
  TO daily_content_reporter;

-- 4. SEED: everything off
INSERT INTO public.daily_content_destinations (destination, notes) VALUES
  ('internal_feed', 'Smarter.Poker Official social_posts row; needs Gate 4'),
  ('facebook',      'Facebook Page Reels; account UNVERIFIED; needs Gate 4'),
  ('instagram',     'Instagram Reels; account UNVERIFIED; needs Gate 4'),
  ('youtube',       'YouTube Shorts; account UNVERIFIED; needs Gate 4');
INSERT INTO public.daily_content_pauses (scope, paused, reason, set_by) VALUES
  ('global', true, 'Gate 4 not approved: publishing is off', 'migration 20261112225638');

-- 5. SOURCE READS (read-only, bounded by the caller's window)
CREATE FUNCTION public.fn_daily_content_source(p_from timestamptz, p_to timestamptz, p_detail boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_events jsonb; v_players jsonb; v_payouts jsonb; v_profiles jsonb; v_ids uuid[];
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '8 days' THEN
    RAISE EXCEPTION 'DAILY_CONTENT_WINDOW_INVALID: window must be positive and at most 8 days';
  END IF;

  v_ids := ARRAY(SELECT t.id FROM public.tournaments t
                  WHERE t.tournament_type = 'MTT' AND t.ended_at >= p_from AND t.ended_at < p_to);

  SELECT COALESCE(jsonb_agg(e ORDER BY e->>'ended_at', e->>'id'), '[]'::jsonb) INTO v_events FROM (
    SELECT jsonb_build_object(
      'id', t.id, 'name', t.name, 'game_type', t.game_type, 'variant', t.variant, 'status', t.status,
      'tournament_type', t.tournament_type, 'start_time', t.start_time, 'ended_at', t.ended_at,
      'club_id', t.club_id, 'club_name', c.name, 'is_private', COALESCE(t.is_private, false),
      'free_buy', COALESCE(t.free_buy, false), 'guaranteed_prize', t.guaranteed_prize,
      'prize_pool', t.prize_pool,
      'field', (SELECT count(*) FROM public.tournament_players p WHERE p.tournament_id = t.id),
      'positioned', (SELECT count(p.position) FROM public.tournament_players p WHERE p.tournament_id = t.id),
      'distinct_positions', (SELECT count(DISTINCT p.position) FROM public.tournament_players p WHERE p.tournament_id = t.id),
      'max_position', (SELECT max(p.position) FROM public.tournament_players p WHERE p.tournament_id = t.id),
      'structure_rows', (SELECT count(*) FROM public.tournament_payouts y WHERE y.tournament_id = t.id AND y.source = 'structure'),
      'structure_unpaid', (SELECT count(*) FROM public.tournament_payouts y WHERE y.tournament_id = t.id AND y.source = 'structure' AND y.paid_at IS NULL),
      'winner_user_id', (SELECT p.user_id FROM public.tournament_players p WHERE p.tournament_id = t.id AND p.position = 1 ORDER BY p.user_id LIMIT 1)
    ) AS e
    FROM public.tournaments t
    LEFT JOIN public.clubs c ON c.id = t.club_id
    WHERE t.id = ANY(v_ids)
  ) s;

  IF p_detail THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_array(p.tournament_id, p.user_id, p.position) ORDER BY p.tournament_id, p.position NULLS LAST, p.user_id), '[]'::jsonb)
      INTO v_players
      FROM public.tournament_players p
      JOIN public.tournaments t ON t.id = p.tournament_id AND t.status = 'COMPLETED'
     WHERE p.tournament_id = ANY(v_ids);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('tournament_id', y.tournament_id, 'user_id', y.user_id,
             'position', y.position, 'amount', y.amount, 'source', y.source, 'paid_at', y.paid_at, 'created_at', y.created_at)
             ORDER BY y.tournament_id, y.position NULLS LAST, y.user_id), '[]'::jsonb)
      INTO v_payouts
      FROM public.tournament_payouts y WHERE y.tournament_id = ANY(v_ids);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id,
             'name', COALESCE(NULLIF(btrim(pr.display_name), ''), pr.username),
             'username', pr.username, 'is_horse', COALESCE(pr.is_horse, false),
             'is_admin', COALESCE(pr.is_admin, false), 'avatar_url', pr.avatar_url) ORDER BY pr.id), '[]'::jsonb)
      INTO v_profiles
      FROM public.profiles pr
      WHERE pr.id IN (SELECT p.user_id FROM public.tournament_players p WHERE p.tournament_id = ANY(v_ids));
  ELSE
    v_players := '[]'::jsonb; v_payouts := '[]'::jsonb;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id,
             'name', COALESCE(NULLIF(btrim(pr.display_name), ''), pr.username),
             'username', pr.username, 'is_horse', COALESCE(pr.is_horse, false),
             'is_admin', COALESCE(pr.is_admin, false), 'avatar_url', pr.avatar_url) ORDER BY pr.id), '[]'::jsonb)
      INTO v_profiles
      FROM public.profiles pr
      WHERE pr.id IN (SELECT (e->>'winner_user_id')::uuid FROM jsonb_array_elements(v_events) e WHERE e->>'winner_user_id' IS NOT NULL);
  END IF;

  RETURN jsonb_build_object('read_at', now(), 'from', p_from, 'to', p_to, 'detail', p_detail,
    'events', v_events, 'players', v_players, 'payouts', v_payouts, 'profiles', v_profiles);
END
$fn$;

CREATE FUNCTION public.fn_daily_content_schedule(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE WHEN p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '2 days'
    THEN NULL ELSE jsonb_build_object('read_at', now(), 'from', p_from, 'to', p_to, 'events',
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'game_type', t.game_type, 'variant', t.variant, 'status', t.status,
        'start_time', t.start_time, 'club_name', c.name, 'free_buy', COALESCE(t.free_buy, false),
        'guaranteed_prize', t.guaranteed_prize, 'is_private', COALESCE(t.is_private, false),
        'is_vip_only', COALESCE(t.is_vip_only, false))
        ORDER BY t.start_time, t.id)
      FROM public.tournaments t LEFT JOIN public.clubs c ON c.id = t.club_id
      WHERE t.tournament_type = 'MTT' AND t.start_time >= p_from AND t.start_time < p_to), '[]'::jsonb)) END
$fn$;

-- 6. LEASED JOB CLAIM
CREATE FUNCTION public.fn_daily_content_claim_job(p_owner text, p_lease_seconds integer DEFAULT 300, p_dry_run boolean DEFAULT true)
RETURNS SETOF public.daily_content_jobs
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_owner IS NULL OR btrim(p_owner) = '' OR p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'DAILY_CONTENT_CLAIM_INVALID';
  END IF;
  RETURN QUERY
  UPDATE public.daily_content_jobs j
     SET state = 'running', lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1, updated_at = now()
   WHERE j.id = (
     SELECT k.id FROM public.daily_content_jobs k
      WHERE k.dry_run = p_dry_run
        AND ((k.state = 'queued' AND k.run_after <= now())
          OR (k.state = 'running' AND k.lease_expires_at < now()))
        AND k.attempts < k.max_attempts
      ORDER BY k.run_after, k.created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_daily_content_source(timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_daily_content_schedule(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_daily_content_claim_job(text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_daily_content_source(timestamptz, timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_daily_content_schedule(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_daily_content_claim_job(text, integer, boolean) TO service_role;

-- 7. PRIVATE STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('daily-content', 'daily-content', false, 52428800, ARRAY['video/mp4','image/png','application/json'])
ON CONFLICT (id) DO NOTHING;

-- 8. POST-APPLY ASSERTIONS
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'daily\_content\_%' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'post-apply assertion failed: RLS off on % daily_content tables', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'daily\_content\_%' AND grantee IN ('anon','authenticated','PUBLIC');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'post-apply assertion failed: anon/authenticated hold % grants', v_bad; END IF;

  IF has_function_privilege('anon', 'public.fn_daily_content_source(timestamptz, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_daily_content_claim_job(text, integer, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_daily_content_schedule(timestamptz, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply assertion failed: an RPC is executable by anon/authenticated';
  END IF;

  IF (SELECT count(*) FROM public.daily_content_destinations WHERE enabled) <> 0 THEN
    RAISE EXCEPTION 'post-apply assertion failed: a destination is enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_content_pauses WHERE scope = 'global' AND paused) THEN
    RAISE EXCEPTION 'post-apply assertion failed: global pause is not on';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'daily-content' AND public = false) THEN
    RAISE EXCEPTION 'post-apply assertion failed: private bucket missing';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (new objects only; run as a new _revert_ migration if needed)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION public.fn_daily_content_claim_job(text, integer, boolean);
-- DROP FUNCTION public.fn_daily_content_schedule(timestamptz, timestamptz);
-- DROP FUNCTION public.fn_daily_content_source(timestamptz, timestamptz, boolean);
-- DROP TABLE public.daily_content_events, public.daily_content_jobs, public.daily_content_receipts,
--   public.daily_content_posts, public.daily_content_pauses, public.daily_content_destinations,
--   public.daily_content_renders, public.daily_content_editions, public.daily_content_snapshots;
-- DROP ROLE daily_content_reporter;
-- DELETE FROM storage.buckets WHERE id = 'daily-content';  -- only when empty
-- COMMIT;
