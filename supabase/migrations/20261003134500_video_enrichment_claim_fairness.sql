-- PURPOSE: Prevent eligible retries from starving behind the initial enrichment backlog
--          and finish each video's six-stage bundle before spreading work broadly.

CREATE OR REPLACE FUNCTION public.fn_claim_video_enrichment_jobs(p_worker text, p_limit integer DEFAULT 10)
RETURNS SETOF public.video_enrichment_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions
AS $$
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_worker),'') IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid claim';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT id
      FROM public.video_enrichment_jobs
     WHERE status IN ('queued','retry')
       AND available_at <= now()
     ORDER BY
       CASE WHEN status='retry' THEN 0 ELSE 1 END,
       video_id,
       created_at,
       id
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.video_enrichment_jobs j
     SET status='running',
         attempt_count=j.attempt_count+1,
         locked_at=now(),
         locked_by=p_worker,
         updated_at=now()
    FROM claimed
   WHERE j.id=claimed.id
  RETURNING j.*;
END $$;

REVOKE ALL ON FUNCTION public.fn_claim_video_enrichment_jobs(text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_video_enrichment_jobs(text,integer)
  TO service_role;

COMMENT ON FUNCTION public.fn_claim_video_enrichment_jobs(text,integer) IS
  'Claims eligible retries first, then clusters queued stages by video so editorial candidates complete promptly.';
