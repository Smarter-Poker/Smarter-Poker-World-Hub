-- PRIVILEGED HOME WRITES NOW LEAVE A TRAIL, AND THE CHECK COUNTS THE RIGHT SET.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'home_privileged_writes_audit_themselves' (version 20260821183156).
--
-- The report read "5 of 37 home RPCs". Both halves were misleading.
--
-- THE DENOMINATOR WAS WRONG. Of those 37, most have no business writing an
-- audit row: 14 are trigger functions (touch_updated_at, bump_activity,
-- refresh_geog, protect_row_identity...), 4 are predicates, one is a read, and
-- several are member-level content actions that are rate-limited and
-- length-capped rather than audited. Counting all 37 made a healthy module
-- look two-thirds unaudited forever.
--
-- THE REAL GAP was the STAFF actions: the seven seat RPCs plus the template
-- and invite-token creators mutate state on a host's authority and left no
-- record of who did it.
--
-- WHY A TRIGGER AND NOT NINE EDITS. Adding an INSERT to each of the nine means
-- rewriting nine production bodies, and a tenth function added next month
-- simply forgets. A trigger on the TABLE captures every write: every existing
-- RPC, every future one, and any direct statement that gets past RLS.
--
-- Seats carry game_id, not group_id, so the group is resolved through
-- commander_home_games. The whole thing is wrapped so an audit failure can
-- never take down the write it is recording - a host must still be able to
-- seat a player. Coverage is reported by the health check instead.

CREATE OR REPLACE FUNCTION public.fn_home_audit_privileged_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row    record;
  v_group  uuid;
  v_target text := TG_ARGV[0];
  v_action text := lower(TG_OP);
BEGIN
  v_row := COALESCE(NEW, OLD);
  BEGIN
    IF TG_TABLE_NAME = 'commander_home_seats' THEN
      SELECT g.group_id INTO v_group
        FROM commander_home_games g WHERE g.id = v_row.game_id;
    ELSE
      EXECUTE format('SELECT ($1).%I', 'group_id') INTO v_group USING v_row;
    END IF;

    INSERT INTO commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (
      v_group, auth.uid(), v_target, v_row.id, v_target || '_' || v_action,
      CASE
        WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
          'before', to_jsonb(OLD) - 'updated_at',
          'after',  to_jsonb(NEW) - 'updated_at')
        WHEN TG_OP = 'DELETE' THEN jsonb_build_object('before', to_jsonb(OLD))
        ELSE jsonb_build_object('after', to_jsonb(NEW))
      END);
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- an audit that cannot be written must not stop the write itself
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_home_seats_audit ON public.commander_home_seats;
CREATE TRIGGER trg_home_seats_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commander_home_seats
  FOR EACH ROW EXECUTE FUNCTION public.fn_home_audit_privileged_write('seat');

DROP TRIGGER IF EXISTS trg_home_templates_audit ON public.commander_home_game_templates;
CREATE TRIGGER trg_home_templates_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commander_home_game_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_home_audit_privileged_write('game_template');

DROP TRIGGER IF EXISTS trg_home_invite_tokens_audit ON public.commander_home_invite_tokens;
CREATE TRIGGER trg_home_invite_tokens_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commander_home_invite_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fn_home_audit_privileged_write('invite_token');
