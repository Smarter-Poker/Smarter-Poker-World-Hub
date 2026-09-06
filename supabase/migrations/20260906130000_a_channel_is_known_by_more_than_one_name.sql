-- A channel is known by more than one name.
--
-- The video library calls a channel "WSOP"; the source registry calls it
-- "World Series of Poker". Same channel, and the join between them is on the
-- name, so 106 poker videos sat unusable behind a spelling. Also
-- "JohnnieVibes" against "Johnnie Vibes" (35 videos) and "EPT Poker" against
-- "European Poker Tour" (31). 172 videos, blocked by punctuation.
--
-- Renaming one side to match the other only moves the problem to the next
-- system that spells it differently. An `aliases` array lets a source answer
-- to every name it is known by, and the join asks the registry rather than
-- hoping two independent scrapers agreed.
--
-- Three genuinely new poker channels are added at the same time - Next Gen
-- Poker (80 videos), Bally Poker Live (25), Phil Ivey (4). These are not
-- guesses: they are already in `video_library_videos` with videos, which is
-- proof the channel exists and publishes.
--
-- WHAT IS DELIBERATELY NOT ADDED. The library also carries slots channels -
-- Brian Christopher Slots, Lady Luck HQ, The Big Jackpot, Vegas Low Roller,
-- Slot Queen, The Slot Cats, NickSlots, CasinoDaddy, 495 videos between them.
-- They stay out. A slots pull in a poker horse's feed is exactly the off-key
-- content this phase exists to stop, and the registry is where that line is
-- drawn: a source is poker because a row says so.

BEGIN;

ALTER TABLE public.content_sources
  ADD COLUMN IF NOT EXISTS aliases text[];

COMMENT ON COLUMN public.content_sources.aliases IS
  'Other names this channel is known by in other systems (e.g. video_library_videos.source_name). Joins match name OR any alias.';

CREATE INDEX IF NOT EXISTS content_sources_aliases_idx
  ON public.content_sources USING gin (aliases);

UPDATE public.content_sources SET aliases = ARRAY['WSOP']            WHERE domain='poker' AND name='World Series of Poker';
UPDATE public.content_sources SET aliases = ARRAY['JohnnieVibes']    WHERE domain='poker' AND name='Johnnie Vibes';
UPDATE public.content_sources SET aliases = ARRAY['EPT Poker','EPT'] WHERE domain='poker' AND name='European Poker Tour';
UPDATE public.content_sources SET aliases = ARRAY['WPT']             WHERE domain='poker' AND name='World Poker Tour';
UPDATE public.content_sources SET aliases = ARRAY['HCL']             WHERE domain='poker' AND name='Hustler Casino Live';
UPDATE public.content_sources SET aliases = ARRAY['LATB']            WHERE domain='poker' AND name='Live at the Bike';
UPDATE public.content_sources SET aliases = ARRAY['TCH']             WHERE domain='poker' AND name='TCH Live';

INSERT INTO public.content_sources (domain, kind, name, handle, category) VALUES
  ('poker','youtube_channel','Next Gen Poker','@NextGenPoker','vlog'),
  ('poker','youtube_channel','Bally Poker Live','@BallyPokerLive','stream'),
  ('poker','youtube_channel','Phil Ivey','@PhilIveyOfficial','celebrity')
ON CONFLICT (domain, name) DO NOTHING;

DO $$
DECLARE v_aliased int;
BEGIN
  SELECT count(*) INTO v_aliased FROM public.content_sources WHERE aliases IS NOT NULL;
  IF v_aliased < 7 THEN
    RAISE EXCEPTION 'content_sources: expected 7+ aliased sources, found %', v_aliased;
  END IF;
  RAISE NOTICE 'aliases set on % sources', v_aliased;
END $$;

COMMIT;
