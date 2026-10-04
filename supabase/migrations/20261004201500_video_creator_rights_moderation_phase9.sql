-- ===========================================================================
-- Phase 9: creator rights, exact attribution, disclosures, and takedowns
-- TIER: 3
-- AUTHOR: Codex
-- AFFECTS: creator source claims/submissions, attribution, clip consent,
--          moderation reports, public Video Library/Reels delivery and takedown
-- IRREVERSIBLE: no (rollback is application rollback plus the guarded objects
--               listed at the end; applied takedowns require explicit restore)
-- WHY: replace browser-only reports and implicit attribution with an auditable,
--      owner-bound rights ledger and atomic public-surface suppression.
-- ===========================================================================
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.content_sources') IS NULL
     OR to_regclass('public.video_library_videos') IS NULL
     OR to_regclass('public.social_posts') IS NULL
     OR to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.video_rights_evidence') IS NULL THEN
    RAISE EXCEPTION 'preflight: Phase 1-8 video contracts are required';
  END IF;
END $preflight$;

CREATE TABLE public.video_creator_source_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  claimant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  content_source_id uuid NOT NULL REFERENCES public.content_sources(id) ON DELETE RESTRICT,
  provider_channel_id text NOT NULL CHECK (length(btrim(provider_channel_id)) BETWEEN 3 AND 160),
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('provider_verification','ownership_document','creator_authorization')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 3 AND 500),
  evidence_sha256 text CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','approved','rejected','revoked','withdrawn')),
  reviewed_by uuid, reviewed_at timestamptz, review_reason text,
  revoked_by uuid, revoked_at timestamptz, revocation_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX video_creator_source_claims_active_source_uq
  ON public.video_creator_source_claims(content_source_id)
  WHERE status IN ('verified','approved');

CREATE TABLE public.video_creator_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
  submitter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_claim_id uuid REFERENCES public.video_creator_source_claims(id) ON DELETE RESTRICT,
  video_id uuid REFERENCES public.video_library_videos(id) ON DELETE RESTRICT,
  youtube_video_id text, upload_ticket_id uuid REFERENCES public.video_source_upload_tickets(id) ON DELETE RESTRICT,
  canonical_asset_key text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 240),
  attribution_name text NOT NULL CHECK (length(btrim(attribution_name)) BETWEEN 2 AND 160),
  attribution_url text NOT NULL CHECK (attribution_url ~ '^https://'),
  disclosure_kind text NOT NULL DEFAULT 'community' CHECK (disclosure_kind IN ('organic','sponsored','promotional','generated','community')),
  sponsor_name text, proposed_rights_status text NOT NULL CHECK (proposed_rights_status IN ('embed_only','owned','licensed','user_authorized')),
  proposed_permitted_uses text[] NOT NULL DEFAULT ARRAY['embed_display']::text[],
  proposed_territories text[] NOT NULL DEFAULT ARRAY['worldwide']::text[],
  valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','in_review','approved','rejected','withdrawn','taken_down')),
  reviewed_by uuid, reviewed_at timestamptz, review_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((youtube_video_id IS NOT NULL)::integer + (upload_ticket_id IS NOT NULL)::integer = 1),
  CHECK (youtube_video_id IS NULL OR (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$' AND canonical_asset_key='youtube:'||youtube_video_id)),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (cardinality(proposed_permitted_uses)>0 AND cardinality(proposed_territories)>0),
  CHECK (disclosure_kind NOT IN ('sponsored','promotional') OR length(btrim(sponsor_name)) BETWEEN 2 AND 160)
);

CREATE TABLE public.video_attribution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_asset_key text NOT NULL,
  video_id uuid REFERENCES public.video_library_videos(id) ON DELETE RESTRICT,
  submission_id uuid REFERENCES public.video_creator_submissions(id) ON DELETE RESTRICT,
  creator_name text NOT NULL CHECK (length(btrim(creator_name)) BETWEEN 2 AND 160),
  provider_channel_id text, attribution_url text NOT NULL CHECK (attribution_url ~ '^https://'),
  disclosure_kind text NOT NULL CHECK (disclosure_kind IN ('organic','sponsored','promotional','generated','community')),
  sponsor_name text, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disputed','revoked')),
  verified_by uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (disclosure_kind NOT IN ('sponsored','promotional') OR length(btrim(sponsor_name)) BETWEEN 2 AND 160)
);
CREATE UNIQUE INDEX video_attribution_active_asset_uq ON public.video_attribution_records(canonical_asset_key) WHERE status='active';

