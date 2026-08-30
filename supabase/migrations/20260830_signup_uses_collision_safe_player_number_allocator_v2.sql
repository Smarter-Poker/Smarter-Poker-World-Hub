-- APPLIED TO PRODUCTION 2026-08-30.
--
-- PROFILE INITIALISATION WAS FAILING ON EVERY CALL, SILENTLY.
--
-- Found by probing initialize_player_profile inside a transaction that was
-- rolled back. It created no profile and returned:
--
--   success = false
--   message = 'duplicate key value violates unique constraint
--              "uq_profiles_player_number"'
--
-- It catches its own exception and reports failure in a RESULT COLUMN, so
-- nothing raises and nothing alerts. A caller that does not inspect `success`
-- sees a successful call that created nothing.
--
-- WHY IT COLLIDES. profiles.player_number is UNIQUE across everyone. A
-- canonical allocator already exists - fn_next_player_number(), which draws
-- from player_number_seq and LOOPS until it finds a number no profile holds -
-- and the BEFORE INSERT trigger trg_profiles_assign_player_number calls it,
-- but only IF NEW.player_number IS NULL. This function supplied its own value
-- from a DIFFERENT sequence with no free-number check, so the trigger deferred
-- to a number that was already taken. Measured at the time: that sequence
-- stood at 1502 while 169 existing profiles held numbers at or below 1502.
--
-- It is recent. A profile with this function's fingerprint (skill_tier
-- 'Newcomer', diamonds 500) was created at 17:00:14 the same day. The sequence
-- walks forward into occupied territory and then fails for everyone, quietly.
--
-- VERIFIED by re-running the same rolled-back probe afterwards:
--   success=t | player_number=1000003 | diamonds=500 diamond_balance=500
--
-- v2: the first attempt aborted on its OWN post-condition, because the comment
-- explaining the fix named the retired sequence and the assertion searched the
-- raw definition. Assertions here read the definition with `--` comments
-- stripped. An assertion must read code, never prose.

DO $$
DECLARE
    v_src  text;
    v_new  text;
    v_old  text;
    v_rep  text;
    v_code text;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'initialize_player_profile';

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'initialize_player_profile not found';
    END IF;

    IF position('fn_next_player_number' in regexp_replace(v_src, '--[^\n]*', '', 'g')) > 0 THEN
        RAISE NOTICE 'already using the collision-safe allocator; no change';
        RETURN;
    END IF;

    v_old := E'    IF v_is_employee THEN\n'
          || E'        v_player_number := NEXTVAL(''employee_number_seq'')::TEXT;\n'
          || E'    ELSE\n'
          || E'        v_player_number := NEXTVAL(''public_player_number_seq'')::TEXT;\n'
          || E'    END IF;';

    IF position(v_old in v_src) = 0 THEN
        RAISE EXCEPTION 'player-number anchor not found; the function changed shape, edit by hand';
    END IF;

    -- Employees keep drawing from their own sequence first, because that
    -- numbering is deliberate. But the UNIQUE constraint spans BOTH
    -- populations, so that branch has to check for a free number too. Bounded,
    -- not open: an exhausted sequence must raise, never hang a signup.
    v_rep := E'    IF v_is_employee THEN\n'
          || E'        DECLARE v_tries int := 0;\n'
          || E'        BEGIN\n'
          || E'            LOOP\n'
          || E'                v_player_number := NEXTVAL(''employee_number_seq'')::TEXT;\n'
          || E'                EXIT WHEN NOT EXISTS (\n'
          || E'                    SELECT 1 FROM public.profiles WHERE player_number = v_player_number\n'
          || E'                );\n'
          || E'                v_tries := v_tries + 1;\n'
          || E'                IF v_tries > 1000 THEN\n'
          || E'                    RAISE EXCEPTION ''initialize_player_profile: no free employee number after 1000 attempts'';\n'
          || E'                END IF;\n'
          || E'            END LOOP;\n'
          || E'        END;\n'
          || E'    ELSE\n'
          || E'        v_player_number := public.fn_next_player_number();\n'
          || E'    END IF;';

    v_new := replace(v_src, v_old, v_rep);
    IF v_new = v_src THEN
        RAISE EXCEPTION 'replacement produced no change';
    END IF;

    EXECUTE v_new;

    SELECT pg_get_functiondef(p.oid) INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'initialize_player_profile';

    v_code := regexp_replace(v_src, '--[^\n]*', '', 'g');

    IF position('fn_next_player_number' in v_code) = 0 THEN
        RAISE EXCEPTION 'post-condition failed: the canonical allocator is not called';
    END IF;
    IF position('public_player_number_seq' in v_code) > 0 THEN
        RAISE EXCEPTION 'post-condition failed: the colliding sequence is still used in code';
    END IF;
    IF position('diamond_balance' in v_code) = 0 THEN
        RAISE EXCEPTION 'post-condition failed: the diamond_balance fix was lost';
    END IF;
    IF position('ON CONFLICT (id) DO UPDATE' in v_code) = 0 THEN
        RAISE EXCEPTION 'post-condition failed: the ON CONFLICT branch was lost';
    END IF;

    RAISE NOTICE 'initialize_player_profile now allocates a guaranteed-free player number';
END $$;
