# Club Arena — Official Upgrade Layout & Integration

**Owner:** Dan
**Status:** Authoritative — supersedes all prior `*HANDOFF*.md`, `POKERBROS_UPGRADE_PLAN.md`, `PHASE_*_OVERHAUL_PLAN.md` drafts
**Scope:** Club Arena (CA) + Club Engine (CE legacy fork) + Supabase + Hetzner + Vercel + World Hub
**Created:** 2026-04-21
**Last Live-Audited:** 2026-04-21

This document is the single source of truth for how Club Arena should run as a real poker room across all four surfaces (client, Hetzner game server, Supabase, World Hub). It is the platform-level consolidation of every plan that came before it.

---

## 0. Executive Summary

Club Arena is architecturally 80% complete. The server-authoritative Bible-V8 migration is shipped, all 9 silent-failure financial bugs from the 2026-04-15 audit are fixed, PokerBros parity Phases A–H are signed off, and the ledger drift ($804.5M) is remediated to zero. What remains is consolidation, not re-architecture:

1. **Kill the dual-engine hazard.** `src/engine/*` (33 files, 584 KB of client-side authoritative code) still exists in the CA repo and is imported by 10+ services and `TablePage.tsx`. The server-authoritative `server/src/engine/*` is the real one. The client copy must be either deleted or reduced to pure-function read helpers (hand evaluator, equity preview, formatting). This is the migration-plan STEP 1 closeout.
2. **Bury `club-engine/`.** It is a stale frontend-only fork last touched 2026-04-06, with a README still pointing to the dead `club-engine.vercel.app`. Task #111 already documented it as superseded. Archive it.
3. **Refactor `server/src/index.ts`.** It is a 162 KB / ~3,800-line monolith that owns every HTTP route, bootstrap path, and service wiring. Split into a thin HTTP router + per-concern modules before adding new features.
4. **Formalize the client ↔ server protocol surface.** The game server exposes 17 HTTP routes plus a WebSocket `/ws/table/:tableId` (SNAPSHOT + RFC-6902 DELTA + EVENT). This is the ONLY contract the client needs. Everything else on the client should go through Supabase RPCs.
5. **Harden the deploy pipeline's invariants.** The sync-to-world-hub → git-safe-push → Vercel auto-deploy + Hetzner SSH deploy split is working. The gaps are: (a) CA bundle budget CI gate (#155), (b) Sentry sourcemap upload on CA Vite builds (#133), (c) the `public/hub/club-arena/` asset migration to R2 (#44).

No new services. No re-platforming. Just finish the consolidation.

---

## 1. Current State Audit — Verified 2026-04-21

### 1.1 Repos

| Repo | Path | Branch | Last Commit | Purpose | Status |
|------|------|--------|-------------|---------|--------|
| **club-arena** | `~/Documents/club-arena` | `main` | `35342e51` (2026-04-20) | Vite + React SPA + Hetzner game server (`server/`) | **ACTIVE — primary source of truth** |
| **Smarter-Poker-World-Hub** | `~/Documents/Smarter-Poker-World-Hub` | `main` | `bdf330e75` (2026-04-21) | Next.js 14 monolith, serves CA SPA at `/hub/club-arena/*`, 67 `/api/club-arena/*` routes | **ACTIVE — deploy target** |
| **club-engine** | `~/Documents/club-engine` | `main` | `4d1c4f32` (2026-04-06) | Frontend-only fork of CA, README points to dead `club-engine.vercel.app` | **SUPERSEDED — Task #111. Archive.** |

### 1.2 Surfaces

