-- ═══════════════════════════════════════════════════════════════════════
-- 20260908180000_social_rewards_are_actually_awarded.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3  (adds triggers on five live tables; issues currency)
-- AUTHOR:       Claude (Cowork), at Dan's instruction 2026-09-08
-- AFFECTS:      functions fn_social_reward_award + 5 trigger fns,
--               triggers on social_posts, social_comments, social_likes,
--               social_interactions, social_follows
-- IRREVERSIBLE: no  (rollback section at the bottom, copy-pasteable)
--
-- WHY:
--   21 of the 26 standard rewards in src/config/diamondRewards.js have NEVER
--   paid a single diamond. Measured, not inferred: across all time,
--   diamond_transactions holds rows for daily_login (212), easter_egg (7),
--   profile_pic (2), profile_complete (1) and video_favorite (1), and nothing
--   else. In the last 30 days alone there were 471 posts, 3,832 likes, 2,418
--   comments and 432 follows, and every one of them earned nothing, while the
--   diamond store advertised each of those actions with a live progress
--   tracker.
--
--   The backend was never the problem. diamond_reward_catalog holds every
--   action_key with active = true, and award_diamonds_v2 pays correctly - a
--   rolled-back probe on 2026-09-08 returned reason "ok" with awarded 1 for
--   reaction, 10 for social_post and 10 for share_content, with
--   daily_remaining and monthly_remaining decrementing properly.
--
--   The problem is that nothing reachable ever called it. The reaction,
--   comment and follow claims live in src/services/SocialService.js, and that
--   file is imported by exactly nine components, every one of which is
--   unreachable from any page (the SmarterPoker*/views/SpatialFeed family).
--   pages/hub/social-media/index.js - the feed people actually use - contains
--   no claimReward call at all and writes straight to the tables.
--   pages/api/rewards/follow.js additionally gates on social_connections,
--   which holds 0 rows and has no writer anywhere in the repo; the data moved
--   to social_follows in the 2026-08-15 audit and the endpoint was never
--   updated, so that one could never have paid under any circumstances.
--
-- HOW (high level):
--   Award at the DATABASE, not in the browser, because there are four
--   independent write paths and only one of them is a browser:
--     1. the live feed, writing directly to the tables from the client
--     2. pages/api/social/interactions.js, server side
--     3. pages/hub/reels.js, client side
--     4. src/content-engine/pipeline/HorseSocialEngine.js, server side
--   A client-side claim can never cover 2 and 4, and 4 is how horses act.
--   RULE 10.5 says horses are players and earn exactly what a human earns for
--   the same action, so the award has to sit where every path converges.
--
--   Five AFTER INSERT triggers call award_diamonds_v2 through one helper.
--   Every anti-farming guard the HTTP endpoints applied is preserved here:
--     * 24h minimum account age            (fn_social_reward_award)
--     * no self-dealing                    (like/follow triggers)
--     * minimum content length             (post 20, comment 10 - the same
--                                           constants the endpoints use)
--     * deterministic, USER-SCOPED reference_id, so a replay is refused as
--       already_claimed and the two like tables dedup against each other
--   and award_diamonds_v2 itself still enforces per-action daily limits,
--   the daily and monthly caps, velocity, and the diamond_issuance_frozen
--   kill switch. This migration adds no new way to earn - it connects the
--   ways that were already configured, priced and advertised.
--
--   NO BACK-PAY. Per Dan, 2026-09-08: fix it forward, pay nothing for the
--   past. These are AFTER INSERT triggers, so they touch only rows created
--   from now on and no historical row is revisited.
--
--   Every trigger is exception-safe. A reward that fails for any reason must
--   never take down the like, comment, post or follow that triggered it.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. PRE-FLIGHT ASSERTIONS
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'award_diamonds_v2'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.award_diamonds_v2 does not exist';
    END IF;

    -- The five action keys must exist AND be active, or the triggers would
    -- fire into unknown_action forever and look like this bug all over again.
    IF (SELECT count(*) FROM public.diamond_reward_catalog
        WHERE action_key IN ('social_post','strategy_comment','reaction','follow')
          AND active IS TRUE) <> 4 THEN
        RAISE EXCEPTION 'pre-flight failed: expected 4 active social action keys in diamond_reward_catalog';
    END IF;

    -- Column shape each trigger depends on.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_posts' AND column_name='author_id') THEN
        RAISE EXCEPTION 'pre-flight failed: social_posts.author_id not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_comments' AND column_name='author_id') THEN
        RAISE EXCEPTION 'pre-flight failed: social_comments.author_id not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_likes' AND column_name='user_id') THEN
        RAISE EXCEPTION 'pre-flight failed: social_likes.user_id not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_interactions' AND column_name='interaction_type') THEN
        RAISE EXCEPTION 'pre-flight failed: social_interactions.interaction_type not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_follows' AND column_name='follower_id') THEN
        RAISE EXCEPTION 'pre-flight failed: social_follows.follower_id not found';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. THE SHARED HELPER
