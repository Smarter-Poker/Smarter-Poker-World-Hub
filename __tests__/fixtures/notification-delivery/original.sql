CREATE OR REPLACE FUNCTION public.fn_raise_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR btrim(p_title) = '' THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, type, title, message, link, data)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, COALESCE(p_data, '{}'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_notify_blinding_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_id uuid;
  v_name text;
  v_stack text := '';
BEGIN
  BEGIN
    -- Only the moment they GO away, never the moment they come back, and never
    -- a repeat while they stay away.
    IF NOT (COALESCE(NEW.is_sitting_out, false) OR COALESCE(NEW.is_away, false)) THEN
      RETURN NEW;
    END IF;
    IF (COALESCE(OLD.is_sitting_out, false) OR COALESCE(OLD.is_away, false)) THEN
      RETURN NEW;
    END IF;
    -- A seat they have already left is not blinding off.
    IF NEW.left_at IS NOT NULL OR NEW.user_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Tournaments only. A cash seat that sits out simply stops being dealt in;
    -- it is not paying blinds to be absent, so there is nothing urgent to say.
    SELECT t.tournament_id INTO v_tournament_id FROM public.tables t WHERE t.id = NEW.table_id;
    IF v_tournament_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(NULLIF(btrim(tn.name), ''), 'Your Tournament')
      INTO v_name FROM public.tournaments tn WHERE tn.id = v_tournament_id;
    v_name := COALESCE(v_name, 'Your Tournament');

    IF COALESCE(NEW.stack, 0) > 0 THEN
      v_stack := ' You have ' || to_char(round(NEW.stack), 'FM999,999,999,990') || ' chips left.';
    END IF;

    -- Copy carried over verbatim from notifyBlindingOff() so the intent that
    -- was already written and reviewed is preserved exactly.
    PERFORM public.fn_raise_notification(
      NEW.user_id,
      'tournament_blinding_off',
      'You Are Being Blinded Off',
      'Your seat in ' || v_name || ' is posting blinds without you.' || v_stack || ' Tap to take your seat.',
      '/table/' || NEW.table_id::text,
      jsonb_build_object('tableId', NEW.table_id, 'tournamentId', v_tournament_id, 'action', 'blinding_off')
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a notification interfere with the engine writing a seat.
    RAISE WARNING 'fn_notify_blinding_off failed for seat %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $function$;
