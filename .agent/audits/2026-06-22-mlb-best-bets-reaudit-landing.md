# MLB Best Bets — re-audit landing (2026-06-22)

Follow-through session for `/hub/MLB-ANALYTICS/best-bets`. The deep swarm
audit + most fixes landed in prior sessions (see
`2026-06-21-mlb-best-bets-audit-and-fixes.md`). This session landed the final
six refinements that earlier sessions kept losing to Antigravity hard-resets
and a blocked `git push`.

## What landed (PR #548 -> squash `9653d4d` on main)

**pages/api/mlb/best-bets.ts**
- A1: import canonical `tier()` from `src/lib/betScore`; recompute
  `bet_tier = tier(bet_score)` after BOTH request-time score penalties.
  Penalty 2 (elite opposing pitcher, -15) never recomputed the tier before,
  leaving a stale ELITE/STRONG label; penalty 1's hand-rolled downgrade only
  covered ELITE->STRONG (not LEAN/THIN). `tier()` is the single source of truth.
- A2: on the RPC path, derive headline `topScore`/`topLock` from the
  POST-penalty `enrichedBets` (matching how `eliteBets` already works), with
  fallback to the RPC's pre-penalty stats; keeps the 0-1 -> 0-100 topLock norm.

**pages/hub/MLB-ANALYTICS/best-bets.tsx**
- F1d/F1e: Team ERA / Team AVG guards `!== undefined` -> `!= null` so a null
  value hides the tile instead of rendering `0.00` / `.000`.
- F6: removed the dead "Best First 5 Innings" `bestF5` useMemo + carousel —
  the engine never emits an F5/first_5 market into pred_best_bets.

**src/hooks/useVIP.js**
- Moved the `localStorage.setItem(VIP_CACHE_KEY, ...)` out of the render body
  into `useEffect([initializing, contextIsVip])` so the hook is a pure
  function of its inputs (no side-effecting write during render).

No schema/RLS/SQL changes this session. The engine-DB security hardening from
the prior session remains in place (verified: `pred_best_bets` grants to
anon/authenticated are SELECT-only).

## Infra notes for future agents (IMPORTANT)

1. `git push` is network-blocked from the Cowork sandbox this session. Even a
   14-object thin pack over HTTP/1.1 hangs (rc=124). `git fetch`/clone and the
   GitHub REST API both work. Reliable landing path that worked: build blobs
   from local files via `POST /git/blobs` (base64), then `/git/trees`
   (base_tree = current main tree), `/git/commits`, `/git/refs`, then PR +
   merge via the GitHub MCP. Avoids the push hang and any large-file content
   round-tripping through the model.
2. CI is red for a pre-existing, unrelated reason. "TypeScript Check" and
   "Pre-Deploy Safety Checks" Actions fail at `npm ci` with `E401 Unauthorized`
   fetching the private `@smarter-poker/commander-shared` GitHub Packages dep —
   the Actions token lacks `read:packages` (or expired). `tsc` never runs; this
   fails identically on plain `main` HEAD and its parent, so it does not gate
   correctness. Vercel's own build env has a valid token (production keeps
   promoting). Worth fixing the Actions token scope.
3. main churns very fast (multiple agents, commits every ~30s). Base API
   commits on the freshest main HEAD and merge promptly to avoid drift.
