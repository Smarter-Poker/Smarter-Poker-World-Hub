-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_drop_legacy_overloads_phase29_sweep_tail.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (DROP × 4 + RENAME × 1 + REPLACE FUNCTION × 2)
-- AUTHOR:      Cowork agent
-- AFFECTS:     rpcs:
--                update_leaderboard (uuid, text, integer)             [DROPPED]
--                record_arena_message (uuid, uuid, text, text)         [DROPPED — was a stub]
--                calculate_agent_spread (uuid)                         [DROPPED — was a stub]
--                fn_discover_clubs (text, integer)                     [DROPPED — superseded by 3-arg variant]
--                recompute_club_levels (uuid, boolean)                 [RENAMED → recompute_club_levels_silent]
--                trg_auto_recompute_club_level                         [REPLACED — caller updated to new name]
--                fn_recompute_club_level_on_member_change              [REPLACED — caller updated to new name]
-- IRREVERSIBLE: yes (rollback section below w/ original SQL captured before drop)
--
-- WHY:
--   Final cleanup of Phase 29-class overload ambiguity (advisor pass found
--   8 same-name/different-return-type pairs total; 3 money-moving were
--   handled in 20260501_drop_legacy_overloads_phase29_sweep.sql; this is
--   the rest).
--
--   Per-target rationale:
--
--   - update_leaderboard: 3-arg void variant (generic
--     leaderboard_entries) had ZERO callers (verified via grep across
--     all repos and pg_proc body scan — only `update_leaderboard_rankings`
--     was a false-match by substring). Drop. The 7-arg jsonb variant
--     (memory-games leaderboard) is the live caller (LeaderboardService.js).
--
--   - record_arena_message: 4-arg jsonb variant body was literally
--     `RETURN jsonb_build_object('success', true)` — a no-op stub.
--     Drop. The 5-arg void variant has the real implementation and is
--     called by World-Hub LobbyManager.
--
--   - calculate_agent_spread: 1-arg json variant body was literally
--     `RETURN '{}'::JSON` — another no-op stub. Drop. The 2-arg jsonb
--     variant has the real implementation and is called by both
--     CommissionService and SettlementService.
--
--   - fn_discover_clubs: 2-arg variant superseded by 3-arg (which adds
--     p_offset and a richer 9-column return). The only known caller
--     (club-arena ClubsService) passes 3 args. AI-Content-GTO-Engine
--     passes a non-existent location-based signature anyway and is
--     already broken; not addressed here.
--
--   - recompute_club_levels: REAL ambiguity — 1-arg jsonb variant is
--     called by HTTP routes (HomePage, ClubDashboard, ClubHomePage)
--     while 2-arg void variant is called by SQL triggers
--     (trg_auto_recompute_club_level, fn_recompute_club_level_on_member_change).
--     Cannot drop either — they have completely different semantics
--     (jsonb summary for HTTP vs silent void for trigger fan-out).
--     Solution: rename the 2-arg trigger variant to
--     `recompute_club_levels_silent` and update its 2 SQL callers in
--     the same migration. The HTTP-facing `recompute_club_levels` keeps
--     its 1-arg jsonb signature.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_leaderboard'
      AND pg_get_function_result(p.oid)='void';
    IF v_count <> 1 THEN RAISE EXCEPTION 'update_leaderboard 3-arg void: expected 1, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='record_arena_message'
      AND pg_get_function_result(p.oid)='jsonb';
    IF v_count <> 1 THEN RAISE EXCEPTION 'record_arena_message 4-arg jsonb: expected 1, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='calculate_agent_spread'
      AND pg_get_function_arguments(p.oid)='p_agent_id uuid';
    IF v_count <> 1 THEN RAISE EXCEPTION 'calculate_agent_spread 1-arg: expected 1, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_discover_clubs'
      AND pg_get_function_arguments(p.oid)='p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20';
    IF v_count <> 1 THEN RAISE EXCEPTION 'fn_discover_clubs 2-arg: expected 1, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='recompute_club_levels'
      AND pg_get_function_arguments(p.oid)='p_club_id uuid DEFAULT NULL::uuid, p_force boolean DEFAULT false';
    IF v_count <> 1 THEN RAISE EXCEPTION 'recompute_club_levels (uuid, boolean): expected 1, got %', v_count; END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_leaderboard(uuid, text, integer);