```
                          ┌──────────────────────────────────────┐
                          │     Vercel project: hub-vanguard     │
                          │  (prj_op66GkZyZcygXQKm76iyycfVFAQx)  │
                          │   domain: smarter.poker              │
                          └──────────────┬───────────────────────┘
                                         │ serves
                 ┌───────────────────────┼───────────────────────────┐
                 │                       │                           │
     /hub/club-arena/*             /api/club-arena/*           /api/* (hub)
     (95 MB static SPA,            67 Next.js handlers         650+ endpoints
      PWA manifest, cards,         proxy / server ops          55+ cron jobs
      club-logos, images)                                      middleware
                 │                       │                           │
                 ▼                       ▼                           ▼
         ┌─────────────┐          ┌─────────────┐             ┌─────────────┐
         │  Browser    │          │ Supabase    │             │ Hetzner     │
         │  (CA SPA)   │◀─────────│ PostgreSQL  │─────────────│ game server │
         │             │ JWT auth │ + Auth +    │  service    │ engine.     │
         │             │ same-    │ Realtime    │  role       │ smarter.    │
         │             │ origin   │ 235 migs    │             │ poker       │
         └──────┬──────┘          └─────────────┘             └──────┬──────┘
                │                         ▲                          │
                │ HTTP POST (17 routes)   │ writes rake_records,     │
                │ WebSocket /ws/table/:id │ chip_ledger, bbj_payouts │
                └─────────────────────────┴──────────────────────────┘
```

### 1.3 Hetzner Game Server — engine.smarter.poker

| Field | Value |
|---|---|
| SSH | `root@178.156.160.206` (key-based) |
| Hetzner Server ID | 125093929 |
| Repo on server | `/opt/club-arena` |
| Container | `club-arena-engine` (Docker) |
| Port | 8080 |
| Health | `https://engine.smarter.poker/health` |
| Entry | `server/src/index.ts` (compiled with tsx/esbuild) |
| Process | 24/7 — creates/runs all cash tables + tournaments, runs horse AI, broadcasts via Supabase Realtime + WebSocket |

**Engine files** (`server/src/engine/`): 29 TypeScript files, 13,598 lines total. The authoritative engines:

`HandController.ts`, `ServerTableEngine.ts`, `ServerActionValidator.ts`, `PreciseActionTimer.ts`, `StateVerifier.ts`, `TimeBankEngine.ts`, `DisconnectEngine.ts`, `PreActionEngine.ts`, `StraddleEngine.ts`, `RunItTwiceEngine.ts`, `InsuranceEngine.ts`, `MixedGameEngine.ts`, `RakebackEngine.ts`, `ChipRaceEngine.ts`, `TableBalancer.ts`, `TableBreakEngine.ts`, `OFCPineappleEngine.ts`, `OFCDealingOrchestrator.ts`, `PokerEngine.ts`, `MonteCarloEquity.ts`, `HorseLogic.ts`, `CryptoRandom.ts`, `AtomicStackService.ts`, `StateMachine.ts`, `DeadlineScheduler.ts`, `EngineTelemetry.ts`.

**Services** (`server/src/services/`): `HorseFleetManager`, `HorseLifecycleManager`, `AutoRebuyService`, `RakebackSettlerService`, `TournamentRecurringService`, `supabase`, `errorReporter`.

**Transport** (`server/src/transport/`): `EngineWebSocketServer.ts`, `TableStateHub.ts`, `wsHelpers.ts`.

### 1.4 Public HTTP contract (Hetzner → Client)

Authoritative list from `server/src/index.ts`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + SHA |
| GET | `/` | Alias for `/health` |
| GET | `/metrics` | Prometheus scrape |
| GET | `/ws-metrics` | WebSocket connection counters |
| POST | `/action` | Fold/Check/Call/Bet/Raise/All-in |
| POST | `/timebank` | Burn time-bank seconds |
| POST | `/heartbeat` | Keep-alive / tab-visible ping |
| POST | `/preaction` | Queue pre-action (fold/check/call-any) |
| POST | `/addchips` | Top-up stack between hands |
| POST | `/leave` | Leave table |
| POST | `/sitout` | Toggle sit-out (deferred mid-hand — DECISION 003) |
| POST | `/straddle` | Toggle straddle |
| POST | `/rit` | Run-It-Twice vote |
| POST | `/insurance` | All-in insurance accept/decline |
| POST | `/showhand` | Show muck |
| POST | `/discard` | OFC discard |
| POST | `/post-bb` | Post out-of-turn BB |
| POST | `/admin/pause` | Admin pause table |
| POST | `/admin/resume` | Admin resume table |

