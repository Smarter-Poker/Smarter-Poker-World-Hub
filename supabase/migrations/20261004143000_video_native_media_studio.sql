-- ===========================================================================
-- Phase 6: rights-cleared native media studio
-- TIER: 3
-- AFFECTS: rights evidence, private source masters, native Reel renditions
-- IRREVERSIBLE: no
-- ===========================================================================
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_reel_candidates') IS NULL
     OR to_regclass('public.video_library_videos') IS NULL THEN
    RAISE EXCEPTION 'preflight: Phase 5 Reel candidates are required';
  END IF;
END $preflight$;

CREATE TABLE public.video_rights_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  rights_status text NOT NULL CHECK (rights_status IN ('owned','licensed')),
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('ownership','license','creator_grant')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 3 AND 500),
  permitted_uses text[] NOT NULL CHECK (permitted_uses @> ARRAY['native_clip']::text[]),
  territories text[] NOT NULL DEFAULT ARRAY['worldwide']::text[],
  valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz,
  revoked_at timestamptz, revoked_by uuid, revocation_reason text,
  recorded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until>valid_from),
  CHECK (revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX video_rights_evidence_active_idx ON public.video_rights_evidence(video_id,valid_from,valid_until)
  WHERE revoked_at IS NULL;

CREATE TABLE public.video_source_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL UNIQUE REFERENCES public.video_library_videos(id) ON DELETE RESTRICT,
  rights_evidence_id uuid NOT NULL REFERENCES public.video_rights_evidence(id) ON DELETE RESTRICT,
  storage_bucket text NOT NULL DEFAULT 'video-source-masters' CHECK (storage_bucket='video-source-masters'),
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.source$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'), mime_type text NOT NULL CHECK (mime_type IN ('video/mp4','video/quicktime','video/webm')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1024 AND 5368709120),
  duration_seconds numeric(10,3) NOT NULL CHECK (duration_seconds>0 AND duration_seconds<=21600),
  width integer NOT NULL CHECK (width BETWEEN 16 AND 16384), height integer NOT NULL CHECK (height BETWEEN 16 AND 16384),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','revoked','deleted')),
  uploaded_by uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK (version>0)
);

