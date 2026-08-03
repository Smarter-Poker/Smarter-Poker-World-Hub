-- ═══════════════════════════════════════════════════════════════════════════
-- poker_venues.timezone — the missing column behind every wrong "Open Now" pill
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- src/components/poker-near-me/pnm-utils.js getOpenStatus() compares a room's
-- posted local hours against `new Date()` in the VIEWER's timezone. A New York
-- user looking at a Las Vegas room at 11pm ET sees "Closed" while the room
-- (8pm PT) is open, and the reverse hides rooms that are actually shut.
-- Every "Open Now" / "Closes at X" badge is wrong whenever the viewer and the
-- venue are in different zones — which, for a nationwide product, is most of
-- the time.
--
-- venue_daily_tournaments already has a `timezone` column (added in
-- 20260408_tournament_rich_fields.sql). poker_venues never got one, so venue
-- hours and tournament start times are evaluated inconsistently.
--
-- SAFETY
-- Additive only: one nullable column plus a best-effort backfill. Nothing is
-- dropped or rewritten, and NULL stays a valid value — the client is expected
-- to SUPPRESS the open/closed label when timezone is unknown rather than guess
-- (a wrong badge is worse than no badge).
--
-- The backfill keys on `state` only, which is correct for the 44 single-zone
-- states. The 6 split-zone states (FL, TX, KS, NE, ND, SD, MI, IN, KY, TN, OR,
-- ID) are LEFT NULL on purpose — those need a lon/lat-based pass, and guessing
-- there would reintroduce exactly the bug this fixes.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.poker_venues
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN public.poker_venues.timezone IS
  'IANA timezone (e.g. America/Los_Angeles). NULL = unknown; clients must suppress open/closed status rather than fall back to the viewer clock.';

-- ── Backfill: unambiguous single-timezone states only ───────────────────────
UPDATE public.poker_venues v
   SET timezone = m.tz
  FROM (VALUES
    -- Eastern
    ('CT','America/New_York'),('DE','America/New_York'),('DC','America/New_York'),
    ('GA','America/New_York'),('ME','America/New_York'),('MD','America/New_York'),
    ('MA','America/New_York'),('NH','America/New_York'),('NJ','America/New_York'),
    ('NY','America/New_York'),('NC','America/New_York'),('OH','America/New_York'),
    ('PA','America/New_York'),('RI','America/New_York'),('SC','America/New_York'),
    ('VT','America/New_York'),('VA','America/New_York'),('WV','America/New_York'),
    -- Central
    ('AL','America/Chicago'),('AR','America/Chicago'),('IL','America/Chicago'),
    ('IA','America/Chicago'),('LA','America/Chicago'),('MN','America/Chicago'),
    ('MS','America/Chicago'),('MO','America/Chicago'),('OK','America/Chicago'),
    ('WI','America/Chicago'),
    -- Mountain
    ('CO','America/Denver'),('MT','America/Denver'),('NM','America/Denver'),
    ('UT','America/Denver'),('WY','America/Denver'),
    ('AZ','America/Phoenix'),          -- no DST
    -- Pacific
    ('CA','America/Los_Angeles'),('NV','America/Los_Angeles'),
    ('WA','America/Los_Angeles'),
    -- Non-contiguous
    ('AK','America/Anchorage'),('HI','Pacific/Honolulu')
  ) AS m(state_code, tz)
 WHERE v.timezone IS NULL
   AND upper(trim(v.state)) = m.state_code;

-- Split-zone states deliberately excluded from the backfill above:
--   FL, TX, KS, NE, ND, SD, MI, IN, KY, TN, OR, ID
-- Resolve those from latitude/longitude in a follow-up pass; until then they
-- stay NULL and the UI shows no open/closed badge for them.

CREATE INDEX IF NOT EXISTS idx_poker_venues_timezone
  ON public.poker_venues (timezone)
  WHERE timezone IS NOT NULL;
