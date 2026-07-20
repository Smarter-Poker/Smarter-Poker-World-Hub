# Handoff: Retire the legacy `club_tournaments` tournament subsystem

Date: 2026-07-20
From: Claude (fable-5), Club Arena engine session (cloud sandbox — cannot run `next build` / browser test)
Decision: Dan approved RETIRE (2026-07-20).
Full finding + reachability: `.agent/audits/2026-07-20-club_tournaments-split-brain.md`

## Why this is a handoff
Retiring this subsystem is destructive, money-adjacent (tournament buy-ins / prize pools),
and touches LIVE code (`GameController.js`, `pages/api/poker/engine/tournament.js`,
`pages/hub/my-tournaments.js`). It MUST be verified with `npx next build` + a browser test of
the live World Hub poker table. The originating session ran in a cloud sandbox that cannot run
World Hub's `next build` or browser tests, so it could not satisfy the Tier-3 verification
protocol. Execute this in a build-capable environment and ship via `scripts/git-safe-push.sh`.

## Ground truth
- `public.tournaments` = canonical, live (1393 rows; 15 RUNNING today). The Club Arena SPA
  (`club-arena/src/services/TournamentService.ts`) and the Hetzner engine use it directly.
- `public.club_tournaments` = legacy base table, dead since 2026-03-10 (6 rows). No RPC writes it.
- The live Club Arena SPA calls NONE of the World Hub routes below (verified by grep).

## MUST-RESOLVE BEFORE PHASE 2 (open question)
Is the World Hub *native* poker frontend still live?
- Files: `pages/hub/poker/table/[tableId].js`, `src/components/poker/LivePokerTable.jsx`, and
  World Hub's own `src/lib/poker-engine/` (GameController etc.).
- If it is LIVE and runs tournaments through World Hub's GameController → **repoint** GameController's
  tournament paths to `tournaments` (do NOT delete them).
- If it is superseded by Club Arena and no longer runs tournaments → the GameController tournament
  paths + `TournamentBridge.js` + `TournamentController.js` can be removed.
Confirm with Dan / by checking whether `pages/hub/poker/*` is linked from live nav and whether any
tournament is ever created/run through World Hub's engine (vs the Hetzner Club Arena engine).

## Execution plan (phased; verify + deploy each phase before the next)

### Phase 1 — delete cleanly-orphaned leaf routes (no caller in either repo)
Delete these 5 files (they are Next.js API endpoints; nothing imports them; the Club Arena SPA
does not fetch them; `tournament-cron.js` is scheduled by nothing):
- `pages/api/club-arena/tournaments.js`
- `pages/api/club-arena/tournament-detail.js`
- `pages/api/club-arena/tournament-cron.js`
- `pages/api/club-arena/union-dashboard.js`
- `pages/api/club-arena/union-games.js`

Do NOT delete any helper they import (all shared, used platform-wide): `supabaseServerClient`,
`poker-engine/RateLimiter`, `apiRateLimit`, `sentryWrap`, `club-arena/notify`,
`club-arena/idempotency`, `club-arena/redteam-validation`, `settlement-lock`,
`contracts/orb4_syndicate`.

Also remove the now-orphaned in-repo mirror component if still unused:
`src/components/club-arena/CreateTournamentModal.jsx` (had no importer in-repo — confirm, then delete).
Update `tests/orb4-integration.test.js` (exercises union-games) and
`tests/orb3_mtt_concurrency.js` (inserts/deletes club_tournaments) so the suite stays green.

Verify: `npx next build` passes; grep confirms no remaining import/fetch of the deleted routes.

### Phase 2 — repoint / surgically fix the LIVE consumers
1. `pages/api/poker/engine/tournament.js` (~line 134): remove or repoint the `club_tournaments`
   cold-start DB fallback to `tournaments` (map columns — see Phase 3 mapping). Keep the route.
2. `pages/hub/my-tournaments.js` (~line 66): repoint the realtime subscription from
   `table: 'club_tournaments'` to `table: 'tournaments'` (or retire the page if `pages/hub/poker`
   is dead — but it is a live notification deep-link target from `src/utils/trainingNotifications.js`,
   so prefer repoint).
3. `src/lib/poker-engine/GameController.js`: `createTournament` (~1970) and `_recoverTournaments`
   (~2350), plus `TournamentBridge.js` writes (~569/582/597) and `TournamentController.js`:
   per the open question, either REPOINT to `tournaments` or REMOVE the tournament code paths +
   their `index.js` re-exports. This is in-file surgery on live infra — build + browser-test the
   live poker table afterwards.

Column mapping club_tournaments → tournaments (for any repoint):
`buy_in`→`buy_in_amount`, `scheduled_start`→`start_time`, `finished_at`→`ended_at`,
`registered_count`→`current_players`, `type`→`tournament_type`; `settings`/`results` have no direct
canonical column (tournaments stores bounty/state in dedicated columns — check the schema before mapping).

Verify: `npx next build`; browser-test the live poker table + `/hub/my-tournaments`; grep the whole
repo (excluding `public/hub/club-arena/assets/`) for `club_tournaments` → only the migration/DDL and
this handoff/audit should remain.

### Phase 3 — drop the table (only after Phases 1-2 are DEPLOYED and verified)
Write a migration `supabase/migrations/<YYYYMMDD>_drop_legacy_club_tournaments.sql` that
`DROP TABLE public.club_tournaments;` (and its indexes/RLS/realtime publication membership).
Tier-3 destructive — include a pasted ROLLBACK section reconstructing the table DDL (copy the
current `CREATE TABLE` from the existing migrations). Apply via Supabase MCP `apply_migration`,
confirm via `list_migrations`. Do this ONLY once a repo-wide grep shows zero live references.

## Definition of done
- No live code references `club_tournaments` (grep clean, excluding assets bundle + this handoff/audit).
- `npx next build` passes; live poker table + my-tournaments verified in browser.
- `git-safe-push.sh` exits 0 with DEPLOY_VERIFIED:true for each phase.
- `club_tournaments` dropped with a rollback migration recorded.
