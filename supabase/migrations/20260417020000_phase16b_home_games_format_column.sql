-- ══════════════════════════════════════════════════════════════════════
--  PHASE 16B: HOME-GAME FORMAT (cash vs tournament)
-- ══════════════════════════════════════════════════════════════════════
--
--  Context: Dan's directive — "if a home game has tournaments, those
--  tournaments should be picked up and added to the Daily Tournaments
--  pages." The existing commander_home_games.game_type column stores
--  the poker VARIANT (nlh, plo, omaha8) — not the format. All 7
--  pre-existing home-game rows had game_type='nlh'; one of them had
--  "Tournament" in the title but nothing in the schema distinguished
--  it from a cash game.
--
--  WHAT THIS MIGRATION DOES
--
--    1. Adds `format` column (text, NOT NULL, DEFAULT 'cash') with a
--       CHECK constraint pinning it to 'cash' or 'tournament'.
--
--    2. Partial index on (format, scheduled_date) WHERE format =
--       'tournament' — makes the Daily Tournaments union query cheap.
--
--    3. Heuristic backfill: any existing row whose title contained
--       'tournament' / 'tourney' / 'freezeout' / 'freeze out' / 'MTT'
--       gets flipped to format='tournament'. Everything else stays
--       'cash' (the safer default).
--
--    STATUS-QUO NOTE
--
--    This migration is applied to production. Backfill result from
--    the migration run:
--      cash       = 6 games ("Game Night 1/2/3" x2 across the two groups)
--      tournament = 1 game ("Phase 4 Test — NLHE Tournament")
--
--    The Daily Tournaments API integration that consumes this column
--    (UNION of public_home_game_tournaments into the /api/poker/daily-
--    tournaments response) is a separate forthcoming patch.
--
--  INTENTIONAL SCOPE LIMITS
--
--    This migration does NOT:
--     - Add shadow rows to poker_venues (Phase 16A approach, reverted)
--     - Create commander_games / commander_seats for home games
--     - Touch any Club Commander venue-scoped tooling
--
--    Home groups remain in their own schema island. The Daily Tournaments
--    integration lives at the API layer via read-time join, no cross-
--    table FK writes.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE commander_home_games
    ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'cash'
    CHECK (format IN ('cash', 'tournament'));

CREATE INDEX IF NOT EXISTS idx_commander_home_games_format_date
    ON commander_home_games (format, scheduled_date)
    WHERE format = 'tournament';

-- Heuristic backfill: titles with tournament-specific terminology
UPDATE commander_home_games
   SET format = 'tournament'
 WHERE format = 'cash'
   AND (
        title ILIKE '%tournament%'
     OR title ILIKE '%tourney%'
     OR title ILIKE '%freezeout%'
     OR title ILIKE '%freeze out%'
     OR title ILIKE '%MTT%'
   );
