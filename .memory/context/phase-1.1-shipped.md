# Phase 1.1 — SHIPPED and VERIFIED (2026-04-14)

Per `.memory/specs/phase-1.1-server-authoritative-state.md`.

## What shipped

### PR-1 — Transport primitives
- `server/src/transport/TableStateHub.ts` — in-process pub/sub, seq-monotonic,
  RFC-6902 JSON Patch deltas, subscriber eviction, resync support.
- `server/src/transport/EngineWebSocketServer.ts` — native `ws` server,
  JWT-subprotocol handshake, rate limiting, heartbeat ping/pong, proper
  HTTP error codes on pre-handshake rejection.
- `server/src/transport/wsHelpers.ts` — pure helpers (path parse, JWT
  extraction) with 14 unit tests.
- 30/30 vitest green, `tsc --noEmit` clean.
- Commit: `d599011a` on Smarter-Poker-Club-Arena main.

### PR-2 — Engine wiring
- `ServerTableEngine.setHub()` + dual-publish in `broadcastCurrentState()`.
- `EngineWebSocketServer.attach(httpServer)` in index.ts.
- Hub injection at every `new ServerTableEngine(id)` site (4 sites).
- `tableStateHub.dropTable(id)` at every engine-removal site.
- `GET /ws-metrics` route.
- Commit: `5dbebc96` + CJS interop fix `09d5e26a` + error-code polish `ba69dcf2`.
- Deployed to Hetzner VPS (178.156.160.206). Container healthy.

### PR-3 — Client WS consumer
- `src/services/EngineStateClient.ts` — WS client with reconnect, resync,
  JSON Patch apply, ping/pong, close-code handling.
- `src/hooks/useEngineTableState.ts` — React binding.
- `src/utils/mapEngineSnapshot.ts` — engine shape → TableState shape.
- `TablePage.tsx` — feature-flagged `useEffect` applies engine snapshot to
  `tableState` when `VITE_USE_ENGINE_WS=1`.
- Commit: `b3dde4fe`.

### PR-4 — Feature flag on
- Vite build with `VITE_USE_ENGINE_WS=1` baked in produced
  `index-CYo6HIjH.js` / `TablePage-Ba_T8bOA.js`.
- Bundle copied into `Smarter-Poker-World-Hub/public/hub/club-arena/assets/`.
- Committed to World Hub via GitHub API (disk-constrained path): `c4a61b6b`.
- Hub-vanguard deploy initially failed on a **pre-existing** bug in
  `pages/hub/poker-near-me.js` introduced by a prior code-splitting refactor
  (ReferenceError: `centerLat`, then `consumedVenueNames` etc).
- Fixed by adding the missing decls inline: commits `69d55ae1` + `b83d0521`.
- Hub-vanguard production deploy READY on commit `b83d0521`.

## Verification (2026-04-14, 05:39 UTC)

- Live browser at https://smarter.poker/hub/club-arena/table/6e1f8768-...
  loads the fresh bundle (`index-CYo6HIjH.js`).
- `curl https://engine.smarter.poker/ws-metrics` returns
  `{"totalSubscribers":1,"activeConnections":1}` — that's Dan's live tab.
- `RECONNECTING...` state is gone. Supabase flakiness no longer drops game
  state; the engine WS delivers it directly.
- 15 active tables running on the engine. 1217+ hands dealt in the session.

## Remaining for Phase 1.1

- **PR-5**: Delete `broadcastHandState()` on server + `subscribeToHandState`
  on client after a ~48h soak period. Blocking rule 12 cleanup.
- **Load test (A6)**: 50 concurrent tables × 6 clients × 10 hands. Before
  this runs green, don't claim Phase 1.1 as "done-done".
- **Smoke test**: sit Dan at a table, play one full hand end-to-end, verify
  each action transitions promptly (no skipped turn) with new pipeline.

## Working rules locked

`.memory/WORKING-RULES.md` (2026-04-13) — 12 rules Dan set, including:
- One step at a time (rule 1)
- Rewrites and hardcodes only, no band-aids (rule 12)
- Never ask for permission, the answer is always yes (rule 12a)
- No "bots" — horses; no "looks good"; no emoji in code

These are binding on every future session.

## Key identifiers / paths

- Game engine: `engine.smarter.poker` (Hetzner 178.156.160.206)
- Main Vercel project (smarter.poker): `hub-vanguard`
  (prj_op66GkZyZcygXQKm76iyycfVFAQx)
- Secondary Vercel project (unused for prod, keep for staging redirects):
  `club-arena` (prj_oaCq8RYhExLRUYizLG93li0uX468)
- Team: `team_SVD8r7AOPH065G3usBxVvrBc`
- Deploy hook for hub-vanguard: `Tw4O1eDeVc` (name: "Agent Deploy")
- Ships from `/Users/smarter.poker/Documents/club-arena` →
  `Smarter-Poker-World-Hub/public/hub/club-arena/` via
  `scripts/build-club-arena.sh` OR via direct GitHub Contents API commit.
- WS endpoint: `wss://engine.smarter.poker/ws/table/:tableId` with
  `Sec-WebSocket-Protocol: bearer, <supabase_jwt>`.
