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

---

# Addendum — second pass (line-by-line re-read + hardening)

Went back over the shipped page line by line. Findings below were all real; each
one is fixed and deployed.

## Wrong numbers

- **`tournament_registrations` is empty platform-wide (0 rows).** Every player's
  Tournaments tab read zeros. Real entries live in `tournament_players`
  (41,684 rows). Buy-ins are now reconstructed from the tournament plus that
  player's rebuys/add-on, and winnings include `bounty_winnings`. Verified
  against a real account: 1,313 entries, 269 cashes, ITM 20.5%, ROI -46.2%.
- **`PositionWinRates` rendered a hands-won percentage in a field labelled and
  colour-banded as bb/100.** An ordinary 18% win rate displayed as
  "18.00 bb/100 — Exceptional" with the progress bar pegged.
- **`BankrollTracker`'s period filter sliced the last N *entries*, not days.**
  Each point is a session, so "Last 7 Days" could span months for a weekend
  player, and peak / trough / max-drawdown / winning-days all inherited the
  wrong window. Period P/L also subtracted the first session out of its own
  window, and a zero baseline rendered the literal string `+∞%`.
- **`SessionHistory`'s "Avg $/hr" was an unweighted mean of per-session rates**,
  so a five-minute heater counted as much as an eight-hour grind. Break-even
  sessions counted as losses for streak purposes.
- **CSV export emitted raw fractions** (`vpip: 0.234`) while the screen showed
  `23.4%`. Now exported as percentages with a unit column.

## Lies to the player

- **A failed load rendered the "No Stats Yet" empty state** — telling a player
  with thousands of hands that they had never played. There is now a distinct
  error panel with a Try Again button, and a failed refresh over good data is
  labelled "showing your last loaded stats" instead of passing stale numbers
  off as current.
- **The skeleton watchdog fired at 10s, mid-retry.** `retryFetch` makes three
  attempts with 1s + 2s backoff, so the timer routinely fired while the request
  was still alive and flashed the empty state. Now 20s, and it sets an error
  state rather than silently declaring "no data".
- **Only Overview had an empty state.** A player with no hands saw a wall of
  `0.0%` rows, a position diagram reading `0.00 bb/100 · ↓ Leak` seven times,
  and blank charts on the other four tabs.
- **The hero gauge was labelled "Win Rate" and banded 35/45/55**, but hands-won
  is 10–20% in real poker — so every honest player rendered red on a near-empty
  arc. Relabelled "Hands Won", rebanded 10/15/22, arc scaled to a 40% ceiling.
- **`AdvancedStatsSummary`'s standalone fetch still used the original bug:**
  `player_stats … .maybeSingle()` filtered only by `user_id`, which errors the
  moment a player has rows in two clubs — and it selected none of the advanced
  columns, so six of its eight cards could only ever read zero. It now reads
  `ca_player_stats_full().overall` like the parent.
- **`PositionWinRates` had no loading or error state:** on failure it silently
  showed seven zeroed positions forever, and the callouts asserted
  "Strongest: UTG 0.00" and "Weakest: UTG 0.00" at the same time. It also drew
  a half-finished hover tooltip — an empty bordered box with no text in it.

## Robustness

- The RPC payload now goes through `normalizeFull()`; every number is coerced,
  so a null or absent field renders 0 instead of throwing `.toFixed()` in the
  hero and taking the whole page down.
- Refreshes arriving mid-flight are queued and replayed once instead of being
  dropped (the bus events are debounced, not queued).
- The index-refresh **write** is throttled to once per 5 minutes; it previously
  fired on every bus event and every tab focus, i.e. repeatedly during play.
- `sessionRows` is memoised — it is the `initialSessions` prop for two children
  whose effects key on identity, so a fresh `[]` per render re-ran both on every
  tab click.
- Tab list hoisted to one `TABS` constant; swipe and pills could previously
  drift apart.

## Analysis window: 1500 → 750 hands

Measured per-hand cost is ~3.8ms (a random heap fetch plus per-hand JSONB
expansion of `players`, `actions`, `winners`). At 1500 hands the heaviest
account measured **5.7s warm and was cancelled outright under load** against the
8s `authenticated` timeout. At 750 it measures **2.1s**. Ordinary players are
unaffected — under 750 hands you get your entire history; above it the window is
stated in the UI rather than presented as a lifetime total.

## New

- **Per-stake breakdown** (by big blind): hands, won, profit, bb/100 — so a
  player can see which game size is carrying or bleeding their results instead
  of one blended number. Verified the per-stake profits sum to the overall
  figure (-350.99 + -530.09 + -1.75 = -882.83).

## Operational notes

- **The `git reset --hard origin/main` sync loop wiped a working tree of
  uncommitted edits mid-session** (RULE 13, reflog shows `reset: moving to
  origin/main`). Re-applied and committed immediately. Commit early, commit
  often — do not hold edits in the working tree.
- **A push that cherry-picks only the tip of a branch silently drops its
  parent.** That happened here: the child-component commit landed, the
  page-level commit did not, and CI then rebuilt the arena bundle from that
  half-state — so production served the old page while the source repo looked
  correct. Verify the shipped chunk, not just the push.
- **Do not run oversized backfill batches against a live table.** A 500k-hand
  batch held the refresh advisory lock for 14 minutes, which stopped the index
  ceiling advancing, which grew the live window every stats call had to scan,
  which pushed the RPC to a timeout. Cancelled it; normal operation uses
  3,000-hand batches that finish in ~1-2s.
- Vercel: verified the work is on the **smarter-poker** team
  (`team_SVD8r7AOPH065G3usBxVvrBc`), project `hub-vanguard`
  (`prj_op66GkZyZcygXQKm76iyycfVFAQx`), which is the canonical project for this
  repo. Commits authored as `agent@smarter.poker` build normally (a personal
  mailbox is what trips CHECK 15).
