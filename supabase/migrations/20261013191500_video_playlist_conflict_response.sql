-- TIER: 3
-- AUTHOR: Codex
-- AFFECTS: fn_reorder_video_playlist(uuid,text[],text[])
-- IRREVERSIBLE: no
-- WHY: SQLSTATE 40001 marks an intentional stale-order conflict as retryable.
-- PostgREST 14 can repeatedly retry this permanent application conflict.
-- HOW: Preserve the exact owner RLS, locks, membership and CAS predicates;
-- change only its permanent stale-order response to explicit HTTP 409/PT409.
-- Original installed migration is immutable and is never replayed.
BEGIN;
DO $$
DECLARE v_source text;
BEGIN
    IF to_regprocedure('public.fn_reorder_video_playlist(uuid,text[],text[])') IS NULL THEN
        RAISE EXCEPTION 'Qualified playlist reorder must already be installed';
    END IF;
    SELECT prosrc INTO v_source FROM pg_proc WHERE oid='public.fn_reorder_video_playlist(uuid,text[],text[])'::regprocedure;
    IF v_source LIKE '%PT409%' THEN RAISE EXCEPTION 'Conflict response already installed; do not replay'; END IF;
    IF md5(v_source) <> '76efa4834d48eb14aaca8f89c9f5449a' OR v_source NOT LIKE '%ERRCODE = ''40001''%' OR
       (SELECT prosecdef FROM pg_proc WHERE oid='public.fn_reorder_video_playlist(uuid,text[],text[])'::regprocedure)
    THEN RAISE EXCEPTION 'Installed reorder contract differs from the qualified baseline'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_reorder_video_playlist(p_playlist_id uuid, p_expected_video_ids text[], p_video_ids text[])
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
    IF v_actual IS DISTINCT FROM p_expected_video_ids THEN RAISE EXCEPTION 'Playlist changed; reload before reordering' USING ERRCODE = 'PT409'; END IF;
    IF cardinality(v_actual) <> cardinality(p_video_ids)
       OR NOT (v_actual @> p_video_ids AND p_video_ids @> v_actual)
    THEN RAISE EXCEPTION 'Playlist membership changed' USING ERRCODE = '22023'; END IF;
    UPDATE public.video_playlist_items item SET sort_order = ordered.position - 1
      FROM unnest(p_video_ids) WITH ORDINALITY AS ordered(video_id, position)
      WHERE item.playlist_id = p_playlist_id AND item.video_id = ordered.video_id;
    RETURN true;
END $$;
DO $$
DECLARE v_function record;
BEGIN
    SELECT prosecdef,proconfig,prosrc INTO v_function FROM pg_proc
      WHERE oid='public.fn_reorder_video_playlist(uuid,text[],text[])'::regprocedure;
    IF md5(v_function.prosrc) <> '84c6c3f44ac4012daab210ea86f6095d' OR v_function.prosecdef OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=public, extensions']::text[]
       OR v_function.prosrc NOT LIKE '%ERRCODE = ''PT409''%' OR v_function.prosrc LIKE '%40001%'
       OR NOT has_function_privilege('authenticated','public.fn_reorder_video_playlist(uuid,text[],text[])','EXECUTE')
       OR has_function_privilege('anon','public.fn_reorder_video_playlist(uuid,text[],text[])','EXECUTE')
       OR has_function_privilege('service_role','public.fn_reorder_video_playlist(uuid,text[],text[])','EXECUTE')
    THEN RAISE EXCEPTION 'Permanent conflict response or original security assertion failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK: Apply as a NEW migration only, never replay the original file.
-- BEGIN;
-- DO $rollback$
-- DECLARE definition text;
-- BEGIN
--   definition := pg_get_functiondef('public.fn_reorder_video_playlist(uuid,text[],text[])'::regprocedure);
--   EXECUTE replace(definition, 'ERRCODE = ''PT409''', 'ERRCODE = ''40001''');
-- END $rollback$;
-- COMMIT;
-- The historical response has the documented PostgREST retry hazard; prefer
-- repairing a new regression without restoring that unsafe response.
