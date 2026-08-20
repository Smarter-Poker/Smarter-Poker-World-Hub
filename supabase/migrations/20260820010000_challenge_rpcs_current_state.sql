-- ============================================================================
-- CHALLENGE RPCs -- capture current production state                  Tier 2
-- ============================================================================
-- WHY THIS FILE EXISTS
--
-- Earlier migrations in this directory still contain OLDER, VULNERABLE bodies:
--
--   supabase/migrations/20260312005_lucky_wheel_and_missions.sql
--     -> a claim_daily_challenge with NO catalog validation and NO auth.uid()
--        check, crediting through the pre-atomic wallet path.
--   supabase/migrations/20260322_atomic_challenge_progress.sql
--     -> an increment_challenge_progress that trusts the CALLER's p_requirement,
--        so passing 1 completes any challenge instantly.
--
-- Replaying this directory onto a fresh branch DB therefore ends with the
-- exploitable versions installed, silently undoing the 2026-08-19 lockdown.
-- Migrations replay in filename order, so this file -- dated after them --
-- restores the hardened definitions last and wins.
--
-- These bodies were read back out of production with pg_get_functiondef, not
-- retyped, so they are exact.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Assignment. The client has no INSERT grant on user_daily_challenges; every
-- row is created here, validated against the catalog, with the period-key shape
-- enforced by regex so free-form keys cannot be used to mint unlimited rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_user_challenges(
  p_assigned_date text,
  p_challenge_ids text[]
)
RETURNS SETOF public.user_daily_challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  text;
  v_existing int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_assigned_date !~ '^(\d{4}-\d{2}-\d{2}|W\d{4}-\d{2}-\d{2}|M\d{4}-\d{2})$' THEN
    RAISE EXCEPTION 'Invalid period key %', p_assigned_date;
  END IF;

  IF array_length(p_challenge_ids, 1) IS NULL OR array_length(p_challenge_ids, 1) > 8 THEN
    RAISE EXCEPTION 'Between 1 and 8 challenges per period';
  END IF;

  SELECT count(*) INTO v_existing
    FROM public.user_daily_challenges
   WHERE user_id = v_uid AND assigned_date = p_assigned_date;

  IF v_existing = 0 THEN
    FOREACH v_id IN ARRAY p_challenge_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.daily_challenge_catalog WHERE id = v_id) THEN
        RAISE EXCEPTION 'Unknown challenge %', v_id;
      END IF;
      INSERT INTO public.user_daily_challenges (user_id, challenge_id, assigned_date, progress, completed)
      VALUES (v_uid, v_id, p_assigned_date, 0, false)
      ON CONFLICT (user_id, challenge_id, assigned_date) DO NOTHING;
    END LOOP;
  END IF;

  RETURN QUERY
    SELECT * FROM public.user_daily_challenges
     WHERE user_id = v_uid AND assigned_date = p_assigned_date;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Progress. p_requirement is accepted for signature compatibility with clients
-- mid-rollout and then IGNORED -- the requirement always comes from the catalog.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_challenge_progress(
  p_user_id uuid,
  p_challenge_row_id uuid,
  p_amount integer,
  p_requirement integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid;
  v_requirement integer;
  v_progress    integer;
  v_completed   boolean;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_uid := p_user_id;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL OR (p_user_id IS NOT NULL AND p_user_id <> v_uid) THEN
      RETURN jsonb_build_object('updated', false, 'error', 'not authorized');
    END IF;
  END IF;

  -- Requirement from the CATALOG, never from the caller.
  SELECT c.requirement INTO v_requirement
    FROM public.user_daily_challenges u
    JOIN public.daily_challenge_catalog c ON c.id = u.challenge_id
   WHERE u.id = p_challenge_row_id AND u.user_id = v_uid;

  IF v_requirement IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'error', 'row or catalog entry not found');
  END IF;

  UPDATE public.user_daily_challenges
     SET progress = LEAST(progress + GREATEST(COALESCE(p_amount, 0), 0), v_requirement),
         completed = (progress + GREATEST(COALESCE(p_amount, 0), 0)) >= v_requirement,
         completed_at = CASE
           WHEN (progress + GREATEST(COALESCE(p_amount, 0), 0)) >= v_requirement
                AND completed_at IS NULL THEN now()
           ELSE completed_at END
   WHERE id = p_challenge_row_id AND user_id = v_uid
   RETURNING progress, completed INTO v_progress, v_completed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated', false);
  END IF;
  RETURN jsonb_build_object('updated', true, 'progress', v_progress, 'completed', v_completed);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Claim. Idempotent (a duplicate claim returns false rather than raising, so a
-- retry after a lost response does not show an error for chips already paid),
-- catalog-validated, and credited through the idempotency-keyed wallet path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_daily_challenge(
  p_user_id uuid,
  p_challenge_row_id uuid,
  p_reward_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_row public.user_daily_challenges%ROWTYPE;
  v_cat public.daily_challenge_catalog%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_uid := p_user_id;
  ELSE
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
      RAISE EXCEPTION 'Cannot claim a challenge for another user';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.user_daily_challenges
   WHERE id = p_challenge_row_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challenge not found'; END IF;

  IF v_row.claimed THEN RETURN false; END IF;
  IF NOT v_row.completed THEN RAISE EXCEPTION 'Challenge not completed yet'; END IF;

  SELECT * INTO v_cat FROM public.daily_challenge_catalog WHERE id = v_row.challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown challenge % - not in the server catalog', v_row.challenge_id;
  END IF;

  -- Defence in depth. progress is no longer client-writable, but keep the
  -- assertion so a future policy regression cannot silently mint chips.
  IF COALESCE(v_row.progress, 0) < v_cat.requirement THEN
    RAISE EXCEPTION 'Challenge progress %/% does not meet the requirement',
      COALESCE(v_row.progress, 0), v_cat.requirement;
  END IF;

  UPDATE public.user_daily_challenges
     SET claimed = true, claimed_at = now()
   WHERE id = p_challenge_row_id;

  IF v_cat.chip_reward > 0 THEN
    IF NOT public.atomic_credit_wallet_and_log(
         v_uid, v_cat.chip_reward, 'bonus',
         'Challenge reward: ' || v_row.challenge_id,
         NULL, NULL, NULL,
         'challenge_claim:' || p_challenge_row_id::text) THEN
      RAISE EXCEPTION 'Challenge reward credit failed';
    END IF;
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants. `anon` gets nothing; the client reaches these only as `authenticated`.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assign_user_challenges(text, text[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.increment_challenge_progress(uuid, uuid, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_user_challenges(text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_challenge_progress(uuid, uuid, integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ASSERTIONS -- fail loudly if a replay left the vulnerable shapes installed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- The old increment took p_requirement as a REQUIRED 3-arg-plus form and used
  -- it. If the catalog lookup is missing from the body, the old one won.
  IF pg_get_functiondef('public.increment_challenge_progress(uuid,uuid,integer,integer)'::regprocedure)
     NOT LIKE '%daily_challenge_catalog%' THEN
    RAISE EXCEPTION 'increment_challenge_progress is not reading the catalog -- the vulnerable version is installed';
  END IF;

  IF pg_get_functiondef('public.claim_daily_challenge(uuid,uuid,numeric)'::regprocedure)
     NOT LIKE '%atomic_credit_wallet_and_log%' THEN
    RAISE EXCEPTION 'claim_daily_challenge is not using the atomic credit path';
  END IF;

  -- The write lockdown must still hold.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_name = 'user_daily_challenges'
       AND grantee IN ('authenticated','anon')
       AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'user_daily_challenges write grants are back -- chip minting is possible';
  END IF;
END $$;