CREATE TABLE public.video_attribution_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attribution_record_id uuid NOT NULL REFERENCES public.video_attribution_records(id) ON DELETE RESTRICT,
  proposed_creator_name text NOT NULL CHECK (length(btrim(proposed_creator_name)) BETWEEN 2 AND 160),
  proposed_attribution_url text NOT NULL CHECK (proposed_attribution_url ~ '^https://'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid, reviewed_at timestamptz, review_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.video_creator_clip_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES public.video_reel_candidates(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
  candidate_version integer NOT NULL CHECK(candidate_version>0),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','rejected')),
  reviewed_by uuid, reviewed_at timestamptz, review_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(creator_user_id,candidate_id)
);

CREATE TABLE public.video_moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  video_id uuid REFERENCES public.video_library_videos(id) ON DELETE RESTRICT,
  reel_id uuid REFERENCES public.social_reels(id) ON DELETE RESTRICT,
  canonical_asset_key text NOT NULL,
  case_kind text NOT NULL CHECK (case_kind IN ('content_report','rights_takedown','attribution_dispute','safety_report')),
  reason_code text NOT NULL CHECK (reason_code IN ('copyright','rights_revoked','wrong_attribution','unlabeled_promotion','unlabeled_generated_media','underage_or_safety','unsafe_gambling','playback_unavailable','inappropriate_content','spam','harassment','misinformation','other')),
  detail text CHECK (detail IS NULL OR length(detail)<=1000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','triaged','applied','rejected','restored','withdrawn')),
  reviewed_by uuid, reviewed_at timestamptz, applied_at timestamptz, restored_at timestamptz,
  cleanup_manifest jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cleanup_manifest)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (video_id IS NOT NULL OR reel_id IS NOT NULL)
);
CREATE INDEX video_moderation_cases_asset_idx ON public.video_moderation_cases(canonical_asset_key,status,created_at DESC);

CREATE TABLE public.video_moderation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.video_moderation_cases(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL, event_type text NOT NULL CHECK(event_type IN ('submitted','triaged','applied','rejected','restored','withdrawn')),
  from_status text, to_status text NOT NULL, before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_rights_evidence
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS grantor_user_id uuid,
  ADD COLUMN IF NOT EXISTS source_claim_id uuid REFERENCES public.video_creator_source_claims(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES public.video_creator_submissions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_sha256 text,
  ADD COLUMN IF NOT EXISTS evidence_storage_reference text,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS video_rights_evidence_operation_uq ON public.video_rights_evidence(operation_id) WHERE operation_id IS NOT NULL;

ALTER TABLE public.video_source_upload_tickets ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS video_source_upload_tickets_operation_uq ON public.video_source_upload_tickets(operation_id) WHERE operation_id IS NOT NULL;

ALTER TABLE public.video_library_videos
  ADD COLUMN IF NOT EXISTS attribution_name text,
  ADD COLUMN IF NOT EXISTS attribution_url text,
  ADD COLUMN IF NOT EXISTS disclosure_kind text NOT NULL DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS takedown_case_id uuid REFERENCES public.video_moderation_cases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taken_down_at timestamptz;
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS attribution_name text,
  ADD COLUMN IF NOT EXISTS attribution_url text,
  ADD COLUMN IF NOT EXISTS disclosure_kind text NOT NULL DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS made_for_kids boolean,
  ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS takedown_case_id uuid REFERENCES public.video_moderation_cases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taken_down_at timestamptz;
ALTER TABLE public.social_reels
  ADD COLUMN IF NOT EXISTS attribution_name text,
  ADD COLUMN IF NOT EXISTS attribution_url text,
  ADD COLUMN IF NOT EXISTS disclosure_kind text NOT NULL DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS made_for_kids boolean,
  ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS takedown_case_id uuid REFERENCES public.video_moderation_cases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taken_down_at timestamptz;

UPDATE public.video_library_videos
SET attribution_name=coalesce(attribution_name,nullif(btrim(source_name),'')),
    attribution_url=coalesce(attribution_url,CASE WHEN youtube_video_id ~ '^[A-Za-z0-9_-]{11}$' THEN 'https://www.youtube.com/watch?v='||youtube_video_id END);
UPDATE public.social_posts p SET attribution_name=coalesce(p.attribution_name,v.attribution_name),attribution_url=coalesce(p.attribution_url,v.attribution_url),made_for_kids=coalesce(p.made_for_kids,v.made_for_kids)
FROM public.video_library_videos v WHERE p.source_asset_id=v.id;
UPDATE public.social_reels r SET attribution_name=coalesce(r.attribution_name,v.attribution_name),attribution_url=coalesce(r.attribution_url,v.attribution_url),made_for_kids=coalesce(r.made_for_kids,v.made_for_kids)
FROM public.video_library_videos v WHERE r.source_asset_id=v.id;

ALTER TABLE public.video_library_videos ADD CONSTRAINT video_library_disclosure_phase9_check CHECK (disclosure_kind IN ('organic','sponsored','promotional','generated','community') AND moderation_state IN ('active','under_review','taken_down','restored') AND (disclosure_kind NOT IN ('sponsored','promotional') OR length(btrim(sponsor_name)) BETWEEN 2 AND 160)) NOT VALID;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_disclosure_phase9_check CHECK (disclosure_kind IN ('organic','sponsored','promotional','generated','community') AND moderation_state IN ('active','under_review','taken_down','restored') AND (disclosure_kind NOT IN ('sponsored','promotional') OR length(btrim(sponsor_name)) BETWEEN 2 AND 160)) NOT VALID;
ALTER TABLE public.social_reels ADD CONSTRAINT social_reels_disclosure_phase9_check CHECK (disclosure_kind IN ('organic','sponsored','promotional','generated','community') AND moderation_state IN ('active','under_review','taken_down','restored') AND (disclosure_kind NOT IN ('sponsored','promotional') OR length(btrim(sponsor_name)) BETWEEN 2 AND 160)) NOT VALID;

CREATE OR REPLACE VIEW public.video_library_public_catalog
WITH (security_barrier = true)
AS SELECT v.youtube_video_id,v.source_id,v.source_name,v.type,v.title,v.thumbnail_url,v.views_text,v.views_count,v.duration,v.published_at,v.scraped_at,v.tags,v.availability_status,v.embeddable,v.availability_checked_at,
  v.attribution_name,v.attribution_url,v.disclosure_kind,v.sponsor_name,v.made_for_kids,v.moderation_state,v.takedown_case_id,v.taken_down_at
FROM public.video_library_videos v
WHERE v.moderation_state IN ('active','restored') AND v.taken_down_at IS NULL AND public.fn_is_video_library_asset_eligible(v.id);
REVOKE ALL ON TABLE public.video_library_public_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.video_library_public_catalog TO service_role;

ALTER TABLE public.video_creator_source_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_creator_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_attribution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_attribution_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_creator_clip_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_moderation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_creator_source_claims,public.video_creator_submissions,public.video_attribution_records,public.video_attribution_update_requests,public.video_creator_clip_reviews,public.video_moderation_cases,public.video_moderation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.video_creator_source_claims,public.video_creator_submissions,public.video_attribution_records,public.video_attribution_update_requests,public.video_creator_clip_reviews,public.video_moderation_cases,public.video_moderation_events TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.video_creator_source_claims,public.video_creator_submissions,public.video_attribution_records,public.video_attribution_update_requests,public.video_creator_clip_reviews,public.video_moderation_cases,public.video_moderation_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.video_moderation_events_id_seq TO service_role;
CREATE POLICY video_claims_owner_read ON public.video_creator_source_claims FOR SELECT TO authenticated USING (claimant_user_id=(SELECT auth.uid()));
CREATE POLICY video_submissions_owner_read ON public.video_creator_submissions FOR SELECT TO authenticated USING (submitter_user_id=(SELECT auth.uid()));
CREATE POLICY video_cases_owner_read ON public.video_moderation_cases FOR SELECT TO authenticated USING (requester_user_id=(SELECT auth.uid()));
CREATE POLICY video_claims_admin_read ON public.video_creator_source_claims FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_submissions_admin_read ON public.video_creator_submissions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_attribution_owner_admin_read ON public.video_attribution_records FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.video_creator_submissions s WHERE s.id=submission_id AND s.submitter_user_id=(SELECT auth.uid())) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_attribution_requests_owner_admin_read ON public.video_attribution_update_requests FOR SELECT TO authenticated USING (requester_user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_clip_reviews_owner_admin_read ON public.video_creator_clip_reviews FOR SELECT TO authenticated USING (creator_user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_cases_admin_read ON public.video_moderation_cases FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));
CREATE POLICY video_events_admin_read ON public.video_moderation_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.is_admin=true));