### 1.5 WebSocket contract

Path: `wss://engine.smarter.poker/ws/table/:tableId`
Auth: `Sec-WebSocket-Protocol: bearer, <supabase-jwt>`
Server messages: `SNAPSHOT` (full state, seq N), `DELTA` (RFC-6902 JSON Patch from seq N-1→N), `EVENT` (insurance_offers, rit_*, time_bank_*, bbj_*, all_in_equity, rabbit_hunt_available), `PING`.
Client messages: `PONG`, `RESYNC` (on seq gap), `SUBSCRIBE`.
Close codes: `4401` AUTH_FAILED (client refreshes JWT and reconnects).
Client implementation: `src/services/EngineStateClient.ts` + `src/hooks/useEngineTableState.ts`.

### 1.6 Supabase

- Project: `kuklfnapbkmacvwxktbh.supabase.co`
- Migrations: **235** SQL files in `supabase/migrations/`; latest `20260419_phase3_engine_integrity.sql`
- Primary write patterns:
  - Engine writes `rake_records`, `hand_history`, `chip_ledger`, `bbj_payouts`, `bbj_payout_recipients`, `tournament_bounties`, `player_stats` durably from Hetzner via `SUPABASE_SERVICE_ROLE_KEY`
  - `RakebackSettlerService` flushes `rake_records` → `rakeback_periods` periodically (FIX BUG-008)
  - `credit_agent_commission_from_rake` RPC credits agents (FIX BUG-009)
  - `fn_clawback_chips_atomic` for real atomic clawbacks (FIX BUG-010)
  - `fn_union_send_chips_to_club` targets `union_wallet_transactions` not `union_transactions` (FIX BUG-011)
  - `fn_idempotent_credit_wallet` / `fn_idempotent_deduct_wallet` / `fn_idempotent_wallet_transfer` wrappers (Phase 4.1.3)
- Auth: JWT, same-origin `smarter-poker-auth` localStorage key shared with World Hub
- Realtime: WebSocket broadcasts for non-authoritative events; authoritative state is via the Hetzner `/ws/table/:tableId`

### 1.7 Vercel (World Hub) — hub-vanguard

- Project: `prj_op66GkZyZcygXQKm76iyycfVFAQx`
- Aliases: `smarter.poker`
- Duplicate dead project `smarter-poker` (`prj_FNUaJmcjRnwCSh1JzblIUYuOXDGK`) — disconnected, do not touch
- SPA bundle size: **95 MB** in `public/hub/club-arena/`
- API routes: **67** handlers in `pages/api/club-arena/*`
- Build safety gate: `.github/workflows/build-safety-gate.yml` (6 checks + Next.js build + post-deploy verify)
- Deploy trigger: Vercel git integration auto-deploys on push to `main`

### 1.8 Known gaps, verified

