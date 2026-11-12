-- ═══════════════════════════════════════════════════════════════════════
-- 20261112232448_daily_content_least_privilege_grants.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (Daily Content Engine, Gate 3 I-1)
-- AFFECTS:     grants on public.daily_content_* (service_role only)
-- IRREVERSIBLE: no
--
-- WHY:
--   20261112225638_daily_content_engine_i1 was applied with GRANT ALL to
--   service_role inside a DO loop. The repository's explicit-table-access gate
--   requires each new table to REVOKE ALL from PUBLIC, anon, authenticated and
--   service_role and then grant only the operations used. The creation file now
--   states that boundary literally; this migration brings the installed grants
--   to the same least-privilege state (no DELETE or TRUNCATE for service_role;
--   receipts and events are append-only).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

REVOKE ALL ON TABLE public.daily_content_snapshots FROM service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_snapshots TO service_role;
REVOKE ALL ON TABLE public.daily_content_editions FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_editions TO service_role;
REVOKE ALL ON TABLE public.daily_content_renders FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_renders TO service_role;
REVOKE ALL ON TABLE public.daily_content_destinations FROM service_role;
GRANT SELECT, UPDATE ON TABLE public.daily_content_destinations TO service_role;
REVOKE ALL ON TABLE public.daily_content_posts FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_posts TO service_role;
REVOKE ALL ON TABLE public.daily_content_receipts FROM service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_receipts TO service_role;
REVOKE ALL ON TABLE public.daily_content_pauses FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_pauses TO service_role;
REVOKE ALL ON TABLE public.daily_content_jobs FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_content_jobs TO service_role;
REVOKE ALL ON TABLE public.daily_content_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.daily_content_events TO service_role;

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'daily\_content\_%'
     AND grantee = 'service_role' AND privilege_type IN ('DELETE','TRUNCATE','REFERENCES','TRIGGER');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'post-apply assertion failed: service_role keeps % extra privileges', v_bad; END IF;
  SELECT count(*) INTO v_bad FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'daily\_content\_%' AND grantee IN ('anon','authenticated','PUBLIC');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'post-apply assertion failed: anon/authenticated hold grants'; END IF;
END $$;

COMMIT;
