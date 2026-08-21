-- TWO REAL UNCAPPED RPCs, AND A DETECTOR THAT WAS WRONG ABOUT TWO MORE.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'home_text_caps_and_a_detector_that_measures_the_cap' (version 20260821183002).
--
-- The derived length-cap check reported 8 / 12. Reading all four shortfalls:
--
--   REAL - create_home_game_template takes SIX free-text fields (name,
--   description, game_type, stakes, food_drinks, special_rules) and bounds
--   none of them. Every target column is unbounded `text`, so one call could
--   store an arbitrarily large template.
--
--   REAL - create_home_group_poll rejects an empty question and caps the
--   option COUNT at 20, but bounds neither the question's length nor the
--   length of each option. Twenty options of unbounded size is the same hole
--   with extra steps.
--
--   NOT REAL - fn_home_assign_seat already caps player_name at 60 and note at
--   500. It just does not use the word TOO_LONG, and the detector was matching
--   that token rather than looking for a cap.
--
--   NOT REAL - fn_home_set_seat_status takes p_status text but validates it
--   against ('empty','reserved','seated','away'). An enumerated argument needs
--   a membership test, not a length bound, and it has one.
--
-- So the detector had the very disease it was written to cure: it tested for a
-- TOKEN instead of the property. It now looks for an actual upper-bound
-- comparison on length(), and ignores enum-validated arguments. `length(x) = 0`
-- is an emptiness test and does not count - that was the hole that let the two
-- real ones through.
--
-- Caps match the neighbouring RPCs: 60 short name, 120 one-line label, 300
-- question, 500 note, 2000 body.

CREATE OR REPLACE FUNCTION public.create_home_game_template(
  p_group_id uuid, p_caller_user_id uuid, p_name text,
  p_description text DEFAULT NULL::text, p_game_type text DEFAULT NULL::text,
  p_stakes text DEFAULT NULL::text, p_format text DEFAULT 'cash'::text,
  p_buyin_min numeric DEFAULT NULL::numeric, p_buyin_max numeric DEFAULT NULL::numeric,
  p_default_start_time time without time zone DEFAULT NULL::time without time zone,
  p_max_players integer DEFAULT NULL::integer, p_min_players integer DEFAULT NULL::integer,
  p_allow_guests boolean DEFAULT false, p_guest_limit integer DEFAULT NULL::integer,
  p_food_drinks text DEFAULT NULL::text, p_special_rules text DEFAULT NULL::text,
  p_is_default boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;

    -- Every target column is unbounded `text`, so these are the only bound.
    IF length(p_name)          > 60   THEN RAISE EXCEPTION 'NAME_TOO_LONG'; END IF;
    IF length(p_description)   > 2000 THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;
    IF length(p_game_type)     > 60   THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;
    IF length(p_stakes)        > 60   THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;
    IF length(p_food_drinks)   > 500  THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;
    IF length(p_special_rules) > 2000 THEN RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM commander_home_groups WHERE id = p_group_id AND owner_id = p_caller_user_id
        UNION
        SELECT 1 FROM commander_home_members WHERE group_id = p_group_id AND user_id = p_caller_user_id
          AND role IN ('admin','owner') AND status='approved'
    ) THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    IF p_is_default THEN
        UPDATE commander_home_game_templates SET is_default = false WHERE group_id = p_group_id;
    END IF;

    INSERT INTO commander_home_game_templates (
        group_id, created_by, name, description,
        game_type, stakes, format, buyin_min, buyin_max,
        default_start_time, max_players, min_players,
        allow_guests, guest_limit, food_drinks, special_rules, is_default
    ) VALUES (
        p_group_id, p_caller_user_id, p_name, p_description,
        p_game_type, p_stakes, p_format, p_buyin_min, p_buyin_max,
        p_default_start_time, p_max_players, p_min_players,
        p_allow_guests, p_guest_limit, p_food_drinks, p_special_rules, p_is_default
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'template_id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_home_group_poll(
  p_group_id uuid, p_caller_user_id uuid, p_question text, p_options jsonb,
  p_poll_type text DEFAULT 'single_choice'::text,
  p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_group  RECORD;
    v_new_id uuid;
    v_opt    jsonb;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF p_question IS NULL OR length(trim(p_question)) = 0 THEN
        RAISE EXCEPTION 'EMPTY_QUESTION';
    END IF;
    IF length(p_question) > 300 THEN
        RAISE EXCEPTION 'CONTENT_TOO_LONG';
    END IF;
    IF jsonb_array_length(p_options) < 2 THEN
        RAISE EXCEPTION 'MIN_TWO_OPTIONS';
    END IF;
    IF jsonb_array_length(p_options) > 20 THEN
        RAISE EXCEPTION 'TOO_MANY_OPTIONS';
    END IF;
    -- Capping the option COUNT without capping their SIZE is the same hole
    -- with extra steps: twenty options of unbounded length.
    FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        IF length(COALESCE(v_opt #>> '{}', '')) > 120 THEN
            RAISE EXCEPTION 'CONTENT_TOO_LONG';
        END IF;
    END LOOP;
    IF p_poll_type NOT IN ('single_choice','multi_choice','date_picker') THEN
        RAISE EXCEPTION 'INVALID_POLL_TYPE';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    IF v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = p_group_id AND user_id = p_caller_user_id
                          AND status = 'approved')
    THEN
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    INSERT INTO commander_home_polls
        (group_id, created_by, question, poll_type, closes_at, options)
    VALUES
        (p_group_id, p_caller_user_id, trim(p_question), p_poll_type, p_closes_at, p_options)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'poll_id', v_new_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hg_text_writing_functions()
RETURNS TABLE(proname text, has_cap boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.proname::text,
         (pg_get_functiondef(p.oid) ~* '(length|char_length)\s*\([^)]*\)\s*>'
          OR pg_get_functiondef(p.oid) ~* '(TOO_LONG|TOO_MANY)')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname ~ '^(fn_home_|create_home_|record_home_|toggle_home_|broadcast_to_home)'
     AND pg_get_function_identity_arguments(p.oid) ~ '\mtext\M'
     AND pg_get_functiondef(p.oid) ~* '\mINSERT\M|\mUPDATE\M'
     -- An argument validated against a fixed set needs a membership test, not
     -- a length bound. fn_home_set_seat_status is the example.
     AND pg_get_functiondef(p.oid) !~* 'NOT IN \(\s*''[a-z_]+''\s*,';
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hg_text_writing_functions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_hg_text_writing_functions() TO authenticated, service_role;

DO $$
DECLARE v_uncapped int;
BEGIN
  SELECT count(*) INTO v_uncapped FROM fn_hg_text_writing_functions() WHERE NOT has_cap;
  IF v_uncapped > 0 THEN
    RAISE EXCEPTION '% text-writing home RPCs still have no length cap', v_uncapped;
  END IF;
END $$;
