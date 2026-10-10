-- 20261010035733_operator_private_export_artifacts.sql
-- Reserved against origin/main and every remote branch.
-- TIER: 3 (new event-to-job foreign key). Additive, no balance writer.
-- Rollback retires the new API authority and foreign-key dependency while
-- retaining committed job/audit evidence and private stored files.

BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.ca_operator_export_jobs') IS NULL OR to_regprocedure('public.fn_ca_finance_records_are_append_only()') IS NULL THEN RAISE EXCEPTION 'export_phase11_prerequisite_missing'; END IF;
 IF to_regclass('public.ca_operator_export_artifacts') IS NOT NULL OR to_regclass('public.ca_operator_export_artifact_events') IS NOT NULL THEN RAISE EXCEPTION 'export_artifacts_already_installed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'canonical_service_role_missing'; END IF;
END $$;

CREATE TABLE public.ca_operator_export_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), op_id uuid NOT NULL UNIQUE,
 requester_id uuid NOT NULL, request_id text, surface text NOT NULL,
 permission text NOT NULL, filters jsonb NOT NULL CHECK(jsonb_typeof(filters)='object'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','ready','truncated','failed','cancelled')),
 progress bigint NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 20000), total bigint CHECK(total>=0),
 snapshot jsonb, lease_id uuid, lease_until timestamptz, object_path text,
 content_sha256 text, byte_size bigint CHECK(byte_size BETWEEN 0 AND 16777216),
 complete boolean NOT NULL DEFAULT false, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 CHECK(content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
 CHECK(state NOT IN ('ready','truncated') OR (object_path IS NOT NULL AND content_sha256 IS NOT NULL AND byte_size IS NOT NULL AND snapshot IS NOT NULL))
);
CREATE INDEX ca_operator_export_artifacts_requester_idx ON public.ca_operator_export_artifacts(requester_id,created_at DESC);
CREATE TABLE public.ca_operator_export_artifact_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, job_id uuid NOT NULL REFERENCES public.ca_operator_export_artifacts(id),
 actor_id uuid NOT NULL, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ca_operator_export_artifact_events_job_idx ON public.ca_operator_export_artifact_events(job_id,id);
ALTER TABLE public.ca_operator_export_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_operator_export_artifact_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_operator_export_artifacts,public.ca_operator_export_artifact_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ca_operator_export_artifacts,public.ca_operator_export_artifact_events TO service_role;
CREATE TRIGGER ca_operator_export_artifact_events_append_only BEFORE UPDATE OR DELETE ON public.ca_operator_export_artifact_events
FOR EACH ROW EXECUTE FUNCTION public.fn_ca_finance_records_are_append_only();

-- Private bucket has restrictive policies even when an unrelated broad storage
-- policy exists. Backend service-role requests retain their canonical access.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('operator-export-artifacts','operator-export-artifacts',false,16777216,ARRAY['text/csv'])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='operator-export-artifacts' AND public=false AND file_size_limit=16777216) THEN
  RAISE EXCEPTION 'export_bucket_configuration_conflict';
 END IF;
END $$;
CREATE POLICY operator_export_artifacts_private ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING(bucket_id <> 'operator-export-artifacts') WITH CHECK(bucket_id <> 'operator-export-artifacts');

CREATE FUNCTION public.fn_ca_operator_export_request(p_actor uuid,p_op_id uuid,p_request_id text,p_surface text,p_permission text,p_filters jsonb,p_payload_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.ca_operator_export_artifacts;
BEGIN
 IF p_actor IS NULL OR p_op_id IS NULL OR length(p_surface) NOT BETWEEN 1 AND 80 OR length(p_permission) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'export_request_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('operator-export:'||p_op_id::text,0));
 SELECT * INTO j FROM public.ca_operator_export_artifacts WHERE op_id=p_op_id;
 IF FOUND THEN
  IF j.requester_id<>p_actor OR j.payload_sha256<>p_payload_sha256 THEN RAISE EXCEPTION 'export_operation_conflict'; END IF;
  RETURN to_jsonb(j)-'snapshot'-'object_path';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('operator-export-requester:'||p_actor::text,0));
 IF (SELECT count(*) FROM public.ca_operator_export_artifacts WHERE requester_id=p_actor AND state IN ('queued','running') AND expires_at>now())>=5 THEN RAISE EXCEPTION 'export_active_job_limit'; END IF;
 INSERT INTO public.ca_operator_export_artifacts(op_id,requester_id,request_id,surface,permission,filters,payload_sha256)
 VALUES(p_op_id,p_actor,p_request_id,p_surface,p_permission,p_filters,p_payload_sha256) RETURNING * INTO j;
 INSERT INTO public.ca_operator_export_artifact_events(job_id,actor_id,action,details) VALUES(j.id,p_actor,'requested',jsonb_build_object('request_id',p_request_id,'surface',p_surface,'filters',p_filters));
 INSERT INTO public.admin_audit_log(admin_user_id,actor_role,action,target_type,target_id,details,request_id)
 VALUES(p_actor,(SELECT role FROM public.profiles WHERE id=p_actor),'export.requested','operator_export',j.id::text,
 jsonb_build_object('op_id',p_op_id,'surface',p_surface,'filters',p_filters,'permission',p_permission),p_request_id);
 RETURN to_jsonb(j)-'snapshot'-'object_path';
END $$;

