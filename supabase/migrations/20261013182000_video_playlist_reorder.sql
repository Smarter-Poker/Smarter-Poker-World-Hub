-- TIER: 2
-- AUTHOR: Codex
-- AFFECTS: video_playlists, video_playlist_items, fn_reorder_video_playlist
-- IRREVERSIBLE: no
-- WHY: Playlist items have sort_order but no atomic owner-scoped reorder.
-- HOW: Lock the owner's playlist, compare the complete prior order, validate
-- identical membership, then update every position in one transaction.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.video_playlists') IS NULL OR to_regclass('public.video_playlist_items') IS NULL THEN
        RAISE EXCEPTION 'Playlist tables are required';
    END IF;
    IF to_regprocedure('public.fn_append_video_playlist(uuid,text,text,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'Playlist append is already installed; do not replay';
    END IF;
    IF to_regprocedure('public.fn_reorder_video_playlist(uuid,text[],text[])') IS NOT NULL THEN
        RAISE EXCEPTION 'Playlist reorder is already installed; do not replay';
    END IF;
END $$;
CREATE FUNCTION public.fn_reorder_video_playlist(p_playlist_id uuid, p_expected_video_ids text[], p_video_ids text[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE v_owner uuid; v_actual text[];
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
    SELECT user_id INTO v_owner FROM public.video_playlists WHERE id = p_playlist_id FOR UPDATE;
    IF v_owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Playlist unavailable' USING ERRCODE = '42501'; END IF;
    IF p_video_ids IS NULL OR p_expected_video_ids IS NULL OR cardinality(p_video_ids) > 500
        OR array_position(p_video_ids, NULL) IS NOT NULL
        OR cardinality(p_video_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_video_ids) id)
    THEN RAISE EXCEPTION 'Invalid playlist order' USING ERRCODE = '22023'; END IF;
    PERFORM id FROM public.video_playlist_items WHERE playlist_id = p_playlist_id FOR UPDATE;
    SELECT COALESCE(array_agg(video_id ORDER BY sort_order, created_at, id), ARRAY[]::text[])
      INTO v_actual FROM public.video_playlist_items WHERE playlist_id = p_playlist_id;
    IF v_actual IS DISTINCT FROM p_expected_video_ids THEN RAISE EXCEPTION 'Playlist changed; reload before reordering' USING ERRCODE = '40001'; END IF;
    IF cardinality(v_actual) <> cardinality(p_video_ids)
       OR NOT (v_actual @> p_video_ids AND p_video_ids @> v_actual)
    THEN RAISE EXCEPTION 'Playlist membership changed' USING ERRCODE = '22023'; END IF;
    UPDATE public.video_playlist_items item SET sort_order = ordered.position - 1
      FROM unnest(p_video_ids) WITH ORDINALITY AS ordered(video_id, position)
      WHERE item.playlist_id = p_playlist_id AND item.video_id = ordered.video_id;
    RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.fn_reorder_video_playlist(uuid,text[],text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reorder_video_playlist(uuid,text[],text[]) TO authenticated;
CREATE FUNCTION public.fn_append_video_playlist(p_playlist_id uuid, p_video_id text, p_title text, p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE v_owner uuid; v_position integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
    IF p_video_id IS NULL OR p_video_id !~ '^[A-Za-z0-9_-]{11}$' THEN RAISE EXCEPTION 'Invalid video id' USING ERRCODE = '22023'; END IF;
    SELECT user_id INTO v_owner FROM public.video_playlists WHERE id = p_playlist_id FOR UPDATE;
    IF v_owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Playlist unavailable' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.video_playlist_items WHERE playlist_id = p_playlist_id AND video_id = p_video_id) THEN RETURN true; END IF;
    SELECT COALESCE(max(sort_order), -1) + 1 INTO v_position FROM public.video_playlist_items WHERE playlist_id = p_playlist_id;
    INSERT INTO public.video_playlist_items(playlist_id,video_id,video_title,video_source,sort_order)
      VALUES(p_playlist_id,p_video_id,left(p_title,300),left(p_source,80),v_position);
    RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.fn_append_video_playlist(uuid,text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_append_video_playlist(uuid,text,text,text) TO authenticated;
DO $$ BEGIN
    IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_reorder_video_playlist(uuid,text[],text[])'::regprocedure)
       OR NOT has_function_privilege('authenticated','public.fn_reorder_video_playlist(uuid,text[],text[])','EXECUTE')
       OR has_function_privilege('anon','public.fn_reorder_video_playlist(uuid,text[],text[])','EXECUTE')
    THEN RAISE EXCEPTION 'Playlist reorder privilege assertion failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK (new migration only):
-- BEGIN;
-- DROP FUNCTION public.fn_append_video_playlist(uuid,text,text,text);
-- DROP FUNCTION public.fn_reorder_video_playlist(uuid,text[],text[]);
-- COMMIT;
