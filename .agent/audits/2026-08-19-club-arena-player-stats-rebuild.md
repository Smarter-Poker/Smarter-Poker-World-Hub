# Club Arena — Player Stats page rebuild (2026-08-19)

Reported: `https://smarter.poker/hub/club-arena/stats` showed "No Stats Yet"
with zeroed hero numbers for every player, despite 2.3M rows in `hand_history`.

## What was actually broken

1. **`.maybeSingle()` on a multi-row table.** The page queried
   `player_stats … .eq('user_id', …).maybeSingle()`. `player_stats` holds **one
   row per (user, club)** — Dan has 3 — so PostgREST returned an error, `data`
   came back null, and the page fell straight to the empty state. This is the
   house `.single()`/`.maybeSingle()` bug shape in a new place: `.maybeSingle()`
   is only safe when the filter is genuinely unique.
2. **The real data was never read.** Sessions came from `player_sessions`
   (3 rows platform-wide) and advanced stats from columns `player_stats` does
   not have (`aggression_factor`, `bb_per_100`, `showdowns_won`, …), so those
   tiles were hardcoded zeros by construction. The source of truth —
   `hand_history` (2.3M rows, `players` / `actions` / `winners` JSONB) — was
   not queried at all.
3. **Tournament stats read an empty table.** `tournament_registrations` has
   **0 rows** on production; entries actually live in `tournament_players`
   (41,684 rows).

## What shipped

**`ca_player_stats_full(p_user uuid) → jsonb`** (SECURITY DEFINER, `authenticated`
+ `service_role` only) computes everything server-side from `hand_history`:

- totals, VPIP, PFR, 3-bet, fold-to-3-bet, c-bet flop, aggression factor,
  WTSD, showdown win %, bb/100, hours, biggest pot won / worst hand
- per-position (BTN/SB/BB/UTG/UTG+1/MP/CO, derived from `button_seat` + seat
  order) and per-variant (NLH/PLO4/5/6/…) breakdowns
- 90-day daily profit series and gap-clustered session history (45-min gap)
- tournaments: entries, cashes, ITM %, wins, best finish, buy-ins, winnings,
  net, ROI, plus the 25 most recent results

Aggregates only — hole cards are never returned.

**`PlayerStatsPage.tsx`** consumes the single RPC: Overview / Performance /
Positions / **Tournaments** (new) / Analysis, per-variant table, CSV export of
sessions and of the stat sheet, and **Send to Personal Assistant** (POSTs to
`/api/assistant/leaks/detect`, then opens `/hub/personal-assistant`). Legacy
fallback aggregates the per-club `player_stats` rows — summed, never
`.maybeSingle()` — if the RPC is unavailable. `SessionHistory`, `BankrollTracker`,
`AdvancedStatsSummary` and `PositionWinRates` are now fed from the RPC payload
instead of issuing their own queries.

## The performance problem, and the fix

`hand_history.players` is JSONB, so "this player's most recent N hands" could
only be answered by a GIN containment scan that **materialises every hand the
player appears in** before `ORDER BY created_at DESC LIMIT N` can apply.
Measured on production for one active account:

```
Bitmap Heap Scan on hand_history  rows=71,238  Heap Blocks: exact=35,807
Execution Time: 11,807 ms      (12.5s on a second, warm run)
```

The `authenticated` role has `statement_timeout=8s`, so those calls were
**cancelled outright** — i.e. the busiest players would have kept seeing a
broken page. Lowering the hand cap did not help (3000 → 1500 hands was still
~16s) because the cost is in the match set, not the cap. A function-level
`SET statement_timeout` does **not** help either: the timeout is already armed
when the statement starts, so the function's setting never re-arms it.

Fix: **`ca_hand_player_idx (user_id, created_at DESC, hand_id)`** — a plain
btree lookup table, so the top-N is an index range scan and only those N hands
are heap-fetched.

- `ca_refresh_hand_player_index(p_max_hands)` maintains it: a forward tail
  above `idx_ceil` (new hands) plus a backward backfill below `idx_floor`.
  **No trigger on `hand_history`** — the engine's hot write path is untouched.
- The RPC is correct at every stage of the backfill: it unions a bounded live
  window above `idx_ceil` and falls back to a containment scan below
  `idx_floor` *only* for players with fewer than the cap indexed (which
  necessarily means a small match set, so that scan is cheap).
- The stats page calls the refresh fire-and-forget on load; concurrent callers
  no-op on `pg_try_advisory_xact_lock`, and the batch is sized to finish inside
  the 8s timeout.

Measured after (as `authenticated`, `statement_timeout=8s`):

| account                        | before        | after   |
|--------------------------------|---------------|---------|
| heaviest (71k matching hands)   | 12–16s, cancelled | **1.26s** |
| typical (92 hands)              | n/a (errored) | **79ms** |

`overall.hand_cap` (1500) and `overall.hands_capped` are returned so the UI can
state the analysis window rather than silently reporting a truncated total.

## Migrations (all applied to production via Supabase MCP)

`20260819_ca_player_stats_full_rpc.sql` in the Club Arena repo is the source of
truth for the RPC. Applied in sequence:

| migration | why |
|---|---|
| `ca_player_stats_full_rpc` | RPC v1 + `idx_hand_history_players_gin` |
| `…_v2_perf` | single-pass action analysis (was re-expanding `actions` per metric) |
| `…_v3_cap_5000`, `…_v4_single_pass_folds`, `…_v6_cap_1500_and_capped_flag` | timeout tuning + `hands_capped` |
| `…_v5_tournament_players` | tournament source fix |
| `ca_hand_player_idx_table_and_refresh`, `…_state_boundaries`, `ca_refresh_hand_player_index_v2_bidirectional`, `…_advisory_lock` | the index table + its refresh |
| `…_v8_index_backed_hand_selection`, `…_v9_forward_tail` | RPC reads the index |

Rollback for the whole feature:

```sql
DROP FUNCTION IF EXISTS public.ca_player_stats_full(uuid);
DROP FUNCTION IF EXISTS public.ca_refresh_hand_player_index(int);
DROP TABLE IF EXISTS public.ca_hand_player_idx;
DROP TABLE IF EXISTS public.ca_hand_player_idx_state;
DROP INDEX IF EXISTS public.idx_hand_history_players_gin;
```

## Gotchas worth keeping

- `CREATE INDEX CONCURRENTLY` on `hand_history` exceeds the 2-min `postgres`
  role timeout and leaves an **INVALID** index behind. Raise
  `ALTER ROLE postgres SET statement_timeout` for the build, drop the invalid
  index first, and restore the timeout afterwards (restored to `2min` here).
- Long MCP calls disconnect the client at ~3 min but the server keeps working;
  poll state rather than assuming failure. A statement cancelled by the
  disconnect rolls back, so keep backfill batches inside the window.
- `RETURNS TABLE` signature changes need `DROP FUNCTION` first.
- `PRIMARY KEY (…, col DESC)` is not valid — use a plain PK plus a separate
  ordered index.

## Follow-ups

- Backfill of `ca_hand_player_idx` is still descending through older history
  (it advances on every stats-page load). Nothing is wrong while it runs; it
  only gets faster as the floor drops. If it should be finished off in one go,
  run `SELECT ca_refresh_hand_player_index(250000);` repeatedly as `postgres`.
- Consider registering that refresh as an Open Claw job (CLAUDE.md §11) so it
  does not depend on page traffic.
- Position stats cover the 59 of Dan's 92 hands that have a `button_seat`;
  hands without one are excluded rather than guessed. Worth having the engine
  always stamp `button_seat` on `hand_history`.
