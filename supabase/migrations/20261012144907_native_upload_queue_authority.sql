-- TIER: 2; AUTHOR: Codex; AFFECTS: one service-only RPC and owned native post queue.
-- WHY: /api/video/transcode created orphan job rows; the existing native worker
-- consumes social_posts.transcode_status, not video_transcode_jobs. Queue at
-- its existing owner atomically, verify upload membership, retain explicit intent.
-- Native worker/service unchanged; no new schedule, downloader or rights grant.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regprocedure('public.queue_owned_native_upload(uuid,uuid,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Native queue RPC already exists; do not replay'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='social_posts'
 AND column_name IN ('author_id','media_urls','original_media_url','transcode_status','rights_status','playback_type','is_deleted')) <> 7 THEN
  RAISE EXCEPTION 'Native post queue baseline missing'; END IF;
END $$;
CREATE FUNCTION public.queue_owned_native_upload(p_actor uuid,p_post_id uuid,p_video_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE p public.social_posts%ROWTYPE; object_path text;
BEGIN
 SELECT * INTO p FROM public.social_posts WHERE id=p_post_id FOR UPDATE;
 IF NOT FOUND OR p.author_id IS DISTINCT FROM p_actor OR COALESCE(p.is_deleted,false)
   OR p.playback_type IS DISTINCT FROM 'native' OR p.rights_status IS DISTINCT FROM 'user_authorized' THEN
   RAISE EXCEPTION 'Native post is not authorized' USING ERRCODE='42501'; END IF;
 IF p_video_url IS NULL OR p_video_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
   OR p_video_url ~ '[?%#\\[:cntrl:]]' THEN
   RAISE EXCEPTION 'Native upload URL is not trusted' USING ERRCODE='22023'; END IF;
 object_path := substring(p_video_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
 IF object_path !~ ('^(videos|reels)/' || p_actor::text || '/[^/]+$')
   OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=object_path) THEN
   RAISE EXCEPTION 'Native upload object is not owned or missing' USING ERRCODE='22023'; END IF;
 IF p.original_media_url=p_video_url AND p.transcode_status IN ('queued','running','done') THEN
   RETURN jsonb_build_object('jobId','native:'||p.id,'status',p.transcode_status,'reused',true);
 END IF;
 IF p.media_urls->>0 IS DISTINCT FROM p_video_url THEN
   RAISE EXCEPTION 'Native upload does not match primary post media' USING ERRCODE='22023'; END IF;
 IF p.transcode_status IN ('queued','running') THEN
   RAISE EXCEPTION 'Another native source is already processing' USING ERRCODE='55000'; END IF;
 UPDATE public.social_posts SET original_media_url=p_video_url,transcode_status='queued',transcode_error=NULL WHERE id=p.id;
 RETURN jsonb_build_object('jobId','native:'||p.id,'status','queued','reused',false);
END $$;
REVOKE ALL ON FUNCTION public.queue_owned_native_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_owned_native_upload(uuid,uuid,text) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.queue_owned_native_upload(uuid,uuid,text)','EXECUTE')
   OR has_function_privilege('authenticated','public.queue_owned_native_upload(uuid,uuid,text)','EXECUTE')
   OR NOT has_function_privilege('service_role','public.queue_owned_native_upload(uuid,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'Native queue grants postimage mismatch'; END IF;
END $$;
COMMIT;
