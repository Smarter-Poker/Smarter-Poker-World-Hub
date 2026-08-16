-- APPLIED TO PRODUCTION 2026-08-16 15:34:43 UTC (version 20260816153443)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVILEGED FUNCTION LOCK
--
-- Why this exists (probe evidence, 2026-08-16):
--   An event trigger on GRANT DOES fire, but pg_event_trigger_ddl_commands()
--   reports it as:  [tag=GRANT | object_type=FUNCTION | objid=NULL | ident=NULL]
--   -- note object_type is UPPERCASE and there is NO object identity at all.
--   So a GRANT handler cannot know which function was granted. The previous
--   migration's GRANT tag was therefore a no-op (verified: targeted_grant
--   still left anon EXECUTE = true).
--
-- Fix: on any function-level GRANT, sweep a persisted lock list instead of
-- trying to identify the granted object. The lock list records the functions
-- whose anon-denied state has been reviewed and must never regress.
--
-- Seeded with every privileged-named function that is ALREADY anon-denied
-- today, so applying this migration changes NO live privilege. It only makes
-- today's verified state non-regressible.
--
-- The 35 still-anon-executable MEDIUM/LOW functions are deliberately NOT
-- seeded -- they are being drained in reviewed batches, and blind-revoking
-- them could break genuinely public surfaces (e.g. an unauthenticated
-- jackpot ticker reading a *_bbj_* function). Each one joins the lock list
-- as it is reviewed and revoked.
--
-- NOTE: the sweep body written here had a latent defect (regprocedure cast of
-- a name-bearing signature). It is corrected in 20260816153613 before any
-- GRANT ran against it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.privileged_function_lock (
  function_signature text PRIMARY KEY,
  security_definer   boolean NOT NULL DEFAULT false,
  reason             text    NOT NULL,
  locked_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.privileged_function_lock ENABLE ROW LEVEL SECURITY;
-- No policies: readable/writable only by service_role and SECURITY DEFINER code.

COMMENT ON TABLE public.privileged_function_lock IS
  'Functions whose PUBLIC/anon EXECUTE denial has been reviewed and must never regress. Swept by fn_autorevoke_privileged_anon() on every function GRANT.';

INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
SELECT
  format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
  p.prosecdef,
  CASE WHEN p.prosecdef
       THEN 'SECURITY DEFINER money/privileged function; anon EXECUTE would bypass RLS entirely.'
       ELSE 'Money/privileged function; anon EXECUTE denied for defence in depth.'
  END
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname !~ '^st_'
  AND p.proname NOT IN ('fn_audit_privileged_grants', 'fn_autorevoke_privileged_anon')
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND (
       p.proname ~* '(mint_|_mint|chip|wallet|promo|cashout|diamond|rake|bounty|settle|payout|clawback|purchase|treasury|jackpot|bbj)'
    OR p.proname ~* '^(credit|debit|transfer|distribute|deduct|atomic|admin)_'
    OR p.proname ~* '(promote_member|transfer_club_ownership|remove_player)'
  )
ON CONFLICT (function_signature) DO NOTHING;
