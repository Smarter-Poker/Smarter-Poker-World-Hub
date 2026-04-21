-- =====================================================================
-- Pass 47 (follow-up): extend BK-1/BK-2 coverage to the two home_*
-- tables that have no `created_at` column:
--   commander_home_rsvps                      → origin ts is responded_at
--   commander_home_group_promotion_requests   → origin ts is requested_at
--
-- For these we create a dedicated trigger fn that:
--   1. Blocks id tamper (BK-2 class)
--   2. Blocks origin-timestamp tamper (BK-1 class, parameterized via TG_ARGV[0])
--
-- Parameter: TG_ARGV[0] is the name of the origin-timestamp column.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_home_protect_row_identity_with_ts()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role     text := current_user;
  v_col      text;
  v_old_val  text;
  v_new_val  text;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Primary key is always immutable.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ROW_IDENTITY_IMMUTABLE'
          USING HINT = 'the primary key (id) of a ' || TG_TABLE_NAME
                     || ' row cannot be changed via direct UPDATE '
                     || '(was ' || OLD.id::text || ', attempted ' || NEW.id::text || ')',
                ERRCODE = '42501';
  END IF;

  -- Origin timestamp: parameterized via TG_ARGV[0] (responded_at / requested_at / ...).
  IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL THEN
    v_col := TG_ARGV[0];
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_col, v_col)
       INTO v_old_val, v_new_val
      USING OLD, NEW;

    IF v_old_val IS DISTINCT FROM v_new_val THEN
      RAISE EXCEPTION 'ORIGIN_TIMESTAMP_IMMUTABLE'
            USING HINT = v_col || ' on ' || TG_TABLE_NAME
                       || ' is the row origin timestamp and cannot be modified '
                       || '(was ' || COALESCE(v_old_val, '<null>')
                       || ', attempted ' || COALESCE(v_new_val, '<null>') || ')',
                  ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_home_protect_row_identity_with_ts() IS
  'Pass 47 follow-up: row-identity immutability for home_* tables that use '
  'a non-standard origin-timestamp column (e.g., responded_at on RSVPs). '
  'Blocks id tamper + origin-ts tamper (column named via TG_ARGV[0]).';

-- commander_home_rsvps: responded_at is origin ts
DROP TRIGGER IF EXISTS trg_home_protect_row_identity ON public.commander_home_rsvps;
CREATE TRIGGER trg_home_protect_row_identity
  BEFORE UPDATE ON public.commander_home_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_home_protect_row_identity_with_ts('responded_at');

-- commander_home_group_promotion_requests: requested_at is origin ts
DROP TRIGGER IF EXISTS trg_home_protect_row_identity ON public.commander_home_group_promotion_requests;
CREATE TRIGGER trg_home_protect_row_identity
  BEFORE UPDATE ON public.commander_home_group_promotion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_home_protect_row_identity_with_ts('requested_at');