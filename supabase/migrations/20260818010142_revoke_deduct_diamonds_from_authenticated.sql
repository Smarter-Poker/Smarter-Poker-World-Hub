-- Applied to production 2026-08-18 as 20260818010142 via Supabase MCP
-- apply_migration. Mirrored here per CLAUDE.md RULE 2 so the repo matches prod.
--
-- Revoke EXECUTE on deduct_diamonds from `authenticated`.
--
-- WHY: deduct_diamonds is SECURITY DEFINER and takes caller-supplied
-- p_user_id / p_amount / p_source / p_transaction_type / p_reference_id.
-- It self-checks auth.uid() = p_user_id, so a browser could never deduct from
-- ANOTHER player. The real exposure is narrower but genuine:
--   1. bypasses the /api/diamonds/spend ALLOWED_SOURCES validation, letting a
--      browser write arbitrary source/type/description into diamond_transactions;
--   2. replaying a known p_reference_id returns {success:true, idempotent:true}
--      with NO new deduction, so any flow trusting that result client-side
--      grants the item for free.
--
-- SAFE BECAUSE: the only browser caller was the legacy fallback in club-arena
-- src/services/ThrowableService.ts, removed in d3899e89e. The primary path
-- fn_use_throwable is SECURITY DEFINER, derives the user from auth.uid(),
-- accepts no user_id/amount parameter, and is advisory-locked - it keeps its
-- `authenticated` grant, which is the correct shape. diamond_transactions has
-- 0 rows with transaction_type='throwable' all-time. Every server caller
-- (pages/api/diamonds/spend.js, live/gift.js, store/diamond-transfer.js,
-- commander premiumFeatureGate.js) uses service_role and is unaffected.

DO $$
DECLARE
  v_has_authenticated boolean;
  v_use_throwable     integer;
BEGIN
  SELECT has_function_privilege('authenticated',
           'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)',
           'EXECUTE')
    INTO v_has_authenticated;
  IF NOT v_has_authenticated THEN
    RAISE EXCEPTION
      'Pre-flight: authenticated already lacks EXECUTE on deduct_diamonds - nothing to do, investigate before re-running.';
  END IF;

  SELECT count(*) INTO v_use_throwable
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_use_throwable';
  IF v_use_throwable = 0 THEN
    RAISE EXCEPTION
      'Pre-flight: fn_use_throwable is missing. Revoking now would leave throwables with no working path.';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer) FROM authenticated;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
       'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-apply: authenticated STILL has EXECUTE on deduct_diamonds.';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-apply: service_role LOST EXECUTE on deduct_diamonds - server spend paths would break.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.fn_use_throwable(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Post-apply: authenticated lost EXECUTE on fn_use_throwable - throwables would break for players.';
  END IF;
END $$;

-- ROLLBACK (paste and run if throwables or any client spend path regress):
--   GRANT EXECUTE ON FUNCTION
--     public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)
--     TO authenticated;
-- Restores the grant only; it does NOT restore the deleted ThrowableService
-- fallback, which was broken independently of the grant.
