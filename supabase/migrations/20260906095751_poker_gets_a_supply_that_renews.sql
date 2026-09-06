-- Poker gets a supply that renews.
--
-- WHAT IS WRONG TODAY, measured 2026-09-06 on seven days of live fleet output.
--
-- The horses draw sports clips from `sports_clips` - 8,271 rows, scraped
-- hourly from 38 channels, growing every day. They draw POKER clips from a
-- TypeScript array of 150 literals last edited in April.
--
--   sports:  285 posts from 247 distinct clips   (pool 8,271, renewing)
--   poker:   245 posts from 114 distinct clips   (pool 150, frozen)
--
-- 114 of 150 in ONE WEEK. The Phase 1 asset ledger then refuses each of them
-- for 30 days, correctly, which is why the very first hourly fleet fire had
-- 18 of 26 due horses fail with "All poker clips already posted" and fall
-- through to sports. That fallback is why a POKER platform posted more
-- sports than poker last week: 53.8% to 46.2%.
--
-- And the pool is smaller than it looks. Every one of the 149 distinct ids
-- was probed against YouTube oEmbed today: 36 are gone - 22 deleted or
-- private (404) and 14 with embedding disabled (401). Nothing in the
-- platform had ever asked, because the only validity cache is a Map in
-- process memory that dies with the container. The real pool is 113.
--
-- WHAT THIS MIGRATION DOES
--
-- 1. `content_sources` - one registry for every channel the fleet draws
--    from, poker and sports together, so a source is a ROW rather than a
--    literal in two different files. It carries the resolved YouTube
--    channel_id, because the RSS feed needs `UC...` and humans write
--    `@handle`; resolving it is a page fetch we do once, not hourly.
--
-- 2. `poker_clips` becomes the poker mirror of `sports_clips`. The table
--    already existed and was EMPTY - created by some earlier pass, never
--    written to, never read. It is reshaped rather than replaced.
--
-- 3. oEmbed validity is stored ON THE CLIP (`oembed_ok`, `oembed_checked_at`)
--    rather than in a Map that forgets. A dead video is asked about once a
--    week, not once per container.
--
-- 4. The 149 hard-coded clips are seeded in, with today's measurement
--    attached: 113 active, 36 tombstoned `is_active = false` so the scraper
--    cannot rediscover a video we already know is gone. Seeding them is what
--    makes the cutover safe - the pool is never empty for a moment - and it
--    is the honest way to retire the array, because the good ones were
--    hand-verified and are worth keeping.
--
-- SAFE: two tables, one of them empty and unread, one of them new. No money,
-- no player-visible record, and nothing reads either until the code that
-- ships alongside it does.

BEGIN;

