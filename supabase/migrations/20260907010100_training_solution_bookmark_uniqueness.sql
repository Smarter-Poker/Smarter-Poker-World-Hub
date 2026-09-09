-- One user can own only one record for a canonical solution scenario.
-- Prefer the newest row with notes when normalizing historical duplicates;
-- this makes the API's server-side UPSERT genuinely idempotent.
WITH ranked_bookmarks AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, scenario_hash
      ORDER BY (notes IS NOT NULL) DESC, created_at DESC NULLS LAST, id DESC
    ) AS duplicate_rank
  FROM public.solution_bookmarks
)
DELETE FROM public.solution_bookmarks AS bookmark
USING ranked_bookmarks AS ranked
WHERE bookmark.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS solution_bookmarks_user_scenario_unique
  ON public.solution_bookmarks (user_id, scenario_hash);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'solution_bookmarks'
      AND indexname = 'solution_bookmarks_user_scenario_unique'
      AND indexdef ILIKE '%UNIQUE%'
  ) THEN
    RAISE EXCEPTION 'solution bookmark uniqueness postcondition failed';
  END IF;
END;
$$;
