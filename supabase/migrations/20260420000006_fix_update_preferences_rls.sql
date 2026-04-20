CREATE OR REPLACE FUNCTION public.update_page_preferences(
  p_user_id uuid, p_column_name text, p_preferences jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User ID mismatch';
  END IF;
  IF p_column_name NOT IN ('bankroll_preferences','trivia_preferences','video_preferences',
    'news_preferences','memory_games_preferences','diamond_arcade_preferences',
    'diamond_arena_preferences','poker_near_me_preferences') THEN
    RAISE EXCEPTION 'Invalid preference column: %', p_column_name;
  END IF;
  EXECUTE format('UPDATE profiles SET %I = $1, updated_at = now() WHERE id = $2', p_column_name)
    USING p_preferences, p_user_id;
END; $$;
