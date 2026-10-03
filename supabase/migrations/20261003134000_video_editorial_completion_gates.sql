-- ===========================================================================
-- 20261003134000_video_editorial_completion_gates.sql
-- ===========================================================================
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     video_reels_pipeline_controls, editorial RPC, social_reels triggers
-- IRREVERSIBLE: no
-- WHY: Complete Phase 4 editor fields and connect approved/scheduled state to
--      publication behind a default-off canary without interrupting live Reels.
-- HOW: Reject unresolved quality evidence, add an editorial publication flag,
--      enforce it at the social_reels boundary, and mark approved rows published.
-- ===========================================================================
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_enrichment_records') IS NULL
     OR to_regclass('public.video_reels_pipeline_controls') IS NULL
     OR to_regprocedure('public.fn_apply_video_editorial_action(uuid,uuid,text,integer,jsonb,text)') IS NULL
  THEN
    RAISE EXCEPTION 'preflight: Phase 4 editorial foundation is incomplete';
  END IF;
END
$preflight$;

INSERT INTO public.video_reels_pipeline_controls(control_key,enabled,reason)
VALUES('video_library_editorial_gate',false,'Phase 4 canary gate; enable after the candidate queue is reviewed')
ON CONFLICT(control_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_apply_video_editorial_action(
  p_video_id uuid,p_actor_id uuid,p_action text,p_expected_version integer,
  p_changes jsonb DEFAULT '{}'::jsonb,p_reason text DEFAULT NULL
)
RETURNS public.video_enrichment_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_before public.video_enrichment_records; v_after public.video_enrichment_records; v_state text;
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM public.video_enrichment_records WHERE video_id=p_video_id FOR UPDATE;
  IF v_before.video_id IS NULL OR v_before.version<>p_expected_version THEN RAISE EXCEPTION 'editorial version conflict'; END IF;
  IF p_action='approve' THEN
    IF cardinality(v_before.quarantine_reason_codes)>0 OR v_before.quality_score IS NULL
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_before.quality_findings) finding
         WHERE finding->>'status' IN ('detected','not_assessed')
       )
    THEN RAISE EXCEPTION 'quarantined, unscored, or unresolved-quality video cannot be approved'; END IF;
    v_state:='approved';
  ELSIF p_action='reject' THEN v_state:='rejected';
  ELSIF p_action IN ('edit','schedule','quarantine','restore','replay') THEN v_state:=v_before.workflow_state;
  ELSE RAISE EXCEPTION 'unsupported editorial action'; END IF;
  UPDATE public.video_enrichment_records SET
    workflow_state=v_state,
    clip_start_seconds=CASE WHEN p_changes ? 'clip_start_seconds' THEN nullif(p_changes->>'clip_start_seconds','')::numeric ELSE clip_start_seconds END,
    clip_end_seconds=CASE WHEN p_changes ? 'clip_end_seconds' THEN nullif(p_changes->>'clip_end_seconds','')::numeric ELSE clip_end_seconds END,
    crop_mode=coalesce(nullif(p_changes->>'crop_mode',''),crop_mode),
    caption_style=CASE WHEN p_changes ? 'caption_style' THEN p_changes->'caption_style' ELSE caption_style END,
    quality_findings=CASE WHEN p_changes ? 'quality_findings' THEN p_changes->'quality_findings' ELSE quality_findings END,
    editorial_title=CASE WHEN p_changes ? 'editorial_title' THEN nullif(left(p_changes->>'editorial_title',500),'') ELSE editorial_title END,
    editorial_thumbnail_url=CASE WHEN p_changes ? 'editorial_thumbnail_url' THEN nullif(left(p_changes->>'editorial_thumbnail_url',2000),'') ELSE editorial_thumbnail_url END,
    editorial_attribution=CASE WHEN p_changes ? 'editorial_attribution' THEN nullif(left(p_changes->>'editorial_attribution',500),'') ELSE editorial_attribution END,
    scheduled_publish_at=CASE WHEN p_changes ? 'scheduled_publish_at' THEN nullif(p_changes->>'scheduled_publish_at','')::timestamptz ELSE scheduled_publish_at END,
    quarantine_reason_codes=CASE WHEN p_action='quarantine' THEN ARRAY[coalesce(nullif(p_reason,''),'editorial_quarantine')] WHEN p_action='restore' THEN '{}' ELSE quarantine_reason_codes END,
    quarantined_at=CASE WHEN p_action='quarantine' THEN now() WHEN p_action='restore' THEN NULL ELSE quarantined_at END,
    approved_at=CASE WHEN p_action='approve' THEN now() ELSE approved_at END,
    approved_by=CASE WHEN p_action='approve' THEN p_actor_id ELSE approved_by END,
    rejected_at=CASE WHEN p_action='reject' THEN now() ELSE rejected_at END,
    rejected_by=CASE WHEN p_action='reject' THEN p_actor_id ELSE rejected_by END,
    rejection_reason=CASE WHEN p_action='reject' THEN left(coalesce(p_reason,'rejected'),1000) ELSE rejection_reason END,
    version=version+1,updated_at=now()
  WHERE video_id=p_video_id RETURNING * INTO v_after;
  INSERT INTO public.video_editorial_events(video_id,actor_id,action,from_state,to_state,reason,changes)
  VALUES(p_video_id,p_actor_id,p_action,v_before.workflow_state,v_after.workflow_state,p_reason,coalesce(p_changes,'{}'));
  RETURN v_after;
