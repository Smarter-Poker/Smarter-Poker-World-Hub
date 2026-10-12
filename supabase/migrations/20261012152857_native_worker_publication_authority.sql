-- TIER: 2; AUTHOR: Codex; AFFECTS: native queue protected fields + service publish RPC.
-- WHY: author UPDATE RLS alone allowed rewriting a queued source/worker state.
-- Protect those fields and publish one still-authorized source atomically.
-- Preserve normal post creation NULL defaults and installed queue RPC unchanged.
-- No new job/service/schedule, financial rails, bulk repair or rights promotion.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regprocedure('public.complete_owned_native_upload(uuid,uuid,text,text,text)') IS NOT NULL
 OR to_regprocedure('public.guard_native_worker_post_fields()') IS NOT NULL THEN
 RAISE EXCEPTION 'Native worker authority source already present; do not replay'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='social_posts'
 AND column_name IN ('original_media_url','transcode_status','transcode_error') AND column_default IS NULL)<>3 THEN
 RAISE EXCEPTION 'Native worker NULL-default baseline mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='tr_queue_video_transcode')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='trg_social_posts_video_to_reel_mirror') THEN
 RAISE EXCEPTION 'Maintained native composer producer/mirror triggers missing'; END IF;
END $$;
CREATE FUNCTION public.guard_native_worker_post_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
   IF TG_OP='INSERT' THEN
     IF NEW.metadata->>'native_reels_worker' IS NOT NULL THEN
       RAISE EXCEPTION 'Native worker ownership is service-owned' USING ERRCODE='42501'; END IF;
     IF NEW.original_media_url IS NOT NULL OR NEW.transcode_status IS NOT NULL OR NEW.transcode_error IS NOT NULL THEN
       RAISE EXCEPTION 'Native processing fields are service-owned' USING ERRCODE='42501'; END IF;
   ELSIF (NEW.metadata->>'native_reels_worker') IS DISTINCT FROM (OLD.metadata->>'native_reels_worker')
     OR NEW.original_media_url IS DISTINCT FROM OLD.original_media_url
     OR NEW.transcode_status IS DISTINCT FROM OLD.transcode_status
     OR NEW.transcode_error IS DISTINCT FROM OLD.transcode_error THEN
     RAISE EXCEPTION 'Native processing fields are service-owned' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_native_worker_post_fields