CREATE OR REPLACE FUNCTION public.fn_submit_video_creator_claim(p_operation_id uuid,p_content_source_id uuid,p_provider_channel_id text,p_evidence_kind text,p_evidence_reference text,p_evidence_sha256 text DEFAULT NULL)
RETURNS public.video_creator_source_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_creator_source_claims; s public.content_sources;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_creator_source_claims WHERE operation_id=p_operation_id;
  IF FOUND THEN IF r.claimant_user_id<>u OR r.content_source_id<>p_content_source_id OR r.provider_channel_id IS DISTINCT FROM btrim(p_provider_channel_id) OR r.evidence_kind IS DISTINCT FROM p_evidence_kind OR r.evidence_reference IS DISTINCT FROM btrim(p_evidence_reference) OR r.evidence_sha256 IS DISTINCT FROM p_evidence_sha256 THEN RAISE EXCEPTION 'operation replay payload mismatch'; END IF; RETURN r; END IF;
  SELECT * INTO s FROM public.content_sources WHERE id=p_content_source_id FOR UPDATE;
  IF s.id IS NULL OR s.provider_source_id IS DISTINCT FROM btrim(p_provider_channel_id) THEN RAISE EXCEPTION 'source identity mismatch'; END IF;
  SELECT * INTO r FROM public.video_creator_source_claims WHERE claimant_user_id=u AND content_source_id=p_content_source_id AND status IN ('pending','verified','approved') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO public.video_creator_source_claims(operation_id,claimant_user_id,content_source_id,provider_channel_id,evidence_kind,evidence_reference,evidence_sha256)
  VALUES(p_operation_id,u,p_content_source_id,btrim(p_provider_channel_id),p_evidence_kind,btrim(p_evidence_reference),p_evidence_sha256) RETURNING * INTO r; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_submit_video_creator_submission(p_operation_id uuid,p_source_claim_id uuid,p_video_id uuid,p_youtube_video_id text,p_upload_ticket_id uuid,p_title text,p_attribution_name text,p_attribution_url text,p_disclosure_kind text,p_sponsor_name text,p_rights_status text,p_permitted_uses text[],p_territories text[],p_valid_until timestamptz DEFAULT NULL)
