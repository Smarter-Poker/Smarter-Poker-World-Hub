-- Phase 5 hardening: bind every selected window to the authoritative source runtime.
BEGIN;

ALTER TABLE public.video_reel_candidates
  ADD COLUMN source_duration_seconds numeric(10,3),
  ADD COLUMN failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 5),
  ADD COLUMN last_failure_code text,
  ADD COLUMN next_attempt_at timestamptz;

CREATE INDEX video_reel_candidates_retry_claim_idx
  ON public.video_reel_candidates(coalesce(next_attempt_at,claimed_at,'-infinity'::timestamptz),id)
  WHERE status='generating' AND failure_count<5;

CREATE OR REPLACE FUNCTION public.fn_video_duration_seconds(p_duration text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public,extensions AS $$
DECLARE m text[];
BEGIN
  IF p_duration ~ '^[0-9]+$' THEN RETURN p_duration::numeric; END IF;
  m:=regexp_match(p_duration,'^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$','i');
  IF m IS NOT NULL THEN RETURN coalesce(m[1]::numeric,0)*3600+coalesce(m[2]::numeric,0)*60+coalesce(m[3]::numeric,0); END IF;
  m:=regexp_match(p_duration,'^(?:(\d+):)?(\d{1,2}):(\d{2})$');
  IF m IS NOT NULL AND m[2]::numeric<60 AND m[3]::numeric<60 THEN
    RETURN coalesce(m[1]::numeric,0)*3600+m[2]::numeric*60+m[3]::numeric;
  END IF;
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
    WHERE status='generating' AND failure_count<5
      AND ((claimed_at IS NULL AND coalesce(next_attempt_at,'-infinity'::timestamptz)<=now())
        OR claimed_at<now()-interval '15 minutes')
    ORDER BY coalesce(next_attempt_at,claimed_at,'-infinity'::timestamptz),id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
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
      AND v.availability_status='verified'
      AND (v.embeddable=true OR s.rights_status IN ('owned','licensed'))
      AND (s.id IS NULL OR (s.lifecycle_status='active' AND s.is_active=true))
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
DECLARE
  v_candidate public.video_reel_candidates;
  v_duration numeric; v_youtube_id text; v_rights text; v_source_key text;
  v_creator_key text; v_topic text; v_quality numeric; v_format text; v_expected_embed text;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_candidate FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v_candidate.id IS NULL OR v_candidate.status<>'generating' OR v_candidate.claimed_by IS DISTINCT FROM p_worker THEN RAISE EXCEPTION 'candidate custody mismatch'; END IF;
  SELECT public.fn_video_duration_seconds(v.duration),v.youtube_video_id,coalesce(s.rights_status,'embed_only'),
    coalesce(v.source_id,v.source_name,'unknown'),coalesce(s.provider_source_id,v.provider_channel_id,v.source_name,'unknown'),
    CASE WHEN coalesce(s.ingest_topic,'')='sports' OR v.type='sports' THEN 'sports'
      WHEN coalesce(s.ingest_topic,'')='casino_slots' OR v.type='slots' THEN 'casino-slots' ELSE 'poker' END,
    e.quality_score,e.format
  INTO v_duration,v_youtube_id,v_rights,v_source_key,v_creator_key,v_topic,v_quality,v_format
  FROM public.video_library_videos v
  JOIN public.video_enrichment_records e ON e.video_id=v.id
  LEFT JOIN public.content_sources s ON s.id::text=v.source_id
  WHERE v.id=v_candidate.video_id;
  IF coalesce(v_duration,0)<=0 OR p_start IS NULL OR p_end IS NULL OR p_start<0 OR p_end<=p_start OR p_end>v_duration OR p_end-p_start>180 THEN
    RAISE EXCEPTION 'candidate segment is outside source runtime';
  END IF;
  IF p_selection_kind NOT IN ('validated_short','chapter_highlight','metadata_highlight')
     OR p_playback_mode NOT IN ('third_party_embed','native_master')
     OR nullif(btrim(p_reason),'') IS NULL
     OR jsonb_typeof(coalesce(p_rationale,'null'::jsonb)) IS DISTINCT FROM 'object'
     OR p_quality IS NULL OR p_quality NOT BETWEEN 0 AND 100
     OR nullif(btrim(p_source_key),'') IS NULL
     OR nullif(btrim(p_creator_key),'') IS NULL
     OR nullif(btrim(p_topic),'') IS NULL
     OR p_rights_status IS NULL
  THEN RAISE EXCEPTION 'candidate explanation is incomplete'; END IF;
  IF p_quality IS DISTINCT FROM v_quality OR p_source_key IS DISTINCT FROM v_source_key
     OR p_creator_key IS DISTINCT FROM v_creator_key OR p_topic IS DISTINCT FROM v_topic
     OR p_rights_status IS DISTINCT FROM v_rights
  THEN RAISE EXCEPTION 'candidate authority metadata mismatch'; END IF;
  IF v_duration<=180 AND v_format='short' AND p_selection_kind<>'validated_short' THEN
    RAISE EXCEPTION 'validated short must use its canonical selection kind';
  END IF;
  IF p_selection_kind='validated_short' AND (v_format IS DISTINCT FROM 'short' OR v_duration>180 OR p_start<>0 OR p_end<>v_duration) THEN
    RAISE EXCEPTION 'validated short must use its complete runtime';
  END IF;
  IF v_youtube_id ~ '^[A-Za-z0-9_-]{11}$' THEN
    IF p_start<>trunc(p_start) OR p_end<>trunc(p_end) THEN RAISE EXCEPTION 'embed boundaries must be whole seconds'; END IF;
    v_expected_embed:=format('https://www.youtube-nocookie.com/embed/%s?start=%s&end=%s',v_youtube_id,p_start::bigint,p_end::bigint);
    IF p_playback_mode<>'third_party_embed' OR p_embed_url IS DISTINCT FROM v_expected_embed OR p_native_clip_eligible IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'third-party candidate must use canonical bounded embed playback';
    END IF;
  ELSIF v_rights IN ('owned','licensed') THEN
    IF p_playback_mode<>'native_master' OR p_embed_url IS NOT NULL OR p_native_clip_eligible IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'rights-cleared source must use native-master eligibility';
    END IF;
  ELSE RAISE EXCEPTION 'candidate has neither a canonical embed nor rights-cleared master'; END IF;
  UPDATE public.video_reel_candidates SET status='proposed',selection_kind=p_selection_kind,playback_mode=p_playback_mode,
    clip_start_seconds=p_start,clip_end_seconds=p_end,source_duration_seconds=v_duration,embed_url=p_embed_url,
    selection_reason=left(p_reason,500),selection_rationale=p_rationale,quality_score=p_quality,
    source_key=left(p_source_key,500),creator_key=left(p_creator_key,500),topic=left(p_topic,100),
    rights_status=p_rights_status,native_clip_eligible=p_native_clip_eligible,claimed_by=NULL,claimed_at=NULL,
    proposed_at=now(),failure_count=0,last_failure_code=NULL,next_attempt_at=NULL,
    updated_at=now(),version=version+1 WHERE id=p_candidate_id RETURNING * INTO v_candidate;
  RETURN v_candidate;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fail_video_reel_candidate(p_candidate_id uuid,p_worker text,p_failure_code text)
RETURNS public.video_reel_candidates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v public.video_reel_candidates; attempts integer; code text;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v.id IS NULL OR v.status<>'generating' OR v.claimed_by IS DISTINCT FROM p_worker THEN RAISE EXCEPTION 'candidate custody mismatch'; END IF;
  code:=left(trim(both '_' FROM lower(regexp_replace(coalesce(p_failure_code,''),'[^a-zA-Z0-9_]+','_','g'))),120);
  IF code='' THEN code:='candidate_generation_failed'; END IF;
  attempts:=least(5,v.failure_count+1);
  UPDATE public.video_reel_candidates SET failure_count=attempts,last_failure_code=code,
    status=CASE WHEN attempts>=5 THEN 'rejected' ELSE 'generating' END,
    rejection_reason=CASE WHEN attempts>=5 THEN 'candidate_generation_failed:'||code ELSE rejection_reason END,
    rejected_at=CASE WHEN attempts>=5 THEN now() ELSE rejected_at END,
    claimed_by=NULL,claimed_at=NULL,
    next_attempt_at=CASE WHEN attempts>=5 THEN NULL ELSE now()+make_interval(secs=>least(3600,30*power(2,attempts-1))::integer) END,
    updated_at=now(),version=version+1 WHERE id=v.id RETURNING * INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.fn_review_video_reel_candidate(
  p_candidate_id uuid,p_actor_id uuid,p_action text,p_expected_version integer,p_reason text DEFAULT NULL
)
RETURNS public.video_reel_candidates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v public.video_reel_candidates; lim public.video_reel_candidate_limits; refusal text;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v.id IS NULL OR v.version<>p_expected_version THEN RAISE EXCEPTION 'candidate version conflict'; END IF;
  IF p_action='reject' THEN
    IF v.status NOT IN ('proposed','rate_limited') THEN RAISE EXCEPTION 'candidate cannot be rejected from this state'; END IF;
    UPDATE public.video_reel_candidates SET status='rejected',rejected_at=now(),rejected_by=p_actor_id,
      rejection_reason=left(coalesce(nullif(btrim(p_reason),''),'Editorial rejection'),1000),updated_at=now(),version=version+1
    WHERE id=v.id RETURNING * INTO v; RETURN v;
  END IF;
  IF p_action<>'approve' OR v.status NOT IN ('proposed','rate_limited') THEN RAISE EXCEPTION 'unsupported candidate action or state'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(lock_key,0))
  FROM (SELECT DISTINCT lock_key FROM unnest(ARRAY[
    'reel-source:'||v.source_key,'reel-creator:'||v.creator_key,
    'reel-topic:'||v.topic,'reel-video:'||v.video_id::text
  ]) lock_key ORDER BY lock_key) ordered_locks;
  SELECT * INTO lim FROM public.video_reel_candidate_limits WHERE singleton=true FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.video_reel_candidates x WHERE x.video_id=v.video_id AND x.id<>v.id AND x.status IN ('approved','published')) THEN refusal:='source_video_total';
  ELSIF (SELECT count(*) FROM public.video_reel_candidates x WHERE x.source_key=v.source_key AND x.status IN ('approved','published') AND x.approved_at>=now()-interval '24 hours')>=lim.source_per_24h THEN refusal:='source_per_24h';
  ELSIF (SELECT count(*) FROM public.video_reel_candidates x WHERE x.creator_key=v.creator_key AND x.status IN ('approved','published') AND x.approved_at>=now()-interval '24 hours')>=lim.creator_per_24h THEN refusal:='creator_per_24h';
  ELSIF (SELECT count(*) FROM public.video_reel_candidates x WHERE x.topic=v.topic AND x.status IN ('approved','published') AND x.approved_at>=now()-interval '24 hours')>=lim.topic_per_24h THEN refusal:='topic_per_24h'; END IF;
  IF refusal IS NOT NULL THEN
    UPDATE public.video_reel_candidates SET status='rate_limited',rate_limit_reason=refusal,updated_at=now(),version=version+1 WHERE id=v.id RETURNING * INTO v;
    RETURN v;
  END IF;
  UPDATE public.video_reel_candidates SET status='approved',approved_at=now(),approved_by=p_actor_id,
    rate_limit_reason=NULL,updated_at=now(),version=version+1 WHERE id=v.id RETURNING * INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.fn_video_duration_seconds(text),
  public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean),
  public.fn_fail_video_reel_candidate(uuid,text,text),
  public.fn_review_video_reel_candidate(uuid,uuid,text,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_video_duration_seconds(text),
  public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean),
  public.fn_fail_video_reel_candidate(uuid,text,text),
  public.fn_review_video_reel_candidate(uuid,uuid,text,integer,text)
  TO service_role;

COMMIT;
