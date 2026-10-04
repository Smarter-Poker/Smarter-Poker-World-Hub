-- Phase 5 hardening: bind every selected window to the authoritative source runtime.
BEGIN;

ALTER TABLE public.video_reel_candidates
  ADD COLUMN source_duration_seconds numeric(10,3);

CREATE OR REPLACE FUNCTION public.fn_video_duration_seconds(p_duration text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public,extensions AS $$
DECLARE m text[];
BEGIN
  IF p_duration ~ '^[0-9]+$' THEN RETURN p_duration::numeric; END IF;
  m:=regexp_match(p_duration,'^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$','i');
  IF m IS NOT NULL THEN RETURN coalesce(m[1]::numeric,0)*3600+coalesce(m[2]::numeric,0)*60+coalesce(m[3]::numeric,0); END IF;
  m:=regexp_match(p_duration,'^(?:(\d+):)?(\d{1,2}):(\d{2})$');
  IF m IS NOT NULL THEN RETURN coalesce(m[1]::numeric,0)*3600+m[2]::numeric*60+m[3]::numeric; END IF;
  RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION public.fn_claim_video_reel_candidate_sources(p_worker text,p_limit integer DEFAULT 25)
RETURNS SETOF public.video_reel_candidates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_worker),'') IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid candidate claim'; END IF;
  RETURN QUERY
  WITH stale AS (
    SELECT id FROM public.video_reel_candidates
    WHERE status='generating' AND claimed_at < now()-interval '15 minutes'
    ORDER BY claimed_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), reclaimed AS (
    UPDATE public.video_reel_candidates c SET claimed_by=p_worker,claimed_at=now(),updated_at=now()
    FROM stale WHERE c.id=stale.id RETURNING c.*
  ), fresh_sources AS (
    SELECT r.video_id
    FROM public.video_enrichment_records r
    JOIN public.video_library_videos v ON v.id=r.video_id
    LEFT JOIN public.content_sources s ON s.id::text=v.source_id
    WHERE r.workflow_state IN ('candidate','approved')
      AND cardinality(r.quarantine_reason_codes)=0 AND r.quality_score IS NOT NULL
      AND public.fn_video_duration_seconds(v.duration)>0
      AND (v.youtube_video_id ~ '^[A-Za-z0-9_-]{11}$' OR s.rights_status IN ('owned','licensed'))
      AND NOT EXISTS (SELECT 1 FROM public.video_reel_candidates c WHERE c.video_id=r.video_id)
    ORDER BY r.updated_at,r.video_id FOR UPDATE OF r SKIP LOCKED
    LIMIT greatest(0,p_limit-(SELECT count(*) FROM reclaimed))
  ), inserted AS (
    INSERT INTO public.video_reel_candidates(video_id,claimed_by,claimed_at)
    SELECT video_id,p_worker,now() FROM fresh_sources ON CONFLICT(video_id) DO NOTHING RETURNING *
  ) SELECT * FROM reclaimed UNION ALL SELECT * FROM inserted;
END $$;

CREATE OR REPLACE FUNCTION public.fn_finish_video_reel_candidate(
  p_candidate_id uuid,p_worker text,p_selection_kind text,p_playback_mode text,
  p_start numeric,p_end numeric,p_embed_url text,p_reason text,p_rationale jsonb,
  p_quality numeric,p_source_key text,p_creator_key text,p_topic text,
  p_rights_status text,p_native_clip_eligible boolean
)
RETURNS public.video_reel_candidates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_candidate public.video_reel_candidates; v_duration numeric;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_candidate FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v_candidate.id IS NULL OR v_candidate.status<>'generating' OR v_candidate.claimed_by IS DISTINCT FROM p_worker THEN RAISE EXCEPTION 'candidate custody mismatch'; END IF;
  SELECT public.fn_video_duration_seconds(duration) INTO v_duration FROM public.video_library_videos WHERE id=v_candidate.video_id;
  IF v_duration<=0 OR p_start<0 OR p_end<=p_start OR p_end>v_duration OR p_end-p_start>180 THEN RAISE EXCEPTION 'candidate segment is outside source runtime'; END IF;
  IF p_playback_mode='third_party_embed' AND (p_embed_url !~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}\?start=[0-9]+&end=[0-9]+$' OR p_native_clip_eligible) THEN RAISE EXCEPTION 'third-party candidate must use bounded embed playback'; END IF;
  IF p_native_clip_eligible AND p_rights_status NOT IN ('owned','licensed') THEN RAISE EXCEPTION 'native clipping requires owned or licensed rights'; END IF;
  UPDATE public.video_reel_candidates SET status='proposed',selection_kind=p_selection_kind,playback_mode=p_playback_mode,
    clip_start_seconds=p_start,clip_end_seconds=p_end,source_duration_seconds=v_duration,embed_url=p_embed_url,
    selection_reason=left(p_reason,500),selection_rationale=coalesce(p_rationale,'{}'),quality_score=p_quality,
    source_key=left(p_source_key,500),creator_key=left(p_creator_key,500),topic=left(p_topic,100),
    rights_status=p_rights_status,native_clip_eligible=p_native_clip_eligible,claimed_by=NULL,claimed_at=NULL,
    proposed_at=now(),updated_at=now(),version=version+1 WHERE id=p_candidate_id RETURNING * INTO v_candidate;
  RETURN v_candidate;
END $$;

REVOKE ALL ON FUNCTION public.fn_video_duration_seconds(text),
  public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_video_duration_seconds(text),
  public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean)
  TO service_role;

COMMIT;