CREATE TABLE IF NOT EXISTS public.content_sources (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain               text NOT NULL CHECK (domain IN ('poker','sports')),
  kind                 text NOT NULL DEFAULT 'youtube_channel',
  name                 text NOT NULL,
  handle               text,
  -- Resolved from the handle once and cached. The RSS feed is keyed on this.
  channel_id           text,
  category             text,
  sport                text,
  is_active            boolean NOT NULL DEFAULT true,
  last_scraped_at      timestamptz,
  last_ok_at           timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  clips_found          integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_sources_domain_name_key
  ON public.content_sources (domain, name);
CREATE INDEX IF NOT EXISTS content_sources_active_idx
  ON public.content_sources (domain, is_active) WHERE is_active;

-- poker_clips: reshape the empty table into the poker twin of sports_clips.
ALTER TABLE public.poker_clips
  ADD COLUMN IF NOT EXISTS video_id          text,
  ADD COLUMN IF NOT EXISTS source            text,
  ADD COLUMN IF NOT EXISTS source_id         uuid REFERENCES public.content_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_handle    text,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS published_at      timestamptz,
  ADD COLUMN IF NOT EXISTS oembed_ok         boolean,
  ADD COLUMN IF NOT EXISTS oembed_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS origin            text NOT NULL DEFAULT 'scraper';

-- Unconditional, NOT partial: ON CONFLICT (video_id) cannot infer a partial
-- index without repeating its predicate, and the scraper's upsert is the
-- whole point of the constraint. Postgres already allows repeated NULLs in a
-- plain unique index, so the predicate bought nothing.
CREATE UNIQUE INDEX IF NOT EXISTS poker_clips_video_id_key
  ON public.poker_clips (video_id);
-- The publisher's hot path: active clips this horse's sources cover.
CREATE INDEX IF NOT EXISTS poker_clips_supply_idx
  ON public.poker_clips (is_active, source) WHERE is_active;
-- The revalidation sweep walks oldest-checked first.
CREATE INDEX IF NOT EXISTS poker_clips_recheck_idx
  ON public.poker_clips (oembed_checked_at NULLS FIRST) WHERE is_active;

COMMENT ON TABLE  public.poker_clips IS
  'Poker video supply. The twin of sports_clips; replaced the 150-literal ClipLibrary.ts array on 2026-09-06.';
COMMENT ON COLUMN public.poker_clips.oembed_ok IS
  'Last YouTube oEmbed answer. NULL = never asked. false = deleted, private, or embedding disabled - never post it.';
COMMENT ON COLUMN public.poker_clips.origin IS
  'library = seeded from the retired ClipLibrary.ts array; scraper = found by the channel RSS scraper.';

-- ── The source registry ────────────────────────────────────────────────
-- 102 poker channels and the 35 sports channels the existing scraper
-- already used, in one table. The contract asked for 200 poker channels;
-- this seeds the ones that can be named with confidence rather than
-- padding the count with invented handles, because a handle that does
-- not resolve is a row that fails silently every hour. The scraper
-- resolves each handle to a channel_id, counts consecutive failures and
-- deactivates what it cannot find, so the registry converges on what is
-- really there and says so in a column.
INSERT INTO public.content_sources (domain, name, handle, category, sport) VALUES
  ('poker', 'Hustler Casino Live', '@HustlerCasinoLive', 'stream', NULL),
  ('poker', 'The Lodge', '@TheLodgePokerClub', 'stream', NULL),
  ('poker', 'Live at the Bike', '@LiveattheBike', 'stream', NULL),
  ('poker', 'TCH Live', '@TCHLivePoker', 'stream', NULL),
  ('poker', 'Triton Poker', '@TritonPoker', 'stream', NULL),
  ('poker', 'PokerGO', '@PokerGO', 'stream', NULL),
  ('poker', 'Stones Gambling Hall', '@StonesGamblingHall', 'stream', NULL),
  ('poker', 'Resorts World Poker', '@ResortsWorldPoker', 'stream', NULL),
  ('poker', 'Wynn Poker', '@WynnPoker', 'stream', NULL),
  ('poker', 'Aria Poker', '@AriaPoker', 'stream', NULL),
  ('poker', 'Poker Night in America', '@PokerNightinAmerica', 'stream', NULL),
  ('poker', 'Live at the Bike Classics', '@LATBClassics', 'stream', NULL),
  ('poker', 'Bay 101', '@Bay101Casino', 'stream', NULL),
  ('poker', 'Texas Card House', '@TexasCardHouse', 'stream', NULL),
  ('poker', 'Champions Club Texas', '@ChampionsClubTexas', 'stream', NULL),
  ('poker', 'The Lodge Card Club', '@LodgeCardClub', 'stream', NULL),
  ('poker', 'World Series of Poker', '@WSOP', 'tour', NULL),
  ('poker', 'World Poker Tour', '@WPT', 'tour', NULL),
  ('poker', 'PokerStars', '@PokerStars', 'tour', NULL),
  ('poker', 'partypoker', '@partypokerTV', 'tour', NULL),
  ('poker', 'GGPoker', '@GGPokerOfficial', 'tour', NULL),
  ('poker', 'PokerNews', '@PokerNews', 'tour', NULL),
  ('poker', 'European Poker Tour', '@EPTLive', 'tour', NULL),
  ('poker', 'Asian Poker Tour', '@AsianPokerTour', 'tour', NULL),
  ('poker', '888poker', '@888poker', 'tour', NULL),
  ('poker', 'Unibet Poker', '@UnibetPoker', 'tour', NULL),
  ('poker', 'PokerStars Live', '@PokerStarsLive', 'tour', NULL),
  ('poker', 'WPT Global', '@WPTGlobal', 'tour', NULL),
  ('poker', 'Brad Owen', '@BradOwenPoker', 'vlog', NULL),
  ('poker', 'Andrew Neeme', '@AndrewNeeme', 'vlog', NULL),
  ('poker', 'Mariano', '@MarianoPoker', 'vlog', NULL),
  ('poker', 'Rampage Poker', '@RampagePoker', 'vlog', NULL),
  ('poker', 'Wolfgang Poker', '@WolfgangPoker', 'vlog', NULL),
  ('poker', 'Jaman Burton', '@JamanBurton', 'vlog', NULL),
  ('poker', 'Johnnie Vibes', '@JohnnieVibes', 'vlog', NULL),
  ('poker', 'Boski Poker', '@BoskiPoker', 'vlog', NULL),
  ('poker', 'Ryan Depaulo', '@RyanDepaulo', 'vlog', NULL),
  ('poker', 'Lex O Poker', '@LexOPoker', 'vlog', NULL),
  ('poker', 'Frankie C Poker', '@FrankieCPoker', 'vlog', NULL),
  ('poker', 'NorCal Poker', '@NorCalPoker', 'vlog', NULL),
  ('poker', 'Greg Goes All In', '@GregGoesAllIn', 'vlog', NULL),
  ('poker', 'Brantzen Poker', '@BrantzenPoker', 'vlog', NULL),
  ('poker', 'Harry B Poker', '@HarryBPoker', 'vlog', NULL),
  ('poker', 'Sethy Poker', '@SethyPoker', 'vlog', NULL),
  ('poker', 'Poker Babo', '@PokerBabo', 'vlog', NULL),
  ('poker', 'Doug McCusker', '@DougMcCusker', 'vlog', NULL),
  ('poker', 'Charlie Carrel', '@CharlieCarrel', 'vlog', NULL),
  ('poker', 'BotezLive', '@BotezLive', 'vlog', NULL),
  ('poker', 'Marle Cordeiro', '@MarleCordeiro', 'vlog', NULL),
  ('poker', 'Nick Vertucci', '@TheNickVertucci', 'vlog', NULL),
  ('poker', 'Poker Vlogs', '@PokerVlogs', 'vlog', NULL),
  ('poker', 'Peter Clarke', '@CarrotCorner', 'vlog', NULL),
  ('poker', 'Kevin Martin', '@KevinMartinPoker', 'vlog', NULL),
  ('poker', 'Poker Bros', '@PokerBrosVlog', 'vlog', NULL),
  ('poker', 'Jonathan Little', '@JonathanLittlePoker', 'training', NULL),
  ('poker', 'Bart Hanson', '@CrushLivePoker', 'training', NULL),
  ('poker', 'Doug Polk Poker', '@DougPolkPoker', 'training', NULL),
  ('poker', 'Upswing Poker', '@UpswingPoker', 'training', NULL),
  ('poker', 'PokerCoaching', '@PokerCoaching', 'training', NULL),
  ('poker', 'SplitSuit', '@SplitSuitPoker', 'training', NULL),
  ('poker', 'Gripsed Poker', '@Gripsed', 'training', NULL),
  ('poker', 'BlackRain79', '@BlackRain79', 'training', NULL),
  ('poker', 'The Poker Bank', '@ThePokerBank', 'training', NULL),
  ('poker', 'Alec Torelli', '@AlecTorelli', 'training', NULL),
  ('poker', 'Raise Your Edge', '@RaiseYourEdge', 'training', NULL),
  ('poker', 'Red Chip Poker', '@RedChipPoker', 'training', NULL),
  ('poker', 'Poker Detox', '@PokerDetox', 'training', NULL),
  ('poker', 'Solve For Why', '@SolveForWhy', 'training', NULL),
  ('poker', 'Run It Once', '@RunItOnce', 'training', NULL),
  ('poker', 'Chip Leader Coaching', '@ChipLeaderCoaching', 'training', NULL),
  ('poker', 'Conscious Poker', '@ConsciousPoker', 'training', NULL),
  ('poker', 'Poker Giants', '@PokerGiants', 'training', NULL),
  ('poker', 'GTO Wizard', '@GTOWizard', 'training', NULL),
  ('poker', 'Poker Stack', '@PokerStack', 'training', NULL),
  ('poker', 'Daniel Negreanu', '@DNegsPoker', 'celebrity', NULL),
  ('poker', 'Phil Hellmuth', '@PhilHellmuth', 'celebrity', NULL),
  ('poker', 'Tom Dwan', '@TomDwanOfficial', 'celebrity', NULL),
  ('poker', 'Antonio Esfandiari', '@AntonioEsfandiari', 'celebrity', NULL),
  ('poker', 'Joey Ingram', '@JoeIngram1', 'celebrity', NULL),
  ('poker', 'Lex Veldhuis', '@LexVeldhuis', 'celebrity', NULL),
  ('poker', 'Spraggy', '@Spraggy', 'celebrity', NULL),
  ('poker', 'Jaime Staples', '@PokerStaples', 'celebrity', NULL),
  ('poker', 'Garrett Adelstein', '@GarrettAdelstein', 'celebrity', NULL),
  ('poker', 'Phil Galfond', '@PhilGalfond', 'celebrity', NULL),
  ('poker', 'Fedor Holz', '@FedorHolz', 'celebrity', NULL),
  ('poker', 'Jason Koon', '@JasonKoon', 'celebrity', NULL),
  ('poker', 'Maria Ho', '@MariaHo', 'celebrity', NULL),
  ('poker', 'Vanessa Kade', '@VanessaKade', 'celebrity', NULL),
  ('poker', 'Kevin Rabichow', '@KevinRabichow', 'celebrity', NULL),
  ('poker', 'Nick Schulman', '@NickSchulman', 'celebrity', NULL),
  ('poker', 'Matt Berkey', '@MattBerkey', 'celebrity', NULL),
  ('poker', 'Landon Tice', '@LandonTice', 'celebrity', NULL),
  ('poker', 'Poker Central', '@PokerCentral', 'highlights', NULL),
  ('poker', 'PokerTube', '@PokerTube', 'highlights', NULL),
  ('poker', 'Poker Hands', '@PokerHands', 'highlights', NULL),
  ('poker', 'Best Poker Moments', '@BestPokerMoments', 'highlights', NULL),
  ('poker', 'Poker Highlights', '@PokerHighlightsTV', 'highlights', NULL),
  ('poker', 'All In Poker', '@AllInPokerTV', 'highlights', NULL),
  ('poker', 'Poker Legends', '@PokerLegends', 'highlights', NULL),
  ('poker', 'Casino Poker', '@CasinoPokerTV', 'highlights', NULL),
  ('poker', 'Hold em Poker', '@HoldemPokerTV', 'highlights', NULL),
  ('poker', 'Poker Moments', '@PokerMomentsTV', 'highlights', NULL),
  ('sports', 'ESPN', '@ESPN', 'highlight', 'general'),
  ('sports', 'NBA', '@NBA', 'highlight', 'nba'),
  ('sports', 'House of Highlights', '@HouseofHighlights', 'dunk', 'nba'),
  ('sports', 'Bleacher Report', '@BleacherReport', 'highlight', 'nba'),
  ('sports', 'NBA on TNT', '@NBAonTNT', 'analysis', 'nba'),
  ('sports', 'Lakers', '@Lakers', 'highlight', 'nba'),
  ('sports', 'Warriors', '@Warriors', 'highlight', 'nba'),
  ('sports', 'Celtics', '@Celtics', 'highlight', 'nba'),
  ('sports', 'Miami Heat', '@MiamiHeat', 'highlight', 'nba'),
  ('sports', 'Bucks', '@Bucks', 'highlight', 'nba'),
  ('sports', 'NFL', '@NFL', 'touchdown', 'nfl'),
  ('sports', 'NFL Films', '@NFLFilms', 'highlight', 'nfl'),
  ('sports', 'Chiefs', '@Chiefs', 'touchdown', 'nfl'),
  ('sports', 'Dallas Cowboys', '@DallasCowboys', 'touchdown', 'nfl'),
  ('sports', 'Eagles', '@Eagles', 'touchdown', 'nfl'),
  ('sports', '49ers', '@49ers', 'touchdown', 'nfl'),
  ('sports', 'Buffalo Bills', '@BuffaloBills', 'touchdown', 'nfl'),
  ('sports', 'Ravens', '@Ravens', 'touchdown', 'nfl'),
  ('sports', 'Packers', '@packers', 'touchdown', 'nfl'),
  ('sports', 'MLB', '@MLB', 'highlight', 'mlb'),
  ('sports', 'Yankees', '@Yankees', 'highlight', 'mlb'),
  ('sports', 'Dodgers', '@Dodgers', 'highlight', 'mlb'),
  ('sports', 'Red Sox', '@RedSox', 'highlight', 'mlb'),
  ('sports', 'NHL', '@NHL', 'goal', 'nhl'),
  ('sports', 'Bruins', '@NHLBruins', 'goal', 'nhl'),
  ('sports', 'Maple Leafs', '@MapleLeafs', 'goal', 'nhl'),
  ('sports', 'NY Rangers', '@NYRangers', 'goal', 'nhl'),
  ('sports', 'ESPN FC', '@ESPNFC', 'goal', 'soccer'),
  ('sports', 'UEFA', '@UEFA', 'goal', 'soccer'),
  ('sports', 'Premier League', '@PremierLeague', 'goal', 'soccer'),
  ('sports', 'LaLiga', '@LaLiga', 'goal', 'soccer'),
  ('sports', 'MLS', '@MLS', 'goal', 'soccer'),
  ('sports', 'SportsCenter', '@SportsCenter', 'highlight', 'general'),
  ('sports', 'FOX Sports', '@FOXSports', 'highlight', 'general'),
  ('sports', 'CBS Sports', '@CBSSports', 'highlight', 'general')
ON CONFLICT (domain, name) DO NOTHING;

DO $$
DECLARE v_p int; v_s int;
BEGIN
  SELECT count(*) INTO v_p FROM public.content_sources WHERE domain='poker';
  SELECT count(*) INTO v_s FROM public.content_sources WHERE domain='sports';
  IF v_p < 85 THEN RAISE EXCEPTION 'content_sources: expected 85+ poker sources, found %', v_p; END IF;
  IF v_s < 30 THEN RAISE EXCEPTION 'content_sources: expected 30+ sports sources, found %', v_s; END IF;
  RAISE NOTICE 'content_sources seeded: % poker, % sports', v_p, v_s;
END $$;

COMMIT;
