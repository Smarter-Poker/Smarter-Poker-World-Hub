-- ═══════════════════════════════════════════════════════════════════════════
-- client_crash_log — durable sink for React error-boundary crashes
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- On 2026-08-19 the Club Arena messenger page rendered "Messenger Temporarily
-- Unavailable" for the owner of a live club. That string comes from
-- HubErrorBoundary, i.e. something threw during render. There was no way to
-- find out what:
--
--   * Sentry's client SDK is inert in production. sentry.client.config.js
--     only calls Sentry.init() when NEXT_PUBLIC_SENTRY_DSN is set, and the
--     production bundle contains no ingest host at all — every
--     Sentry.captureException() in the error boundaries is a no-op. The
--     comment in pages/api/auth/log-client-error.js says the same thing:
--     auto-instrumentation is disabled as an OOM workaround.
--   * public.sentry_error_log holds 0 rows, so the snapshot mirror that was
--     supposed to back-fill visibility has never run either.
--   * PageErrorBoundary writes crashes to sessionStorage, which dies with the
--     tab and is unreadable by anyone but the user.
--
-- Net effect: a page could die in production and leave zero evidence. This
-- table is that evidence. Boundaries POST to /api/client-crash, which writes
-- here with the service-role key.
--
-- ACCESS: service role only. No anon, no authenticated. RLS is on with no
-- policies, so PostgREST returns nothing to a user token even if the grants
-- were ever widened by accident.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_crash_log (
    id               bigserial PRIMARY KEY,
    created_at       timestamptz NOT NULL DEFAULT now(),
    boundary         text        NOT NULL,   -- 'hub' | 'page'
    section          text,                   -- HubErrorBoundary name prop, e.g. 'Messenger'
    route            text,                   -- window.location.pathname
    url              text,                   -- full href incl. query
    error_name       text,
    message          text,
    stack            text,
    component_stack  text,
    user_agent       text,
    user_id          uuid,
    embedded         boolean NOT NULL DEFAULT false, -- true when running inside an iframe
    build_sha        text
);

COMMENT ON TABLE public.client_crash_log IS
    'React error-boundary crashes posted from the browser via /api/client-crash. Service-role only. See 20260819_client_crash_log.sql for why Sentry could not be used.';

CREATE INDEX IF NOT EXISTS client_crash_log_created_at_idx
    ON public.client_crash_log (created_at DESC);
CREATE INDEX IF NOT EXISTS client_crash_log_section_created_at_idx
    ON public.client_crash_log (section, created_at DESC);

ALTER TABLE public.client_crash_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_crash_log FROM PUBLIC;
REVOKE ALL ON TABLE public.client_crash_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.client_crash_log_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.client_crash_log_id_seq FROM anon, authenticated;

-- ── Post-apply assertions ────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'client_crash_log' AND rowsecurity
    ) THEN
        RAISE EXCEPTION 'client_crash_log exists but RLS is not enabled';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = 'client_crash_log'
          AND grantee IN ('anon', 'authenticated')
    ) THEN
        RAISE EXCEPTION 'client_crash_log still grants privileges to anon/authenticated';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'client_crash_log'
    ) THEN
        RAISE EXCEPTION 'client_crash_log should have no RLS policies (service-role only)';
    END IF;
END $$;

-- ROLLBACK
--   DROP TABLE IF EXISTS public.client_crash_log;
