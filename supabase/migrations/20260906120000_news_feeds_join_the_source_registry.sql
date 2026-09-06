-- News feeds join the source registry.
--
-- `HorsePublisher.ts` carried its own list of RSS feeds - TWO for poker
-- (CardPlayer, Upswing) and four for sports - as literals, while
-- `content-health-check` has been monitoring SEVEN poker news sources with
-- fallback URLs and auto-repair since Phase 2. Two lists of the same thing,
-- one watched and one not: the watched list could heal a broken feed and the
-- horses would never see the repair, because they read the other list.
--
-- The same shape as the clip supply this phase already fixed: a hard-coded
-- list sitting beside a maintained one.
--
-- Every candidate feed was fetched before being written here (2026-09-06):
--   PokerNews      200, 20 items
--   CardPlayer     200, 30 items
--   Poker.org      200, 100 items
--   Upswing Poker  200, 10 items
--   Pokerfuse      404  - not seeded
--   PokerStrategy  404  - not seeded
--   HighstakesDB   301  - not seeded
-- Only feeds that answered are seeded, for the same reason the channel
-- registry only holds handles that resolve: a row that fails silently every
-- hour is worse than an absent one.

BEGIN;

ALTER TABLE public.content_sources
  ADD COLUMN IF NOT EXISTS feed_url text,
  ADD COLUMN IF NOT EXISTS fallback_urls text[];

COMMENT ON COLUMN public.content_sources.feed_url IS
  'RSS/Atom feed for kind = rss. content-health-check repairs this in place when the primary dies.';

INSERT INTO public.content_sources (domain, kind, name, feed_url, fallback_urls, category) VALUES
  ('poker','rss','PokerNews','https://www.pokernews.com/rss.php',
     ARRAY['https://www.pokernews.com/news.rss'],'news'),
  ('poker','rss','CardPlayer','https://www.cardplayer.com/poker-news.rss',
     ARRAY['https://www.cardplayer.com/rss/news.xml'],'news'),
  ('poker','rss','Poker.org','https://www.poker.org/feed', NULL,'news'),
  ('poker','rss','Upswing Poker News','https://upswingpoker.com/feed/', NULL,'strategy'),
  ('sports','rss','ESPN News','https://www.espn.com/espn/rss/news', NULL,'news'),
  ('sports','rss','ESPN NBA News','https://www.espn.com/espn/rss/nba/news', NULL,'news'),
  ('sports','rss','ESPN NFL News','https://www.espn.com/espn/rss/nfl/news', NULL,'news'),
  ('sports','rss','CBS Sports News','https://www.cbssports.com/rss/headlines/', NULL,'news')
ON CONFLICT (domain, name) DO UPDATE
  SET feed_url = EXCLUDED.feed_url,
      fallback_urls = EXCLUDED.fallback_urls,
      kind = EXCLUDED.kind;

DO $$
DECLARE v_poker int; v_sports int; v_nofeed int;
BEGIN
  SELECT count(*) INTO v_poker  FROM public.content_sources WHERE kind='rss' AND domain='poker'  AND is_active;
  SELECT count(*) INTO v_sports FROM public.content_sources WHERE kind='rss' AND domain='sports' AND is_active;
  SELECT count(*) INTO v_nofeed FROM public.content_sources WHERE kind='rss' AND feed_url IS NULL;
  IF v_poker < 4 THEN
    RAISE EXCEPTION 'content_sources: expected 4+ poker news feeds, found %', v_poker;
  END IF;
  IF v_nofeed <> 0 THEN
    RAISE EXCEPTION 'content_sources: % rss rows have no feed_url', v_nofeed;
  END IF;
  RAISE NOTICE 'news feeds registered: % poker, % sports', v_poker, v_sports;
END $$;

COMMIT;
