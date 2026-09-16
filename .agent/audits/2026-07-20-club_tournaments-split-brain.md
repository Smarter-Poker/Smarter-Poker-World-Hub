# Audit: `club_tournaments` vs `tournaments` — legacy tournament subsystem (split-brain)

Date: 2026-07-20
Author: Claude (fable-5), Club Arena engine session
Status: FINDING — awaiting product decision (retire vs repoint). No code changed.

## Summary

`public.tournaments` is the live, canonical tournament table. `public.club_tournaments`
is a **legacy base table, effectively dead since 2026-03-10**. Nine World Hub source
consumers still read/write/subscribe to `club_tournaments`; they form a legacy
tournament subsystem (old World Hub poker engine + its API routes + cron) that the
live product no longer uses.

This was tracked as "Duplicate #6" in the canonical architecture doc, whose WRITE-path
resolution (register RPC → canonical `tournaments`) was completed 2026-04-29. The
remaining consumer sweep was deferred; this audit is that sweep's finding.

## Evidence

| Table | relkind | Rows | Latest `created_at` | Live statuses |
|---|---|---|---|---|
| `tournaments` (canonical) | base table | 1393 | 2026-07-20 (today) | 15 RUNNING, 534 COMPLETED, 844 CANCELLED |
| `club_tournaments` (legacy) | base table | 6 | 2026-03-10 | 1 running (stale), 5 cancelled |

- The live Club Arena SPA `src/services/TournamentService.ts` uses `tournaments`
  exclusively (18 references, zero to `club_tournaments`).
- The authoritative Hetzner engine (`club-arena/server`) runs tournaments on
  `tournaments` (15 RUNNING right now).
- Both tables are the SAME domain (both have club_id, buy_in(_amount), starting_chips,
  blind_structure, prize_pool, engine_id/status) — a genuine duplicate, not two
  different concepts. (Note: the `cross_club_tournaments` *settings boolean* in the
  Club Arena repo is unrelated — different string, not this table.)

## The 9 legacy consumers (all in World Hub)

Create → list → lifecycle → engine-persist → realtime → cron, all bound to the dead table:

1. `pages/api/club-arena/tournaments.js` — create/list/register/start/cancel/update/spin (READ+WRITE). Register routes through `fn_tournament_atomic_register` (already migrated to canonical) → split-brain within one flow.
2. `pages/api/club-arena/tournament-detail.js` — half-migrated: IDOR check reads canonical `tournaments`, bounty-state reads `club_tournaments`.
3. `pages/api/club-arena/tournament-cron.js` — scheduled auto-start/auto-cancel/reminders scan only the dead table (no-op for real tournaments).
4. `pages/api/club-arena/union-dashboard.js` — union tiles + activity feed counts (READ).
5. `pages/api/club-arena/union-games.js` — full union tournament management surface (READ+WRITE).
6. `pages/hub/my-tournaments.js` — realtime subscription to `club_tournaments` UPDATE.
7. `pages/api/poker/engine/tournament.js` — engine cold-start DB fallback (READ).
8. `src/lib/poker-engine/TournamentBridge.js` — legacy engine persists tournament/level state (WRITE).
9. `src/lib/poker-engine/GameController.js` — legacy engine creates tournaments + cold-start recovery (READ+WRITE).

Harmless: `stickerOrchestrator.js` (comment), `database.types.ts` (`cross_club_tournaments`
field, not the table), the table's own migration DDL, and `tests/orb3_mtt_concurrency.js`.

## Decision required (product intent)

The live tournament system is entirely in Club Arena (SPA + Hetzner engine) on
`tournaments`. The World Hub tournament routes + legacy `src/lib/poker-engine` engine
appear fully superseded. Path forward is a product call:

- **RETIRE** the legacy World Hub tournament subsystem (remove the 9 consumers + legacy
  engine, drop `club_tournaments` with a rollback section). Correct if the World Hub
  tournament UI/engine is truly replaced by Club Arena.
- **REPOINT** the 9 consumers to canonical `tournaments` (non-trivial: column names
  differ — `buy_in`→`buy_in_amount`, `scheduled_start`→`start_time`, `finished_at`→
  `ended_at`, `registered_count`→`current_players`, etc.). Correct only if the World Hub
  tournament surface is meant to stay live alongside Club Arena.
- **LEAVE** as-is (dead code) — lowest effort, but leaves a money-adjacent split-brain
  and stale UI paths in the tree.

