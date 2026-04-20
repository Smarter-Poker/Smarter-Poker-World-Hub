-- =====================================================================
-- Pass 38: commander_home_groups stat/ranking/promo field lockdown
--
-- BUG (5 CVE-class findings — BC-1 through BC-5):
--   Owner (or approved admin) can self-UPDATE the following system-
--   maintained fields on their own group row via PostgREST:
--     - quality_score        (BC-1: recommendation ranking inflation)
--     - vitality_score       (BC-2: vitality ranking inflation)
--     - promotion_approved_at (BC-3: forge club-promotion timestamp)
--     - inactivity_hidden_sent_at  (BC-4: suppress dormancy-hide)
--     - inactivity_warning_sent_at (BC-4: suppress dormancy-warning)
--     - vitality_refreshed_at (BC-5: skip scheduled vitality recompute)
--     - promotion_requested_at (server timestamp)
--
--   The existing fn_enforce_home_group_field_permissions trigger blocks
--   member_count / games_hosted / share_click_count / created_at, and
--   fn_enforce_home_group_activity_and_views blocks view_count +
--   future-dated last_activity_at. Neither covers the stat/promo fields
--   above, allowing direct PostgREST UPDATEs to succeed.
--
-- FIX:
--   New BEFORE UPDATE trigger fn_enforce_home_group_stat_lockdown.
--   Blocks direct user UPDATE of all system-maintained ranking, promo,
--   and dormancy-nudge fields. Allows:
--     - service_role / postgres / supabase_* bypass
--     - nested trigger recomputes via pg_trigger_depth() > 1
--       (so server-side RPCs like request_home_group_promotion and
--        cron jobs that bump vitality_refreshed_at still work)
--   Layered as a NEW trigger (does not modify existing triggers) to
--   preserve prior protections and avoid monolithic rewrites.
-- ========================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_stat_lockdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_role text := current_user;
BEGIN
  -- Service-role / postgres bypass
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- Nested trigger bypass (legit recompute paths, e.g. request_home_group_promotion
  -- RPC → UPDATE commander_home_groups.promotion_requested_at)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.quality_score IS DISTINCT FROM OLD.quality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'quality_score is computed server-side by the ranking job';
  END IF;

  IF NEW.vitality_score IS DISTINCT FROM OLD.vitality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_score is computed server-side by the vitality job';
  END IF;

  IF NEW.vitality_refreshed_at IS DISTINCT FROM OLD.vitality_refreshed_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_refreshed_at is set by the vitality-refresh job';
  END IF;

  IF NEW.promotion_approved_at IS DISTINCT FROM OLD.promotion_approved_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_approved_at is set by the club-promotion approval flow '
                    || 'in the admin backend, not by groups themselves';
  END IF;

  IF NEW.promotion_requested_at IS DISTINCT FROM OLD.promotion_requested_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_requested_at is set by request_home_group_promotion RPC';
  END IF;

  IF NEW.inactivity_hidden_sent_at IS DISTINCT FROM OLD.inactivity_hidden_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_hidden_sent_at is set by the dormancy-hide job';
  END IF;

  IF NEW.inactivity_warning_sent_at IS DISTINCT FROM OLD.inactivity_warning_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_warning_sent_at is set by the dormancy-warning job';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_home_group_stat_lockdown ON public.commander_home_groups;
CREATE TRIGGER trg_enforce_home_group_stat_lockdown
BEFORE UPDATE ON public.commander_home_groups
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_group_stat_lockdown();

COMMENT ON FUNCTION public.fn_enforce_home_group_stat_lockdown() IS
  'Pass 38: Blocks direct user UPDATE of quality_score / vitality_score / '
  'vitality_refreshed_at / promotion_approved_at / promotion_requested_at / '
  'inactivity_hidden_sent_at / inactivity_warning_sent_at on commander_home_groups. '
  'Service-role + nested-trigger bypass preserved for legit server recompute paths.';