BEFORE INSERT OR UPDATE OF original_media_url,transcode_status,transcode_error,metadata ON public.social_posts
FOR EACH ROW EXECUTE FUNCTION public.guard_native_worker_post_fields();
REVOKE ALL ON FUNCTION public.guard_native_worker_post_fields() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.queue_owned_native_upload(p_actor uuid,p_post_id uuid,p_video_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE p public.social_posts%ROWTYPE; object_path text;
BEGIN
 SELECT * INTO p FROM public.social_posts WHERE id=p_post_id FOR UPDATE;
 IF NOT FOUND OR p.author_id IS DISTINCT FROM p_actor OR COALESCE(p.is_deleted,false)
   OR p.moderation_state='taken_down' OR p.taken_down_at IS NOT NULL
   OR p.playback_type IS DISTINCT FROM 'native' OR p.rights_status IS DISTINCT FROM 'user_authorized' THEN
   RAISE EXCEPTION 'Native post is not authorized' USING ERRCODE='42501'; END IF;
 IF p_video_url IS NULL OR p_video_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
   OR p_video_url ~ '[?%#\\[:cntrl:]]' THEN
   RAISE EXCEPTION 'Native upload URL is not trusted' USING ERRCODE='22023'; END IF;
 object_path := substring(p_video_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
 IF object_path !~ ('^(videos|reels)/' || p_actor::text || '/[^/]+$')
   OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=object_path) THEN
   RAISE EXCEPTION 'Native upload object is not owned or missing' USING ERRCODE='22023'; END IF;
 IF p.metadata IS NOT NULL AND jsonb_typeof(p.metadata)<>'object' THEN
  RAISE EXCEPTION 'Native queue metadata must be an object' USING ERRCODE='22023'; END IF;
 -- Assign the existing consumer only for explicit Reel paths or owned mirrors.
 IF object_path LIKE ('reels/'||p_actor::text||'/%') OR EXISTS(SELECT 1 FROM public.social_reels r
   WHERE r.source_post_id=p.id AND r.author_id=p_actor AND r.playback_type='native'
   AND r.rights_status='user_authorized' AND r.is_deleted=false AND r.media_status='ready'
   AND r.moderation_state IS DISTINCT FROM 'taken_down' AND r.taken_down_at IS NULL) THEN
   UPDATE public.social_posts SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{native_reels_worker}',to_jsonb('sp-transcode'::text)) WHERE id=p.id;
 END IF;
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
-- Normal composer inserts already use the maintained BEFORE queue producer
-- and AFTER video-to-Reel mirror. Assign its exact eligible queue after both.
CREATE FUNCTION public.mark_inserted_native_reel_queue_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE object_path text;
BEGIN
 IF NEW.transcode_status IS DISTINCT FROM 'queued' OR NEW.is_deleted IS DISTINCT FROM false
   OR NEW.playback_type IS DISTINCT FROM 'native' OR NEW.rights_status IS DISTINCT FROM 'user_authorized'
   OR NEW.moderation_state='taken_down' OR NEW.taken_down_at IS NOT NULL
   OR NEW.original_media_url IS DISTINCT FROM NEW.media_urls->>0 THEN RETURN NEW; END IF;
 IF NEW.original_media_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
   OR NEW.original_media_url ~ '[?%#\\[:cntrl:]]' THEN RETURN NEW; END IF;
 object_path=substring(NEW.original_media_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
 IF object_path !~ ('^(videos|reels)/'||NEW.author_id::text||'/[^/]+$')
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=object_path) THEN RETURN NEW; END IF;
 IF object_path LIKE ('reels/'||NEW.author_id::text||'/%') OR EXISTS(SELECT 1 FROM social_reels r
   WHERE r.source_post_id=NEW.id AND r.author_id=NEW.author_id AND r.playback_type='native'
   AND r.rights_status='user_authorized' AND r.is_deleted=false AND r.media_status='ready'
   AND r.moderation_state IS DISTINCT FROM 'taken_down' AND r.taken_down_at IS NULL) THEN
   IF NEW.metadata IS NOT NULL AND jsonb_typeof(NEW.metadata)<>'object' THEN
     RAISE EXCEPTION 'Native queue metadata must be an object' USING ERRCODE='22023'; END IF;
   UPDATE social_posts SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{native_reels_worker}',to_jsonb('sp-transcode'::text)) WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mark_inserted_native_reel_queue_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_native_reels_queue_owner AFTER INSERT ON public.social_posts
FOR EACH ROW EXECUTE FUNCTION public.mark_inserted_native_reel_queue_owner();
CREATE FUNCTION public.complete_owned_native_upload(p_post_id uuid,p_author_id uuid,p_source_url text,p_output_url text,p_thumbnail_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE p public.social_posts%ROWTYPE; source_path text; output_path text; thumbnail_path text; chosen_thumbnail text; mirrors integer;
BEGIN
 SELECT * INTO p FROM public.social_posts WHERE id=p_post_id FOR UPDATE;
 IF NOT FOUND OR p.author_id IS DISTINCT FROM p_author_id OR p.is_deleted IS DISTINCT FROM false
   OR p.moderation_state='taken_down' OR p.taken_down_at IS NOT NULL
   OR p.playback_type IS DISTINCT FROM 'native' OR p.rights_status IS DISTINCT FROM 'user_authorized'
   OR p.metadata->>'native_reels_worker' IS DISTINCT FROM 'sp-transcode'
   OR p.transcode_status IS DISTINCT FROM 'running' OR p.original_media_url IS DISTINCT FROM p_source_url
   OR p.media_urls->>0 IS DISTINCT FROM p_source_url THEN
   RAISE EXCEPTION 'Native publish source is no longer authorized' USING ERRCODE='42501'; END IF;
 IF p_source_url IS NULL OR p_output_url IS NULL OR p_source_url=p_output_url
   OR p_source_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
   OR p_output_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
   OR p_source_url ~ '[?%#\\[:cntrl:]]' OR p_output_url ~ '[?%#\\[:cntrl:]]' THEN
   RAISE EXCEPTION 'Native publish URLs are not trusted' USING ERRCODE='22023'; END IF;
 source_path=substring(p_source_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
 output_path=substring(p_output_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
 IF source_path !~ ('^(videos|reels)/'||p_author_id::text||'/[^/]+$')
   OR output_path !~ ('^videos/'||p_author_id::text||'/native-'||p_post_id::text||'-[0-9a-f-]{36}\.mp4$')
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=source_path)
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=output_path) THEN
   RAISE EXCEPTION 'Native publish object is missing or not owned' USING ERRCODE='22023'; END IF;
 IF p_thumbnail_url IS NOT NULL THEN
  IF p_thumbnail_url NOT LIKE 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/%'
    OR p_thumbnail_url ~ '[?%#\\[:cntrl:]]' THEN RAISE EXCEPTION 'Native thumbnail URL not trusted' USING ERRCODE='22023'; END IF;
  thumbnail_path=substring(p_thumbnail_url from length('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/')+1);
  IF thumbnail_path IS DISTINCT FROM regexp_replace(output_path,'\.mp4$','.jpg')
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='social-media' AND name=thumbnail_path) THEN
    RAISE EXCEPTION 'Native thumbnail object missing or not owned' USING ERRCODE='22023'; END IF;
 END IF;
 chosen_thumbnail=COALESCE(NULLIF(p.thumbnail_url,''),p_thumbnail_url);
 UPDATE public.social_posts SET media_urls=jsonb_set(media_urls,'{0}',to_jsonb(p_output_url)),
   transcode_status='done',transcode_error=NULL,thumbnail_url=chosen_thumbnail WHERE id=p.id;
 UPDATE public.social_reels SET video_url=p_output_url,thumbnail_url=COALESCE(NULLIF(thumbnail_url,''),chosen_thumbnail) WHERE source_post_id=p.id AND author_id=p.author_id
   AND playback_type='native' AND rights_status='user_authorized' AND is_deleted=false AND video_url=p_source_url AND media_status='ready'
   AND moderation_state IS DISTINCT FROM 'taken_down' AND taken_down_at IS NULL;
 GET DIAGNOSTICS mirrors=ROW_COUNT;
 RETURN jsonb_build_object('completed',true,'postId',p.id,'mirrors',mirrors);
END $$;
REVOKE ALL ON FUNCTION public.complete_owned_native_upload(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_owned_native_upload(uuid,uuid,text,text,text) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.complete_owned_native_upload(uuid,uuid,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.complete_owned_native_upload(uuid,uuid,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.complete_owned_native_upload(uuid,uuid,text,text,text)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='guard_native_worker_post_fields')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_posts'::regclass AND tgname='zz_native_reels_queue_owner') THEN
 RAISE EXCEPTION 'Native publish authority postimage mismatch'; END IF;
END $$;
COMMIT;
