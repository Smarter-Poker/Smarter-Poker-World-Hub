-- Phase 4: durable enrichment, quarantine, editorial review, and scheduling.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_library_videos') IS NULL THEN
    RAISE EXCEPTION 'preflight: video_library_videos is missing';
  END IF;
END
$preflight$;

CREATE TABLE public.video_enrichment_records (
  video_id uuid PRIMARY KEY REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  workflow_state text NOT NULL DEFAULT 'discovered'
    CHECK (workflow_state IN ('discovered','validated','enriched','candidate','approved','rejected','published')),
  game_type text, format text, skill_level text,
  concepts text[] NOT NULL DEFAULT '{}', players text[] NOT NULL DEFAULT '{}',
  events text[] NOT NULL DEFAULT '{}', stakes text, language_code text,
  source_quality_score numeric(5,2), quality_score numeric(5,2),
  transcript_status text NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending','available','unavailable','failed')),
  transcript_text text, chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  quarantine_reason_codes text[] NOT NULL DEFAULT '{}', quarantined_at timestamptz,
  clip_start_seconds numeric(10,3), clip_end_seconds numeric(10,3),
  crop_mode text NOT NULL DEFAULT 'source' CHECK (crop_mode IN ('source','fit','fill','vertical_focus')),
  caption_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  editorial_title text, editorial_thumbnail_url text, editorial_attribution text,
  scheduled_publish_at timestamptz, approved_at timestamptz, approved_by uuid,
  rejected_at timestamptz, rejected_by uuid, rejection_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clip_end_seconds IS NULL OR clip_start_seconds IS NULL OR clip_end_seconds > clip_start_seconds),
  CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  CHECK (source_quality_score IS NULL OR source_quality_score BETWEEN 0 AND 100)
);

CREATE TABLE public.video_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('classify','tag','transcript','chapters','quality','analysis')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','retry','succeeded','dead_letter','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb, output jsonb,
  failure_code text, failure_detail text, completed_at timestamptz,
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, job_type, generation)
);
CREATE INDEX video_enrichment_jobs_claim_idx ON public.video_enrichment_jobs(status, available_at, created_at)
  WHERE status IN ('queued','retry');

CREATE TABLE public.video_editorial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  actor_id uuid, action text NOT NULL CHECK (action IN ('edit','approve','reject','schedule','quarantine','restore','replay')),
  from_state text, to_state text, reason text, changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_editorial_events_video_idx ON public.video_editorial_events(video_id, created_at DESC);

ALTER TABLE public.video_enrichment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_editorial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_enrichment_records, public.video_enrichment_jobs, public.video_editorial_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_enrichment_records, public.video_enrichment_jobs, public.video_editorial_events TO service_role;

CREATE OR REPLACE FUNCTION public.fn_enqueue_video_enrichment(p_video_id uuid, p_generation integer DEFAULT 1)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_count integer;
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.video_library_videos WHERE id=p_video_id AND availability_status='verified' AND embeddable=true) THEN
    RAISE EXCEPTION 'video is not eligible for enrichment';
  END IF;
  INSERT INTO public.video_enrichment_records(video_id, workflow_state) VALUES(p_video_id,'validated')
    ON CONFLICT(video_id) DO NOTHING;
  INSERT INTO public.video_enrichment_jobs(video_id,job_type,generation)
    SELECT p_video_id, job_type, p_generation FROM unnest(ARRAY['classify','tag','transcript','chapters','quality','analysis']) job_type
    ON CONFLICT(video_id,job_type,generation) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.fn_claim_video_enrichment_jobs(p_worker text, p_limit integer DEFAULT 10)
