-- ═══════════════════════════════════════════════════════════════════════
-- 20261128120608_fn_staking_link_is_active.sql  (INSTALLED 2026-11-28 12:06 UTC)
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: one read-only SECURITY DEFINER function)
-- AUTHOR:      Claude (Bankroll Manager programme coordinator, owner-authorized)
-- AFFECTS:     rpcs: public.fn_staking_link_is_active(uuid)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/stakingStatement.mjs readStakingStatement, used by
--   pages/staking/statement/[token].js.
--
-- WHY: fn_staking_statement returns zero rows both for a dead link and for a
--   live link on a deal with no sessions linked yet, so a freshly shared link
--   read "Expired Or Revoked". This answers only "is this link live?", so the
--   page can say "No Sessions Linked Yet" while revoked / expired / never
--   existed stay indistinguishable.
--
-- ROLLBACK: DROP FUNCTION public.fn_staking_link_is_active(uuid);  (the page
--   then throws on the second call: ship the client change first.)
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $pre$
BEGIN
  IF to_regclass('public.staking_share_links') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: staking_share_links missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'fn_staking_link_is_active') THEN
    RAISE EXCEPTION 'pre-flight failed: fn_staking_link_is_active already exists';
  END IF;
END
$pre$;
CREATE FUNCTION public.fn_staking_link_is_active(p_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_token IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staking_share_links k
     WHERE k.token = p_token
       AND k.revoked_at IS NULL
       AND k.expires_at > now()
  )
$fn$;
COMMENT ON FUNCTION public.fn_staking_link_is_active(uuid) IS
  'True only for an existing, unrevoked, unexpired staking share link token; reveals nothing else. Public statement page (2026-11-28).';
REVOKE ALL ON FUNCTION public.fn_staking_link_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_staking_link_is_active(uuid) TO anon, authenticated;
DO $post$
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_staking_link_is_active(uuid)'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_staking_link_is_active(uuid)'::regprocedure
                    AND proconfig::text LIKE '%search_path=%') THEN
    RAISE EXCEPTION 'post-apply: must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF NOT has_function_privilege('anon', 'public.fn_staking_link_is_active(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: anon cannot execute fn_staking_link_is_active';
  END IF;
  IF public.fn_staking_link_is_active(gen_random_uuid()) OR public.fn_staking_link_is_active(NULL) THEN
    RAISE EXCEPTION 'post-apply: an unknown or null token reads as active';
  END IF;
END
$post$;
COMMIT;
