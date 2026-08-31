-- Expensive Personal Assistant routes need a cross-instance limiter that
-- fails closed when its authority cannot be consulted.
CREATE OR REPLACE FUNCTION public.check_rate_limit_strict(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_limit IS NULL OR p_limit <= 0
     OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN false;
  END IF;
  v_window_start := to_timestamp(
    (extract(epoch FROM now())::bigint / p_window_seconds) * p_window_seconds
  );
  INSERT INTO public.rate_limit_buckets (bucket_key, window_start, request_count, last_request_at)
  VALUES (p_key, v_window_start, 1, now())
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = public.rate_limit_buckets.request_count + 1,
        last_request_at = now()
  RETURNING request_count INTO v_count;
  RETURN v_count <= p_limit;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'check_rate_limit_strict failed closed (key=%): % %', p_key, SQLERRM, SQLSTATE;
  RETURN false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit_strict(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_strict(text, integer, integer) TO service_role;
