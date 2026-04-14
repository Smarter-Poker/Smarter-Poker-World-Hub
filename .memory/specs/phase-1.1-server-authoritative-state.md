# Phase 1.1 — Server Engine as Sole Authoritative Game State Transport

**Status:** DRAFT — awaiting Dan's approval before any code changes
**Owner:** Claude (session lead)
**Created:** 2026-04-13
**Rules:** Bound by `.memory/WORKING-RULES.md`. No exceptions. No band-aids.

---

## 1. Objective

Make the game engine on `engine.smarter.poker` the **single, authoritative
transport for all game state updates**, delivered over a native WebSocket the
engine itself serves. Delete the Supabase Realtime path for game state. No
fallbacks, no shims, no dual-delivery.

This closes the root cause of every "my turn got skipped" report — today the
client depends on Supabase Realtime broadcasts reaching a browser that is
simultaneously failing to maintain that Realtime socket, so turn changes are
silently missed and the server's 15-second timer auto-folds the player.

---

## 2. Non-Goals

- Hole card security — **already implemented correctly** in
  `ServerTableEngine.broadcastCurrentState()` (scrubs cards, uses
  `table_hole_cards` + RLS for per-player delivery). Verified, not touching it.
- Rewriting the engine internals (HandController, PokerEngine, hand lifecycle
  logic) — those are out of scope for 1.1 and covered by later phases.
- UI polish (action badges, dealer button art, hole card position, bet slider
  presets, mobile layout) — all pending until 1.1 is green.
- Tournament / variant support — not changed by 1.1.

---

## 3. Current Architecture (what exists today, verified by reading code)

```
                     ┌──────────────────┐
  Player action →    │  POST /action    │  HTTP, JWT-auth'd, returns {success}
  (ActionPanel)      │  (Node server    │
                     │   on Hetzner)    │
                     └─────┬────────────┘
                           │
                           ▼
                     ┌──────────────────┐
                     │ServerTableEngine │
                     │(runs hand, calls │
                     │ broadcastCurrent │
                     │  State())        │
                     └─────┬────────────┘
                           │
                           ▼
                     ┌──────────────────┐
                     │ broadcastHand    │    ← Supabase Realtime. FLAKY.
                     │ State() →        │      Client often misses messages.
                     │ channel.send()   │
                     └─────┬────────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
          subscribeToHand    useTableWebSocket
          State (postgres    (Supabase Realtime
          changes listener)   channel listener)
                  │                 │
                  └───────┬─────────┘
                          ▼
                   TablePage.setTableState()
                      (often stale)
```

**Evidence of brokenness (captured in this session, 2026-04-13):**
- Console shows repeating `[Watchdog] Supabase connection lost (after repeated failures)`
- `TypeError: Failed to fetch (kuklfnapbkmacvwxktbh.supabase.co)` floods the log
- Hand #263 progressed through flop/turn/river server-side but the client UI
  never mounted ActionPanel on hero's turn — server 15s timer auto-folded
- Direct HTTP probe of `/state/:tableId` returned the true current_player = hero,
  confirming the engine was correct and the client was behind.

---

## 4. Target Architecture

```
                     ┌──────────────────┐
  Player action →    │  POST /action    │  HTTP, JWT-auth'd, now returns
  (ActionPanel)      │                  │  {success, state, error}
                     └─────┬────────────┘
                           │
                           ▼
                     ┌──────────────────┐
                     │ServerTableEngine │
                     │(runs hand)       │
                     └─────┬────────────┘
                           │ emits event
                           ▼
                     ┌──────────────────┐
                     │ TableStateHub    │  NEW — maintains set of WS
                     │ (in-process)     │  subscribers per tableId,
                     └─────┬────────────┘  publishes SNAPSHOT / DELTA
                           │
                           ▼
                     ┌──────────────────┐
                     │ WebSocketServer  │  NEW — native `ws` server
                     │ /ws/table/:id    │  attached to existing http
                     │ JWT handshake    │  server, one socket per tab
                     └─────┬────────────┘
                           │
                           ▼
                  ReconnectingWebSocket  ← already exists client-side
                  + DeltaSyncService        (src/services/*)
                           │
                           ▼
                   TablePage.setTableState()
                    (always current)

                  Supabase Realtime used ONLY for:
                     - chat messages
                     - table presence (who's watching)
                     - club-level notifications
```

**Transport contract (binding):**

- WS URL: `wss://engine.smarter.poker/ws/table/:tableId`
- Handshake auth: JWT via `Sec-WebSocket-Protocol: bearer, <token>` subprotocol,
  validated against Supabase `auth.getUser(token)`. Invalid → 401, close with
  code 4401.
- On connect, server sends exactly one SNAPSHOT message:
  `{type: "SNAPSHOT", seq: N, state: EngineSnapshot}`
