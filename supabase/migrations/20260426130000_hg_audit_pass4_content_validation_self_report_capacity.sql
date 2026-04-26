-- Audit Pass 4 fixes:
--
-- B9 + B10: posts content must be non-empty after trim
-- B11: comment content must be non-empty after trim
-- B12: self-reports rejected
-- B13: scheduled/confirmed games must not be in the past
-- B14: RSVP capacity enforcement at INSERT (auto-waitlist when full)

ALTER TABLE public.commander_home_posts
  DROP CONSTRAINT IF EXISTS chk_home_posts_content_nonblank;
ALTER TABLE public.commander_home_posts
  ADD CONSTRAINT chk_home_posts_content_nonblank
  CHECK (length(btrim(content)) >= 1);

ALTER TABLE public.commander_home_post_comments
  DROP CONSTRAINT IF EXISTS chk_home_post_comments_content_nonblank;
ALTER TABLE public.commander_home_post_comments
  ADD CONSTRAINT chk_home_post_comments_content_nonblank
  CHECK (length(btrim(content)) >= 1);

ALTER TABLE public.commander_home_content_reports
  DROP CONSTRAINT IF EXISTS chk_home_reports_no_self_report;
ALTER TABLE public.commander_home_content_reports
  ADD CONSTRAINT chk_home_reports_no_self_report
  CHECK (reporter_id IS DISTINCT FROM content_author_id);

CREATE OR REPLACE FUNCTION public.fn_hg_validate_game_scheduled_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('scheduled','confirmed') THEN
    IF NEW.scheduled_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'PAST_SCHEDULED_DATE'
        USING HINT = 'cannot create a scheduled or confirmed game in the past; '
                  || 'use the lifecycle RPCs to mark older games completed/cancelled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hg_validate_game_scheduled_date ON public.commander_home_games;
CREATE TRIGGER trg_hg_validate_game_scheduled_date
  BEFORE INSERT ON public.commander_home_games
  FOR EACH ROW EXECUTE FUNCTION public.fn_hg_validate_game_scheduled_date();

CREATE OR REPLACE FUNCTION public.fn_hg_enforce_rsvp_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_game RECORD;
  v_yes_count int;
BEGIN
  IF NEW.response <> 'yes' THEN RETURN NEW; END IF;

  SELECT id, max_players, rsvp_yes
    INTO v_game
    FROM commander_home_games
   WHERE id = NEW.game_id
     FOR UPDATE;

  IF NOT FOUND OR v_game.max_players IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_yes_count
    FROM commander_home_rsvps
   WHERE game_id = NEW.game_id AND response = 'yes';

  IF v_yes_count >= v_game.max_players THEN
    NEW.response := 'waitlist';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hg_enforce_rsvp_capacity ON public.commander_home_rsvps;
CREATE TRIGGER trg_hg_enforce_rsvp_capacity
  BEFORE INSERT OR UPDATE OF response ON public.commander_home_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.fn_hg_enforce_rsvp_capacity();
