-- TIER: 2; AUTHOR: Codex; AFFECTS: authenticated desired-state Reel RPC only.
-- WHY: separately deleting the opposite reaction then inserting can lose state
-- on failure; concurrent like attempts return23505 and falsely roll back UI.
-- Existing unique key, RLS, restriction/canonicalization/reward/count triggers
-- remain intact. No arbitrary actor parameter, new awards or RLS widening.
-- A bounded transaction advisory lock replaces FOR UPDATE because author-only
-- Reel UPDATE RLS cannot lock another author's row as SECURITY INVOKER.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regprocedure('public.set_reel_reaction(uuid,text,boolean)') IS NOT NULL THEN
  RAISE EXCEPTION 'Reel reaction RPC already present; do not replay'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.social_likes'::regclass AND relrowsecurity)
 OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='social_likes'
 AND indexname='social_likes_post_id_user_id_reaction_key') THEN
  RAISE EXCEPTION 'Reaction RLS or unique-key baseline missing'; END IF;
END $$;
CREATE FUNCTION public.set_reel_reaction(p_reel_id uuid,p_reaction text,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_reel_id IS NULL OR p_reaction NOT IN ('like','dislike') OR p_reaction IS NULL OR p_active IS NULL THEN
  RAISE EXCEPTION 'Invalid Reel reaction intent' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.social_reels r WHERE r.id=p_reel_id
   AND COALESCE(r.is_deleted,false)=false AND (r.is_public=true OR r.author_id=actor) AND r.media_status='ready'
   AND r.moderation_state IS DISTINCT FROM 'taken_down' AND r.taken_down_at IS NULL
   AND public.fn_is_public_video_playback_eligible(r.playback_type,r.rights_status,r.video_url,r.author_id,r.youtube_video_id,r.canonical_asset_key)) THEN
   RAISE EXCEPTION 'Qualified Reel unavailable' USING ERRCODE='42501'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||':'||p_reel_id::text,0)) THEN
   RAISE EXCEPTION 'Reel reaction intent is busy' USING ERRCODE='55P03'; END IF;
 IF p_active THEN
   DELETE FROM public.social_likes WHERE post_id=p_reel_id AND user_id=actor
     AND reaction_type=CASE p_reaction WHEN 'like' THEN 'dislike' ELSE 'like' END;
   INSERT INTO public.social_likes(post_id,user_id,reaction_type)
     VALUES(p_reel_id,actor,p_reaction) ON CONFLICT(post_id,user_id,reaction_type) DO NOTHING;
 ELSE
   DELETE FROM public.social_likes WHERE post_id=p_reel_id AND user_id=actor AND reaction_type=p_reaction;
 END IF;
 SELECT jsonb_build_object(
   'liked',EXISTS(SELECT 1 FROM public.social_likes WHERE post_id=p_reel_id AND user_id=actor AND reaction_type='like'),
   'disliked',EXISTS(SELECT 1 FROM public.social_likes WHERE post_id=p_reel_id AND user_id=actor AND reaction_type='dislike'),
   'likeCount',(SELECT count(*)::integer FROM public.social_likes WHERE post_id=p_reel_id AND reaction_type='like')
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.set_reel_reaction(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_reel_reaction(uuid,text,boolean) TO authenticated;
DO $$ BEGIN
 IF has_function_privilege('anon','public.set_reel_reaction(uuid,text,boolean)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.set_reel_reaction(uuid,text,boolean)','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.set_reel_reaction(uuid,text,boolean)'::regprocedure) THEN
  RAISE EXCEPTION 'Reaction function privilege postimage mismatch'; END IF;
END $$;
COMMIT;
