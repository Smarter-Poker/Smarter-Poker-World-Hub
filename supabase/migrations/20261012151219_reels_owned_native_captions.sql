-- TIER: 2; AUTHOR: Codex; AFFECTS: native captions metadata and scoped Storage paths.
-- Nullable creator-supplied WebVTT; keep provider captions unknown and protect API-owned bytes.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='social_reels' AND column_name='caption_track_url') THEN RAISE EXCEPTION 'Native caption migration already installed; never replay'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='social-media' AND public) THEN RAISE EXCEPTION 'Canonical public social-media bucket is required'; END IF;
END $$;
ALTER TABLE public.social_reels ADD COLUMN caption_track_url text;
ALTER TABLE public.social_reels ADD CONSTRAINT social_reels_owned_caption_path CHECK (
 caption_track_url IS NULL OR (
 author_id IS NOT NULL AND playback_type IS NOT NULL AND playback_type='native' AND caption_track_url ~ (
 '^https://kuklfnapbkmacvwxktbh[.]supabase[.]co/storage/v1/object/public/social-media/reels/' || author_id::text || '/caption-' || id::text || '-[a-f0-9]{64}[.]vtt$'
 ))
);
CREATE FUNCTION public.guard_owned_reel_caption_metadata() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.caption_track_url IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.caption_track_url ELSE NULL END)
 AND current_user NOT IN ('service_role','postgres') THEN
  RAISE EXCEPTION 'Caption metadata is set only by the authenticated creator API' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_owned_reel_caption_metadata BEFORE INSERT OR UPDATE OF caption_track_url ON public.social_reels FOR EACH ROW EXECUTE FUNCTION public.guard_owned_reel_caption_metadata();
REVOKE ALL ON FUNCTION public.guard_owned_reel_caption_metadata() FROM PUBLIC;
UPDATE storage.buckets SET allowed_mime_types=array_append(allowed_mime_types,'text/vtt')
 WHERE id='social-media' AND allowed_mime_types IS NOT NULL AND NOT ('text/vtt'=ANY(allowed_mime_types));
-- Existing permissive FOR ALL policies otherwise allow anonymous modification.
-- Restrict only this new API-owned path; all unrelated storage paths retain their policies.
CREATE POLICY owned_reel_caption_service_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK (NOT (bucket_id='social-media' AND name LIKE 'reels/%/caption-%.vtt'));
CREATE POLICY owned_reel_caption_service_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING (NOT (bucket_id='social-media' AND name LIKE 'reels/%/caption-%.vtt'))
 WITH CHECK (NOT (bucket_id='social-media' AND name LIKE 'reels/%/caption-%.vtt'));
CREATE POLICY owned_reel_caption_service_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING (NOT (bucket_id='social-media' AND name LIKE 'reels/%/caption-%.vtt'));
COMMENT ON COLUMN public.social_reels.caption_track_url IS 'Creator supplied WebVTT on canonical owned Storage. Nullable; provider transcripts are never inferred or rehosted.';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='social_reels' AND column_name='caption_track_url' AND is_nullable='YES')
 OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.social_reels'::regclass AND tgname='guard_owned_reel_caption_metadata')
 OR (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname IN ('owned_reel_caption_service_insert','owned_reel_caption_service_update','owned_reel_caption_service_delete') AND NOT polpermissive) <> 3
 OR EXISTS (SELECT 1 FROM storage.buckets WHERE id='social-media' AND allowed_mime_types IS NOT NULL AND NOT ('text/vtt'=ANY(allowed_mime_types))) THEN
 RAISE EXCEPTION 'Native caption postimage mismatch'; END IF;
END $$;
COMMIT;