1. **Dual engine hazard.** `src/engine/` has 33 files (`HandController.ts`, `ServerActionValidator.ts`, `PokerEngine.ts`, `TableBalancer.ts`, `PreciseActionTimer.ts`, `InsuranceEngine.ts`, `TournamentEngine.ts`, etc.). These are imported by `src/pages/TablePage.tsx` and by `src/services/{HandPersistenceService, GameServerAPI, TournamentTimerService, EngineStateClient, RakeService, HorseOrchestrator, LeaderboardService, AchievementTriggerService, HorseBugReporter, BBJService, HydraService}`. The migration-plan STEP 1 "RIP OUT client-side engine code" is NOT done.
2. **`server/src/index.ts` monolith.** 162 KB / ~3,800 lines, owns all 17 HTTP handlers plus bootstrap plus service wiring in one file.
3. **Tombstone files in CA root:** `dist.dead.47076/`, `prompts.stale.*`, `wipe_db.cjs.stale.*`, `patch_roomservice.js.stale.*`, and dozens of `.git/*.lock.stale.*`. Cosmetic but noisy.
4. **Handoff-doc rot in CA root:** `ANTIGRAVITY-HANDOFF-*.md` × 5, `ANIMATION-FIX-HANDOFF.md`, `CHAT-HANDOFF-*.md`. These were from the old handoff workflow which Dan killed 2026-04-20 (no-handoffs override). Archive.
5. **`club-engine/` repo:** deprecated fork. Task #111 already documented as superseded. Not yet archived on GitHub.
6. **CA Sentry sourcemap upload:** Task #133 open — Vite build does not upload sourcemaps, so Sentry stack traces from CA are minified.
7. **CA bundle size >5 MB** breaks CI "Build & Type Safety" on main — Task #155 open.
8. **CA static assets → R2:** Task #44 in_progress — 95 MB in `public/hub/club-arena/` should move to R2 CDN to shave Vercel bandwidth.

---

## 2. Target Architecture (no change, just consolidation)

The architecture is already correct. The target is simply to get to it without dead code in the way.

### 2.1 Single source of game truth: Hetzner

- All authoritative game state lives in `server/src/engine/*` on Hetzner
- Client sends intents via HTTP POST; receives state via WebSocket SNAPSHOT + DELTA
- Supabase is the durable store (hand_history, chip_ledger, wallets, clubs, rakeback_periods, etc.)
- Vercel serves the static SPA + per-request API routes that DO NOT touch game state (profiles, chat, BBJ display, club branding, analytics, agent dashboards, etc.)

### 2.2 Client `src/` reduced scope

After rip-out, client-side modules that remain:

- `src/pages/*` — React pages
- `src/components/*` — UI only
- `src/services/*` — HTTP clients to WH `/api/club-arena/*` and Hetzner, NO local game logic
- `src/hooks/useEngineTableState.ts` — the binding between `EngineStateClient` (WebSocket) and React
- `src/services/EngineStateClient.ts` — the WebSocket client (keep, this is the contract binding)
- `src/utils/handFormatters.ts`, `src/utils/equityPreview.ts` — pure-function helpers only (eval, display, preview). These are NOT authoritative.

Deleted (or moved to pure-helper module):
- `src/engine/HandController.ts` — DELETE (server authoritative)
- `src/engine/ServerActionValidator.ts` — DELETE (server authoritative; misnamed copy)
- `src/engine/PokerEngine.ts` — split: eval fn → `src/utils/handEval.ts` keeps; dealing / state mutation → DELETE
- `src/engine/TableBalancer.ts` — DELETE (Hetzner owns tournament balancing)
- `src/engine/TournamentEngine.ts`, `TournamentOrchestrator.ts` — DELETE
- `src/engine/HorseLogic.ts`, `HorseBrainAdapter.ts` — DELETE (Hetzner `HorseFleetManager`)
- `src/engine/Time*`, `Straddle*`, `Insurance*`, `RunItTwice*`, `Preaction*`, `Disconnect*`, `ChipRace*`, `TableBreak*`, `OFC*`, `Spin*`, `Flash*` — DELETE
- `src/engine/AtomicStackService.ts`, `CryptoRandom.ts`, `StateVerifier.ts`, `EngineTelemetry.ts` — DELETE (server authoritative)
- `src/engine/HeadlessTableEngine.ts`, `CashGameOrchestrator.ts`, `HandReplayEngine.ts` — REVIEW (may be test-only; delete if so)
- `src/engine/demo.ts`, `index.ts` — DELETE (re-exports of deleted code)