RETURNS public.video_creator_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_creator_submissions; c public.video_creator_source_claims; key text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_creator_submissions WHERE operation_id=p_operation_id;
  IF FOUND THEN IF r.submitter_user_id<>u OR r.source_claim_id IS DISTINCT FROM p_source_claim_id OR r.video_id IS DISTINCT FROM p_video_id OR r.youtube_video_id IS DISTINCT FROM p_youtube_video_id OR r.upload_ticket_id IS DISTINCT FROM p_upload_ticket_id OR r.title IS DISTINCT FROM btrim(p_title) OR r.attribution_name IS DISTINCT FROM btrim(p_attribution_name) OR r.attribution_url IS DISTINCT FROM p_attribution_url OR r.disclosure_kind IS DISTINCT FROM p_disclosure_kind OR r.sponsor_name IS DISTINCT FROM p_sponsor_name OR r.proposed_rights_status IS DISTINCT FROM p_rights_status OR r.proposed_permitted_uses IS DISTINCT FROM p_permitted_uses OR r.proposed_territories IS DISTINCT FROM p_territories OR r.valid_until IS DISTINCT FROM p_valid_until THEN RAISE EXCEPTION 'operation replay payload mismatch'; END IF; RETURN r; END IF;
  IF p_source_claim_id IS NOT NULL THEN SELECT * INTO c FROM public.video_creator_source_claims WHERE id=p_source_claim_id AND claimant_user_id=u AND status IN ('verified','approved'); IF c.id IS NULL THEN RAISE EXCEPTION 'approved creator source claim required'; END IF; END IF;
  IF (p_youtube_video_id IS NULL)=(p_upload_ticket_id IS NULL) THEN RAISE EXCEPTION 'exactly one source identity required'; END IF;
  IF p_upload_ticket_id IS NOT NULL AND (p_video_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.video_source_upload_tickets t WHERE t.id=p_upload_ticket_id AND t.actor_id=u AND t.video_id=p_video_id AND t.status='reserved' AND t.expires_at>now())) THEN RAISE EXCEPTION 'active matching owner upload reservation required'; END IF;
  key:=CASE WHEN p_youtube_video_id IS NOT NULL THEN 'youtube:'||p_youtube_video_id ELSE 'native:'||p_upload_ticket_id::text END;
  SELECT * INTO r FROM public.video_creator_submissions WHERE submitter_user_id=u AND canonical_asset_key=key AND status IN ('draft','pending','in_review','approved') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF r.source_claim_id IS DISTINCT FROM p_source_claim_id OR r.video_id IS DISTINCT FROM p_video_id OR r.youtube_video_id IS DISTINCT FROM p_youtube_video_id OR r.upload_ticket_id IS DISTINCT FROM p_upload_ticket_id OR r.title IS DISTINCT FROM btrim(p_title) OR r.attribution_name IS DISTINCT FROM btrim(p_attribution_name) OR r.attribution_url IS DISTINCT FROM p_attribution_url OR r.disclosure_kind IS DISTINCT FROM p_disclosure_kind OR r.sponsor_name IS DISTINCT FROM p_sponsor_name OR r.proposed_rights_status IS DISTINCT FROM p_rights_status OR r.proposed_permitted_uses IS DISTINCT FROM p_permitted_uses OR r.proposed_territories IS DISTINCT FROM p_territories OR r.valid_until IS DISTINCT FROM p_valid_until THEN RAISE EXCEPTION 'active submission already exists with different terms'; END IF;
    RETURN r;
  END IF;
  INSERT INTO public.video_creator_submissions(operation_id,submitter_user_id,source_claim_id,video_id,youtube_video_id,upload_ticket_id,canonical_asset_key,title,attribution_name,attribution_url,disclosure_kind,sponsor_name,proposed_rights_status,proposed_permitted_uses,proposed_territories,valid_until)
  VALUES(p_operation_id,u,p_source_claim_id,p_video_id,p_youtube_video_id,p_upload_ticket_id,key,btrim(p_title),btrim(p_attribution_name),p_attribution_url,p_disclosure_kind,p_sponsor_name,p_rights_status,p_permitted_uses,p_territories,p_valid_until) RETURNING * INTO r; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_request_video_attribution_update(p_operation_id uuid,p_attribution_record_id uuid,p_creator_name text,p_attribution_url text)
