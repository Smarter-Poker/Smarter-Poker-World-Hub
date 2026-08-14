-- =====================================================================
-- Populate memory_leaderboards from completed memory_game_sessions
--
-- FOUND BY: scripts/ci/check-stranded-writers.mjs (Phase U4.1), first run.
--
-- THE BUG
-- `memory_leaderboards` is READ three times by src/services/LeaderboardService.js
-- (getLeaderboard, getUserRank, getUserBestScores) and WRITTEN by nothing,
-- anywhere. It has 0 rows. There is a dedicated page at
-- /hub/memory-games/leaderboard.js rendering it.
--
-- So the memory-games leaderboard has always been empty, and because an
-- empty leaderboard is indistinguishable from "nobody has played yet", it
-- never looked like a bug. Meanwhile `memory_game_sessions` IS written (four
-- call sites in GameSessionService/DiamondEngine), so the scores exist — they
-- were simply never promoted.
--
-- The schemas line up 1:1 and `memory_leaderboards.session_id` already points
-- back at the session, which is what confirms this was the intended design
-- rather than a guess:
--
--   memory_game_sessions: user_id, game_mode, level, score, accuracy,
--                         time_taken, completed, ...
--   memory_leaderboards : user_id, game_mode, level, score, accuracy,
--                         time_taken, perfect_game, session_id
--
-- WHY A TRIGGER RATHER THAN AN APPLICATION WRITE
-- Four separate call sites write sessions. Adding an upsert to each would
-- guarantee they drift, which is the single most common defect pattern in
-- this codebase (three geo pages that had to be de-duplicated, three
-- home-game venue adapters, two authUtils implementations). One trigger on
-- the source table cannot drift, and it also backfills correctly for any
-- writer added later.
--
-- SEMANTICS: best score per (user, game_mode, level). A session only counts
-- when completed = true. Ties are broken by the faster time.
--
-- NOT APPLIED YET — the Supabase MCP connection dropped before this could be
-- applied. Apply with `apply_migration` (or the CLI) and then confirm:
--     SELECT count(*) FROM memory_leaderboards;   -- expect > 0 after backfill
--     node scripts/ci/check-stranded-writers.mjs  -- memory_leaderboards gone
-- =====================================================================

-- ---------- PRE-FLIGHT ----------
DO $$
BEGIN
    IF to_regclass('public.memory_game_sessions') IS NULL THEN
        RAISE EXCEPTION 'PRE-FLIGHT FAILED: memory_game_sessions is missing';
    END IF;
    IF to_regclass('public.memory_leaderboards') IS NULL THEN
        RAISE EXCEPTION 'PRE-FLIGHT FAILED: memory_leaderboards is missing';
    END IF;
END $$;

-- One leaderboard row per (user, mode, level). Required for the upsert below
-- and it is what makes "best score" well-defined.
CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_leaderboards_user_mode_level
    ON public.memory_leaderboards (user_id, game_mode, level);

CREATE OR REPLACE FUNCTION public.fn_memory_promote_session_to_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Only completed sessions with an owner and a score are eligible.
    IF NEW.completed IS NOT TRUE OR NEW.user_id IS NULL OR NEW.score IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.memory_leaderboards
        (user_id, game_mode, level, score, accuracy, time_taken, perfect_game, session_id, created_at)
    VALUES
        (NEW.user_id, NEW.game_mode, NEW.level, NEW.score, NEW.accuracy, NEW.time_taken,
         COALESCE(NEW.accuracy, 0) >= 100, NEW.id, now())
    ON CONFLICT (user_id, game_mode, level) DO UPDATE
        SET score        = EXCLUDED.score,
            accuracy     = EXCLUDED.accuracy,
            time_taken   = EXCLUDED.time_taken,
            perfect_game = EXCLUDED.perfect_game,
            session_id   = EXCLUDED.session_id,
            created_at   = now()
        -- Keep the personal best: only overwrite on a higher score, or an
        -- equal score achieved faster.
        WHERE EXCLUDED.score > public.memory_leaderboards.score
           OR (EXCLUDED.score = public.memory_leaderboards.score
               AND COALESCE(EXCLUDED.time_taken, 2147483647)
                   < COALESCE(public.memory_leaderboards.time_taken, 2147483647));

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_memory_promote_session_to_leaderboard() IS
  'Promotes a completed memory_game_sessions row into memory_leaderboards as the user''s personal best for that (game_mode, level). Added 2026-08-12 after check-stranded-writers found memory_leaderboards had readers, a dedicated page, and no writer at all.';

DROP TRIGGER IF EXISTS trg_memory_promote_session ON public.memory_game_sessions;
CREATE TRIGGER trg_memory_promote_session
    AFTER INSERT OR UPDATE OF completed, score, accuracy, time_taken
    ON public.memory_game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_memory_promote_session_to_leaderboard();

-- ---------- BACKFILL ----------
-- Existing completed sessions have never been promoted. DISTINCT ON picks the
-- personal best per (user, mode, level) using the same ordering as the trigger.
INSERT INTO public.memory_leaderboards
    (user_id, game_mode, level, score, accuracy, time_taken, perfect_game, session_id, created_at)
SELECT DISTINCT ON (s.user_id, s.game_mode, s.level)
       s.user_id, s.game_mode, s.level, s.score, s.accuracy, s.time_taken,
       COALESCE(s.accuracy, 0) >= 100, s.id, COALESCE(s.created_at, now())
FROM public.memory_game_sessions s
WHERE s.completed IS TRUE AND s.user_id IS NOT NULL AND s.score IS NOT NULL
ORDER BY s.user_id, s.game_mode, s.level,
         s.score DESC, COALESCE(s.time_taken, 2147483647) ASC
ON CONFLICT (user_id, game_mode, level) DO NOTHING;

-- ---------- POST-APPLY ----------
DO $$
DECLARE v_rows bigint; v_src bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'public.memory_game_sessions'::regclass
                      AND tgname = 'trg_memory_promote_session') THEN
        RAISE EXCEPTION 'POST-APPLY FAILED: trigger was not created';
    END IF;

    SELECT count(*) INTO v_src FROM public.memory_game_sessions
     WHERE completed IS TRUE AND user_id IS NOT NULL AND score IS NOT NULL;
    SELECT count(*) INTO v_rows FROM public.memory_leaderboards;

    IF v_src > 0 AND v_rows = 0 THEN
        RAISE EXCEPTION 'POST-APPLY FAILED: % eligible sessions but leaderboard is still empty', v_src;
    END IF;

    RAISE NOTICE 'OK: trigger installed; % eligible sessions, % leaderboard rows.', v_src, v_rows;
END $$;

-- =====================================================================
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_memory_promote_session ON public.memory_game_sessions;
--   DROP FUNCTION IF EXISTS public.fn_memory_promote_session_to_leaderboard();
--   -- the backfilled rows are real results; delete them only if you mean to.
-- =====================================================================
