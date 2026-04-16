# Phase 1.3 — Action Rejection UX + Validator Telemetry

**Status:** DRAFT
**Depends on:** Phase 1.1 shipped (engine WS pipeline). Phase 1.2 in flight
through PR-F. Can start in parallel with the remaining 1.2 PRs since the
touch-surface (handlePlayerAction response body + ActionPanel) doesn't
overlap.
**Rules:** `.memory/WORKING-RULES.md` binding.

---

## 1. Objective

When the engine rejects a player action (too-low raise, not-your-turn,
action-expired, etc.) the client currently only sees `{success:false,
error: "reason string"}`. That's enough to log but not to build a
good UX around. This phase surfaces the rejection with:

- A structured `code` the client can branch on (e.g. `BELOW_MIN_RAISE`)
- A `hint` object with the values the client needs to correct the action
  (e.g. `{minRaiseTo, maxRaiseTo, toCall}`)
- A toast UI for transient error cases + inline correction for
  BELOW_MIN_RAISE / ABOVE_MAX_RAISE (adjust the slider automatically)

And server-side telemetry:
- Count rejections per code per table per hour
- Surface via `/validator-metrics` route for monitoring

---

## 2. Current state audit

### Server (ServerTableEngine.handlePlayerAction)

The `actionValidator.validate()` already returns `{valid, reason, code,
sanitizedAction, sanitizedAmount}` from ServerActionValidator.ts. The
engine uses it correctly — rejects via `{success:false, error:reason}`
WITHOUT auto-folding. This half is healthy.

### Client (submitAction in GameServerAPI.ts)

Parses `{success, error}` only. Drops the `code` if the server sends it.
Doesn't show the error to the user — just `console.warn`.

### Gap

The validator knows WHY an action was rejected but the client never
gets the code, so the UX can't differentiate between "you already
folded" (unrecoverable, show a message) and "raise too small" (the
slider just snaps to min).

---

## 3. Target behavior

### Server (POST /action response)

```json
{
  "success": false,
  "error": "Raise must be at least 4.00",
  "code": "BELOW_MIN_RAISE",
  "hint": {
    "minRaiseTo": 4.00,
    "maxRaiseTo": 98.00,
    "toCall": 2.00
  }
}
```

Always include `code`. Include `hint` whenever the validator knows
specific numeric bounds. Shape is JSON-stable — client parses with a
narrow type.

### Client (ActionPanel + toast)

- On `BELOW_MIN_RAISE` with `hint.minRaiseTo`: auto-snap the slider to
  min, show a brief inline chip "Minimum raise: $N", fire the press
  flash animation again so the user can confirm.
- On `ABOVE_MAX_RAISE` similarly, snap to all-in.
- On `NOT_YOUR_TURN` / `ALREADY_ACTED` / `ACTION_EXPIRED`: re-sync from
  engine state (force a `RESYNC` through the WS), the action panel
  will unmount if state is now opponent's turn. Show nothing loud —
  server got here first, client was stale.
- On `ALREADY_FOLDED`: disable the action panel permanently for the
  rest of this hand with a "Folded" label.
- Other codes: toast with the reason string for 3s. Dismiss on next
  state update.

### Server telemetry

New counter on `EngineTelemetry`:
- `recordValidationRejection(tableId, code)`
- `getValidationStats() → { [tableId]: { [code]: count, total: N } }`

Exposed via `GET /validator-metrics` (public, counts only).

---

## 4. Deliverables

### Server

1. `engine/ServerActionValidator.ts` — already returns `{code, reason}`.
   Add a `hint` field to `ValidationResult` populated for these codes:
     - `BELOW_MIN_RAISE` → `{minRaiseTo}`
     - `ABOVE_MAX_RAISE` → `{maxRaiseTo}`
     - `INSUFFICIENT_STACK` → `{maxRaiseTo}`
     - `NOTHING_TO_CALL` → `{canCheck: true}`
     - `CANNOT_CHECK` → `{toCall}`

2. `engine/ServerTableEngine.handlePlayerAction` — include `code` and
   `hint` in the returned rejection object so the HTTP layer forwards
   them.

3. `index.ts POST /action` — no changes; already forwards whatever
   `handlePlayerAction` returns.

4. `index.ts` — new `GET /validator-metrics` route returning the
   aggregated stats from EngineTelemetry.

5. `engine/EngineTelemetry.ts` — new counter + accessor. Add a ring
   buffer of the last 100 rejections per table for deeper debugging.

6. Tests: ServerActionValidator.test.ts (new) covering each error code
   produces the correct hint shape, plus telemetry counter asserts.

### Client

7. `services/GameServerAPI.ts` — `ActionResult` interface gains
   `code?: ValidationErrorCode` and `hint?: ActionHint`. Parse them off
   the response.

8. `components/table/ActionPanel.tsx` — handle rejection codes:
     - BELOW_MIN_RAISE → snap slider to `hint.minRaiseTo`
     - ABOVE_MAX_RAISE → snap slider to `hint.maxRaiseTo`
     - ALREADY_FOLDED → enter a permanent "Folded" state until next hand
     - Others → emit on an `onError` prop

9. `components/table/ActionErrorToast.tsx` — NEW, mirror of
   DisconnectToast but for action rejections. 3s auto-dismiss.

10. `pages/TablePage.tsx` — wire `onError` from ActionPanel into the
    toast state.

---

## 5. Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| C1 | Submit a raise of 1 when min is 4. Server returns 400 with code BELOW_MIN_RAISE + hint.minRaiseTo=4. Client slider snaps to 4 within 100ms. | manual |
| C2 | Submit a check when there's a bet to call. Server returns CANNOT_CHECK + hint.toCall. Client shows toast "Can't check — $N to call" for 3s. | manual |
| C3 | Tab in background for 20s; try to act on a turn that already expired server-side. Server returns ACTION_EXPIRED. Client force-resyncs via WS RESYNC; action panel unmounts if appropriate. | manual |
| C4 | After hero folds, try to submit another action via browser console. Server returns ALREADY_FOLDED. Client panel shows "Folded" badge for rest of hand. | manual |
| C5 | `/validator-metrics` returns { [tableId]: { NOT_YOUR_TURN: N, BELOW_MIN_RAISE: M, total: N+M, ... } } | `curl` |
| C6 | Throw-load 1000 rejections of mixed codes into one table; metrics counter accurate, ring buffer bounded to last 100. | scripted test |
| C7 | `rg "Action validation failed"` returns zero matches after PR-F — all rejections surface with specific codes. | grep |

---

## 6. Rollout

One PR per deliverable section, tested + deployed independently.

- **PR-A** — ServerActionValidator hint field + tests
- **PR-B** — engine + HTTP forwarding, telemetry counter
- **PR-C** — client parsing + ActionPanel rejection handling
- **PR-D** — ActionErrorToast + TablePage wiring
- **PR-E** — /validator-metrics route + smoke test

<<<<<<< Updated upstream
Each PR ~0.5 day. Total ~3 working days incl. tests and verification.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.
=======
>>>>>>> Stashed changes
Each PR ~0.5 day. Total ~3 working days incl. tests and soak.

## 7. Rollback

Server-only PRs: revert commit; engine rebuild (~2 min). Client PRs:
redeploy prior bundle from `public/hub/club-arena/` git history.
No user data touched.

## 8. Next action

Start PR-A once Phase 1.2 PR-F has 48h of clean observability.
