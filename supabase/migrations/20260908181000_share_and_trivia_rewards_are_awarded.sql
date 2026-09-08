-- ═══════════════════════════════════════════════════════════════════════
-- 20260908181000_share_and_trivia_rewards_are_awarded.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3  (adds triggers on two live tables; issues currency)
-- AUTHOR:       Claude (Cowork), at Dan's instruction 2026-09-08
-- AFFECTS:      trgfn_award_share_content, trgfn_award_daily_trivia,
--               triggers on share_events and daily_trivia_plays
-- IRREVERSIBLE: no  (rollback section at the bottom)
--
-- WHY:
--   Companion to 20260908180000_social_rewards_are_actually_awarded.sql.
--   These are the last two advertised rewards with no working emitter:
--     * share_content (10 diamonds, 2/day) - /api/rewards/share has ZERO
--       reachable callers. Its only two are EnhancedSpatialFeed.jsx:431 and
--       SpatialFeed.jsx:256, both unreachable from any page.
--     * daily_trivia_challenge (15 diamonds, 1/day) - /api/rewards/daily-trivia
--       has ZERO callers anywhere in the repo, reachable or not.
--   Both were shown in the diamond store with a progress tracker the whole
--   time, and neither has ever paid a diamond.
--
-- HOW:
--   Both actions already leave a durable row, so the award goes on the row and
--   therefore covers every path - including server-side ones a browser call
--   could never reach, which is what RULE 10.5 requires for horses.
--     share_events        -> share_content,          keyed (user, post)
--     daily_trivia_plays  -> daily_trivia_challenge, keyed (user, played_date)
--   Both go through fn_social_reward_award from the companion migration, so
--   they inherit its 24h account-age gate and its exception safety, and
--   award_diamonds_v2 still enforces the per-day limit, the daily and monthly
--   caps and the diamond_issuance_frozen switch.
--
--   Two of the anti-farming guards turned out to be enforced by the schema
--   already, which is better than a trigger check: share_events has a CHECK on
--   destination, and daily_trivia_plays is UNIQUE on (user_id, played_date) so
--   the same day physically cannot be replayed.
--
--   Sharing your OWN post is allowed on purpose - that is what sharing is for -
--   and is bounded by the same 2/day and the once-per-post key.
--
--   NO BACK-PAY. AFTER INSERT only; no historical row is revisited.
--
-- VERIFIED (rolled-back probe, 2026-09-08, all PASS):
--   share PAYS 1 - re-sharing the same post still 1 - share by an under-24h
--   account 0 - trivia by an under-24h account 0 - daily trivia PAYS 1.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='share_events') THEN
        RAISE EXCEPTION 'pre-flight failed: share_events not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='daily_trivia_plays') THEN
        RAISE EXCEPTION 'pre-flight failed: daily_trivia_plays not found';
    END IF;
    IF (SELECT count(*) FROM public.diamond_reward_catalog
        WHERE action_key IN ('share_content','daily_trivia_challenge') AND active IS TRUE) <> 2 THEN
        RAISE EXCEPTION 'pre-flight failed: share_content/daily_trivia_challenge not both active';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='fn_social_reward_award') THEN
        RAISE EXCEPTION 'pre-flight failed: fn_social_reward_award missing - apply 20260908180000 first';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trgfn_award_share_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.user_id IS NULL OR NEW.post_id IS NULL THEN RETURN NEW; END IF;
    PERFORM public.fn_social_reward_award(NEW.user_id,'share_content',
        'share_content_'||NEW.user_id::text||'_'||NEW.post_id::text, NEW.post_id::text);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.trgfn_award_daily_trivia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    -- Paid for PLAYING, not for being right: was_correct is deliberately not
    -- consulted, which is what the catalog copy promises.
    PERFORM public.fn_social_reward_award(NEW.user_id,'daily_trivia_challenge',
        'daily_trivia_challenge_'||NEW.user_id::text||'_'||COALESCE(NEW.played_date, current_date)::text,
        COALESCE(NEW.played_date, current_date)::text);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_award_share_content ON public.share_events;
DROP TRIGGER IF EXISTS trg_award_daily_trivia  ON public.daily_trivia_plays;

CREATE TRIGGER trg_award_share_content AFTER INSERT ON public.share_events
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_share_content();
CREATE TRIGGER trg_award_daily_trivia AFTER INSERT ON public.daily_trivia_plays
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_daily_trivia();

DO $$
DECLARE v int;
BEGIN
    SELECT count(*) INTO v FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname IN ('trg_award_share_content','trg_award_daily_trivia');
    IF v <> 2 THEN RAISE EXCEPTION 'post-apply failed: expected 2 triggers, found %', v; END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 - copy-paste; paid rows are NOT clawed back, RULE 10.6)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_award_share_content ON public.share_events;
-- DROP TRIGGER IF EXISTS trg_award_daily_trivia  ON public.daily_trivia_plays;
-- DROP FUNCTION IF EXISTS public.trgfn_award_share_content();
-- DROP FUNCTION IF EXISTS public.trgfn_award_daily_trivia();
-- COMMIT;