RETURNS public.video_attribution_update_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_attribution_update_requests; a public.video_attribution_records;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_attribution_update_requests WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF r.requester_user_id<>u OR r.attribution_record_id<>p_attribution_record_id OR r.proposed_creator_name IS DISTINCT FROM btrim(p_creator_name) OR r.proposed_attribution_url IS DISTINCT FROM p_attribution_url THEN RAISE EXCEPTION 'operation replay payload mismatch'; END IF;
    RETURN r;
  END IF;
  SELECT a0.* INTO a FROM public.video_attribution_records a0
  JOIN public.video_creator_submissions s ON s.id=a0.submission_id
  WHERE a0.id=p_attribution_record_id AND s.submitter_user_id=u AND a0.status IN ('active','disputed') FOR UPDATE OF a0;
  IF a.id IS NULL THEN RAISE EXCEPTION 'owned attribution record required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_attribution_update_requests
  WHERE requester_user_id=u AND attribution_record_id=p_attribution_record_id AND status='pending'
  ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO public.video_attribution_update_requests(operation_id,requester_user_id,attribution_record_id,proposed_creator_name,proposed_attribution_url)
  VALUES(p_operation_id,u,p_attribution_record_id,btrim(p_creator_name),p_attribution_url) RETURNING * INTO r;
  UPDATE public.video_attribution_records SET status='disputed',updated_at=now(),version=version+1 WHERE id=a.id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_submit_video_creator_clip_review(p_operation_id uuid,p_candidate_id uuid,p_expected_version integer,p_decision text,p_reason text DEFAULT NULL)
RETURNS public.video_creator_clip_reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_creator_clip_reviews; c public.video_reel_candidates;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_creator_clip_reviews WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF r.creator_user_id<>u OR r.candidate_id<>p_candidate_id OR r.candidate_version<>p_expected_version OR r.decision IS DISTINCT FROM p_decision OR r.reason IS DISTINCT FROM nullif(btrim(p_reason),'') THEN RAISE EXCEPTION 'operation replay payload mismatch'; END IF;
    RETURN r;
  END IF;
  SELECT c0.* INTO c FROM public.video_reel_candidates c0
  WHERE c0.id=p_candidate_id AND c0.version=p_expected_version AND c0.status='proposed'
    AND EXISTS(SELECT 1 FROM public.video_creator_submissions s WHERE s.video_id=c0.video_id AND s.submitter_user_id=u AND s.status='approved')
  FOR UPDATE OF c0;
  IF c.id IS NULL OR p_decision NOT IN ('approved','rejected') OR (p_decision='rejected' AND nullif(btrim(p_reason),'') IS NULL) THEN RAISE EXCEPTION 'owned current clip review and valid decision required'; END IF;
  SELECT * INTO r FROM public.video_creator_clip_reviews WHERE creator_user_id=u AND candidate_id=p_candidate_id FOR UPDATE;
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO public.video_creator_clip_reviews(operation_id,creator_user_id,candidate_id,decision,reason,candidate_version)
  VALUES(p_operation_id,u,p_candidate_id,p_decision,nullif(left(btrim(p_reason),500),''),p_expected_version) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_submit_video_moderation_case_internal(p_operation_id uuid,p_video_id uuid,p_reel_id uuid,p_case_kind text,p_reason_code text,p_detail text DEFAULT NULL)
RETURNS public.video_moderation_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_moderation_cases; key text;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_moderation_cases WHERE operation_id=p_operation_id;
  IF FOUND THEN IF r.requester_user_id<>u OR r.video_id IS DISTINCT FROM p_video_id OR r.reel_id IS DISTINCT FROM p_reel_id OR r.case_kind IS DISTINCT FROM p_case_kind OR r.reason_code IS DISTINCT FROM p_reason_code OR r.detail IS DISTINCT FROM left(p_detail,1000) THEN RAISE EXCEPTION 'operation replay payload mismatch'; END IF; RETURN r; END IF;
  IF p_video_id IS NOT NULL THEN SELECT canonical_asset_key INTO key FROM public.social_reels WHERE source_asset_id=p_video_id ORDER BY created_at LIMIT 1; SELECT coalesce(key,'youtube:'||youtube_video_id) INTO key FROM public.video_library_videos WHERE id=p_video_id; END IF;
  IF p_reel_id IS NOT NULL THEN SELECT canonical_asset_key,source_asset_id INTO key,p_video_id FROM public.social_reels WHERE id=p_reel_id; END IF;
  IF key IS NULL THEN RAISE EXCEPTION 'moderation target not found'; END IF;
  SELECT * INTO r FROM public.video_moderation_cases WHERE requester_user_id=u AND canonical_asset_key=key AND case_kind=p_case_kind AND status IN ('submitted','triaged','applied') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO public.video_moderation_cases(operation_id,requester_user_id,video_id,reel_id,canonical_asset_key,case_kind,reason_code,detail)
  VALUES(p_operation_id,u,p_video_id,p_reel_id,key,p_case_kind,p_reason_code,left(p_detail,1000)) RETURNING * INTO r;
  INSERT INTO public.video_moderation_events(case_id,actor_user_id,event_type,to_status) VALUES(r.id,u,'submitted','submitted'); RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_submit_video_content_report(p_operation_id uuid,p_video_id uuid,p_reel_id uuid,p_reason_code text,p_detail text DEFAULT NULL)