CREATE TABLE public.video_source_upload_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.source$'),
  actor_id uuid NOT NULL, byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1024 AND 500000000),
  mime_type text NOT NULL CHECK (mime_type IN ('video/mp4','video/quicktime','video/webm')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','consumed','cleaned')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours', consumed_at timestamptz, cleaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_source_upload_tickets_gc_idx ON public.video_source_upload_tickets(expires_at,id) WHERE status='reserved';

CREATE TABLE public.video_native_renditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.video_reel_candidates(id) ON DELETE CASCADE,
  master_id uuid NOT NULL REFERENCES public.video_source_masters(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed','rejected','revoked')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_bucket text CHECK (output_bucket='video-reels-native'), output_path text UNIQUE,
  poster_path text UNIQUE, output_sha256 text, output_bytes bigint,
  output_duration_seconds numeric(10,3), output_width integer, output_height integer,
  video_codec text, audio_codec text, validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_cents integer NOT NULL DEFAULT 0 CHECK (estimated_cost_cents BETWEEN 0 AND 10000),
  claimed_by text, claim_token uuid, claimed_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  next_attempt_at timestamptz, last_failure_code text, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK (jsonb_typeof(settings)='object'),
  CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (status<>'ready' OR (output_path IS NOT NULL AND poster_path IS NOT NULL AND output_width=1080 AND output_height=1920 AND output_duration_seconds>0 AND output_duration_seconds<=180))
);
CREATE INDEX video_native_renditions_claim_idx ON public.video_native_renditions(coalesce(next_attempt_at,created_at),id)
  WHERE status IN ('queued','processing') AND attempt_count<5;

CREATE TABLE public.video_native_studio_limits (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT true,
  max_jobs_per_run integer NOT NULL DEFAULT 2 CHECK(max_jobs_per_run BETWEEN 1 AND 5),
  max_jobs_per_day integer NOT NULL DEFAULT 48 CHECK(max_jobs_per_day BETWEEN 1 AND 500),
  max_source_bytes bigint NOT NULL DEFAULT 5368709120 CHECK(max_source_bytes BETWEEN 1048576 AND 5368709120),
  max_output_bytes bigint NOT NULL DEFAULT 268435456 CHECK(max_output_bytes BETWEEN 1048576 AND 1073741824),
  max_render_seconds_per_day integer NOT NULL DEFAULT 3600 CHECK(max_render_seconds_per_day BETWEEN 60 AND 86400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.video_native_studio_limits(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING;

ALTER TABLE public.video_rights_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_source_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_source_upload_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_native_renditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_native_studio_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_rights_evidence,public.video_source_masters,public.video_source_upload_tickets,public.video_native_renditions,public.video_native_studio_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.video_rights_evidence,public.video_source_masters,public.video_source_upload_tickets,public.video_native_renditions TO service_role;
GRANT SELECT,UPDATE ON public.video_native_studio_limits TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('video-source-masters','video-source-masters',false,5368709120,ARRAY['video/mp4','video/quicktime','video/webm']),
       ('video-reels-native','video-reels-native',true,268435456,ARRAY['video/mp4','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.fn_register_video_source_master(
  p_video_id uuid,p_actor_id uuid,p_rights_status text,p_evidence_kind text,p_evidence_reference text,
  p_permitted_uses text[],p_territories text[],p_valid_from timestamptz,p_valid_until timestamptz,
  p_storage_path text,p_sha256 text,p_mime_type text,p_byte_size bigint,p_duration numeric,p_width integer,p_height integer
) RETURNS public.video_source_masters LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.video_rights_evidence; m public.video_source_masters; t public.video_source_upload_tickets; v public.video_library_videos; lim public.video_native_studio_limits;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.video_library_videos WHERE id=p_video_id FOR UPDATE;
  SELECT * INTO lim FROM public.video_native_studio_limits WHERE singleton=true;
  IF v.id IS NULL OR NOT lim.enabled OR p_rights_status NOT IN ('owned','licensed') OR NOT coalesce(p_permitted_uses,'{}') @> ARRAY['native_clip']::text[] OR coalesce(array_length(p_territories,1),0)=0 OR coalesce(p_valid_from,now())>now() OR (p_valid_until IS NOT NULL AND p_valid_until<=now()) THEN RAISE EXCEPTION 'active native clipping rights required'; END IF;
  IF p_byte_size NOT BETWEEN 1024 AND lim.max_source_bytes THEN RAISE EXCEPTION 'source master exceeds configured limit'; END IF;
  IF p_storage_path !~ format('^%s/[0-9a-f-]{36}\.source$',p_video_id) OR p_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid source master identity'; END IF;
  SELECT * INTO t FROM public.video_source_upload_tickets WHERE storage_path=p_storage_path AND video_id=p_video_id AND actor_id=p_actor_id AND status='reserved' AND expires_at>now() FOR UPDATE;
  IF t.id IS NULL OR t.byte_size<>p_byte_size OR t.mime_type<>p_mime_type THEN RAISE EXCEPTION 'active matching upload reservation required'; END IF;
  INSERT INTO public.video_rights_evidence(video_id,rights_status,evidence_kind,evidence_reference,permitted_uses,territories,valid_from,valid_until,recorded_by)
  VALUES(p_video_id,p_rights_status,p_evidence_kind,left(btrim(p_evidence_reference),500),p_permitted_uses,coalesce(p_territories,ARRAY['worldwide']),coalesce(p_valid_from,now()),p_valid_until,p_actor_id) RETURNING * INTO e;
  INSERT INTO public.video_source_masters(video_id,rights_evidence_id,storage_path,sha256,mime_type,byte_size,duration_seconds,width,height,uploaded_by)
  VALUES(p_video_id,e.id,p_storage_path,p_sha256,p_mime_type,p_byte_size,p_duration,p_width,p_height,p_actor_id)
  ON CONFLICT(video_id) DO UPDATE SET rights_evidence_id=excluded.rights_evidence_id,storage_path=excluded.storage_path,sha256=excluded.sha256,mime_type=excluded.mime_type,byte_size=excluded.byte_size,duration_seconds=excluded.duration_seconds,width=excluded.width,height=excluded.height,status='ready',uploaded_by=excluded.uploaded_by,verified_at=now(),revoked_at=NULL,updated_at=now(),version=video_source_masters.version+1
  WHERE video_source_masters.status IN ('revoked','deleted') RETURNING * INTO m;
  IF m.id IS NULL THEN RAISE EXCEPTION 'active source master must be revoked before replacement'; END IF;
  UPDATE public.video_source_upload_tickets SET status='consumed',consumed_at=now(),updated_at=now() WHERE id=t.id;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.fn_revoke_video_source_master(p_video_id uuid,p_actor_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m public.video_source_masters; paths text[];
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL OR length(btrim(p_reason))>500 THEN RAISE EXCEPTION 'bounded revocation reason required'; END IF;
  SELECT * INTO m FROM public.video_source_masters WHERE video_id=p_video_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'source master not found'; END IF;
  SELECT coalesce(array_agg(path),ARRAY[]::text[]) INTO paths FROM (
    SELECT output_path AS path FROM public.video_native_renditions WHERE master_id=m.id AND output_path IS NOT NULL
    UNION ALL SELECT poster_path FROM public.video_native_renditions WHERE master_id=m.id AND poster_path IS NOT NULL
  ) cleanup;
  UPDATE public.video_rights_evidence SET revoked_at=coalesce(revoked_at,now()),revoked_by=coalesce(revoked_by,p_actor_id),revocation_reason=coalesce(revocation_reason,left(btrim(p_reason),500)),updated_at=now() WHERE id=m.rights_evidence_id;
  UPDATE public.video_native_renditions SET status='revoked',claimed_by=NULL,claim_token=NULL,claimed_at=NULL,next_attempt_at=NULL,updated_at=now(),version=version+1 WHERE master_id=m.id AND status<>'revoked';
  UPDATE public.video_source_masters SET status='revoked',revoked_at=coalesce(revoked_at,now()),updated_at=now(),version=version+1 WHERE id=m.id AND status<>'revoked';
  RETURN jsonb_build_object('source_path',m.storage_path,'output_paths',to_jsonb(paths));
END $$;

CREATE OR REPLACE FUNCTION public.fn_confirm_video_source_master_deleted(p_video_id uuid)
RETURNS public.video_source_masters LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE m public.video_source_masters;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.video_source_masters SET status='deleted',updated_at=now(),version=version+1
  WHERE video_id=p_video_id AND status='revoked' RETURNING * INTO m;
  IF m.id IS NULL THEN SELECT * INTO m FROM public.video_source_masters WHERE video_id=p_video_id AND status='deleted'; END IF;
  IF m.id IS NULL THEN RAISE EXCEPTION 'revoked source master required'; END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.fn_queue_video_native_rendition(p_candidate_id uuid,p_actor_id uuid,p_settings jsonb)
RETURNS public.video_native_renditions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE c public.video_reel_candidates; m public.video_source_masters; e public.video_rights_evidence; r public.video_native_renditions; s numeric; f numeric;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.video_reel_candidates WHERE id=p_candidate_id FOR UPDATE;
  IF c.id IS NULL OR c.status<>'approved' OR c.playback_mode<>'native_master' OR NOT c.native_clip_eligible OR c.rights_status NOT IN ('owned','licensed') THEN RAISE EXCEPTION 'approved rights-cleared native candidate required'; END IF;
  SELECT * INTO m FROM public.video_source_masters WHERE video_id=c.video_id AND status='ready' FOR SHARE;
  SELECT * INTO e FROM public.video_rights_evidence WHERE id=m.rights_evidence_id AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE;
  IF m.id IS NULL OR e.id IS NULL OR e.rights_status<>c.rights_status OR NOT e.permitted_uses @> ARRAY['native_clip']::text[] THEN RAISE EXCEPTION 'active matching source-master rights required'; END IF;
  s:=coalesce((p_settings->>'clip_start_seconds')::numeric,c.clip_start_seconds); f:=coalesce((p_settings->>'clip_end_seconds')::numeric,c.clip_end_seconds);
  IF s<0 OR f<=s OR f-s>180 OR f>m.duration_seconds THEN RAISE EXCEPTION 'studio clip boundaries are invalid'; END IF;
  IF coalesce(p_settings->>'crop_mode','vertical_focus') NOT IN ('vertical_focus','fit_blur','center_crop') OR coalesce((p_settings->>'focus_x')::numeric,50) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'studio crop settings are invalid'; END IF;
  INSERT INTO public.video_native_renditions(candidate_id,master_id,settings,estimated_cost_cents)
  VALUES(c.id,m.id,p_settings||jsonb_build_object('clip_start_seconds',s,'clip_end_seconds',f),greatest(1,ceil(f-s)::int))
  ON CONFLICT(candidate_id) DO UPDATE SET master_id=excluded.master_id,settings=excluded.settings,status='queued',next_attempt_at=NULL,last_failure_code=NULL,updated_at=now(),version=video_native_renditions.version+1
  WHERE video_native_renditions.status IN ('failed','rejected') RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM public.video_native_renditions WHERE candidate_id=c.id; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_claim_video_native_renditions(p_worker text,p_limit integer DEFAULT 2)
RETURNS SETOF public.video_native_renditions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE lim public.video_native_studio_limits;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO lim FROM public.video_native_studio_limits WHERE singleton=true;
  IF NOT lim.enabled OR nullif(btrim(p_worker),'') IS NULL OR p_limit NOT BETWEEN 1 AND least(5,lim.max_jobs_per_run) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.video_native_renditions WHERE claimed_at>=date_trunc('day',now()))>=lim.max_jobs_per_day OR
     (SELECT coalesce(sum(output_duration_seconds),0) FROM public.video_native_renditions WHERE completed_at>=date_trunc('day',now()))>=lim.max_render_seconds_per_day THEN RETURN; END IF;
  RETURN QUERY WITH due AS (
    SELECT r.id FROM public.video_native_renditions r JOIN public.video_source_masters m ON m.id=r.master_id JOIN public.video_rights_evidence e ON e.id=m.rights_evidence_id
    WHERE r.attempt_count<5 AND ((r.status='queued' AND coalesce(r.next_attempt_at,'-infinity')<=now()) OR (r.status='processing' AND r.claimed_at<now()-interval '30 minutes'))
      AND m.status='ready' AND e.revoked_at IS NULL AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now())
    ORDER BY coalesce(r.next_attempt_at,r.created_at),r.id FOR UPDATE OF r SKIP LOCKED LIMIT p_limit
  ) UPDATE public.video_native_renditions r SET status='processing',claimed_by=p_worker,claim_token=gen_random_uuid(),claimed_at=now(),attempt_count=attempt_count+1,updated_at=now(),version=version+1 FROM due WHERE r.id=due.id RETURNING r.*;
END $$;

CREATE OR REPLACE FUNCTION public.fn_finish_video_native_rendition(p_id uuid,p_worker text,p_claim_token uuid,p_output_path text,p_poster_path text,p_sha256 text,p_bytes bigint,p_duration numeric,p_width integer,p_height integer,p_video_codec text,p_audio_codec text,p_validation jsonb)
RETURNS public.video_native_renditions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_native_renditions; lim public.video_native_studio_limits;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_native_renditions WHERE id=p_id FOR UPDATE; SELECT * INTO lim FROM public.video_native_studio_limits WHERE singleton=true;
  IF r.status<>'processing' OR r.claimed_by IS DISTINCT FROM p_worker OR r.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'native rendition custody mismatch'; END IF;
  IF p_output_path IS DISTINCT FROM format('%s/%s.mp4',r.candidate_id,r.id) OR p_poster_path IS DISTINCT FROM format('%s/%s.jpg',r.candidate_id,r.id) OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_bytes NOT BETWEEN 1024 AND lim.max_output_bytes OR p_duration<=0 OR p_duration>180 OR p_width<>1080 OR p_height<>1920 OR p_video_codec<>'h264' OR p_audio_codec NOT IN ('aac','none') OR jsonb_typeof(p_validation)<>'object' THEN RAISE EXCEPTION 'native rendition output validation failed'; END IF;
  UPDATE public.video_native_renditions SET status='ready',output_bucket='video-reels-native',output_path=p_output_path,poster_path=p_poster_path,output_sha256=p_sha256,output_bytes=p_bytes,output_duration_seconds=p_duration,output_width=p_width,output_height=p_height,video_codec=p_video_codec,audio_codec=p_audio_codec,validation=p_validation,completed_at=now(),claimed_by=NULL,claim_token=NULL,claimed_at=NULL,next_attempt_at=NULL,last_failure_code=NULL,updated_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO r; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fail_video_native_rendition(p_id uuid,p_worker text,p_claim_token uuid,p_code text)
RETURNS public.video_native_renditions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_native_renditions;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_native_renditions WHERE id=p_id FOR UPDATE;
  IF r.status<>'processing' OR r.claimed_by IS DISTINCT FROM p_worker OR r.claim_token IS DISTINCT FROM p_claim_token OR p_code !~ '^[a-z0-9_]{3,80}$' THEN RAISE EXCEPTION 'native rendition failure custody mismatch'; END IF;
  UPDATE public.video_native_renditions SET status=CASE WHEN attempt_count>=5 THEN 'failed' ELSE 'queued' END,last_failure_code=p_code,next_attempt_at=CASE WHEN attempt_count>=5 THEN NULL ELSE now()+make_interval(mins=>least(60,power(2,attempt_count)::int)) END,claimed_by=NULL,claim_token=NULL,claimed_at=NULL,updated_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO r; RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.fn_register_video_source_master(uuid,uuid,text,text,text,text[],text[],timestamptz,timestamptz,text,text,text,bigint,numeric,integer,integer),public.fn_revoke_video_source_master(uuid,uuid,text),public.fn_confirm_video_source_master_deleted(uuid),public.fn_queue_video_native_rendition(uuid,uuid,jsonb),public.fn_claim_video_native_renditions(text,integer),public.fn_finish_video_native_rendition(uuid,text,uuid,text,text,text,bigint,numeric,integer,integer,text,text,jsonb),public.fn_fail_video_native_rendition(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_register_video_source_master(uuid,uuid,text,text,text,text[],text[],timestamptz,timestamptz,text,text,text,bigint,numeric,integer,integer),public.fn_revoke_video_source_master(uuid,uuid,text),public.fn_confirm_video_source_master_deleted(uuid),public.fn_queue_video_native_rendition(uuid,uuid,jsonb),public.fn_claim_video_native_renditions(text,integer),public.fn_finish_video_native_rendition(uuid,text,uuid,text,text,text,bigint,numeric,integer,integer,text,text,jsonb),public.fn_fail_video_native_rendition(uuid,text,uuid,text) TO service_role;

COMMIT;
-- ROLLBACK: ship a new forward migration that first drains/revokes renditions,
-- then drops the five functions and the four Phase 6 tables in dependency order.
