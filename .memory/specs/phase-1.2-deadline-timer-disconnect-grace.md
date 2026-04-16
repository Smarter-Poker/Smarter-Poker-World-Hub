# Phase 1.2 — Deadline-based Turn Timer + Disconnect Grace Period

**Status:** DRAFT
**Depends on:** Phase 1.1 shipped (PR-1 through PR-5). See
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
<<<<<<< Updated upstream
>>>>>>> Stashed changes
`.memory/context/phase-1.1-shipped.md`. 1.2 runs the moment 1.1's
grep-for-absence audit is green — no idle window.
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
=======
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
=======
`.memory/context/phase-1.1-shipped.md`. Do not start 1.2 code until 1.1 has
soaked 48h without regression.
>>>>>>> Stashed changes
**Rules:** `.memory/WORKING-RULES.md` — no band-aids, rewrites only, one
step at a time.

---

## 1. Objective

Replace every `setTimeout` / `setInterval` used to time player turns in the
game engine with a **deadline-based scheduler**: turn-expiry times are
stored as absolute wall-clock timestamps, the engine checks them at a
bounded tick rate, and the scheduler survives a process crash + restart
without timer drift or phantom auto-folds.

Also give disconnected players a formal, server-authoritative grace period
before they get auto-folded — long enough to reload a tab or flap WiFi,
short enough that a deliberately-offline player doesn't stall the table.

---

## 2. Why this is Phase 1.2 and not part of 1.1

Turn-timer correctness was the *symptom* behind "my turn got skipped" —
but once Phase 1.1 ships, the **client** is always in sync with the
engine, so the real UX problem is gone. What remains are correctness
issues that can bite under load or restart:

- `setTimeout(cb, 15000)` drifts if the event loop is blocked. On a busy
  container (50+ tables) this has been observed up to 900ms of slip.
- If the server restarts mid-hand, every in-flight `setTimeout` is lost
  and the hand either hangs (no auto-fold ever fires) or double-fires
  (new engine spawns its own timer on top of the reloaded state).
- `DisconnectEngine.sitOut(voluntary)` currently only triggers on
  explicit button press; a real WS drop has no formal grace-period state
  and the player either auto-folds on first turn miss or blocks the table
  forever.

These failure modes don't show up every hand, but they DO show up in a
50-table load test. Per rule 12 we rewrite rather than patch.

---

## 3. Current architecture (as of Phase 1.1)

```
ServerTableEngine
  ├─ PreciseActionTimer   (server/src/engine/PreciseActionTimer.ts)
  │     • setTimeout-based. Stores fn + delayMs, reschedules on reset.
  │     • No persistence. Process restart loses all pending timers.
  ├─ DisconnectEngine     (server/src/engine/DisconnectEngine.ts)
  │     • Tracks `isConnected(tableId, userId)` boolean per seat.
  │     • Flipped via heartbeat HTTP POST or sitOut API.
  │     • Does NOT gate turn-timer — if player is disconnected, they still
  │       get their 15s and auto-fold the same as a connected player.
  └─ TimeBankEngine       (server/src/engine/TimeBankEngine.ts)
        • Grants +N seconds on request. Uses setTimeout internally.
        • Also drift-prone + non-persistent.
```

Persistence state today: `hand_state_snapshots` table in Supabase has
`current_player_turn_started_at` but the engine does not consult it on
restart to reconstruct pending timers.

---

## 4. Target architecture

```
ServerTableEngine
  ├─ DeadlineScheduler    (NEW — server/src/engine/DeadlineScheduler.ts)
  │     • One setInterval tick at 100ms granularity per process.
  │     • Priority queue of (tableId, eventId, deadlineMs, callback).
  │     • On process start, reconstructs pending deadlines from
  │       hand_state_snapshots and re-registers them with corrected
  │       deadlines (deadline — now; if already past, fire on next tick).
  │     • Idempotent scheduling: re-registering same (tableId, eventId)
  │       replaces prior entry. No leaked timers across resets.
  │
  ├─ DisconnectEngine     (REWRITTEN — formal state machine)
  │     • states: CONNECTED → MISSING (WS dropped, <grace) → DISCONNECTED
  │       (grace exhausted, still not back) → SAT_OUT (auto-fold on turn)
  │     • Grace period: 30s for cash, 60s for tournaments (configurable).
  │     • Heartbeat arrival flips MISSING → CONNECTED.
  │     • Turn-timer behavior depends on state:
  │         CONNECTED: normal 15s clock
  │         MISSING:   normal 15s clock, but if it expires AND state is
  │                    still MISSING (not CONNECTED), auto-check (not fold)
  │                    when no raise to call; auto-fold otherwise.
  │         DISCONNECTED/SAT_OUT: skip straight to auto-fold, no clock.
  │
  └─ TimeBankEngine       (UPGRADED)
        • Stops carrying its own setTimeout; registers a deadline with
          DeadlineScheduler and lets it fire.
        • Survives restart (deadline persisted in hand_state_snapshots).
```

---

## 5. Deliverables

### Server

1. **`server/src/engine/DeadlineScheduler.ts`** — NEW
   Min-heap priority queue. Public surface:
     - `schedule({tableId, eventId, deadlineMs, callback})`
     - `cancel({tableId, eventId})`
     - `cancelAll(tableId)`
     - `persistPending()` — dumps JSON of all upcoming deadlines for a
       tableId so `ServerTableEngine.saveSnapshot()` can include them.
     - `rehydrate(tableId, pending[])` — reinstalls on engine start after
       a crash / container restart.

