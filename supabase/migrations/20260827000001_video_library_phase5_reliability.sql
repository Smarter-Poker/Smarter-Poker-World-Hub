-- Video Library Phase 5: atomic watch sessions and the real preference column.

CREATE OR REPLACE FUNCTION public.update_page_preferences(
  p_user_id uuid, p_column_name text, p_preferences jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_preferences jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User ID mismatch';
  END IF;
  IF p_column_name NOT IN ('bankroll_preferences','trivia_preferences','video_preferences',
    'video_library_preferences','news_preferences','memory_games_preferences',
    'diamond_arcade_preferences','diamond_arena_preferences','poker_near_me_preferences') THEN
    RAISE EXCEPTION 'Invalid preference column: %', p_column_name;
  END IF;
  EXECUTE format(
    'UPDATE profiles SET %I = $1, updated_at = now() WHERE id = $2 RETURNING %I',
    p_column_name, p_column_name
  ) INTO v_preferences USING p_preferences, p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  RETURN v_preferences;
END; $$;

CREATE OR REPLACE FUNCTION public.record_video_watch_session(
  p_video_id text,
  p_additional_seconds integer,
  p_video_title text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_duration_seconds integer DEFAULT NULL
) RETURNS TABLE (
  previous_watch_duration_seconds integer,
  watch_duration_seconds integer,
  progress_seconds integer,
  watched_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_additional integer := LEAST(GREATEST(COALESCE(p_additional_seconds, 0), 0), 3600);
  v_previous integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_video_id IS NULL OR btrim(p_video_id) = '' THEN
    RAISE EXCEPTION 'Video ID is required';
  END IF;
  IF v_additional = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(h.watch_duration_seconds, 0)
    INTO v_previous
    FROM public.video_watch_history h
   WHERE h.user_id = v_user_id AND h.video_id = p_video_id;

  INSERT INTO public.video_watch_history (
    user_id, video_id, video_title, thumbnail_url,
    watch_duration_seconds, progress_seconds, duration_seconds, watched_at
  ) VALUES (
    v_user_id, p_video_id, p_video_title, p_thumbnail_url,
    v_additional,
    CASE WHEN COALESCE(p_duration_seconds, 0) > 0
      THEN LEAST(p_duration_seconds, v_additional) ELSE v_additional END,
    NULLIF(p_duration_seconds, 0), now()
  )
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    video_title = COALESCE(EXCLUDED.video_title, video_watch_history.video_title),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, video_watch_history.thumbnail_url),
    watch_duration_seconds = COALESCE(video_watch_history.watch_duration_seconds, 0) + v_additional,
    progress_seconds = CASE
      WHEN COALESCE(EXCLUDED.duration_seconds, video_watch_history.duration_seconds, 0) > 0
        THEN LEAST(
          COALESCE(EXCLUDED.duration_seconds, video_watch_history.duration_seconds),
          COALESCE(video_watch_history.progress_seconds, 0) + v_additional
        )
      ELSE COALESCE(video_watch_history.progress_seconds, 0) + v_additional
    END,
    duration_seconds = COALESCE(EXCLUDED.duration_seconds, video_watch_history.duration_seconds),
    watched_at = now();

  RETURN QUERY
  SELECT v_previous,
         COALESCE(h.watch_duration_seconds, 0),
         COALESCE(h.progress_seconds, 0),
         h.watched_at
    FROM public.video_watch_history h
   WHERE h.user_id = v_user_id AND h.video_id = p_video_id;
END; $$;

REVOKE ALL ON FUNCTION public.record_video_watch_session(text, integer, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_video_watch_session(text, integer, text, text, integer) TO authenticated;
