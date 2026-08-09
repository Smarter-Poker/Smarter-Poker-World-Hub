-- ============================================================================
-- 20260809010000_create_increment_share_view_rpc.sql
-- Share-link view counting has NEVER worked in production:
--   • both call sites (pages/sandbox/[id].js getServerSideProps and the PATCH
--     beacon in /api/sandbox/create-share) call rpc('increment_share_view'),
--     which did not exist — the error was swallowed by design;
--   • the read-modify-write fallback used a `view_count` column, but the
--     production column is `views` — 42703, also swallowed by design.
-- Net effect: every view of every shared hand counted for nothing.
--
-- This creates the missing RPC as an atomic UPDATE on the real column.
-- Idempotent (CREATE OR REPLACE). No data rewrite. Grants are tight: both
-- callers run server-side through the service-role client; nothing
-- client-side calls this, so authenticated/anon get nothing.
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('public.sandbox_shared_scenarios') IS NULL THEN
        RAISE EXCEPTION 'sandbox_shared_scenarios missing — wrong database?';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sandbox_shared_scenarios'
          AND column_name = 'views'
    ) THEN
        RAISE EXCEPTION 'sandbox_shared_scenarios.views missing — schema drift, do not guess';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_share_view(share_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    UPDATE public.sandbox_shared_scenarios
       SET views = COALESCE(views, 0) + 1
     WHERE id = share_id;
$$;

COMMENT ON FUNCTION public.increment_share_view(text) IS
    'Atomic view-count bump for a shared sandbox scenario. Called server-side only (service role); a missing row is a silent no-op by design — the callers must never leak id existence.';

REVOKE ALL ON FUNCTION public.increment_share_view(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_share_view(text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_share_view(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_view(text) TO service_role;
