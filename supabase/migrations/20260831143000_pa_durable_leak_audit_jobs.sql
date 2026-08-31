-- Personal Assistant Phase 2: durable, owner-private Leak Finder audit jobs.
-- The browser starts a job, but server-owned workers advance every signed
-- Club Arena page. Checkpoints survive reloads, device changes and deploys.

CREATE TABLE IF NOT EXISTS public.pa_leak_audit_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  stage text NOT NULL DEFAULT 'queued',
  audit_cursor text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  reconciliation jsonb,
  engine_version text NOT NULL DEFAULT 'pa-leak-audit-v2',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  error_message text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pa_leak_audit_jobs_one_active_per_user
  ON public.pa_leak_audit_jobs(user_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS pa_leak_audit_jobs_user_recent
  ON public.pa_leak_audit_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pa_leak_audit_jobs_recovery
  ON public.pa_leak_audit_jobs(status, lease_expires_at, queued_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.pa_leak_audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_leak_audit_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_leak_audit_jobs_owner_read ON public.pa_leak_audit_jobs;
CREATE POLICY pa_leak_audit_jobs_owner_read
  ON public.pa_leak_audit_jobs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS pa_leak_audit_jobs_service_manage ON public.pa_leak_audit_jobs;
CREATE POLICY pa_leak_audit_jobs_service_manage
  ON public.pa_leak_audit_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.pa_leak_audit_jobs FROM public, anon, authenticated;
GRANT ALL ON TABLE public.pa_leak_audit_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.start_or_resume_pa_leak_audit_job(p_user_id uuid)
RETURNS SETOF public.pa_leak_audit_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pa_leak_audit_jobs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pa_leak_audit:' || p_user_id::text, 0));

  SELECT * INTO v_job
    FROM public.pa_leak_audit_jobs
   WHERE user_id = p_user_id AND status IN ('queued', 'running')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_job.status = 'running' AND COALESCE(v_job.lease_expires_at, '-infinity'::timestamptz) <= now() THEN
      UPDATE public.pa_leak_audit_jobs
         SET status = 'queued', stage = 'recovering', worker_token = NULL,
             lease_expires_at = NULL, queued_at = now(), updated_at = now()
       WHERE id = v_job.id
       RETURNING * INTO v_job;
    END IF;
    RETURN NEXT v_job;
    RETURN;
  END IF;

  -- A failed job with a valid persisted checkpoint resumes idempotently.
  SELECT * INTO v_job
    FROM public.pa_leak_audit_jobs
   WHERE user_id = p_user_id
     AND status = 'failed'
     AND audit_cursor IS NOT NULL
     AND updated_at >= now() - interval '7 days'
   ORDER BY updated_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.pa_leak_audit_jobs
       SET status = 'queued', stage = 'recovering', worker_token = NULL,
           lease_expires_at = NULL, error_code = NULL, error_message = NULL,
           queued_at = now(), completed_at = NULL, updated_at = now()
     WHERE id = v_job.id
     RETURNING * INTO v_job;
    RETURN NEXT v_job;
    RETURN;
  END IF;

  INSERT INTO public.pa_leak_audit_jobs(user_id)
  VALUES (p_user_id)
  RETURNING * INTO v_job;
  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pa_leak_audit_job(
  p_job_id uuid,
  p_worker_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.pa_leak_audit_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pa_leak_audit_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_worker_token IS NULL THEN RETURN; END IF;
  UPDATE public.pa_leak_audit_jobs
     SET status = 'running', stage = CASE WHEN stage = 'queued' THEN 'importing_hands' ELSE stage END,
         worker_token = p_worker_token,
         lease_expires_at = now() + make_interval(secs => LEAST(300, GREATEST(30, COALESCE(p_lease_seconds, 90)))),
         started_at = COALESCE(started_at, now()), heartbeat_at = now(),
         attempt_count = attempt_count + 1, updated_at = now()
   WHERE id = p_job_id
     AND (status = 'queued'
       OR (status = 'running' AND COALESCE(lease_expires_at, '-infinity'::timestamptz) <= now()))
   RETURNING * INTO v_job;
  IF FOUND THEN RETURN NEXT v_job; END IF;
END;
$$;

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
         lease_expires_at = CASE WHEN p_status = 'running' THEN lease_expires_at ELSE NULL END,
         updated_at = now()
   WHERE id = p_job_id AND status = 'running' AND worker_token = p_worker_token
   RETURNING * INTO v_job;
  IF FOUND THEN RETURN NEXT v_job; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_resume_pa_leak_audit_job(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pa_leak_audit_job(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_resume_pa_leak_audit_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pa_leak_audit_job(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) TO service_role;

-- Completion notification inserts are idempotent even if a worker is retried
-- after persisting its final checkpoint.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_pa_leak_audit_job_unique
  ON public.notifications ((data ->> 'paAuditJobId'))
  WHERE type = 'personal_assistant_audit_complete'
    AND data ? 'paAuditJobId';