RETURNS SETOF public.video_enrichment_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_worker),'') IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid claim'; END IF;
  RETURN QUERY WITH claimed AS (
    SELECT id FROM public.video_enrichment_jobs WHERE status IN ('queued','retry') AND available_at <= now()
    ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE public.video_enrichment_jobs j SET status='running',attempt_count=j.attempt_count+1,
      locked_at=now(),locked_by=p_worker,updated_at=now() FROM claimed WHERE j.id=claimed.id RETURNING j.*;
END $$;

CREATE OR REPLACE FUNCTION public.fn_finish_video_enrichment_job(p_job_id uuid,p_worker text,p_succeeded boolean,p_output jsonb DEFAULT '{}'::jsonb,p_failure_code text DEFAULT NULL,p_failure_detail text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_job public.video_enrichment_jobs; v_status text;
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_job FROM public.video_enrichment_jobs WHERE id=p_job_id FOR UPDATE;
  IF v_job.id IS NULL OR v_job.status <> 'running' OR v_job.locked_by IS DISTINCT FROM p_worker THEN RAISE EXCEPTION 'job custody mismatch'; END IF;
  v_status := CASE WHEN p_succeeded THEN 'succeeded' WHEN v_job.attempt_count >= v_job.max_attempts THEN 'dead_letter' ELSE 'retry' END;
  UPDATE public.video_enrichment_jobs SET status=v_status,output=CASE WHEN p_succeeded THEN coalesce(p_output,'{}') ELSE output END,
    failure_code=CASE WHEN p_succeeded THEN NULL ELSE left(coalesce(p_failure_code,'unknown'),120) END,
    failure_detail=CASE WHEN p_succeeded THEN NULL ELSE left(coalesce(p_failure_detail,''),1000) END,
    available_at=CASE WHEN v_status='retry' THEN now()+make_interval(secs => least(3600,30*(2^least(v_job.attempt_count,7)))) ELSE available_at END,
    completed_at=CASE WHEN v_status IN ('succeeded','dead_letter') THEN now() ELSE NULL END,
    locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=p_job_id;
  RETURN v_status;
END $$;

CREATE OR REPLACE FUNCTION public.fn_apply_video_editorial_action(p_video_id uuid,p_actor_id uuid,p_action text,p_expected_version integer,p_changes jsonb DEFAULT '{}'::jsonb,p_reason text DEFAULT NULL)
RETURNS public.video_enrichment_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_before public.video_enrichment_records; v_after public.video_enrichment_records; v_state text;
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_before FROM public.video_enrichment_records WHERE video_id=p_video_id FOR UPDATE;
  IF v_before.video_id IS NULL OR v_before.version<>p_expected_version THEN RAISE EXCEPTION 'editorial version conflict'; END IF;
  IF p_action='approve' THEN
    IF cardinality(v_before.quarantine_reason_codes)>0 OR v_before.quality_score IS NULL THEN RAISE EXCEPTION 'quarantined or unscored video cannot be approved'; END IF;
    v_state:='approved';
  ELSIF p_action='reject' THEN v_state:='rejected';
  ELSIF p_action IN ('edit','schedule','quarantine','restore','replay') THEN v_state:=v_before.workflow_state;
  ELSE RAISE EXCEPTION 'unsupported editorial action'; END IF;
  UPDATE public.video_enrichment_records SET
    workflow_state=v_state,
    clip_start_seconds=CASE WHEN p_changes ? 'clip_start_seconds' THEN (p_changes->>'clip_start_seconds')::numeric ELSE clip_start_seconds END,
    clip_end_seconds=CASE WHEN p_changes ? 'clip_end_seconds' THEN (p_changes->>'clip_end_seconds')::numeric ELSE clip_end_seconds END,
    crop_mode=coalesce(nullif(p_changes->>'crop_mode',''),crop_mode),
    editorial_title=CASE WHEN p_changes ? 'editorial_title' THEN nullif(left(p_changes->>'editorial_title',500),'') ELSE editorial_title END,
    editorial_thumbnail_url=CASE WHEN p_changes ? 'editorial_thumbnail_url' THEN nullif(left(p_changes->>'editorial_thumbnail_url',2000),'') ELSE editorial_thumbnail_url END,
    editorial_attribution=CASE WHEN p_changes ? 'editorial_attribution' THEN nullif(left(p_changes->>'editorial_attribution',500),'') ELSE editorial_attribution END,
    scheduled_publish_at=CASE WHEN p_changes ? 'scheduled_publish_at' THEN nullif(p_changes->>'scheduled_publish_at','')::timestamptz ELSE scheduled_publish_at END,
    quarantine_reason_codes=CASE WHEN p_action='quarantine' THEN ARRAY[coalesce(nullif(p_reason,''),'editorial_quarantine')] WHEN p_action='restore' THEN '{}' ELSE quarantine_reason_codes END,
    quarantined_at=CASE WHEN p_action='quarantine' THEN now() WHEN p_action='restore' THEN NULL ELSE quarantined_at END,
    approved_at=CASE WHEN p_action='approve' THEN now() ELSE approved_at END, approved_by=CASE WHEN p_action='approve' THEN p_actor_id ELSE approved_by END,
    rejected_at=CASE WHEN p_action='reject' THEN now() ELSE rejected_at END, rejected_by=CASE WHEN p_action='reject' THEN p_actor_id ELSE rejected_by END,
    rejection_reason=CASE WHEN p_action='reject' THEN left(coalesce(p_reason,'rejected'),1000) ELSE rejection_reason END,
    version=version+1,updated_at=now() WHERE video_id=p_video_id RETURNING * INTO v_after;
  INSERT INTO public.video_editorial_events(video_id,actor_id,action,from_state,to_state,reason,changes)
    VALUES(p_video_id,p_actor_id,p_action,v_before.workflow_state,v_after.workflow_state,p_reason,coalesce(p_changes,'{}'));
  RETURN v_after;
END $$;

REVOKE ALL ON FUNCTION public.fn_enqueue_video_enrichment(uuid,integer), public.fn_claim_video_enrichment_jobs(text,integer), public.fn_finish_video_enrichment_job(uuid,text,boolean,jsonb,text,text), public.fn_apply_video_editorial_action(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_video_enrichment(uuid,integer), public.fn_claim_video_enrichment_jobs(text,integer), public.fn_finish_video_enrichment_job(uuid,text,boolean,jsonb,text,text), public.fn_apply_video_editorial_action(uuid,uuid,text,integer,jsonb,text) TO service_role;

INSERT INTO public.video_enrichment_records(video_id,workflow_state)
SELECT id,'validated' FROM public.video_library_videos
WHERE availability_status='verified' AND embeddable=true
ON CONFLICT(video_id) DO NOTHING;

INSERT INTO public.video_enrichment_jobs(video_id,job_type,generation)
SELECT record.video_id, job_type, 1
FROM public.video_enrichment_records record
CROSS JOIN unnest(ARRAY['classify','tag','transcript','chapters','quality','analysis']) job_type
ON CONFLICT(video_id,job_type,generation) DO NOTHING;

COMMIT;
