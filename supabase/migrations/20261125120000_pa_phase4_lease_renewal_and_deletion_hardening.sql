-- ===========================================================================
-- MIGRATION:   pa_phase4_lease_renewal_and_deletion_hardening
-- AFFECTS:     public.checkpoint_pa_leak_audit_job
-- IRREVERSIBLE: no
--
-- WHY:
--   A running audit checkpoint renewed lease_expires_at by only 90 seconds
--   (20261124221500). One slow stage of a large-account audit (a solver batch
--   or a big hand import page) can go longer than that between checkpoints,
--   so the lease lapsed mid-stage and claim_pa_leak_audit_job let a second
--   worker take the job over while the first was still writing. Every running
--   checkpoint now renews the lease to 180 seconds from now.
--
-- The signature is UNCHANGED on purpose. Adding a parameter would create a
-- second overload next to the one every caller resolves today; CREATE OR
-- REPLACE with the identical argument list replaces the one function in place.
-- A lease is only ever extended (GREATEST), never shortened, and a checkpoint
-- that ends the run (completed / failed / cancelled / queued) still clears it.
-- No column is added.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.checkpoint_pa_leak_audit_job(
  p_job_id uuid,
  p_worker_token uuid,
  p_status text,
  p_stage text,
  p_audit_cursor text,
  p_progress jsonb,
  p_result jsonb DEFAULT NULL,
  p_reconciliation jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS SETOF public.pa_leak_audit_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pa_leak_audit_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('queued', 'running', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid audit status';
  END IF;
  UPDATE public.pa_leak_audit_jobs
     SET status = p_status,
         stage = LEFT(COALESCE(NULLIF(p_stage, ''), stage), 80),
         audit_cursor = p_audit_cursor,
         progress = COALESCE(p_progress, progress),
         result = COALESCE(p_result, result),
         reconciliation = COALESCE(p_reconciliation, reconciliation),
         error_code = p_error_code,
         error_message = LEFT(p_error_message, 500),
         heartbeat_at = now(),
         queued_at = CASE WHEN p_status = 'queued' THEN now() ELSE queued_at END,
         completed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE NULL END,
         worker_token = CASE WHEN p_status = 'running' THEN worker_token ELSE NULL END,
         lease_expires_at = CASE
           WHEN p_status = 'running' THEN GREATEST(COALESCE(lease_expires_at, now()), now() + interval '180 seconds')
           ELSE NULL
         END,
         updated_at = now()
   WHERE id = p_job_id AND status = 'running' AND worker_token = p_worker_token
   RETURNING * INTO v_job;
  IF FOUND THEN RETURN NEXT v_job; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) TO service_role;

DO $$
DECLARE
  v_overloads integer;
BEGIN
  SELECT count(*) INTO v_overloads
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'checkpoint_pa_leak_audit_job';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'checkpoint_pa_leak_audit_job must have exactly one signature, found %', v_overloads;
  END IF;
  IF has_function_privilege('authenticated', 'public.checkpoint_pa_leak_audit_job(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.checkpoint_pa_leak_audit_job(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'checkpoint_pa_leak_audit_job is exposed to a browser role';
  END IF;
END
$$;

COMMIT;
