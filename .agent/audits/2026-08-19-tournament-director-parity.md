# 2026-08-19 - Club Commander Tournament Director Parity Overhaul

Session goal (Dan): line-by-line deep dive of all Club Commander tournament
features, fix and build toward 1:1 functional parity with PokerAtlas
TableCaptain tournament director + tournament building/display. Plus two
binding style rules applied throughout Club Commander: First Letter Of Every
Word Capitalized in user-visible text, and no em dashes anywhere.

## Database (production, project kuklfnapbkmacvwxktbh)

Applied via Supabase MCP apply_migration and committed as
supabase/migrations/20260819120000_tournament_director_parity_constraints_and_clock_rpc.sql:

1. commander_tournament_entries.status CHECK now includes 'alternate' and
   'cashed'. Code emitted both; inserts/updates were failing silently.
2. commander_tournaments.tournament_type CHECK now includes 'pko' and
   'deepstack'. The archived 20260215 pko migration was never applied to
   production (verified live before altering).
3. New RPC commander_clock_write(p_tournament_id, p_clock_state, p_updates):
   atomic jsonb_set of settings.clock_state plus optional
   status/current_level/actual_start/ended_at, returns the updated row.
   Eliminates the lost-update race when two TD tablets write clock state.
   EXECUTE revoked from anon/authenticated (service role only).

## World Hub changes (this repo)

- pages/api/commander/tournaments/[[...path]].js (new): hardened catch-all
  proxy to https://commander.smarter.poker/api/tournaments/*. The player
  tournament pages called /api/commander/tournaments/* which had no
  filesystem route after the commander extraction; fetch failures were
  swallowed by .catch wrappers so players saw permanently empty lists.
  Proxy forwards Authorization only (never cookies or x-staff-session),
  10s timeout, rate limited, path segments shape-validated.
- vendor/commander-shared/src/lib/commander/icm-utils.js: replaced with the
  corrected Malmuth-Harville implementation from the commander repo (the
  shared version produced non-probabilities for 4th place and deeper).
- Player pages (pages/hub/commander/tournament*, pages/hub/my-tournaments.js):
  break-aware level display, duration_minutes fallbacks, null-safe money
  rendering, registration response shape fix (data.data.entry), Title Case
  and em dash sweep.
- Em dash sweep across pages/hub/commander/**, pages/api/commander/**,
  src/components/commander/**, vendor/commander-shared/src/**.

## Commander repo changes (Smarter-Poker/smarter-poker-commander)

Full detail appended to that repo's MIGRATION_LEDGER.md. Highlights: atomic
clock writes via the new RPC; floor-view GET staff-gated (was public and
leaked player names/phones/chips); break-aware level numbering everywhere
(structure arrays interleave break rows, so index+1 overstated the level);
prize pool = max(collected, guarantee) with overlay surfaced; payout table
generator with exact-sum rounding; elimination race guards; auto-break fixes
including the commander_tables release bug (updated_at is not a column, so
broken tables were never returned to the pool); Tournament Director nav
entry; repo-wide Title Case + em dash sweep.

## Verification

- All modified files parse-checked with esbuild (Linux binary): 369 files in
  the commander repo, all WH commander-scope files, zero failures.
- Migration pre-flight and post-apply assertions ran inside the migration
  (DO blocks) and passed.
- Zero em dashes remain in either repo's commander code (grep-verified).

## Deferred / follow-ups

- entries.js DELETE hard-deletes rows while register.js DELETE cancels;
  unify later (design decision).
- Atomic finish-position assignment RPC if simultaneous multi-table busts
  become common.
- 'bagged' (multi-day) entries are not counted as remaining anywhere;
  coordinated change needed across clock/eliminate/balance if multi-day
  bagging must affect finish positions.
- Leaderboards/points/templates tables still have zero production rows;
  wiring leaderboard_id to tournaments remains a product decision.