Recommendation: RETIRE, pending confirmation that no live World Hub UI still links to
these routes. This is destructive + cross-repo + money-adjacent (buy-ins/prize pools) →
Tier-3, plan-and-confirm before executing.

## Reachability addendum (2026-07-20) — premise partially CORRECTED

A follow-up reachability sweep found the "9 dead consumers + legacy engine" framing is
too broad. Corrected picture:

- **`src/lib/poker-engine/` is LIVE core infrastructure, NOT deletable.** `GameController.js`,
  `RateLimiter`, `RakeConfig`, `Deck`, `HandEvaluator`, etc. are imported by ~50 live
  `pages/api/club-arena/*` and all `pages/api/poker/engine/*` routes. Only the *tournament
  code paths inside* GameController (`createTournament` ~1970, `_recoverTournaments` ~2350)
  and `TournamentBridge.js` / `TournamentController.js` touch `club_tournaments` — and they
  are reachable only through GameController + `index.js` re-exports. Removing them is
  in-file surgery on live infra, not a file delete.
- **The live Club Arena SPA calls NONE of these World Hub routes** (confirmed: grep of
  `club-arena/src` for these endpoint paths = 0 hits; the SPA's `TournamentService.ts`
  uses Supabase `tournaments` directly).
- **Cleanly orphaned (no caller in either repo) — safe leaf-route deletes:**
  `tournaments.js`, `tournament-detail.js`, `tournament-cron.js`, `union-dashboard.js`,
  `union-games.js`. (`tournament-cron.js` is also wired to NO scheduler in-repo — not
  `vercel.json`, not `openclaw-cron-dispatcher.py`, not any workflow.)
- **LIVE consumers that must be REPOINTED/surgically fixed, not deleted:**
  `pages/api/poker/engine/tournament.js` (live; called by `LivePokerTable.jsx`; has a
  `club_tournaments` cold-start fallback at line ~134); `pages/hub/my-tournaments.js`
  (live; reached by notification deep-links in `trainingNotifications.js`; realtime-
  subscribes to `club_tournaments`); and GameController's tournament paths.
- **Shared helpers imported by the orphaned routes are used platform-wide — DO NOT delete:**
  `supabaseServerClient`, `poker-engine/RateLimiter`, `apiRateLimit`, `sentryWrap`,
  `club-arena/notify`, `club-arena/idempotency`, `club-arena/redteam-validation`,
  `settlement-lock`, `contracts/orb4_syndicate`.

**OPEN QUESTION for the executing agent:** is the World Hub *native* poker frontend
(`pages/hub/poker/table/[tableId].js` + `LivePokerTable.jsx`, which use World Hub's own
`src/lib/poker-engine`) still live, or itself superseded by Club Arena? If it is live and
runs tournaments through World Hub's GameController, then GameController's tournament paths
must be **repointed to `tournaments`**, not deleted. This must be resolved before Phase 2.

**Execution constraint:** this retirement needs `next build` + browser testing of the live
World Hub poker table — which the current cloud sandbox cannot run. It is therefore handed
off (see `.agent/handoffs/2026-07-20-retire-club_tournaments.md`) for a build-capable agent.

## RESOLUTION (2026-07-20) — retirement EXECUTED, all phases complete

- Phases 1-2 shipped in WH commit `420a0c2d` (git-safe-push.sh: DEPLOY_VERIFIED:true,
  SHA_MATCHED:true). Orphaned routes + tournament controller/bridge archived to
  archive/legacy-club-tournaments/; live consumers repointed to canonical tournaments;
  GameController zombie recovery eliminated.
- Phase 3: migration `drop_legacy_club_tournaments_20260720` applied with pre-flight
  assertions. club_tournaments (6 E2E test rows from 2026-03-10), tournament_entries (0
  rows) and tournament_mystery_draws (0 rows) dropped; rake_records.tournament_id FK
  repointed to tournaments(id) ON DELETE SET NULL. Post-apply verified: all three
  to_regclass NULL, FK target = tournaments, 19 canonical tournaments RUNNING untouched.
- Incidental find fixed en route: patch-next.js patch 6 (nextFontManifest.pages guard) —
  patch 3's {} fallback left .pages undefined, crashing webpack export on a random page
  per run. Also documented: the WH webpack build requires Node 20 (Node 22 crashes the
  /_not-found export); Vercel matches Node 20.
