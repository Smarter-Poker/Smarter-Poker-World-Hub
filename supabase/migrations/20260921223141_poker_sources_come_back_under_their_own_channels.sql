-- ═══════════════════════════════════════════════════════════════════════
-- poker_sources_come_back_under_their_own_channels
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data repair on public.content_sources; no schema change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 4
-- AFFECTS:     public.content_sources rows named below (domain 'poker'), nothing else
-- IRREVERSIBLE: no (rollback block at the end restores the observed state)
--
-- WHY:
--   Two defects in /cron/scrape-poker-clips retired live poker sources, and
--   the registry carried channel ids that a correct scraper cannot fix:
--   * every 05:20 UTC run from 2026-09-08 read zero videos (YouTube does not
--     answer the worker's address at that hour) and each empty read was
--     charged to the channel; a good read never cleared the charge, so live
--     channels walked to six "consecutive" failures and were retired
--     (47 -> 35 -> 28 active, 2026-09-18..20). Fixed in workers #141.
--   * the channel walk had no kind filter, so the four poker news feeds
--     (no handle, no channel id) were charged and retired 2026-09-13..15,
--     leaving poker news with no source. Fixed in workers #142.
--   * 20 rows stored a channel id other than the one the source's own
--     handle names. Some pointed at a different creator entirely (Andrew
--     Neeme held Poker At The Lodge, Red Chip Poker held The Poker Bank,
--     World Series of Poker held GGPoker, Hustler Casino Live held a
--     highlights re-upload channel), others at a regional, clips, podcast or
--     long-dormant channel (PokerStars held PokerStars Brasil; Alec Torelli
--     and Conscious Poker held each other's). The registry named one channel
--     and fed another's videos. A 21st, PokerGO Sport, has a handle that does
--     not exist and carries PokerStars' channel.
--   Both scraper fixes are live since 2026-09-20 14:44 UTC; the 2026-09-21
--   05:20 run met the same blocked shape and retired nothing.
--
-- EVIDENCE (retained under agent-evidence/fleet-p6-closeout-20260920/):
--   identity/audit.tsv: every poker handle fetched on 2026-09-20 from the
--   owner's Mac, whose address YouTube answers; og:url gives the channel the
--   handle itself names, its Atom feed gives author and newest upload.
--   rss/ and a re-check on 2026-09-21 22:2x UTC: all four news feeds HTTP 200,
--   10..100 items, newest 2026-09-18..21.
--
-- HOW (plain English):
--   A. switch the four poker news feeds back on.
--   B. switch back on 9 channels whose stored id is right and which posted
--      inside the scraper's own 540-day dormancy rule.
--   C. give 14 retired channels the id their own handle resolves to, then
--      switch them back on.
--   D. give 6 active channels the id their own handle resolves to.
--   E. switch off "PokerGO Sport" (handle does not exist; its channel is
--      PokerStars' own, which the PokerStars row now holds).
--   Rows are keyed by their natural key (domain, name) AND their exact prior
--   state; the pre-flight block refuses to run at all unless every row is as
--   observed, so a row that moved since the evidence was taken stops the
--   whole repair instead of being overwritten.
--   Kept off on evidence: 30 handles that do not exist on YouTube,
--   @PokerCentral and @WPT (now owned by unrelated personal channels),
--   @RyanDepaulo (unrelated empty channel), partypoker (empty feed),
--   PokerCoaching.com and Raise Your Edge Poker (duplicates of active rows),
--   and channels whose newest upload is older than 540 days.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: every row must be exactly as observed, or nothing runs.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND kind = 'rss' AND is_active = false AND consecutive_failures >= 6
     AND name IN ('CardPlayer', 'Poker.org', 'PokerNews', 'Upswing Poker News');
  IF n <> 4 THEN RAISE EXCEPTION 'pre-flight A: expected 4 retired poker news feeds, found %', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND kind = 'youtube_channel' AND is_active = false AND consecutive_failures >= 6
     AND name IN ('Bart Hanson', 'Frankie C Poker', 'Greg Goes All In', 'Lex O Poker', 'Mariano', 'Phil Galfond', 'PokerGO', 'Texas Card House', 'PokerTube');
  IF n <> 9 THEN RAISE EXCEPTION 'pre-flight B: expected 9 retired channels, found %', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources s
    JOIN (VALUES
    ('Andrew Neeme', 'UCbkK3nFzsxy6FzT5kvKoVNg'),
    ('Brad Owen', 'UC_jHs8JAxkS045CTIEw7AyA'),
    ('GTO Wizard', 'UCFJMUGsjKsEQB8T0zqPbJ2Q'),
    ('Hustler Casino Live', 'UCOYjui_6iH-ab2MDG6uooiQ'),
    ('Jaime Staples', 'UCTiJxFuhWS1zZSUoHc25mIA'),
    ('Johnnie Vibes', 'UCPU_UTugG-xd7l0_dof1k4w'),
    ('PokerStars', 'UCs-CetFjsbmnX5vna43DO9Q'),
    ('Rampage Poker', 'UC6Ro3yQo7LJqZDQqhaVHsEQ'),
    ('Red Chip Poker', 'UCLYzd2pigivfbl2OpYq1Vxg'),
    ('TCH Live', 'UCVJOqvsRGwS3n605Wu_ktQA'),
    ('Triton Poker', 'UC2H8zWjiEEwkR8C3sBAF91w'),
    ('Spraggy', 'UCa859QYNRulz8WfsSf3M-xQ'),
    ('Doug Polk Poker', 'UCUdd8GiFOGgNYeYsq8--GFw'),
    ('Joey Ingram', 'UCpgbFBBcSo_sXumi4_gKCDA')
    ) AS v(name, old_id) ON s.name = v.name AND s.channel_id = v.old_id
   WHERE s.domain = 'poker' AND s.kind = 'youtube_channel' AND s.is_active = false;
  IF n <> 14 THEN RAISE EXCEPTION 'pre-flight C: expected 14 retired channels on their old ids, found %', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources s
    JOIN (VALUES
    ('Alec Torelli', 'UCGCThbGQdVNe1llymw3-pxQ'),
    ('Conscious Poker', 'UCayGIuyrj-2BifUsy6iuvLg'),
    ('BotezLive', 'UCvktw2yF_rkJRNO9fyT-_KQ'),
    ('Daniel Negreanu', 'UCc_brWLjhCCgu4WV_Rf9gRQ'),
    ('Raise Your Edge', 'UCUlMp_wTWqCH5ddSakUIKEQ'),
    ('World Series of Poker', 'UCJPnb9ricOOYLFSlotSfOng')
    ) AS v(name, old_id) ON s.name = v.name AND s.channel_id = v.old_id
   WHERE s.domain = 'poker' AND s.kind = 'youtube_channel' AND s.is_active = true;
  IF n <> 6 THEN RAISE EXCEPTION 'pre-flight D: expected 6 active channels on their old ids, found %', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND name = 'PokerGO Sport' AND channel_id = 'UCGWkDcYbDKP9r--ym28YwAQ' AND is_active = true;
  IF n <> 1 THEN RAISE EXCEPTION 'pre-flight E: expected PokerGO Sport active on PokerStars'' channel, found %', n; END IF;
END $$;

-- 2. THE CHANGES

-- A. The four poker news feeds.
UPDATE public.content_sources
   SET is_active = true, consecutive_failures = 0, updated_at = now()
 WHERE domain = 'poker' AND kind = 'rss' AND is_active = false AND consecutive_failures >= 6
   AND name IN ('CardPlayer', 'Poker.org', 'PokerNews', 'Upswing Poker News');

-- B. Right channel, retired by the never-reset count.
UPDATE public.content_sources
   SET is_active = true, consecutive_failures = 0, updated_at = now()
 WHERE domain = 'poker' AND kind = 'youtube_channel' AND is_active = false AND consecutive_failures >= 6
   AND name IN ('Bart Hanson', 'Frankie C Poker', 'Greg Goes All In', 'Lex O Poker', 'Mariano', 'Phil Galfond', 'PokerGO', 'Texas Card House', 'PokerTube');

-- C. Wrong channel, retired: corrected to the channel the source's own handle names, then restored.
UPDATE public.content_sources s
   SET channel_id = v.new_id, is_active = true, consecutive_failures = 0, updated_at = now()
  FROM (VALUES
    ('Andrew Neeme', 'UCbkK3nFzsxy6FzT5kvKoVNg', 'UCLTP4Ns4v8EsVS0DVGugQrQ'), -- was Poker At The Lodge
    ('Brad Owen', 'UC_jHs8JAxkS045CTIEw7AyA', 'UCxYljUelq6VBk4m8dM-7NVA'), -- was Brad Owen Clips
    ('GTO Wizard', 'UCFJMUGsjKsEQB8T0zqPbJ2Q', 'UCXSg1srGpJ67HuPTMm4w72g'), -- was GTOWizard RU
    ('Hustler Casino Live', 'UCOYjui_6iH-ab2MDG6uooiQ', 'UCQe7wB0o_cZgv1miyYB9TMA'), -- was High Stakes Highlights
    ('Jaime Staples', 'UCTiJxFuhWS1zZSUoHc25mIA', 'UC7tffpR__YXghv3ypgpE7fg'), -- his older channel; @PokerStaples is the one he posts on
    ('Johnnie Vibes', 'UCPU_UTugG-xd7l0_dof1k4w', 'UC-1p67FDUSX3rTc2C3gOi8w'), -- was SKILL GAME Poker
    ('PokerStars', 'UCs-CetFjsbmnX5vna43DO9Q', 'UCGWkDcYbDKP9r--ym28YwAQ'), -- was PokerStars Brasil
    ('Rampage Poker', 'UC6Ro3yQo7LJqZDQqhaVHsEQ', 'UCToA-j1kPYHmllFVQ5k2rYg'), -- was his personal channel
    ('Red Chip Poker', 'UCLYzd2pigivfbl2OpYq1Vxg', 'UCv11QCJcfwKDlJ4b66VNecQ'), -- was The Poker Bank
    ('TCH Live', 'UCVJOqvsRGwS3n605Wu_ktQA', 'UCLb2c-d9mNgI5bdsgvYW5ow'), -- was Best TCH Poker Hands
    ('Triton Poker', 'UC2H8zWjiEEwkR8C3sBAF91w', 'UCpcv404DxfhGYhXgyB9Aoeg'), -- was Triton One
    ('Spraggy', 'UCa859QYNRulz8WfsSf3M-xQ', 'UCQi9iHHEqiWDgW83iJN0uxw'), -- was a dormant channel
    ('Doug Polk Poker', 'UCUdd8GiFOGgNYeYsq8--GFw', 'UCyI7FNTudkyALBh9N7hwI9Q'), -- was a dormant channel
    ('Joey Ingram', 'UCpgbFBBcSo_sXumi4_gKCDA', 'UCLNWyduFVhxjj0r1tPrE_-A') -- was a dormant channel
  ) AS v(name, old_id, new_id)
 WHERE s.domain = 'poker' AND s.kind = 'youtube_channel' AND s.is_active = false
   AND s.name = v.name AND s.channel_id = v.old_id;

-- D. Wrong channel, active: corrected. Their failure counts were accumulated
--    by the old never-reset rule, so they restart at 0.
UPDATE public.content_sources s
   SET channel_id = v.new_id, consecutive_failures = 0, updated_at = now()
  FROM (VALUES
    ('Alec Torelli', 'UCGCThbGQdVNe1llymw3-pxQ', 'UCayGIuyrj-2BifUsy6iuvLg'), -- held Conscious Poker's channel
    ('Conscious Poker', 'UCayGIuyrj-2BifUsy6iuvLg', 'UCGCThbGQdVNe1llymw3-pxQ'), -- held Alec Torelli's channel
    ('BotezLive', 'UCvktw2yF_rkJRNO9fyT-_KQ', 'UCAn8NrZ-J4CRfwodajqFYoQ'), -- was Botez Sisters Podcast
    ('Daniel Negreanu', 'UCc_brWLjhCCgu4WV_Rf9gRQ', 'UC0w4AA42ItXQEb9aZld87-w'), -- was The MANIA Podcast
    ('Raise Your Edge', 'UCUlMp_wTWqCH5ddSakUIKEQ', 'UCEN-gXxV3gi049oJFRi63hA'), -- was an unrelated personal channel
    ('World Series of Poker', 'UCJPnb9ricOOYLFSlotSfOng', 'UC9m6fb3RXf-W90fH3KkZAJw') -- was GGPoker
  ) AS v(name, old_id, new_id)
 WHERE s.domain = 'poker' AND s.kind = 'youtube_channel' AND s.is_active = true
   AND s.name = v.name AND s.channel_id = v.old_id;

-- E. PokerGO Sport: a handle that does not exist, carrying PokerStars' channel.
UPDATE public.content_sources
   SET is_active = false, updated_at = now()
 WHERE domain = 'poker' AND name = 'PokerGO Sport'
   AND channel_id = 'UCGWkDcYbDKP9r--ym28YwAQ' AND is_active = true;

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND kind = 'rss' AND is_active = true AND consecutive_failures = 0
     AND name IN ('CardPlayer', 'Poker.org', 'PokerNews', 'Upswing Poker News');
  IF n <> 4 THEN RAISE EXCEPTION 'post-apply A: % of 4 news feeds active', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND name IN ('Bart Hanson', 'Frankie C Poker', 'Greg Goes All In', 'Lex O Poker', 'Mariano', 'Phil Galfond', 'PokerGO', 'Texas Card House', 'PokerTube') AND is_active = true AND consecutive_failures = 0;
  IF n <> 9 THEN RAISE EXCEPTION 'post-apply B: % of 9 channels restored', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources s
    JOIN (VALUES
    ('Andrew Neeme', 'UCLTP4Ns4v8EsVS0DVGugQrQ'),
    ('Brad Owen', 'UCxYljUelq6VBk4m8dM-7NVA'),
    ('GTO Wizard', 'UCXSg1srGpJ67HuPTMm4w72g'),
    ('Hustler Casino Live', 'UCQe7wB0o_cZgv1miyYB9TMA'),
    ('Jaime Staples', 'UC7tffpR__YXghv3ypgpE7fg'),
    ('Johnnie Vibes', 'UC-1p67FDUSX3rTc2C3gOi8w'),
    ('PokerStars', 'UCGWkDcYbDKP9r--ym28YwAQ'),
    ('Rampage Poker', 'UCToA-j1kPYHmllFVQ5k2rYg'),
    ('Red Chip Poker', 'UCv11QCJcfwKDlJ4b66VNecQ'),
    ('TCH Live', 'UCLb2c-d9mNgI5bdsgvYW5ow'),
    ('Triton Poker', 'UCpcv404DxfhGYhXgyB9Aoeg'),
    ('Spraggy', 'UCQi9iHHEqiWDgW83iJN0uxw'),
    ('Doug Polk Poker', 'UCyI7FNTudkyALBh9N7hwI9Q'),
    ('Joey Ingram', 'UCLNWyduFVhxjj0r1tPrE_-A')
    ) AS v(name, new_id) ON s.name = v.name AND s.channel_id = v.new_id
   WHERE s.domain = 'poker' AND s.is_active = true AND s.consecutive_failures = 0;
  IF n <> 14 THEN RAISE EXCEPTION 'post-apply C: % of 14 channels corrected and restored', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources s
    JOIN (VALUES
    ('Alec Torelli', 'UCayGIuyrj-2BifUsy6iuvLg'),
    ('Conscious Poker', 'UCGCThbGQdVNe1llymw3-pxQ'),
    ('BotezLive', 'UCAn8NrZ-J4CRfwodajqFYoQ'),
    ('Daniel Negreanu', 'UC0w4AA42ItXQEb9aZld87-w'),
    ('Raise Your Edge', 'UCEN-gXxV3gi049oJFRi63hA'),
    ('World Series of Poker', 'UC9m6fb3RXf-W90fH3KkZAJw')
    ) AS v(name, new_id) ON s.name = v.name AND s.channel_id = v.new_id
   WHERE s.domain = 'poker' AND s.is_active = true AND s.consecutive_failures = 0;
  IF n <> 6 THEN RAISE EXCEPTION 'post-apply D: % of 6 active channels corrected', n; END IF;

  SELECT count(*) INTO n FROM public.content_sources
   WHERE domain = 'poker' AND name = 'PokerGO Sport' AND is_active = false;
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply E: PokerGO Sport still active'; END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a new _revert_ migration to restore the observed state)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE public.content_sources SET is_active = false, consecutive_failures = 6, updated_at = now()
--  WHERE domain = 'poker' AND kind = 'rss' AND name IN ('CardPlayer', 'Poker.org', 'PokerNews', 'Upswing Poker News');
-- UPDATE public.content_sources SET is_active = false, consecutive_failures = 6, updated_at = now()
--  WHERE domain = 'poker' AND name IN ('Bart Hanson', 'Frankie C Poker', 'Greg Goes All In', 'Lex O Poker', 'Mariano', 'Phil Galfond', 'PokerGO', 'Texas Card House', 'PokerTube');
-- UPDATE public.content_sources s SET channel_id = v.old_id, is_active = false, consecutive_failures = 6, updated_at = now()
--   FROM (VALUES ('Andrew Neeme', 'UCbkK3nFzsxy6FzT5kvKoVNg'), ('Brad Owen', 'UC_jHs8JAxkS045CTIEw7AyA'), ('GTO Wizard', 'UCFJMUGsjKsEQB8T0zqPbJ2Q'), ('Hustler Casino Live', 'UCOYjui_6iH-ab2MDG6uooiQ'), ('Jaime Staples', 'UCTiJxFuhWS1zZSUoHc25mIA'), ('Johnnie Vibes', 'UCPU_UTugG-xd7l0_dof1k4w'), ('PokerStars', 'UCs-CetFjsbmnX5vna43DO9Q'), ('Rampage Poker', 'UC6Ro3yQo7LJqZDQqhaVHsEQ'), ('Red Chip Poker', 'UCLYzd2pigivfbl2OpYq1Vxg'), ('TCH Live', 'UCVJOqvsRGwS3n605Wu_ktQA'), ('Triton Poker', 'UC2H8zWjiEEwkR8C3sBAF91w'), ('Spraggy', 'UCa859QYNRulz8WfsSf3M-xQ'), ('Doug Polk Poker', 'UCUdd8GiFOGgNYeYsq8--GFw'), ('Joey Ingram', 'UCpgbFBBcSo_sXumi4_gKCDA')) AS v(name, old_id)
--  WHERE s.domain = 'poker' AND s.name = v.name;
-- UPDATE public.content_sources s SET channel_id = v.old_id, updated_at = now()
--   FROM (VALUES ('Alec Torelli', 'UCGCThbGQdVNe1llymw3-pxQ'), ('Conscious Poker', 'UCayGIuyrj-2BifUsy6iuvLg'), ('BotezLive', 'UCvktw2yF_rkJRNO9fyT-_KQ'), ('Daniel Negreanu', 'UCc_brWLjhCCgu4WV_Rf9gRQ'), ('Raise Your Edge', 'UCUlMp_wTWqCH5ddSakUIKEQ'), ('World Series of Poker', 'UCJPnb9ricOOYLFSlotSfOng')) AS v(name, old_id)
--  WHERE s.domain = 'poker' AND s.name = v.name;
-- UPDATE public.content_sources SET is_active = true, updated_at = now() WHERE domain = 'poker' AND name = 'PokerGO Sport';
-- COMMIT;
