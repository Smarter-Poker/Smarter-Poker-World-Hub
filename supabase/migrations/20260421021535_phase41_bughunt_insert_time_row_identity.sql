-- =====================================================================
-- Pass 47 (BK-3): Universal INSERT-time origin-timestamp force-override
--
-- BUG (class-wide, verified live on commander_home_members):
--   A user can INSERT a home_* row and provide an arbitrary created_at
--   value (or NULL on nullable columns). The column default `now()` only
--   fires when the column is omitted — if the client sends an explicit
--   value, Postgres accepts it. Trigger fn_enforce_home_members_self_insert
--   normalizes role/status/joined_at but does NOT touch created_at.
--
--   Result: BK-3 — an attacker joining a public group today can claim to
--   have joined 400+ days ago. Same class exists on all 18 home_* tables
--   previously hardened against UPDATE-time tamper in Pass 47.
--
-- FIX:
--   Pair-function to Pass 47's update-time guard. BEFORE INSERT trigger
--   overwrites NEW.created_at := NOW() for non-service-role callers, so
--   the server-side clock is always authoritative regardless of client
--   payload. For the two tables without `created_at`, parameterized
--   variant handles responded_at / requested_at.
--
-- Uses current_user DB-role check (matches Pass 47 pattern). Runs only
-- at pg_trigger_depth() = 1 to avoid clashing with cascading writes.
--
-- Seals BK-3 + 18-table blast radius.
-- ======================================================================

CREATE OR REPLACE FUNCTION public.fn_home_force_insert_origin_ts()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
  v_col  text;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Parameterized column name. Defaults to 'created_at'.
  IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL THEN
    v_col := TG_ARGV[0];
  ELSE
    v_col := 'created_at';
  END IF;

  -- Force the origin timestamp to NOW(), overriding whatever the client sent.
  -- We use dynamic SQL because the column name varies.
  EXECUTE format(
    'SELECT ($1 #= hstore(%L, $2::text))',
    v_col
  )
  INTO NEW
  USING NEW, NOW()::text;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_home_force_insert_origin_ts() IS
  'Pass 47 BK-3: BEFORE INSERT pair for fn_home_protect_row_identity. '
  'Overwrites the origin-timestamp column (created_at by default, or '
  'TG_ARGV[0] if given) with NOW() for non-service-role callers, so '
  'server-side clock is authoritative. Prevents INSERT-time chronology '
  'tamper (BK-3).';

-- hstore requires the extension. It's already enabled project-wide.
-- Attach the INSERT trigger to every home_* table we hardened in Pass 47.
DO $outer$
DECLARE
  -- [table_name, origin_ts_column]
  v_plan text[][] := ARRAY[
    ['commander_home_members',                     'created_at'],
    ['commander_home_groups',                      'created_at'],
    ['commander_home_games',                       'created_at'],
    ['commander_home_game_templates',              'created_at'],
    ['commander_home_game_tables',                 'created_at'],
    ['commander_home_posts',                       'created_at'],
    ['commander_home_post_comments',               'created_at'],
    ['commander_home_post_likes',                  'created_at'],
    ['commander_home_polls',                       'created_at'],
    ['commander_home_poll_votes',                  'created_at'],
    ['commander_home_game_photos',                 'created_at'],
    ['commander_home_game_reviews',                'created_at'],
    ['commander_home_group_follows',               'created_at'],
    ['commander_home_seat_reservations',           'created_at'],
    ['commander_home_content_reports',             'created_at'],
    ['commander_home_invite_tokens',               'created_at'],
    ['commander_home_rsvps',                       'responded_at'],
    ['commander_home_group_promotion_requests',    'requested_at']
  ];
  v_row text[];
  v_has_col boolean;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_plan LOOP
    -- Sanity check
    SELECT true INTO v_has_col
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = v_row[1] AND column_name = v_row[2];

    IF v_has_col IS NOT TRUE THEN
      RAISE NOTICE 'Pass 47 BK-3: skipping %.%; column missing', v_row[1], v_row[2];
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_home_force_insert_origin_ts ON public.%I',
      v_row[1]
    );
    EXECUTE format(
      'CREATE TRIGGER trg_home_force_insert_origin_ts '
      'BEFORE INSERT ON public.%I '
      'FOR EACH ROW '
      'EXECUTE FUNCTION public.fn_home_force_insert_origin_ts(%L)',
      v_row[1], v_row[2]
    );
  END LOOP;
END;
$outer$;

COMMENT ON TRIGGER trg_home_force_insert_origin_ts ON public.commander_home_members IS
  'Pass 47 BK-3: forces created_at := NOW() on INSERT for authenticated/anon, '
  'preventing client-supplied back-dating.'