RETURNS public.video_moderation_cases LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT public.fn_submit_video_moderation_case_internal(p_operation_id,p_video_id,p_reel_id,'content_report',p_reason_code,p_detail)
$$;

CREATE OR REPLACE FUNCTION public.fn_request_video_takedown(p_operation_id uuid,p_video_id uuid,p_reel_id uuid,p_reason_code text,p_detail text DEFAULT NULL)
RETURNS public.video_moderation_cases LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT public.fn_submit_video_moderation_case_internal(p_operation_id,p_video_id,p_reel_id,'rights_takedown',p_reason_code,p_detail)
$$;

CREATE OR REPLACE FUNCTION public.fn_review_video_creator_claim(p_claim_id uuid,p_expected_version integer,p_decision text,p_reason text,p_actor_id uuid)
RETURNS public.video_creator_source_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_creator_source_claims; u uuid:=auth.uid();
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL OR p_decision NOT IN ('verified','approved','rejected','revoked') THEN RAISE EXCEPTION 'service role, actor and valid decision required' USING ERRCODE='42501'; END IF;
  UPDATE public.video_creator_source_claims SET status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),review_reason=left(btrim(p_reason),500),version=version+1,updated_at=now() WHERE id=p_claim_id AND version=p_expected_version AND status IN ('pending','verified','approved') RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'claim version or transition conflict'; END IF; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_review_video_creator_submission(p_submission_id uuid,p_expected_version integer,p_decision text,p_reason text,p_actor_id uuid)
RETURNS public.video_creator_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_creator_submissions; u uuid:=auth.uid();
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL OR p_decision NOT IN ('in_review','approved','rejected') THEN RAISE EXCEPTION 'service role, actor and valid decision required' USING ERRCODE='42501'; END IF;
  UPDATE public.video_creator_submissions SET status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),review_reason=left(btrim(p_reason),500),version=version+1,updated_at=now() WHERE id=p_submission_id AND version=p_expected_version AND status IN ('pending','in_review') RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'submission version or transition conflict'; END IF;
  IF p_decision='approved' THEN
    INSERT INTO public.video_attribution_records(canonical_asset_key,video_id,submission_id,creator_name,provider_channel_id,attribution_url,disclosure_kind,sponsor_name,verified_by)
    VALUES(r.canonical_asset_key,r.video_id,r.id,r.attribution_name,(SELECT c.provider_channel_id FROM public.video_creator_source_claims c WHERE c.id=r.source_claim_id),r.attribution_url,r.disclosure_kind,r.sponsor_name,p_actor_id)
    ON CONFLICT(canonical_asset_key) WHERE status='active' DO NOTHING;
    UPDATE public.video_library_videos SET attribution_name=r.attribution_name,attribution_url=r.attribution_url,disclosure_kind=r.disclosure_kind,sponsor_name=r.sponsor_name,moderation_state='active' WHERE id=r.video_id;
    UPDATE public.social_posts SET attribution_name=r.attribution_name,attribution_url=r.attribution_url,disclosure_kind=r.disclosure_kind,sponsor_name=r.sponsor_name WHERE canonical_asset_key=r.canonical_asset_key;
    UPDATE public.social_reels SET attribution_name=r.attribution_name,attribution_url=r.attribution_url,disclosure_kind=r.disclosure_kind,sponsor_name=r.sponsor_name WHERE canonical_asset_key=r.canonical_asset_key;
  END IF; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_review_video_attribution_update(p_request_id uuid,p_expected_version integer,p_decision text,p_reason text,p_actor_id uuid)
RETURNS public.video_attribution_update_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_attribution_update_requests; a public.video_attribution_records;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL OR p_decision NOT IN ('approved','rejected') OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'service role, actor, decision and reason required' USING ERRCODE='42501'; END IF;
  UPDATE public.video_attribution_update_requests SET status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),review_reason=left(btrim(p_reason),500),version=version+1,updated_at=now()
  WHERE id=p_request_id AND version=p_expected_version AND status='pending' RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'attribution request version or transition conflict'; END IF;
  SELECT * INTO a FROM public.video_attribution_records WHERE id=r.attribution_record_id FOR UPDATE;
  IF p_decision='approved' THEN
    UPDATE public.video_attribution_records SET creator_name=r.proposed_creator_name,attribution_url=r.proposed_attribution_url,status='active',verified_by=p_actor_id,verified_at=now(),updated_at=now(),version=version+1 WHERE id=a.id RETURNING * INTO a;
    UPDATE public.video_library_videos SET attribution_name=a.creator_name,attribution_url=a.attribution_url WHERE id=a.video_id;
    UPDATE public.social_posts SET attribution_name=a.creator_name,attribution_url=a.attribution_url WHERE canonical_asset_key=a.canonical_asset_key;
    UPDATE public.social_reels SET attribution_name=a.creator_name,attribution_url=a.attribution_url WHERE canonical_asset_key=a.canonical_asset_key;
  ELSE
    UPDATE public.video_attribution_records SET status='active',updated_at=now(),version=version+1 WHERE id=a.id;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_review_video_creator_clip(p_review_id uuid,p_expected_version integer,p_decision text,p_reason text,p_actor_id uuid)