Callers updated:
- `src/pages/TablePage.tsx` → uses `useEngineTableState` only; never constructs a HandController
- `src/services/GameServerAPI.ts` → HTTP-only wrapper around the 17 Hetzner routes (rename if needed to match)
- `src/services/HandPersistenceService.ts` → reads from Supabase `hand_history`; does NOT call client engine
- `src/services/RakeService.ts` → reads from Supabase `rake_records` / `rakeback_periods`; does NOT compute rake client-side
- `src/services/HorseOrchestrator.ts`, `HorseBugReporter.ts` → DELETE (server owns horses)
- `src/services/TournamentTimerService.ts` → reads server-broadcast deadlines; no local timer math
- `src/services/LeaderboardService.ts`, `AchievementTriggerService.ts`, `BBJService.ts`, `HydraService.ts` → replace engine imports with Supabase RPC calls

### 2.3 Server `server/src/` split

Target layout after monolith break-up (no new files yet, just the shape):

```
server/src/
├── index.ts                 // <3 KB: bootstrap, createServer, listen, SIGTERM
├── router.ts                // <5 KB: switch statement, 17 route→handler dispatches
├── config/                  // (exists) env loading, guardrails
├── engine/                  // (exists, authoritative) 29 files, unchanged
├── services/                // (exists) unchanged
├── transport/               // (exists) WebSocket hub, unchanged
├── handlers/                // NEW — one file per HTTP route
│   ├── action.ts
│   ├── timebank.ts
│   ├── heartbeat.ts
│   ├── preaction.ts
│   ├── addchips.ts
│   ├── leave.ts
│   ├── sitout.ts
│   ├── straddle.ts
│   ├── rit.ts
│   ├── insurance.ts
│   ├── showhand.ts
│   ├── discard.ts
│   ├── postbb.ts
│   ├── admin.ts          // pause + resume
│   └── health.ts         // health + metrics + ws-metrics
└── types.ts                 // (exists) unchanged
```

This is a mechanical extraction, not a rewrite. Each handler is already an `if (method === 'POST' && url === '/…')` block in `index.ts`.

### 2.4 Supabase schema invariants

Two rules born from the 2026-04-15 audit (9 silent-failure bugs):

1. **No stranded writers.** For every UI-read table, `grep -rln "<table>" server/` must return ≥1 hit. Zero hits → red flag. CI gate should enforce this.
2. **No phantom tables.** For every `.from('<table>')` in `server/src/` and in `pages/api/*`, the table MUST exist in `pg_tables`. Missing → `42P01` silent failure. CI gate should enforce this.

### 2.5 Deploy topology

```
Developer push                     CI / Vercel                          Production
──────────────                     ───────────                          ──────────

cd ~/Documents/club-arena          git push origin main                 (no Vercel deploy)
npm run build                      (club-arena repo is not              ─────── ▲
bash scripts/sync-to-world-hub.sh  on Vercel anymore)                            │
                                                                                  │
cd ~/Documents/Smarter-Poker-      GitHub → Vercel webhook ─────────────▶  hub-vanguard
   World-Hub                       build-safety-gate.yml                         │
bash scripts/git-safe-push.sh      + Next.js build                               │
  "sync club-arena: …"             + post-deploy verify                          │
                                                                                  ▼
                                                                          smarter.poker
                                                                           (live)

(server/ change)                                                          engine.smarter.poker
cd ~/Documents/club-arena          SSH + docker restart                  (separate release)
ssh root@178.156.160.206 \\
  "cd /opt/club-arena && \\
   git pull && \\
   docker restart club-arena-engine"
```

The client build and the server build are separately deployable. They share only the WebSocket protocol shape declared in `server/src/transport/TableStateHub.ts` and mirrored in `src/services/EngineStateClient.ts`. Any protocol change must ship server-first.

---

## 3. Phased Execution Plan

Each phase has a reversibility gate. If the gate fails, revert and stop.

### Phase U1 — Cleanup (low risk, no behavior change)

