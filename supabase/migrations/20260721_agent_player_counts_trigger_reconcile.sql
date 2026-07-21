-- Task #56: keep agents.total_players / active_player_count accurate.
-- Applied to prod via Supabase MCP 2026-07-21.
--
-- Players link to an agent via club_members.agent_id (= the agent's user_id) scoped
-- by club_id. The counters were unmaintained and had drifted (stored sum 90 vs actual
-- 184). Fix = a recompute-on-change AFTER trigger (SECURITY DEFINER, so it can write
-- the service-role-only agents table) + a one-time reconcile. Recompute (not delta
-- arithmetic) is self-healing.
CREATE OR REPLACE FUNCTION public.fn_sync_agent_player_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.agent_id IS NOT NULL THEN
    UPDATE agents a SET
      total_players = (SELECT count(*) FROM club_members cm
                       WHERE cm.agent_id = OLD.agent_id AND cm.club_id = OLD.club_id),
      active_player_count = (SELECT count(*) FROM club_members cm
                       WHERE cm.agent_id = OLD.agent_id AND cm.club_id = OLD.club_id AND cm.is_active IS TRUE)
    WHERE a.user_id = OLD.agent_id AND a.club_id = OLD.club_id;
  END IF;

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.agent_id IS NOT NULL THEN
    UPDATE agents a SET
      total_players = (SELECT count(*) FROM club_members cm
                       WHERE cm.agent_id = NEW.agent_id AND cm.club_id = NEW.club_id),
      active_player_count = (SELECT count(*) FROM club_members cm
                       WHERE cm.agent_id = NEW.agent_id AND cm.club_id = NEW.club_id AND cm.is_active IS TRUE)
    WHERE a.user_id = NEW.agent_id AND a.club_id = NEW.club_id;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_agent_player_counts ON public.club_members;
CREATE TRIGGER trg_sync_agent_player_counts
AFTER INSERT OR DELETE OR UPDATE OF agent_id, club_id, is_active ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_agent_player_counts();

UPDATE agents a SET
  total_players = (SELECT count(*) FROM club_members cm
                   WHERE cm.agent_id = a.user_id AND cm.club_id = a.club_id),
  active_player_count = (SELECT count(*) FROM club_members cm
                   WHERE cm.agent_id = a.user_id AND cm.club_id = a.club_id AND cm.is_active IS TRUE);
