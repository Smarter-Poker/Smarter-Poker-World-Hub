-- ═══════════════════════════════════════════════════════════════════════
-- 20260821050000_club_activity_counts.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER 2. AUTHOR: Cowork (Claude). IRREVERSIBLE: no (ROLLBACK at bottom).
--
-- WHY: clubs.active_players / active_tables were 0 for every club with nothing
-- maintaining them. This gives them a value and a definition.
--
-- THE DEFINITION MATTERS. This function was first written against the ORIGINAL
-- meaning of "active" — players seated at tables BELONGING TO the club. In
-- between writing and verifying it, fn_batch_active_player_counts (the
-- function the club cards actually call) was rewritten by another agent to a
-- different meaning: MEMBERS OF the club seated at ANY live table, wherever it
-- belongs.
--
-- The two disagreed in production and each was right about a different thing.
-- Shark Club reads 8 under the new definition and 0 under the old: it has no
-- live tables of its own and eight of its members are playing on the union's.
-- In a union model where clubs share a table pool, "how many of MY players are
-- playing" is what a club owner is asking — and decisively, it is what is
-- already on screen. A stored column that contradicts the card is worse than
-- no column, so this mirrors the card.
--
-- active_tables keeps its literal meaning (live tables the club owns), which
-- is not ambiguous.
--
-- NOTE FOR WHOEVER READS THIS NEXT: union cards use
-- fn_union_active_player_counts, which is TABLE-based (everyone playing under
-- the union). So "ACTIVE" answers a slightly different question on a union
-- card than on a club card. That is defensible but it is not obvious, and it
-- deserves a product decision rather than being discovered again.
--
-- Applied to production 2026-08-21; post-apply asserts every club agrees with
-- fn_batch_active_player_counts.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_refresh_club_activity_counts(p_club_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
    UPDATE public.clubs c
       SET active_players = coalesce(p.n, 0),
           active_tables  = coalesce(t.n, 0)
      FROM public.clubs base
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT ts.user_id) AS n
          FROM public.club_members cm
          JOIN public.table_seats ts ON ts.user_id = cm.user_id
           AND ts.left_at IS NULL AND coalesce(ts.is_away,false) = false
          JOIN public.tables tb ON tb.id = ts.table_id
           AND lower(coalesce(tb.status,'')) NOT IN ('closed','completed','cancelled','finished')
         WHERE cm.club_id = base.id AND cm.status = 'active'
      ) p ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS n FROM public.tables tb2
         WHERE tb2.club_id = base.id
           AND lower(coalesce(tb2.status,'')) NOT IN ('closed','completed','cancelled','finished')
      ) t ON true
     WHERE c.id = base.id AND (p_club_id IS NULL OR base.id = p_club_id);
$function$;

SELECT public.fn_refresh_club_activity_counts(NULL);

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.fn_refresh_club_activity_counts(uuid);