| Step | Action | Verify |
|---|---|---|
| U1.1 | `rm -rf club-arena/dist.dead.47076 club-arena/*.stale.* club-arena/.git/*.lock.stale.*` | `git status` clean; no build side-effects |
| U1.2 | `mkdir club-arena/docs/_archive/handoffs` and `git mv ANTIGRAVITY-HANDOFF-*.md ANIMATION-FIX-HANDOFF.md CHAT-HANDOFF-*.md docs/_archive/handoffs/` | CA root only has current docs |
| U1.3 | Push club-engine README update: replace body with a 5-line "ARCHIVED — use club-arena repo" notice. Push. | GitHub repo displays archive banner |
| U1.4 | On GitHub: archive the `club-engine` repository via Settings → Danger Zone | Repo shows "Archived" banner |

Gate U1: CA and WH both build clean. Nothing deleted that's imported anywhere.

### Phase U2 — Close the dual-engine hazard (medium risk)

| Step | Action | Verify |
|---|---|---|
| U2.1 | For each file in `src/engine/`, `grep -rln "from '../engine/FileName\\|from './FileName\\|from 'src/engine/FileName\\|from '@/engine/FileName'" src/` and enumerate callers into a delete-plan spreadsheet | List of ~50 caller sites |
| U2.2 | For each caller, replace the `src/engine/*` import with: (a) Supabase RPC if it was reading durable state, (b) Hetzner HTTP POST via `GameServerAPI` if it was emitting an action, or (c) `useEngineTableState` hook if it was reading live state. Commit per caller. | `npm run build` green after each commit |
| U2.3 | Delete `src/engine/*` files in reverse topological order (leaves first) | No build breakage |
| U2.4 | Add ESLint rule banning `import from '../engine/' | import from '@/engine/'` | `npm run lint` fails for any reintroduction |
| U2.5 | Run the existing V8 compliance suite + PokerBros parity E2E on a staging table to confirm nothing regressed | Phase-A signoff probe still green |

Gate U2: Zero files in `src/engine/`; ESLint rule in place; full typecheck + lint + build green; live hand playable on staging.

### Phase U3 — Break up `server/src/index.ts` (medium risk, mechanical)

| Step | Action | Verify |
|---|---|---|
| U3.1 | Extract `/health`, `/metrics`, `/ws-metrics` into `server/src/handlers/health.ts`; route from `router.ts` | `curl /health` still returns SHA |
| U3.2 | Extract `/action` → `handlers/action.ts` (largest handler) | live hand shows no regression on staging |
| U3.3 | Extract remaining 14 routes one per commit | `/metrics` counters unchanged |
| U3.4 | Reduce `index.ts` to bootstrap + `listen()` + SIGTERM | `index.ts` ≤ 100 lines |
| U3.5 | Add a per-route unit test scaffold (`handlers/action.test.ts` etc.) and port the existing `StateVerifier`-based assertions | vitest runs all handler tests |

Gate U3: All 17 routes return byte-identical responses to pre-refactor snapshots. Staging hand count/hour unchanged (~85 h/h).

### Phase U4 — Supabase invariants as CI gates

| Step | Action | Verify |
|---|---|---|
| U4.1 | Add `scripts/ci/check-stranded-writers.mjs` — for every table referenced by `src/services/*`, assert at least one server-side write site exists. Fail CI otherwise. | CI catches the next stranded-writer |
| U4.2 | Add `scripts/ci/check-phantom-tables.mjs` — grep `.from('<name>')` in `server/src/` and `pages/api/`, connect to Supabase, and verify every referenced table is in `pg_tables`. Fail CI if any is missing. | CI catches the next `42P01` |
| U4.3 | Wire both into `.github/workflows/build-safety-gate.yml` as non-blocking warnings for one week, then blocking | Two rules blocking on the third week |

Gate U4: Both scripts pass against current HEAD. Any intentional exceptions are listed in a `supabase-invariants.allowlist.json`.

### Phase U5 — Deploy-pipeline housekeeping

