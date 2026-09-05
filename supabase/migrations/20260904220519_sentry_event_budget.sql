-- ═══════════════════════════════════════════════════════════════════════
-- 20260904220519_sentry_event_budget.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive: two tables, one function)
-- AUTHOR:      Claude (Cowork) - Sentry free-tier cut
-- AFFECTS:     tables: sentry_event_budget, sentry_event_fingerprints
--              rpcs:   fn_sentry_budget_take(text, int, int)
--              rls:    none (service_role only; anon/authenticated revoked)
-- IRREVERSIBLE: no
--
-- WHY:
--   Sentry is on the free Developer plan from 2026-09-16: 5,000 errors a
--   month, shared by the World Hub server, the Arena client and the engine
--   (docs/SENTRY-FREE-TIER-POLICY.md, section 1). The Hub server's share is
--   60 events a day with a per-fingerprint cap of 3 (section 4). Vercel
--   functions do not share memory, so an in-process token bucket would be
--   one bucket PER LAMBDA and would enforce nothing. The bucket has to live
--   somewhere every lambda can see, and that is this database.
--
--   sentry.server.config.js `beforeSend` calls fn_sentry_budget_take() for
--   every event it is about to send. If the function says no (or cannot be
--   reached), the event is dropped. Fail closed: a budget check that fails
--   open is a budget that does not exist.
--
-- HOW (high level):
--   - sentry_event_budget(day PK, sent): one row per UTC day, global count.
--   - sentry_event_fingerprints(day, fingerprint PK, sent): per-error count.
--   - fn_sentry_budget_take(fingerprint, daily_limit, fingerprint_limit):
--     SECURITY DEFINER. Checks the fingerprint cap first (a duplicate never
--     consumes global budget), then takes one global token with an atomic
--     UPDATE ... WHERE sent < limit RETURNING. Returns jsonb
--     {allowed, reason, sent, fingerprint_sent}.
--   - Both tables and the function are revoked from anon/authenticated.
--     Only service_role (the server config's client) can call it.
--   - Old rows are pruned opportunistically inside the function (rows older
--     than 14 days), so no cron is needed. Section 11 of CLAUDE.md forbids a
--     new scheduled job for housekeeping this small.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sentry_event_budget'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.sentry_event_budget already exists';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_sentry_budget_take'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.fn_sentry_budget_take already exists';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE TABLE public.sentry_event_budget (
    day   date    NOT NULL PRIMARY KEY,
    sent  integer NOT NULL DEFAULT 0 CHECK (sent >= 0)
);
COMMENT ON TABLE public.sentry_event_budget IS
    'Sentry free-tier daily token bucket for the World Hub server runtime. One row per UTC day. Read/written only by fn_sentry_budget_take() from sentry.server.config.js beforeSend. See docs/SENTRY-FREE-TIER-POLICY.md.';

CREATE TABLE public.sentry_event_fingerprints (
    day         date    NOT NULL,
    fingerprint text    NOT NULL,
    sent        integer NOT NULL DEFAULT 0 CHECK (sent >= 0),
    PRIMARY KEY (day, fingerprint)
);
COMMENT ON TABLE public.sentry_event_fingerprints IS
    'Sentry free-tier per-fingerprint daily cap (3/day) for the World Hub server runtime. Companion to sentry_event_budget.';

CREATE FUNCTION public.fn_sentry_budget_take(
    p_fingerprint       text,
    p_daily_limit       integer DEFAULT 60,
    p_fingerprint_limit integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_day      date := (now() AT TIME ZONE 'utc')::date;
    v_fp       text := COALESCE(NULLIF(left(p_fingerprint, 200), ''), 'unknown');
    v_fp_sent  integer;
    v_sent     integer;
BEGIN
    -- Opportunistic housekeeping: keep two weeks of history, no cron needed.
    DELETE FROM public.sentry_event_budget       WHERE day < v_day - 14;
    DELETE FROM public.sentry_event_fingerprints WHERE day < v_day - 14;

    -- Make sure today's rows exist. ON CONFLICT DO NOTHING is safe under
    -- concurrency; the UPDATEs below are the atomic part.
    INSERT INTO public.sentry_event_budget (day, sent)
        VALUES (v_day, 0) ON CONFLICT (day) DO NOTHING;
    INSERT INTO public.sentry_event_fingerprints (day, fingerprint, sent)
        VALUES (v_day, v_fp, 0) ON CONFLICT (day, fingerprint) DO NOTHING;

    -- 1. Per-fingerprint cap first. The fourth identical error today is
    --    dropped WITHOUT touching the global budget: Sentry groups them
    --    anyway, so a duplicate buys nothing.
    UPDATE public.sentry_event_fingerprints
       SET sent = sent + 1
     WHERE day = v_day AND fingerprint = v_fp AND sent < p_fingerprint_limit
    RETURNING sent INTO v_fp_sent;

    IF v_fp_sent IS NULL THEN
        SELECT sent INTO v_fp_sent FROM public.sentry_event_fingerprints
         WHERE day = v_day AND fingerprint = v_fp;
        SELECT sent INTO v_sent FROM public.sentry_event_budget WHERE day = v_day;
        RETURN jsonb_build_object(
            'allowed', false, 'reason', 'fingerprint_cap',
            'sent', COALESCE(v_sent, 0), 'fingerprint_sent', COALESCE(v_fp_sent, 0));
    END IF;

    -- 2. Global daily token. Atomic: the row lock on UPDATE serialises
    --    concurrent lambdas, and the WHERE clause is the ceiling.
    UPDATE public.sentry_event_budget
       SET sent = sent + 1
     WHERE day = v_day AND sent < p_daily_limit
    RETURNING sent INTO v_sent;

    IF v_sent IS NULL THEN
        -- Budget exhausted. Give the fingerprint token back so the count
        -- there stays honest about what actually reached Sentry.
        UPDATE public.sentry_event_fingerprints
           SET sent = GREATEST(sent - 1, 0)
         WHERE day = v_day AND fingerprint = v_fp;
        SELECT sent INTO v_sent FROM public.sentry_event_budget WHERE day = v_day;
        RETURN jsonb_build_object(
            'allowed', false, 'reason', 'daily_budget',
            'sent', COALESCE(v_sent, 0), 'fingerprint_sent', GREATEST(v_fp_sent - 1, 0));
    END IF;

    RETURN jsonb_build_object(
        'allowed', true, 'reason', 'ok',
        'sent', v_sent, 'fingerprint_sent', v_fp_sent);
END;
$$;

COMMENT ON FUNCTION public.fn_sentry_budget_take(text, integer, integer) IS
    'Take one Sentry event token for today (UTC). Per-fingerprint cap checked first, then the global daily bucket. Returns {allowed, reason, sent, fingerprint_sent}. service_role only.';

REVOKE ALL ON TABLE public.sentry_event_budget       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sentry_event_fingerprints FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sentry_budget_take(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sentry_event_budget       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sentry_event_fingerprints TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_sentry_budget_take(text, integer, integer) TO service_role;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    r jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sentry_event_budget'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: sentry_event_budget missing';
    END IF;
    IF has_table_privilege('anon', 'public.sentry_event_budget', 'SELECT')
       OR has_table_privilege('authenticated', 'public.sentry_event_budget', 'SELECT')
       OR has_function_privilege('anon', 'public.fn_sentry_budget_take(text, integer, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_sentry_budget_take(text, integer, integer)', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'post-apply failed: anon/authenticated still have access to the Sentry budget';
    END IF;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