RETURNS public.video_creator_clip_reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_creator_clip_reviews;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL OR p_decision NOT IN ('approved','rejected') OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'service role, actor, decision and reason required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_creator_clip_reviews WHERE id=p_review_id AND version=p_expected_version AND moderation_status='pending' FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'clip review version or transition conflict'; END IF;
  PERFORM public.fn_review_video_reel_candidate(r.candidate_id,p_actor_id,CASE WHEN p_decision='approved' THEN 'approve' ELSE 'reject' END,r.candidate_version,p_reason);
  UPDATE public.video_creator_clip_reviews SET moderation_status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),review_reason=left(btrim(p_reason),500),updated_at=now(),version=version+1 WHERE id=r.id RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_apply_video_takedown(p_case_id uuid,p_expected_version integer,p_actor_id uuid)
RETURNS public.video_moderation_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE c public.video_moderation_cases; u uuid:=auth.uid(); before jsonb; paths text[]; prior_status text;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'service role and actor required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.video_moderation_cases WHERE id=p_case_id FOR UPDATE;
  IF c.id IS NULL OR c.version<>p_expected_version OR c.status NOT IN ('submitted','triaged') THEN RAISE EXCEPTION 'case version or transition conflict'; END IF;
  prior_status:=c.status;
  before:=jsonb_build_object('video_id',c.video_id,'canonical_asset_key',c.canonical_asset_key);
  SELECT coalesce(array_agg(x),ARRAY[]::text[]) INTO paths FROM (SELECT m.storage_path x FROM public.video_source_masters m WHERE m.video_id=c.video_id UNION ALL SELECT r.output_path FROM public.video_native_renditions r JOIN public.video_source_masters m ON m.id=r.master_id WHERE m.video_id=c.video_id AND r.output_path IS NOT NULL UNION ALL SELECT r.poster_path FROM public.video_native_renditions r JOIN public.video_source_masters m ON m.id=r.master_id WHERE m.video_id=c.video_id AND r.poster_path IS NOT NULL) q;
  UPDATE public.video_library_videos SET availability_status='restricted',embeddable=false,availability_checked_at=now(),availability_failure_reason='rights_takedown',availability_source='phase9_takedown',moderation_state='taken_down',takedown_case_id=c.id,taken_down_at=now() WHERE id=c.video_id;
  UPDATE public.social_reels SET is_public=false,is_deleted=true,moderation_state='taken_down',takedown_case_id=c.id,taken_down_at=now() WHERE canonical_asset_key=c.canonical_asset_key;
  UPDATE public.social_posts SET visibility='admins',is_deleted=true,moderation_state='taken_down',takedown_case_id=c.id,taken_down_at=now() WHERE canonical_asset_key=c.canonical_asset_key;
  UPDATE public.video_reel_candidates SET status='rejected',rejection_reason='rights_takedown',rejected_at=now(),rejected_by=p_actor_id,updated_at=now(),version=version+1 WHERE video_id=c.video_id AND status NOT IN ('rejected','published');
  UPDATE public.video_native_renditions r SET status='revoked',claimed_by=NULL,claim_token=NULL,claimed_at=NULL,next_attempt_at=NULL,updated_at=now(),version=version+1 FROM public.video_source_masters m WHERE r.master_id=m.id AND m.video_id=c.video_id AND r.status<>'revoked';
  UPDATE public.video_source_masters SET status='revoked',revoked_at=coalesce(revoked_at,now()),updated_at=now(),version=version+1 WHERE video_id=c.video_id AND status='ready';
  UPDATE public.video_rights_evidence SET lifecycle_status='revoked',revoked_at=coalesce(revoked_at,now()),revoked_by=coalesce(revoked_by,p_actor_id),revocation_reason=coalesce(revocation_reason,'rights_takedown'),updated_at=now(),version=version+1 WHERE video_id=c.video_id AND revoked_at IS NULL;
  DELETE FROM public.video_learning_search_documents WHERE video_id=c.video_id;
  UPDATE public.video_moderation_cases SET status='applied',reviewed_by=p_actor_id,reviewed_at=now(),applied_at=now(),cleanup_manifest=jsonb_build_object('storage_paths',paths,'cleanup_pending',cardinality(paths)>0),version=version+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
  INSERT INTO public.video_moderation_events(case_id,actor_user_id,event_type,from_status,to_status,before_state,after_state) VALUES(c.id,p_actor_id,'applied',prior_status,'applied',before,jsonb_build_object('suppressed',true,'cleanup_manifest',c.cleanup_manifest)); RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.fn_review_video_moderation_case(p_case_id uuid,p_expected_version integer,p_decision text,p_reason text,p_actor_id uuid)