| Step | Action | Blocks | Verify |
|---|---|---|---|
| U5.1 | Fix CA Sentry sourcemap upload in Vite build (Task #133) | nothing | CA release shows readable stack frames in Sentry |
| U5.2 | Add CA bundle-size CI budget (Task #155) — fail build if main bundle > 5 MB | U5.1 done first | CI blocks an oversized change |
| U5.3 (**DEFERRED by Dan 2026-08-17**: zero real users, cost optimization only. Code side is done — MEDIA_BASE env flip in CA 45f2228ce; runbook in .agent/handoffs/2026-08-17-u5-3-r2-static-assets.md. Revisit when real traffic makes the Vercel bill matter. Do NOT resurrect before then.) | Move `public/hub/club-arena/` large static assets (cards, club-logos, avatar packs) to Cloudflare R2 (Task #44). Update SPA to load from R2 URL. | WH rewrites updated | Vercel bandwidth cut ≥ 50 MB/deploy |
| U5.4 | Deprecate `scripts/build-club-arena.sh` duplicate pipelines — consolidate to single entrypoint: `bash scripts/sync-club-arena.sh` that runs build + sync + push | U5.1, U5.2 done | One and only one way to ship a CA change |

Gate U5: Sentry stack traces are readable, CA bundle ≤ 5 MB, R2 URLs return 200, all deploys go through one script.

### Phase U6 — Documentation consolidation

| Step | Action | Verify |
|---|---|---|
| U6.1 | This document (`CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md`) stays in `Smarter-Poker-World-Hub/` as platform doc | Linked from both `CLAUDE.md` files |
| U6.2 | `club-arena/CLAUDE.md` gets a top-of-file pointer: "For platform-level plan, see ~/Documents/Smarter-Poker-World-Hub/CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md" | pointer exists |
| U6.3 | Archive `club-arena/docs/POKERBROS_UPGRADE_PLAN.md`, `PHASE_3_PREMIUM_UPGRADE_PLAN.md`, `PHASE_4_COMPLETE_OVERHAUL_PLAN.md`, `TABLE_UI_OVERHAUL_GAMEPLAN.md`, `docs/MASTER_BLUEPRINT.md` to `docs/_archive/` with a `README.md` explaining which doc supersedes each | older docs no longer claim authority |
| U6.4 | `Smarter-Poker-World-Hub/POKERBROS-PARITY-UPGRADE-PLAN.md` → move to `docs/_archive/`. Its content is now inside Phase U2 and the PokerBros-parity signoffs in `.memory/` | archive structure clean |

Gate U6: One canonical doc; all older plans either superseded by this one or archived with a clear pointer.

---

## 4. Ownership Matrix

| Concern | Owner surface | Authoritative file |
|---|---|---|
| Game state / dealing / pot / showdown | Hetzner game server | `server/src/engine/HandController.ts` |
| Turn timer / time bank | Hetzner | `server/src/engine/PreciseActionTimer.ts` + `TimeBankEngine.ts` |
| Horse AI / fleet management | Hetzner | `server/src/services/HorseFleetManager.ts` |
| Rake + rakeback calculation | Hetzner engine → Supabase RPC | `RakebackEngine.ts` + `RakebackSettlerService.ts` |
| Tournament scheduling + balancing | Hetzner | `TournamentRecurringService.ts` + `TableBalancer.ts` |
| Durable hand log | Supabase `hand_history` | engine writes via service role |
| Wallet balances / transfers | Supabase RPC | `fn_idempotent_*_wallet` family |
| Agent commissions | Supabase RPC | `credit_agent_commission_from_rake` |
| Union chip transfers | Supabase RPC | `fn_union_send_chips_to_club` → `union_wallet_transactions` |
| BBJ pool + payouts | Supabase RPC + tables `bbj_payouts`, `bbj_payout_recipients` | server writes; client reads |
| Club branding / logos / chat | WH Next.js API | `pages/api/club-arena/*` |
| Player profile / avatar / friends | WH Next.js API | `pages/api/club-arena/*` |
| Cashout approval flow | WH Next.js API (admin-gated) | `pages/api/club-arena/approve-cashout.js` + `cashout-history.js` |
| Static assets (cards, logos) | Cloudflare R2 (Phase U5.3) until then Vercel | `public/hub/club-arena/` |
| SPA entry | Vercel WH | `public/hub/club-arena/index.html` via Next.js fallback rewrite |

The line is clear: **if it mutates stacks or moves chips, the engine or a Supabase RPC owns it — never the client and never a Next.js API route.**

---

## 5. Reversibility

Every phase above is reversible:

- **U1 cleanup** is file moves only. `git revert` restores everything.
- **U2 dual-engine kill** is committed caller-by-caller. Any regression reverts one commit, not the whole phase.
- **U3 monolith split** is route-by-route and byte-identical — the `router.ts` switch can be replaced with the old `index.ts` block.
- **U4 CI gates** start as non-blocking warnings; if they false-positive, they stay warnings until fixed.
- **U5 deploys** are each small and separately verifiable against the Vercel/Sentry dashboards.
- **U6 doc archival** is `git mv` only.

No database migrations are required by this plan. No schema changes. No Supabase project move. No Hetzner server move. No Vercel project move. The architecture is already the target — this plan just finishes arriving at it.

---

## 6. Quick-Reference: deploy commands

**Frontend change** (anywhere in `club-arena/src/`):

```bash
cd ~/Documents/club-arena
npm run build
bash scripts/sync-to-world-hub.sh ~/Documents/Smarter-Poker-World-Hub
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "sync club-arena: <what changed>"
```

Verify: https://smarter.poker/hub/club-arena/ shows new build; `curl -s https://smarter.poker/api/health | jq '.sha'` matches the commit SHA.

**Server change** (anywhere in `club-arena/server/`):

```bash
cd ~/Documents/club-arena
git add server/
git commit -m "engine: <what changed>"
git push origin main
ssh root@178.156.160.206 "cd /opt/club-arena && git pull origin main && docker restart club-arena-engine"
curl -s https://engine.smarter.poker/health | jq
```

Verify: `/health` SHA matches; `docker logs club-arena-engine --tail 50` shows clean startup; staging table continues dealing.

**Supabase migration:**

```bash
cd ~/Documents/club-arena
# author new file: supabase/migrations/<YYYYMMDD>_<description>.sql
# apply via Supabase MCP apply_migration or manual psql, NEVER via the client
```

Verify: `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;` shows the new row; the intended table/function/policy exists.

---

## 7. Open Tasks This Plan Discharges

| Task # | Title | Discharged by phase |
|---|---|---|
| #115 | Deep audit: club-arena vs club-engine + optimal rebuild plan | **this document** |
| #111 | Document club-engine as superseded in build tracker | U1.3 + U1.4 |
| #133 | Fix Club Arena Sentry sourcemap upload in Vite build | U5.1 |
| #155 | Fix CA bundle size >5 MB breaking CI | U5.2 |
| #44 | Phase 1.8 — Move Club Arena static assets to R2 | U5.3 |

Tasks this plan does **not** discharge (they are orthogonal):

- #117 update local git remotes to new PAT (ops, not architecture)
- #138, #140, #144, #147, #154, #105 — Sentry autofix pipeline audit (separate system)

---

## 8. Stop Signals

If any of the following become true, stop the phase in flight, do not advance:

1. Live hand count/hour on staging drops below 80 (baseline ~85 h/h) for more than 10 minutes.
2. `reconcile_ledger_nightly()` reports any `critical_count > 0` after the day's run.
3. Sentry issue-creation rate > 10× the prior week's median.
4. Any of the 9 bug categories documented in 2026-04-15 (stranded-writer or phantom-table) resurfaces.
5. Vercel build minutes > 25 min on main for more than one deploy in a row.
6. Hetzner container restart count > 2 in any rolling hour (indicates crash loop).

On any stop signal, revert the last phase commit, write a note to `.memory/problems/`, and ask Dan.

---

*Last words:* the architecture is right. Finish the consolidation, close the dual-engine seam, break up the server monolith, and move on to features. No rewrites.
