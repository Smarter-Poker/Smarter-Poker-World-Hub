-- Applied to the live project 2026-09-20 (recorded version 20260920150544).
-- Committed here so the repo does not drift from the database.
--
-- poker_news.search_vector was built from title + summary + content.
-- Measured on the 3,487 published rows at the time:
--   excerpt populated on 3,487 (100%)   <- was NOT indexed
--   summary populated on    19 (0.5%)
--   content populated on    58 (1.7%)
-- So the vector was effectively title-only. Adding excerpt changed no result
-- TODAY (excerpt is currently a copy of title on 3,412 of 3,487 rows), but it
-- means search picks real excerpts up automatically once the scraper writes
-- them, instead of silently ignoring the column.
CREATE OR REPLACE FUNCTION public.poker_news_search_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.excerpt, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'D');
    RETURN NEW;
END;
$function$;

UPDATE public.poker_news
SET search_vector =
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(excerpt, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'D');

-- The column was stored (and until recently shipped to every browser) with no
-- index, so nothing could ever query it. GIN makes /api/news/articles?search=
-- able to use it.
CREATE INDEX IF NOT EXISTS idx_poker_news_search_vector
    ON public.poker_news USING gin (search_vector);
