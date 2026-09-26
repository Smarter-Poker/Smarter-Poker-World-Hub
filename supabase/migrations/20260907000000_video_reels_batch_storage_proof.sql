-- Keep service-role feed readers on the same native-object boundary as RLS.
-- A URL-shaped string is not proof that the referenced object still exists,
-- is a video, or remains outside Storage's archived/delete-marker states.

CREATE OR REPLACE FUNCTION public.fn_filter_valid_user_video_storage_urls(
  p_candidates jsonb
)
RETURNS TABLE(playback_url text, author_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  WITH bounded_input AS (
    SELECT CASE
      WHEN jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) = 'array'
      THEN CASE
        WHEN jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb)) <= 500
        THEN COALESCE(p_candidates, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
      ELSE '[]'::jsonb
    END AS candidates
  ), parsed AS (
    SELECT candidate ->> 'playback_url' AS playback_url,
           CASE
             WHEN COALESCE(candidate ->> 'author_id', '') ~
               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
             THEN (candidate ->> 'author_id')::uuid
             ELSE NULL
           END AS author_id
    FROM bounded_input
    CROSS JOIN LATERAL jsonb_array_elements(candidates) AS input(candidate)
    WHERE jsonb_typeof(candidate) = 'object'
  )
  SELECT DISTINCT parsed.playback_url, parsed.author_id
  FROM parsed
  WHERE parsed.playback_url IS NOT NULL
    AND parsed.author_id IS NOT NULL
    AND public.fn_is_user_video_storage_url(
      parsed.playback_url,
      parsed.author_id
    )
$function$;

COMMENT ON FUNCTION public.fn_filter_valid_user_video_storage_urls(jsonb) IS
  'Service-role batch proof for live, non-archived, non-delete-marker video objects in exact author namespaces; rejects malformed or oversized input fail-closed.';

REVOKE ALL ON FUNCTION public.fn_filter_valid_user_video_storage_urls(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_filter_valid_user_video_storage_urls(jsonb)
  TO service_role;