2. **Replace `PreciseActionTimer` usage** throughout `ServerTableEngine`
   and `HandController` with DeadlineScheduler. Delete PreciseActionTimer
   (rule 12).

3. **`DisconnectEngine` rewrite** — formal state machine with the four
   states above. DB schema change: add `hand_state_snapshots.
   disconnect_states JSONB` keyed by userId. Migration:
   `supabase/migrations/20260420_disconnect_fsm.sql`.

4. **`TimeBankEngine` upgrade** — use DeadlineScheduler; stop owning its
   own timers.

5. **Restart recovery** — on `ServerTableEngine.start()`, read the most
   recent row from `hand_state_snapshots` for the tableId, rehydrate
   deadlines into DeadlineScheduler. Verify: kill a container mid-hand;
   new container finishes the hand within one tick of the original
   deadline.

### Client

6. **Action panel countdown from deadline** — instead of receiving a
   `turn_duration_ms` + `turn_start_time_ms` pair and doing local math,
   the engine broadcasts `turn_deadline_ms` (absolute wall-clock
   timestamp). Client renders
   `remainingMs = Math.max(0, turn_deadline_ms - Date.now())`. This
   eliminates clock-skew drift between server and client (only absolute
   wall-clock, no relative duration).

7. **Disconnect UI** — when own-user DisconnectEngine state becomes
   MISSING, show a "Reconnecting — X seconds until auto-check" toast.
   State reaches DISCONNECTED → "Session lost — rejoin to continue".

---

## 6. Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| B1 | Kill engine container with 3 hands mid-turn, bring it back within 20s. Each hand resumes and auto-folds on its original deadline ± 100ms. | scripted test + timestamps |
| B2 | 50 concurrent tables, 6 players each, all at the flop. Measure max turn-timer drift across 500 turns. Target: p99 < 150ms. | k6 + engine telemetry |
| B3 | Close the browser tab mid-turn as a real player. Engine marks MISSING within 10s of WS close (heartbeat timeout), transitions to DISCONNECTED at grace end, auto-checks the turn if legal. | manual |
| B4 | Reopen tab within grace window → MISSING → CONNECTED, turn clock keeps running. | manual |
| B5 | `PreciseActionTimer` referenced zero times in source. `grep -r` clean. | rule 12 check |
| B6 | Client displays accurate countdown even when OS clock is skewed by ±500ms vs server. Uses broadcast deadline, not local math. | manual: adjust OS clock |

---

## 7. Rollout plan

One PR per deliverable. Each follows the PR-1..PR-5 cadence:

- **PR-A**: DeadlineScheduler + 30+ unit tests. Not wired. Verify-green.
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
<<<<<<< Updated upstream
>>>>>>> Stashed changes
- **PR-B**: Replace `PreciseActionTimer`'s internal `setInterval` + expiry
  scan with `DeadlineScheduler.schedule` / `.cancel`. Public API of
  PreciseActionTimer is unchanged; its internals no longer hold their own
  clock. Every existing caller benefits without code change. Deploy, verify
  with grep that no `setInterval` remains in PreciseActionTimer.ts.
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
=======
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
=======
- **PR-B**: Wire DeadlineScheduler inside `PreciseActionTimer` as the
  execution backend (temporarily) so every existing caller transparently
  benefits. Deploy, observe.
>>>>>>> Stashed changes
- **PR-C**: Migrate `hand_state_snapshots` schema. DB migration through
  Supabase SQL mcp.
- **PR-D**: Persistence + rehydrate path. Kill-test verification.
- **PR-E**: Rewrite `DisconnectEngine` FSM. Client-side toast.
- **PR-F**: Client uses `turn_deadline_ms`. Engine broadcast adds that
  field; client picks it up; old `turn_start_time_ms`/`turn_duration_ms`
  stay for one cycle for safety.
- **PR-G**: Delete `PreciseActionTimer`. Delete legacy duration fields.
  Rule 12 satisfied.

## 8. Rollback

DeadlineScheduler can run with a feature flag
(`ENGINE_USE_DEADLINE_SCHEDULER=0`) that falls back to the old
`setTimeout` path. Disabling it stops using the scheduler without
losing state — deadlines collapse to `setTimeout(deadline - now)` for
the remaining lifetime of each engine instance.

## 9. Estimated effort

- PR-A (scheduler + tests): 1.5 days
- PR-B (wire, no behavior change): 0.5 day
- PR-C (migration): 0.5 day
- PR-D (persistence + rehydrate): 1.5 days
- PR-E (FSM + UI): 2 days
- PR-F (client deadline): 1 day
- PR-G (cleanup): 0.5 day
- Load test (B2): 1 day
- Buffer: 1.5 days

**Total: ~10 working days.**

---

## 10. Next action

<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
<<<<<<< Updated upstream
>>>>>>> Stashed changes
Begin PR-A the moment Phase 1.1's grep-for-absence audit is green
(`rg 'broadcastHandState|subscribeToHandState'` returns zero across
server/src and src). No idle window. Load test is an independent track.
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
=======
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
=======
After Phase 1.1 soak + load test pass, begin PR-A.
>>>>>>> Stashed changes