END $$;

CREATE OR REPLACE FUNCTION public.fn_video_library_editorial_publication_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_gate boolean;
BEGIN
  IF NEW.origin_type IS DISTINCT FROM 'video_library' THEN RETURN NEW; END IF;
  SELECT enabled INTO v_gate FROM public.video_reels_pipeline_controls WHERE control_key='video_library_editorial_gate';
  IF coalesce(v_gate,false) AND NOT EXISTS (
    SELECT 1 FROM public.video_enrichment_records record
    WHERE record.video_id=NEW.source_asset_id
      AND record.workflow_state IN ('approved','published')
      AND cardinality(record.quarantine_reason_codes)=0
      AND (record.scheduled_publish_at IS NULL OR record.scheduled_publish_at<=now())
  ) THEN
    RAISE EXCEPTION 'video library asset is not editorially approved or scheduled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_video_library_editorial_publication_guard ON public.social_reels;
CREATE TRIGGER trg_video_library_editorial_publication_guard
BEFORE INSERT OR UPDATE OF is_public,source_asset_id,origin_type ON public.social_reels
FOR EACH ROW EXECUTE FUNCTION public.fn_video_library_editorial_publication_guard();

CREATE OR REPLACE FUNCTION public.fn_video_library_editorial_mark_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF NEW.origin_type='video_library' AND NEW.is_public AND NEW.source_asset_id IS NOT NULL THEN
    UPDATE public.video_enrichment_records SET workflow_state='published',updated_at=now()
    WHERE video_id=NEW.source_asset_id AND workflow_state='approved';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_video_library_editorial_mark_published ON public.social_reels;
CREATE TRIGGER trg_video_library_editorial_mark_published
AFTER INSERT OR UPDATE OF is_public ON public.social_reels
FOR EACH ROW EXECUTE FUNCTION public.fn_video_library_editorial_mark_published();

REVOKE ALL ON FUNCTION public.fn_apply_video_editorial_action(uuid,uuid,text,integer,jsonb,text),
  public.fn_video_library_editorial_publication_guard(),
  public.fn_video_library_editorial_mark_published()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_video_editorial_action(uuid,uuid,text,integer,jsonb,text) TO service_role;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.video_reels_pipeline_controls
    WHERE control_key='video_library_editorial_gate' AND enabled=false
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.social_reels'::regclass
      AND tgname='trg_video_library_editorial_publication_guard' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.social_reels'::regclass
      AND tgname='trg_video_library_editorial_mark_published' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'postflight: Phase 4 editorial publication wiring is incomplete';
  END IF;
END
$postflight$;

COMMIT;
