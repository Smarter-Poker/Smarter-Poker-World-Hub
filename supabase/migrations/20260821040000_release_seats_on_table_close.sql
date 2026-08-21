-- ═══════════════════════════════════════════════════════════════════════
-- 20260821040000_release_seats_on_table_close.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER 2. AUTHOR: Cowork (Claude). IRREVERSIBLE: no (ROLLBACK at bottom).
--
-- WHY: two problems, one cause — nothing reacted to a table closing.
--
-- 1. SEAT LEAK. On 2026-08-20 there were 1,427 seats with left_at IS NULL on
--    tables already closed, 185 real users marked "seated" at tables that had
--    ended two days earlier. That backlog was cleared before this ran, so this
--    is the RECURRENCE fix: a table entering a terminal state now releases its
--    own seats in the same transaction.
--
-- 2. DEAD COLUMNS. clubs.active_players and clubs.active_tables were 0 for
--    every club and nothing had ever maintained them — the obvious names for
--    the number on the club card, sitting permanently wrong.
--
-- ON VOLUME: counts refresh when a TABLE opens or closes, never per seat. Seat
-- churn is what got the realtime listener removed in 2026-07 "for write
-- volume"; a per-seat trigger would reintroduce exactly that.
--
-- Applied to production 2026-08-21.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_on_table_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
    v_terminal_now boolean;
    v_terminal_before boolean;
BEGIN
    v_terminal_now := lower(coalesce(NEW.status,'')) IN ('closed','completed','cancelled','finished');
    v_terminal_before := lower(coalesce(OLD.status,'')) IN ('closed','completed','cancelled','finished');

    -- Stamped with the table's own update time, so the seat's history says when
    -- the TABLE ended, not when this trigger happened to run.
    IF v_terminal_now AND NOT v_terminal_before THEN
        UPDATE public.table_seats SET left_at = coalesce(NEW.updated_at, now())
         WHERE table_id = NEW.id AND left_at IS NULL;
    END IF;

    IF v_terminal_now <> v_terminal_before AND NEW.club_id IS NOT NULL THEN
        PERFORM public.fn_refresh_club_activity_counts(NEW.club_id);
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_on_table_status_change ON public.tables;
CREATE TRIGGER trg_on_table_status_change
    AFTER UPDATE OF status ON public.tables
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.fn_on_table_status_change();

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_on_table_status_change ON public.tables;
--   DROP FUNCTION IF EXISTS public.fn_on_table_status_change();
