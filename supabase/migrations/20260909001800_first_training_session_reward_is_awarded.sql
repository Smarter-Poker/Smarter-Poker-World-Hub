-- ═══════════════════════════════════════════════════════════════════════
-- 20260909001800_first_training_session_reward_is_awarded.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3  (trigger on a live table; issues currency)
-- AUTHOR:       Claude (Cowork), continuing Dan's 2026-09-08 instruction
-- AFFECTS:      fn_training_reward_award, trgfn_award_first_training_session,
--               trigger on training_attempts
-- IRREVERSIBLE: no  (rollback section at the bottom)
--
-- WHY:
--   first_training_session (15 diamonds, lifetime:true, active:true) is
--   advertised in the diamond store and had NO award call anywhere in the
--   codebase - it appeared only in a test file. It has never paid.
--
--   This closes the reward sweep. Yesterday I reported that five remaining
--   rewards "have hooks and were not exercised". That was wrong, and it was
--   wrong because I counted how often the reward KEY appeared in the repo
--   instead of checking whether an award was ever CALLED. Re-checked properly -
--   a key only counts if it appears in a file that also calls safeAward,
--   award_diamonds_v2, claimReward or awardDiamondsV2 - four more had no award
--   path at all, and hand_of_the_day was one of them.
--
-- WHY THIS IS THE ONLY ONE WIRED HERE:
--   * hand_of_the_day (10) and training_level_complete (8) DUPLICATE
--     training_reward, which is live, has paid, and is described in the catalog
--     as "Per-session training reward for completing a GTO training level or
--     the Hand of the Day" - it pays a variable 8-25 and the observed rows are
--     17-23 per level. Wiring these two would pay a second time for one
--     action. Which price is authoritative is a PRICING decision and RULE 10.6
--     reserves those to Dan.
--   * gto_chart_study needs "a server-recorded study session of sufficient
--     dwell time" (its own verifyNote). No dwell tracking exists;
--     memory_charts_gold is a chart DEFINITION table, not a per-user event.
--     That is an unbuilt feature, not a wiring gap.
--   * referral_qualified / referral_referee / referral_vip_conversion cannot
--     pay because NOTHING creates a referrals row. The only INSERT in the repo
--     is inside pages/api/social/__DISABLED_slug.js.bak.14778, the table holds
--     0 rows, /api/rewards/referral only ever SELECTs it, and
--     referral_vip_conversion additionally requires a Stripe webhook that does
--     not exist in this repo. The whole referral programme is dead at the
--     attribution layer, not the payout layer.
--
--   first_training_session is different: it is a one-time welcome bonus keyed
--   to a player's FIRST completed session, so it stacks with the per-session
--   training_reward by design rather than competing with it.
--
-- HOW:
--   AFTER UPDATE on training_attempts, firing only on the transition into
--   completed. Attempts are INSERTed in progress and UPDATEd on finish - all
--   14 completed rows have completed_at > started_at - so an INSERT trigger
--   would never see one, which is why this one differs from the seven social
--   triggers.
--
-- NO 24-HOUR AGE GATE, deliberately. fn_social_reward_award enforces one
-- because every social HTTP endpoint did. Applying it to a "welcome to the
-- grind" bonus would deny the welcome to exactly the brand-new player it is
-- for. Hence the sibling helper; fn_social_reward_award is left untouched
-- because changing its signature means dropping it while five live triggers
-- depend on it.
--
-- ANTI-FARMING:
--   * the reference id is the USER ALONE, no target, so it can physically only
--     ever pay once per player;
--   * the catalog row is lifetime:true, so award_diamonds_v2 refuses a second
--     one independently of the reference id;
--   * practice_only attempts pay nothing;
--   * failed attempts pay nothing;
--   * re-saving an already-completed attempt pays nothing (OLD.completed_at
--     must be NULL).
--
-- NO BACK-PAY: fires only on an attempt that completes from here on. The 14
-- already-completed rows are not revisited.
--
-- VERIFIED (rolled-back probe, 2026-09-09, all 5 PASS):
--   first completed session pays 1 - the amount is exactly the catalog's 15 -
--   a second session pays nothing - re-saving a finished attempt pays nothing -
--   a failed attempt pays nothing. Table counts unchanged; nothing committed.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='award_diamonds_v2') THEN
        RAISE EXCEPTION 'pre-flight failed: award_diamonds_v2 missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.diamond_reward_catalog
                   WHERE action_key='first_training_session' AND active IS TRUE AND lifetime IS TRUE) THEN
        RAISE EXCEPTION 'pre-flight failed: first_training_session must be active and lifetime in the catalog';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='training_attempts' AND column_name='practice_only') THEN
        RAISE EXCEPTION 'pre-flight failed: training_attempts.practice_only not found';
    END IF;
END $$;

-- Sibling of fn_social_reward_award WITHOUT the account-age gate. See header.
CREATE OR REPLACE FUNCTION public.fn_training_reward_award(
    p_user_id uuid, p_action_key text, p_reference_id text, p_target_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF p_user_id IS NULL OR p_action_key IS NULL THEN RETURN; END IF;
    -- Fail closed on a user that does not exist, same as the social helper.
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN RETURN; END IF;
    PERFORM public.award_diamonds_v2(p_user_id, p_action_key, p_reference_id, p_target_id,
                                     jsonb_build_object('source','db_trigger'));
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[training-reward] % failed for user %: %', p_action_key, p_user_id, SQLERRM;
    RETURN;
END $$;

REVOKE ALL ON FUNCTION public.fn_training_reward_award(uuid, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trgfn_award_first_training_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    -- Only on the transition INTO completed, so re-saving a finished attempt
    -- cannot re-fire.
    IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL THEN RETURN NEW; END IF;
    IF COALESCE(NEW.practice_only, false) THEN RETURN NEW; END IF;
    IF NOT COALESCE(NEW.passed, false) THEN RETURN NEW; END IF;

    -- Reference id is the USER ALONE: one welcome bonus per player, forever.
    PERFORM public.fn_training_reward_award(
        NEW.user_id, 'first_training_session',
        'first_training_session_' || NEW.user_id::text,
        NEW.id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_award_first_training_session ON public.training_attempts;
CREATE TRIGGER trg_award_first_training_session
    AFTER UPDATE ON public.training_attempts
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_first_training_session();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                   WHERE NOT tgisinternal AND tgname='trg_award_first_training_session') THEN
        RAISE EXCEPTION 'post-apply failed: trg_award_first_training_session not created';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 - paid rows are NOT clawed back, RULE 10.6)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_award_first_training_session ON public.training_attempts;
-- DROP FUNCTION IF EXISTS public.trgfn_award_first_training_session();
-- DROP FUNCTION IF EXISTS public.fn_training_reward_award(uuid, text, text, text);
-- COMMIT;
