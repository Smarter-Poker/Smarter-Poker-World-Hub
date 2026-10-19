CREATE OR REPLACE FUNCTION public.fn_next_player_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate bigint;
  v_tries     int := 0;
BEGIN
  LOOP
    v_candidate := nextval('public.player_number_seq');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE player_number = v_candidate::text
    );
    v_tries := v_tries + 1;
    IF v_tries > 1000 THEN
      RAISE EXCEPTION 'fn_next_player_number: no free player number after 1000 attempts';
    END IF;
  END LOOP;
  RETURN v_candidate::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_v2_create_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (user_id, wallet_type, balance, locked_balance)
  VALUES (NEW.id, 'PLAYER', 0, 0)
  ON CONFLICT (user_id, wallet_type) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.signup_errors (user_id, email, trigger_name, error_code, error_msg)
    VALUES (NEW.id, NEW.email, 'handle_new_user_v2_create_wallet', SQLSTATE, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.initialize_user_diamonds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    /* 2026-09-07: this wrote (100, 100) into a MIRROR of profiles.diamonds.
       The canonical store defaults to 0 and no profile in fourteen days held a
       canonical 100, so the number was never a balance - it was a mirror
       disagreeing with the thing it mirrors. It reads the canonical store now;
       at signup there is usually no profile row yet, which reads 0, and
       trg_diamond_side_tables_follow_profiles writes the true figure the
       moment the profile is created. */
    INSERT INTO public.user_diamonds (user_id, balance, lifetime_earned)
    VALUES (NEW.id,
            COALESCE((SELECT GREATEST(COALESCE(p.diamonds, 0), 0)
                        FROM public.profiles p WHERE p.id = NEW.id), 0),
            0)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_daily_streaks (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.signup_errors (user_id, email, trigger_name, error_code, error_msg)
      VALUES (NEW.id, NEW.email, 'initialize_user_diamonds', SQLSTATE, SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END;
$function$;