- Each subsequent engine event emits a DELTA:
  `{type: "DELTA", seq: N+1, prev: N, patch: JSONPatch[]}`
  where `patch` follows RFC 6902 over the snapshot shape.
- Client missing a seq number sends `{type: "RESYNC", lastSeq: N}`; server
  responds with a fresh SNAPSHOT.
- Heartbeat: server sends `{type: "PING", ts}` every 25s; client replies
  `{type: "PONG", ts}`. 60s without PONG → server closes.
- Close codes: 4401 auth failed, 4404 table not found, 4429 rate-limited,
  4500 server error.

---

## 5. Deliverables

### Server (club-arena/server)

1. **`server/src/transport/TableStateHub.ts`** — NEW
   - Per-tableId pub/sub. `publish(tableId, state)`, `subscribe(tableId, ws)`,
     `unsubscribe(ws)`. Deduplicates by seq. Supplies SNAPSHOT on subscribe.

2. **`server/src/transport/EngineWebSocketServer.ts`** — NEW
   - Wraps `ws` WebSocketServer. Handles upgrade on `/ws/table/:id`, JWT auth,
     message routing (RESYNC, PONG), close cleanup. Rate-limited per connection.

3. **`server/src/index.ts`** — MODIFY
   - Attach WebSocketServer to `httpServer` in `upgrade` event.
   - Wire `ServerTableEngine.broadcastCurrentState()` to call
     `TableStateHub.publish(tableId, state)` INSTEAD OF
     `broadcastHandState(...)`.
   - Delete the `broadcastHandState` import and its call sites (rule 12: no
     dead code left behind).

4. **`server/src/services/supabase.ts`** — MODIFY
   - Delete `broadcastHandState()` export. Delete `channelCache` entries used
     only by it. Keep `cleanupAllChannels()` for the remaining channel-based
     features (chat/presence).

5. **`server/src/engine/ServerTableEngine.ts`** — MODIFY
   - Replace the `broadcastHandState()` call inside `broadcastCurrentState()`
     with a direct `TableStateHub.publish(...)`. Snapshot shape unchanged —
     the existing state object is already authoritative.

### Client (club-arena/src)

6. **`src/services/ReconnectingWebSocket.ts`** — VERIFY AND USE
   - Exists. May need minor edits for the new handshake subprotocol header.

7. **`src/services/DeltaSyncService.ts`** — VERIFY AND USE
   - Exists. Validate it handles the SNAPSHOT/DELTA contract above. If it
     doesn't, rewrite to match exactly, no shim.

8. **`src/services/GameServerAPI.ts`** — MODIFY
   - `submitAction()` returns `{success, state?, error?}`. On 2xx, parse
     server response; engine endpoint is upgraded to include the new state
     in the response body.
   - Keep `connectTableWebSocket()`, but rewire it to the real endpoint with
     the JWT subprotocol handshake.

9. **`src/hooks/useEngineTableState.ts`** — NEW
   - Opens the engine WS. Subscribes. Exposes `{snapshot, isConnected,
     lastSeq}`. Handles RESYNC on gap. Cleans up on unmount.

10. **`src/pages/TablePage.tsx`** — MAJOR MODIFY
    - Delete `subscribeToHandState(...)` call and its handler (~100 lines at
      line 1884+).
    - Replace `useTableWebSocket` for game-state fields with
      `useEngineTableState`. Keep `useTableWebSocket` only for the presence /
      chat / `sendChat` surface.
    - One `useEffect` maps `snapshot → setTableState(...)` for the game-state
      fields: pot, communityCards, boardStage, currentPlayerSeat, dealerSeat,
      lastActions, lastBetAmounts, players stacks/status.
    - Delete `useEngineState.ts` (the stub I created earlier in this session)
      — superseded by `useEngineTableState`.

11. **`src/components/table/ActionPanel.tsx`** — MINOR MODIFY
    - The `submittedAction` state I added stays (it's not a band-aid — it's
      the UX contract: button feels pressed on click). But the SAFETY timer
      becomes unnecessary because `submitAction` now returns and the parent
      can tell the panel to clear `submittedAction` via a prop. Replace the
      1500ms `setTimeout` with a `clearOnAck` prop driven by the parent.

### Deletions (rule 12)

- `broadcastHandState()` function — deleted.
- `subscribeToHandState()` function — deleted.
- Any client reference to the `hand-state:${tableId}` Supabase channel —
  deleted.
- `useEngineState.ts` (my earlier stub) — deleted.

---

## 6. Acceptance criteria

Each criterion is pass/fail, observable, and must be demonstrated before 1.1
is considered shipped.