-- ─────────────────────────────────────────────────────────────────────
-- One place that knows how to pay a social action. SECURITY DEFINER because
-- award_diamonds_v2 is granted to service_role only and these triggers fire
-- under whatever role happened to do the insert - including an anon/authed
-- browser session writing straight to the table.
--
-- It returns void and NEVER raises. Everything it could fail on (a missing
-- profile, a frozen issuance switch, a cap, a duplicate) is a normal verdict
-- from award_diamonds_v2 and is simply discarded here; the ledger row it
-- writes is the record.
CREATE OR REPLACE FUNCTION public.fn_social_reward_award(
    p_user_id      uuid,
    p_action_key   text,
    p_reference_id text,
    p_target_id    text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_created_at timestamptz;
BEGIN
    IF p_user_id IS NULL OR p_action_key IS NULL THEN
        RETURN;
    END IF;

    -- Anti-farming: the same 24h account age gate the HTTP endpoints applied
    -- (MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000 in every one of them). A
    -- profile we cannot find is NOT paid - fail closed, never open.
    SELECT created_at INTO v_created_at FROM public.profiles WHERE id = p_user_id;
    IF v_created_at IS NULL OR (now() - v_created_at) < interval '24 hours' THEN
        RETURN;
    END IF;

    PERFORM public.award_diamonds_v2(
        p_user_id,
        p_action_key,
        p_reference_id,
        p_target_id,
        jsonb_build_object('source', 'db_trigger')
    );

EXCEPTION WHEN OTHERS THEN
    -- A reward must never break the action that earned it. Swallow, and leave
    -- a breadcrumb that does not depend on anybody reading the log.
    RAISE WARNING '[social-reward] % failed for user %: %', p_action_key, p_user_id, SQLERRM;
    RETURN;
END $$;

REVOKE ALL ON FUNCTION public.fn_social_reward_award(uuid, text, text, text) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────
-- 3. TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────

-- 3.1 social_post - 10 diamonds, 2/day. Content floor 20 chars, matching
--     MIN_CONTENT_LENGTH in pages/api/rewards/social-post.js.
CREATE OR REPLACE FUNCTION public.trgfn_award_social_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF COALESCE(NEW.is_deleted, false) THEN RETURN NEW; END IF;
    IF length(btrim(COALESCE(NEW.content, ''))) < 20 THEN RETURN NEW; END IF;

    PERFORM public.fn_social_reward_award(
        NEW.author_id, 'social_post',
        'social_post_' || NEW.author_id::text || '_' || NEW.id::text,
        NEW.id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

-- 3.2 strategy_comment - 3 diamonds, 3/day. Content floor 10 chars, matching
--     MIN_CONTENT_LENGTH in pages/api/rewards/comment.js.
CREATE OR REPLACE FUNCTION public.trgfn_award_strategy_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF COALESCE(NEW.is_deleted, false) THEN RETURN NEW; END IF;
    IF length(btrim(COALESCE(NEW.content, ''))) < 10 THEN RETURN NEW; END IF;

    PERFORM public.fn_social_reward_award(
        NEW.author_id, 'strategy_comment',
        'strategy_comment_' || NEW.author_id::text || '_' || NEW.id::text,
        NEW.id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

-- 3.3 reaction from social_likes - 1 diamond, 5/day.
--     This is where post likes actually land: 31,885 rows against 8 'like'
--     rows in social_interactions.
--     The reference id is keyed on (user, post) and NOT on the like row id, so
--     unlike-then-relike cannot be farmed, and so this dedups against 3.4.
CREATE OR REPLACE FUNCTION public.trgfn_award_reaction_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author uuid;
BEGIN
    SELECT author_id INTO v_author FROM public.social_posts WHERE id = NEW.post_id;
    -- Anti-farming: you cannot earn from your own post. Same rule as
    -- pages/api/rewards/reaction.js ("Cannot earn diamonds from your own posts").
    IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;

    PERFORM public.fn_social_reward_award(
        NEW.user_id, 'reaction',
        'reaction_' || NEW.user_id::text || '_' || NEW.post_id::text,
        NEW.post_id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

-- 3.4 reaction from social_interactions - the live feed's own like path.
--     Only interaction_type 'like' pays. 'comment_like' (778 of the 788 rows)
--     is a different action and is not in the catalog, so it earns nothing.
CREATE OR REPLACE FUNCTION public.trgfn_award_reaction_interaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_author uuid;
BEGIN
    IF NEW.interaction_type IS DISTINCT FROM 'like' THEN RETURN NEW; END IF;

    SELECT author_id INTO v_author FROM public.social_posts WHERE id = NEW.post_id;
    IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;

    -- Same key shape as 3.3 on purpose: a post liked through both paths pays
    -- once, and award_diamonds_v2 refuses the second as already_claimed.
    PERFORM public.fn_social_reward_award(
        NEW.user_id, 'reaction',
        'reaction_' || NEW.user_id::text || '_' || NEW.post_id::text,
        NEW.post_id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

-- 3.5 follow - 2 diamonds, 3/day.
--     social_follows is the live table (1,180 rows). social_connections, which
--     pages/api/rewards/follow.js reads, holds 0 rows and has no writer.
CREATE OR REPLACE FUNCTION public.trgfn_award_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    -- Anti-farming: no self-follow. Same rule as follow.js ("Cannot follow yourself").
    IF NEW.follower_id IS NULL OR NEW.follower_id = NEW.following_id THEN RETURN NEW; END IF;

    PERFORM public.fn_social_reward_award(
        NEW.follower_id, 'follow',
        'follow_' || NEW.follower_id::text || '_' || NEW.following_id::text,
        NEW.following_id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. THE TRIGGERS
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_award_social_post           ON public.social_posts;
DROP TRIGGER IF EXISTS trg_award_strategy_comment      ON public.social_comments;
DROP TRIGGER IF EXISTS trg_award_reaction_like         ON public.social_likes;
DROP TRIGGER IF EXISTS trg_award_reaction_interaction  ON public.social_interactions;
DROP TRIGGER IF EXISTS trg_award_follow                ON public.social_follows;

CREATE TRIGGER trg_award_social_post
    AFTER INSERT ON public.social_posts
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_social_post();

CREATE TRIGGER trg_award_strategy_comment
    AFTER INSERT ON public.social_comments
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_strategy_comment();

CREATE TRIGGER trg_award_reaction_like
    AFTER INSERT ON public.social_likes
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_reaction_like();

CREATE TRIGGER trg_award_reaction_interaction
    AFTER INSERT ON public.social_interactions
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_reaction_interaction();

CREATE TRIGGER trg_award_follow
    AFTER INSERT ON public.social_follows
    FOR EACH ROW EXECUTE FUNCTION public.trgfn_award_follow();

-- ─────────────────────────────────────────────────────────────────────
-- 5. POST-APPLY ASSERTIONS
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_triggers int;
BEGIN
    SELECT count(*) INTO v_triggers
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND t.tgname IN ('trg_award_social_post','trg_award_strategy_comment',
                       'trg_award_reaction_like','trg_award_reaction_interaction',
                       'trg_award_follow');
    IF v_triggers <> 5 THEN
        RAISE EXCEPTION 'post-apply failed: expected 5 award triggers, found %', v_triggers;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='fn_social_reward_award' AND p.prosecdef
    ) THEN
        RAISE EXCEPTION 'post-apply failed: fn_social_reward_award missing or not SECURITY DEFINER';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 - copy-paste to undo, leaves paid rows alone)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_award_social_post          ON public.social_posts;
-- DROP TRIGGER IF EXISTS trg_award_strategy_comment     ON public.social_comments;
-- DROP TRIGGER IF EXISTS trg_award_reaction_like        ON public.social_likes;
-- DROP TRIGGER IF EXISTS trg_award_reaction_interaction ON public.social_interactions;
-- DROP TRIGGER IF EXISTS trg_award_follow               ON public.social_follows;
-- DROP FUNCTION IF EXISTS public.trgfn_award_social_post();
-- DROP FUNCTION IF EXISTS public.trgfn_award_strategy_comment();
-- DROP FUNCTION IF EXISTS public.trgfn_award_reaction_like();
-- DROP FUNCTION IF EXISTS public.trgfn_award_reaction_interaction();
-- DROP FUNCTION IF EXISTS public.trgfn_award_follow();
-- DROP FUNCTION IF EXISTS public.fn_social_reward_award(uuid, text, text, text);
-- COMMIT;
--
-- Diamonds already awarded are NOT clawed back by this rollback. They were
-- earned under the rules the catalog advertises, and RULE 10.6 is explicit
-- that nothing is taken back from a player for our mistake.
-- ═══════════════════════════════════════════════════════════════════════