CREATE FUNCTION public.fn_ca_operator_export_transition(p_id uuid,p_actor uuid,p_action text,p_lease uuid DEFAULT NULL,p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j public.ca_operator_export_artifacts;
BEGIN
 SELECT * INTO j FROM public.ca_operator_export_artifacts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.requester_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'export_job_not_found'; END IF;
 IF p_action='cancel' THEN
  IF j.state<>'cancelled' THEN UPDATE public.ca_operator_export_artifacts SET state='cancelled',lease_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=j.id; END IF;
 ELSIF p_action='claim' THEN
  IF j.expires_at<=now() THEN RAISE EXCEPTION 'export_expired'; END IF;
  IF j.state NOT IN ('queued','failed','running') OR (j.state='running' AND j.lease_until>now()) THEN RETURN jsonb_build_object('claimed',false); END IF;
  IF p_lease IS NULL THEN RAISE EXCEPTION 'export_lease_required'; END IF;
  UPDATE public.ca_operator_export_artifacts SET state='running',lease_id=p_lease,lease_until=now()+interval '260 seconds',error_code=NULL,updated_at=now() WHERE id=j.id;
 ELSIF p_action='served' THEN
  IF j.state NOT IN ('ready','truncated') OR j.expires_at<=now() THEN RAISE EXCEPTION 'export_not_downloadable'; END IF;
 ELSIF p_action='purged' THEN
  IF j.state<>'cancelled' AND j.expires_at>now() THEN RAISE EXCEPTION 'export_purge_refused'; END IF;
 ELSIF p_action IN ('progress','capture','finish','fail') THEN
  IF j.state<>'running' OR j.lease_id IS DISTINCT FROM p_lease OR j.lease_until<=now() OR j.expires_at<=now() THEN RETURN jsonb_build_object('owned',false); END IF;
  IF p_action='progress' THEN
   UPDATE public.ca_operator_export_artifacts SET progress=(p_details->>'rows')::bigint,total=(p_details->>'total')::bigint,updated_at=now() WHERE id=j.id;
  ELSIF p_action='capture' THEN
   IF j.snapshot IS NOT NULL AND j.snapshot IS DISTINCT FROM p_details THEN RAISE EXCEPTION 'export_snapshot_immutable'; END IF;
   IF octet_length(p_details::text)>16777216 OR jsonb_typeof(p_details->'rows')<>'array' OR jsonb_array_length(p_details->'rows')>20000 THEN RAISE EXCEPTION 'export_capture_invalid'; END IF;
   UPDATE public.ca_operator_export_artifacts SET snapshot=p_details,progress=jsonb_array_length(p_details->'rows'),total=(p_details->>'total')::bigint,complete=(p_details->>'complete')::boolean,updated_at=now() WHERE id=j.id;
  ELSIF p_action='finish' THEN
   IF j.snapshot IS NULL OR p_details->>'object_path'<>j.requester_id::text||'/'||j.op_id::text||'.csv' THEN RAISE EXCEPTION 'export_artifact_invalid'; END IF;
   UPDATE public.ca_operator_export_artifacts SET state=CASE WHEN complete THEN 'ready' ELSE 'truncated' END,
    object_path=p_details->>'object_path',content_sha256=p_details->>'sha256',byte_size=(p_details->>'bytes')::bigint,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  ELSE
   UPDATE public.ca_operator_export_artifacts SET state='failed',error_code=left(p_details->>'code',80),lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  END IF;
 ELSE RAISE EXCEPTION 'export_transition_invalid'; END IF;
 IF p_action<>'progress' THEN INSERT INTO public.ca_operator_export_artifact_events(job_id,actor_id,action,details) VALUES(j.id,p_actor,p_action,CASE WHEN p_action='capture' THEN p_details-'rows' ELSE p_details END); END IF;
 SELECT * INTO j FROM public.ca_operator_export_artifacts WHERE id=p_id;
 RETURN jsonb_build_object('owned',true,'claimed',p_action='claim','job',to_jsonb(j)-'snapshot'-'object_path');
END $$;
REVOKE ALL ON FUNCTION public.fn_ca_operator_export_request(uuid,uuid,text,text,text,jsonb,text), public.fn_ca_operator_export_transition(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_export_request(uuid,uuid,text,text,text,jsonb,text), public.fn_ca_operator_export_transition(uuid,uuid,text,uuid,jsonb) TO service_role;
COMMENT ON TABLE public.ca_operator_export_artifacts IS 'Bounded explicit-request export owner; immutable source capture, lease-fenced recovery and authenticated private artifact retrieval. No schedule.';
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.ca_operator_export_artifacts','SELECT') OR has_function_privilege('anon','public.fn_ca_operator_export_request(uuid,uuid,text,text,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'export_unprivileged_authority'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='operator_export_artifacts_private' AND NOT polpermissive) THEN RAISE EXCEPTION 'export_private_policy_missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='operator-export-artifacts' AND NOT public) THEN RAISE EXCEPTION 'export_private_bucket_missing'; END IF;
END $$;
COMMIT;

-- ROLLBACK: apply as a new migration after retiring the export API candidate.
-- BEGIN;
-- SET LOCAL lock_timeout='2s';
-- REVOKE EXECUTE ON FUNCTION public.fn_ca_operator_export_request(uuid,uuid,text,text,text,jsonb,text), public.fn_ca_operator_export_transition(uuid,uuid,text,uuid,jsonb) FROM service_role;
-- ALTER TABLE public.ca_operator_export_artifact_events DROP CONSTRAINT ca_operator_export_artifact_events_job_id_fkey;
-- COMMIT;
-- Keep the restrictive storage policy, private bucket and append-only history.
