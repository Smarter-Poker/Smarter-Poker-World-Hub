-- ===========================================================================
-- 20261004124500_video_reel_candidate_highlight_engine.sql
-- ===========================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     Phase 5 Video Library Reel candidate selection and review
-- IRREVERSIBLE: no
-- WHY: Persist one explainable, replay-safe candidate per validated video while
--      keeping third-party media embed-only and enforcing diversity limits.
-- ===========================================================================
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_enrichment_records') IS NULL
     OR to_regclass('public.video_library_videos') IS NULL
     OR to_regclass('public.content_sources') IS NULL
  THEN RAISE EXCEPTION 'preflight: Phase 3/4 video foundations are incomplete'; END IF;
END
$preflight$;

CREATE TABLE public.video_reel_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL UNIQUE REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating','proposed','approved','rejected','rate_limited','published')),
  selection_kind text CHECK (selection_kind IN ('validated_short','chapter_highlight','metadata_highlight')),
  playback_mode text CHECK (playback_mode IN ('third_party_embed','native_master')),
  clip_start_seconds numeric(10,3), clip_end_seconds numeric(10,3),
  embed_url text, selection_reason text, selection_rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score numeric(5,2), source_key text, creator_key text, topic text,
  rights_status text NOT NULL DEFAULT 'embed_only', native_clip_eligible boolean NOT NULL DEFAULT false,
  claimed_by text, claimed_at timestamptz, proposed_at timestamptz,
  approved_at timestamptz, approved_by uuid, rejected_at timestamptz, rejected_by uuid,
  rejection_reason text, rate_limit_reason text, published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clip_start_seconds IS NULL OR clip_start_seconds >= 0),
  CHECK (clip_end_seconds IS NULL OR clip_end_seconds > clip_start_seconds),
  CHECK (clip_end_seconds IS NULL OR clip_start_seconds IS NULL OR clip_end_seconds-clip_start_seconds <= 180),
  CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  CHECK (native_clip_eligible=false OR rights_status IN ('owned','licensed')),
  CHECK (playback_mode IS DISTINCT FROM 'third_party_embed' OR native_clip_eligible=false)
);

CREATE INDEX video_reel_candidates_review_idx
  ON public.video_reel_candidates(status, proposed_at DESC, created_at DESC);
CREATE INDEX video_reel_candidates_diversity_idx
  ON public.video_reel_candidates(status, approved_at DESC, source_key, creator_key, topic);

CREATE TABLE public.video_reel_candidate_limits (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  source_per_24h integer NOT NULL DEFAULT 6 CHECK (source_per_24h BETWEEN 1 AND 100),
  creator_per_24h integer NOT NULL DEFAULT 6 CHECK (creator_per_24h BETWEEN 1 AND 100),
  topic_per_24h integer NOT NULL DEFAULT 24 CHECK (topic_per_24h BETWEEN 1 AND 500),
  source_video_total integer NOT NULL DEFAULT 1 CHECK (source_video_total=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.video_reel_candidate_limits(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;

ALTER TABLE public.video_reel_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_reel_candidate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_reel_candidates, public.video_reel_candidate_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.video_reel_candidates TO service_role;
GRANT SELECT,UPDATE ON public.video_reel_candidate_limits TO service_role;

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
      AND cardinality(r.quarantine_reason_codes)=0
      AND r.quality_score IS NOT NULL
      AND (v.youtube_video_id ~ '^[A-Za-z0-9_-]{11}$' OR s.rights_status IN ('owned','licensed'))
      AND NOT EXISTS (SELECT 1 FROM public.video_reel_candidates c WHERE c.video_id=r.video_id)
    ORDER BY r.updated_at,r.video_id
    FOR UPDATE OF r SKIP LOCKED
    LIMIT greatest(0,p_limit-(SELECT count(*) FROM reclaimed))
  ), inserted AS (
    INSERT INTO public.video_reel_candidates(video_id,claimed_by,claimed_at)
    SELECT video_id,p_worker,now() FROM fresh_sources
    ON CONFLICT(video_id) DO NOTHING RETURNING *
  )
  SELECT * FROM reclaimed UNION ALL SELECT * FROM inserted;
END $$;

CREATE OR REPLACE FUNCTION public.fn_finish_video_reel_candidate(
  p_candidate_id uuid,p_worker text,p_selection_kind text,p_playback_mode text,
  p_start numeric,p_end numeric,p_embed_url text,p_reason text,p_rationale jsonb,
  p_quality numeric,p_source_key text,p_creator_key text,p_topic text,
  p_rights_status text,p_native_clip_eligible boolean
)
RETURNS public.video_reel_candidates
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_candidate public.video_reel_candidates;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_candidate FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF v_candidate.id IS NULL OR v_candidate.status<>'generating' OR v_candidate.claimed_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION 'candidate custody mismatch';
  END IF;
  IF p_start<0 OR p_end<=p_start OR p_end-p_start>180 THEN RAISE EXCEPTION 'candidate segment is invalid'; END IF;
  IF p_playback_mode='third_party_embed' AND (p_embed_url !~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}\?start=[0-9]+&end=[0-9]+$' OR p_native_clip_eligible) THEN
    RAISE EXCEPTION 'third-party candidate must use bounded embed playback';
  END IF;
  IF p_native_clip_eligible AND p_rights_status NOT IN ('owned','licensed') THEN RAISE EXCEPTION 'native clipping requires owned or licensed rights'; END IF;
  UPDATE public.video_reel_candidates SET status='proposed',selection_kind=p_selection_kind,playback_mode=p_playback_mode,
    clip_start_seconds=p_start,clip_end_seconds=p_end,embed_url=p_embed_url,selection_reason=left(p_reason,500),
    selection_rationale=coalesce(p_rationale,'{}'),quality_score=p_quality,source_key=left(p_source_key,500),
    creator_key=left(p_creator_key,500),topic=left(p_topic,100),rights_status=p_rights_status,
    native_clip_eligible=p_native_clip_eligible,claimed_by=NULL,claimed_at=NULL,proposed_at=now(),updated_at=now(),version=version+1
  WHERE id=p_candidate_id RETURNING * INTO v_candidate;
  RETURN v_candidate;
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
    UPDATE public.video_reel_candidates SET status='rejected',rejected_at=now(),rejected_by=p_actor_id,
      rejection_reason=left(coalesce(p_reason,'Editorial rejection'),1000),updated_at=now(),version=version+1
    WHERE id=v.id RETURNING * INTO v; RETURN v;
  END IF;
  IF p_action<>'approve' OR v.status NOT IN ('proposed','rate_limited') THEN RAISE EXCEPTION 'unsupported candidate action or state'; END IF;
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

REVOKE ALL ON FUNCTION public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean),
  public.fn_review_video_reel_candidate(uuid,uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_video_reel_candidate_sources(text,integer),
  public.fn_finish_video_reel_candidate(uuid,text,text,text,numeric,numeric,text,text,jsonb,numeric,text,text,text,text,boolean),
  public.fn_review_video_reel_candidate(uuid,uuid,text,integer,text) TO service_role;

COMMIT;

-- ROLLBACK (ship as a new forward migration only): drop the three Phase 5
-- functions, then video_reel_candidates and video_reel_candidate_limits.
