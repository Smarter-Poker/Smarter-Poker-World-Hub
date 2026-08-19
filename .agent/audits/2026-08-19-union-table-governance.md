# 2026-08-19 — Union table governance, restart, and weekly player P&L billing

## TL;DR

Dan's hard rule shipped end-to-end: **a club inside a union plays only on
union-created tables/tournaments.** All open cash tables were closed with full
refunds and recreated by the fleet under union ownership. Clubs keep the right
to run **private club games** (`is_private = true`, visible only inside their
own club, never the union lobby). Weekly billing now squares **player
wins/losses** between each club and its union on top of the existing
90/10 rake settlement. Two production data bugs were found and fixed along the
way (JAQK's broken union link; a corrupt orphan table).

## Root causes found

1. **Club JAQK's `clubs.union_id` mirror was NULL** while `union_clubs` said it
   was in Midway Union. Rake routing keys off `clubs.union_id`, so JAQK's rake
   went to its own treasury instead of the union `rake_wallet`, and every JAQK
   tournament was created club-scoped. This is very likely "the big bug".
2. **Orphan table `68c94447`** was running with 6 seated players carrying the
   union id in `club_id` and `union_id = NULL` — invisible to union views,
   unattributable for billing.
3. **10 RUNNING + 1 REGISTERING tournaments** hosted by union clubs carried no
   `union_id` (the recurring service never stamped it; JAQK's ones couldn't be
   stamped because of bug 1).
4. **`/api/club-arena/create-table` had no union guard** — the SPA blocked
   union clubs but the API did not; no DB-level enforcement existed.
5. **Player win/loss settlement was not implemented**: `settle-period.js` wrote
   `total_player_winnings: 0, total_player_losses: 0` hardcoded.

## What shipped

### Supabase (applied via MCP, files under `supabase/migrations/20260819_union_*.sql`)

- `union_table_governance` — `tournaments.is_private`,
  `settlement_periods.seated_stack_snapshot`; `trg_union_clubs_sync_mirror`
  keeps `clubs.union_id` synced from `union_clubs` (repaired JAQK);
  `trg_tables_union_ownership` / `trg_tournaments_union_ownership` auto-stamp
  `union_id` on every non-private insert from a union club and null it on
  private rows; stamped the open tournaments in place (Dan chose "stamp in
  place" over cancelling two 70+ player fields).
- `union_player_pnl_settlement` (+ same-day `union_player_pnl_dual_ledger_fix`)
  — `fn_union_club_player_pnl(club, union, start, end)`; counts buy-ins from
  `wallet_transactions` (debit/'buyin', scoped by union `table_id`) and
  cash-outs from BOTH ledgers (`wallet_transactions` credit/'cashout' AND
  `chip_transactions` 'cashout' — verified non-overlapping in production),
  plus the club's currently seated stacks on union tables. Attribution: each
  player belongs to the union club they joined first.
- `union_restart_close_club_tables` — Dan-approved kill/restart: refunded
  every seat from its actual stack (engine-idempotent `cashout:<seat_id>`
  keys), vacated, closed all 54 open cash tables, tombstoned the orphan.
  Fleet recreated 45 tables union-owned within a minute; 1,185 hands dealt in
  the 5 minutes after — verified via `hand_history` per CA repo rules.
- `union_private_club_games` — `tables` INSERT RLS now also admits club
  owner/admin when `is_private = true`; `fn_create_tournament` accepts
  `isPrivate` (club admin may create private; private rows never carry
  `union_id`).

### World Hub (this commit)

- `create-table.js` — union governance: union admins create union tables
  (`union_id` stamped); club owners/admins get private club games
  (`isPrivate: true`); anything else in a union → 403.
- `union-application.js` approve — **join flow enforces the hard rule**: live
  non-private tournaments block approval; open club tables are auto-closed
  with full refunds before the club is integrated.
- `settle-period.js` — `open` snapshots the club's seated stacks on union
  tables; `close` computes weekly player P&L (realized flows + seated-stack
  delta), fills `total_player_winnings/losses`, and writes a
  `union_club_pnl` settlement invoice (union→club when players net won,
  club→union when they net lost). Runs under the existing Monday 10:00 UTC
  auto-settlement chain — no new cron.

### Club Arena repo (commit `036c91798` on main)

- `TableService` / `TournamentService` — `union_only` refusals fall back to a
  private club game instead of a hard error; union admins unchanged
  (`fn_game_creation_access` path from the same-day AntiGravity work).
- `TableConfigPage` / `TableCreationPage` / `CreateTablePage` — private-only
  mode replaces the bounce; fail-closed forces MORE private, never less.
- `ClubHomePage` — union clubs see union tables + their OWN private games;
  club tournament list is own-private-only inside unions; the union list now
  includes ALL union-owned tournaments (not just XMTT); other clubs' private
  games never leak.

## Deliberate scope notes / deferred

- Engine (`server/src`) untouched: the DB triggers make every writer correct
  without a Hetzner deploy.
- `chip_transactions` cash-outs carry no `table_id`; private-game cash-outs
  could bleed into the P&L scope for a union club. Acceptable now (0 private
  games exist); follow-up: engine should stamp `table_id` into chip_tx
  metadata.
- The first settlement period after rollout has no seated-stack snapshot; its
  stack delta is treated as 0 (realized flows only). Self-corrects from the
  next `open`.
- Incident recorded: an Antigravity `reset --hard` wiped the first
  (uncommitted) WH edits mid-session, and a first CA commit through the
  shared index swept in another agent's staged HomePage WIP (branch deleted,
  never merged). Both redone via detached worktrees with explicit paths.

## Verification

- 0 open cash tables without `union_id`; fleet recreation + hand flow
  confirmed in DB (behavioral check per CA CLAUDE.md §11).
- `fn_union_club_player_pnl` spot-checked over 7 days: union-wide realized
  net ≈ −261k with 122k seated — remainder ≈ rake+BBJ collected, as expected.
- `clubs.union_id` mirror assertion green; open-tournament stamp assertion
  green; tsc clean on CA.