DROP FUNCTION IF EXISTS public.record_arena_message(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.calculate_agent_spread(uuid);
DROP FUNCTION IF EXISTS public.fn_discover_clubs(text, integer);

ALTER FUNCTION public.recompute_club_levels(uuid, boolean) RENAME TO recompute_club_levels_silent;

-- Update the 2 SQL callers to point at the renamed function.
CREATE OR REPLACE FUNCTION public.trg_auto_recompute_club_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE v_club_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_club_id := OLD.club_id;
  ELSE                     v_club_id := NEW.club_id;
  END IF;
  PERFORM public.recompute_club_levels_silent(v_club_id, false);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_club_level_on_member_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_club_id  uuid;
  v_union_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_club_id := OLD.club_id;
  ELSE                     v_club_id := NEW.club_id;
  END IF;
  PERFORM public.recompute_club_levels_silent(v_club_id, false);
  SELECT uc.union_id INTO v_union_id FROM union_clubs uc WHERE uc.club_id = v_club_id LIMIT 1;
  IF v_union_id IS NOT NULL THEN
    PERFORM public.recompute_union_levels(v_union_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_leaderboard';
    IF v_count <> 1 THEN RAISE EXCEPTION 'update_leaderboard expected 1 overload, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='record_arena_message';
    IF v_count <> 1 THEN RAISE EXCEPTION 'record_arena_message expected 1 overload, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='calculate_agent_spread';
    IF v_count <> 1 THEN RAISE EXCEPTION 'calculate_agent_spread expected 1 overload, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_discover_clubs';
    IF v_count <> 1 THEN RAISE EXCEPTION 'fn_discover_clubs expected 1 overload, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='recompute_club_levels';
    IF v_count <> 1 THEN RAISE EXCEPTION 'recompute_club_levels expected 1 (the 1-arg jsonb HTTP variant) after rename, got %', v_count; END IF;

    SELECT COUNT(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='recompute_club_levels_silent';
    IF v_count <> 1 THEN RAISE EXCEPTION 'recompute_club_levels_silent expected 1 (the renamed 2-arg variant), got %', v_count; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste each into a NEW _revert migration if needed; original
-- bodies captured from pg_get_functiondef BEFORE drop/rename)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- restore update_leaderboard 3-arg
-- CREATE OR REPLACE FUNCTION public.update_leaderboard(p_user_id uuid, p_leaderboard text DEFAULT 'global'::text, p_score integer DEFAULT 0)
--   RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
-- BEGIN
--   IF p_user_id IS NULL THEN RETURN; END IF;
--   INSERT INTO public.leaderboard_entries (user_id, leaderboard_type, score, updated_at)
--   VALUES (p_user_id, p_leaderboard, p_score, NOW())
--   ON CONFLICT (user_id, leaderboard_type) DO UPDATE
--     SET score = GREATEST(public.leaderboard_entries.score, EXCLUDED.score), updated_at = NOW();
-- END $$;
-- -- restore record_arena_message 4-arg (stub)
-- CREATE OR REPLACE FUNCTION public.record_arena_message(p_club_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_content text DEFAULT ''::text, p_channel text DEFAULT 'general'::text)
--   RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions' AS $$
-- BEGIN RETURN jsonb_build_object('success', true); END $$;
-- -- restore calculate_agent_spread 1-arg (stub)
-- CREATE OR REPLACE FUNCTION public.calculate_agent_spread(p_agent_id uuid)
--   RETURNS json LANGUAGE plpgsql SET search_path TO 'public', 'extensions' AS $$
-- BEGIN RETURN '{}'::JSON; END $$;
-- -- restore fn_discover_clubs 2-arg (full body in pg_get_functiondef snapshot)
-- -- (See snapshot in migration-safety doc commit; not inlined here for brevity.)
-- -- un-rename recompute_club_levels_silent back
-- ALTER FUNCTION public.recompute_club_levels_silent(uuid, boolean) RENAME TO recompute_club_levels;
-- -- revert callers to old name  (PERFORM public.recompute_club_levels(v_club_id, false);)
-- COMMIT;