RETURNS public.video_moderation_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE c public.video_moderation_cases; prior text;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' OR p_actor_id IS NULL OR p_decision NOT IN ('triaged','rejected') OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'service role, actor, decision and reason required' USING ERRCODE='42501'; END IF;
  SELECT status INTO prior FROM public.video_moderation_cases WHERE id=p_case_id FOR UPDATE;
  UPDATE public.video_moderation_cases SET status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),version=version+1,updated_at=now()
  WHERE id=p_case_id AND version=p_expected_version AND status IN ('submitted','triaged') RETURNING * INTO c;
  IF c.id IS NULL THEN RAISE EXCEPTION 'case version or transition conflict'; END IF;
  INSERT INTO public.video_moderation_events(case_id,actor_user_id,event_type,from_status,to_status,before_state,after_state)
  VALUES(c.id,p_actor_id,CASE WHEN p_decision='rejected' THEN 'rejected' ELSE 'triaged' END,prior,p_decision,jsonb_build_object('reason',p_reason),jsonb_build_object('reviewed',true));
  RETURN c;
END $$;

REVOKE ALL ON FUNCTION public.fn_submit_video_creator_claim(uuid,uuid,text,text,text,text),public.fn_submit_video_creator_submission(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,text[],text[],timestamptz),public.fn_request_video_attribution_update(uuid,uuid,text,text),public.fn_submit_video_creator_clip_review(uuid,uuid,integer,text,text),public.fn_submit_video_moderation_case_internal(uuid,uuid,uuid,text,text,text),public.fn_submit_video_content_report(uuid,uuid,uuid,text,text),public.fn_request_video_takedown(uuid,uuid,uuid,text,text),public.fn_review_video_creator_claim(uuid,integer,text,text,uuid),public.fn_review_video_creator_submission(uuid,integer,text,text,uuid),public.fn_review_video_attribution_update(uuid,integer,text,text,uuid),public.fn_review_video_creator_clip(uuid,integer,text,text,uuid),public.fn_review_video_moderation_case(uuid,integer,text,text,uuid),public.fn_apply_video_takedown(uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_video_creator_claim(uuid,uuid,text,text,text,text),public.fn_submit_video_creator_submission(uuid,uuid,uuid,text,uuid,text,text,text,text,text,text,text[],text[],timestamptz),public.fn_request_video_attribution_update(uuid,uuid,text,text),public.fn_submit_video_creator_clip_review(uuid,uuid,integer,text,text),public.fn_submit_video_content_report(uuid,uuid,uuid,text,text),public.fn_request_video_takedown(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_review_video_creator_claim(uuid,integer,text,text,uuid),public.fn_review_video_creator_submission(uuid,integer,text,text,uuid),public.fn_review_video_attribution_update(uuid,integer,text,text,uuid),public.fn_review_video_creator_clip(uuid,integer,text,text,uuid),public.fn_review_video_moderation_case(uuid,integer,text,text,uuid),public.fn_apply_video_takedown(uuid,integer,uuid) TO service_role;

DO $assertions$
BEGIN
  IF to_regclass('public.video_creator_source_claims') IS NULL OR to_regclass('public.video_creator_submissions') IS NULL OR to_regclass('public.video_attribution_records') IS NULL OR to_regclass('public.video_attribution_update_requests') IS NULL OR to_regclass('public.video_creator_clip_reviews') IS NULL OR to_regclass('public.video_moderation_cases') IS NULL OR to_regclass('public.video_moderation_events') IS NULL THEN RAISE EXCEPTION 'post-apply: Phase 9 tables missing'; END IF;
  IF has_table_privilege('anon','public.video_moderation_cases','SELECT')
     OR has_table_privilege('anon','public.video_moderation_events','SELECT')
     OR has_table_privilege('authenticated','public.video_moderation_cases','INSERT')
     OR has_table_privilege('authenticated','public.video_moderation_cases','UPDATE')
     OR has_table_privilege('authenticated','public.video_moderation_cases','DELETE')
     OR has_table_privilege('authenticated','public.video_moderation_events','INSERT')
     OR has_table_privilege('authenticated','public.video_moderation_events','UPDATE')
     OR has_table_privilege('authenticated','public.video_moderation_events','DELETE')
  THEN RAISE EXCEPTION 'post-apply: moderation authority exposed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_moderation_cases' AND policyname='video_cases_owner_read') THEN RAISE EXCEPTION 'post-apply: owner case policy missing'; END IF;
END $assertions$;

COMMIT;

-- Rollback plan (manual, maintenance window): first restore any applied case
-- through an audited compensating migration, then remove the Phase 9 grants,
-- functions, view projection, policies/tables and additive columns in reverse
-- dependency order. The migration intentionally never performs destructive
-- rollback automatically because rights evidence and moderation history are
-- compliance records.