| # | Criterion | How verified |
|---|-----------|--------------|
| A1 | Two tabs on the same table, same user, receive state DELTAs from engine WS within 150ms of `broadcastCurrentState()` | timestamp log + console inspection |
| A2 | Kill Supabase project. Client still sees every turn change. | manual: revoke anon key, reload |
| A3 | Disconnect client WiFi for 10s, reconnect. Client resyncs with fresh SNAPSHOT. No missed turns once reconnected. | manual: offline toggle in DevTools |
| A4 | ActionPanel buttons disable on click and re-enable only on server ack (or visible error toast on failure). Zero perceived latency between click and button state change. | manual: 10 clicks, zero ghost-clickable windows |
| A5 | Invalid JWT in WS handshake gets 4401 close code; client shows re-auth toast. | manual: manually corrupt token, reload |
| A6 | Load test: 50 concurrent tables, 6 clients each, 10 hands per table. Zero missed turn notifications client-side. | k6 or similar; reported metrics |
| A7 | Chat and presence still work unchanged. | manual: send chat, see online indicator |
| A8 | `rg "broadcastHandState"` and `rg "subscribeToHandState"` both return zero matches outside git history. | `rg` in checkout |

---

## 7. Test matrix

| Layer | Test | Tool |
|-------|------|------|
| TableStateHub | publish/subscribe fan-out, unsubscribe cleanup, seq monotonic | vitest |
| EngineWebSocketServer | JWT accept, JWT reject, RESYNC flow, ping/pong, rate limit | vitest + `ws` test client |
| ServerTableEngine | broadcastCurrentState emits to hub with monotonic seq | vitest, mock hub |
| ReconnectingWebSocket | reconnect with backoff, resync on gap | vitest jsdom + mock ws |
| useEngineTableState | snapshot → state mapping, cleanup on unmount | vitest + @testing-library/react |
| TablePage | action click → submitAction → button disables → ack → button re-enables | playwright |
| End-to-end | hand from posting blinds through showdown on real engine, watched via real client | manual + playwright |

---

## 8. Rollout plan

One PR per deliverable section. No combined PRs. Each PR must:
- Cite this spec
- Include its own unit tests
- Pass CI (typecheck + vitest)
- Be reviewed by Dan before merge

Deployment order:
1. PR-1: Server new modules (`TableStateHub`, `EngineWebSocketServer`) — not
   yet wired. CI verifies they compile and unit-test.
2. PR-2: Server wiring. `broadcastCurrentState` publishes to hub AND still
   calls `broadcastHandState` (one exception to rule 12, documented: needed
   for no-downtime rollout). Deploy to engine.
3. PR-3: Client new hook + WS wiring. Feature flag `VITE_USE_ENGINE_WS=1`
   routes game state through engine WS instead of Supabase. Default off.
4. PR-4: Enable feature flag in production config. Smoke test one table.
5. PR-5: Remove `broadcastHandState` server-side and Supabase subscription
   client-side. Dead code gone. Rule 12 satisfied.

The one rule-12 exception in PR-2 is paid back in PR-5. This is documented so
it isn't forgotten.

## 9. Rollback plan

- Server: revert to pre-PR-2 commit. Supabase Realtime path still intact
  until PR-5.
- Client: flip `VITE_USE_ENGINE_WS=0`, redeploy. Falls back to the Supabase
  path until the server rollback completes.
- Full rollback window: <10 min (Vercel redeploy + one git revert + engine
  container restart).

---

## 10. Open questions (Dan to answer before code)

1. **JWT in WS handshake via subprotocol vs query param?** Subprotocol is
   cleaner (survives redirects, not logged). Query param is easier to
   debug. Recommending subprotocol.
2. **Seq number persistence across server restart?** Option A: seq resets to
   0 per-table on engine start, client treats gap as forced resync. Option
   B: seq persisted to Redis. Recommending A — simpler, restart is
   infrequent.
3. **Delta format: RFC-6902 JSON Patch vs custom ops?** RFC-6902 has library
   support on both sides. Custom is more compact. Recommending RFC-6902.
4. **Rate limiting on WS: per-user or per-connection?** Per-user
   (sum across tabs). Recommending per-user at 30 msgs/sec.

---

## 11. Estimated effort

Realistic, honest:

- PR-1 (server new modules + tests): 1.5 days
- PR-2 (server wiring + deploy + observe): 1 day
- PR-3 (client hook + TablePage refactor + feature-flagged): 2 days
- PR-4 (enable flag + smoke test): 0.5 day
- PR-5 (delete legacy + tests + deploy): 1 day
- Load test (A6): 0.5 day
- Buffer (there always is one): 1.5 days

**Total: ~8 working days** for Phase 1.1 alone. Matches the "multi-week"
expectation from the parity plan.

---

## 12. Next action

Dan reviews this spec. Accepts, rejects, or asks for changes to any section.
No code is written until Dan says "approved" in chat. One step at a time.
