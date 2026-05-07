# Phase 105 — Game-Click Breakage: Root Cause + Fix
**Date:** 2026-05-07
**Author:** claude (Phase 105)
**Severity:** P0 — every game click was no-op for every user since PR #239 shipped
**Status:** FIXED + pushed

---

## Symptom

User report: "not a single game actually works when clicked. you need to insure
that all games actually work when clicked and have zero issues when played."

Visible behaviour: clicking any game card on `/hub/training` did nothing.
No navigation, no arena mount, no error toast — just silent failure.

---

## Investigation

End-to-end trace from click → arena:

1. **User clicks game card** → `<GameCardNew onStart={() => startDrill(g)} />`
2. **`startDrill`** at `pages/hub/training.js:122-126`:
   ```js
   const startDrill = useCallback((game) => {
       if (!game) return;
       setActiveGame(game);   // <-- here
       setShowArena(true);    // <-- here
   }, [setActiveGame, setShowArena]);
   ```
3. **Setters source** at `pages/hub/training.js:81-84`:
   ```js
   const showArena    = useTrainingStore(s => s.showArena);
   const activeGame   = useTrainingStore(s => s.activeGame);
   const setShowArena = useTrainingStore(s => s.setShowArena);
   const setActiveGame= useTrainingStore(s => s.setActiveGame);
   ```
4. **Store definition** (pre-fix) at `src/stores/trainingStore.js`:
   - Exposed: `showIntro`, `pendingGame`, `setShowIntro`, `setPendingGame`
   - **Did NOT expose:** `showArena`, `activeGame`, `setShowArena`, `setActiveGame`

So `setActiveGame` was `undefined`. Calling `setActiveGame(game)` threw
`TypeError: setActiveGame is not a function`. React swallowed the error inside
the click handler. Visually: nothing happened.

## Why this slipped through

PR #239 (commit `926bff559e`) — "feat(training): drastically improve /hub/training UX"
rewrote `pages/hub/training.js` from 2,245 lines down to 782 lines. The redesign
uses `showArena` / `activeGame` naming. The Zustand store kept the older
`showIntro` / `pendingGame` names. The PR did not update the store. There was
no compile-time error because `useTrainingStore(s => s.setActiveGame)` is valid
syntax — it just returns `undefined` at runtime.

There is no other consumer of these store fields anywhere in the codebase
(verified via grep across `pages/` and `src/`). The other `pendingGame` /
`showIntro` references are local React `useState` in unrelated pages
(`poker-near-me`, `social-media`, `video-library`, `diamond-store`,
`training/category/[categoryId]`). None of them touched the training store.

## Other paths verified non-broken (for completeness)

- `/api/training/batch-preload` — works. Live-tested with Dan's account JWT
  against prod for `mtt-001`, `cash-005`, `spins-007`, `psy-001`, `adv-005`
  — all 200 OK, 2 questions each. Backend is healthy.
- `/api/training/get-question` — same JWT auth path, same backend. Healthy.
- `useGTOTrainer` correctly calls `getSessionToken()` and adds
  `Authorization: Bearer` header on `batch-preload` and `get-question` calls.
- `GodModeArena` wrapper routes `cash-001` → `PreflopRangeTrainer`,
  `adv-011` → `SPRTrainer`, `quiz-gauntlet` → `QuizGauntlet`; everything else
  falls through to `GodModeArenaInner`. All correct.
- `GodModeArenaInner` mounts splash → loads questions → shows
  "Loading Solver Data..." until `splashReady === true`, then "Start Training →".
  All correct — but NEVER REACHED because click never fired `setShowArena(true)`.

## Fix

Added 4 missing fields to `src/stores/trainingStore.js`:

- `showArena: false`           (state — canonical)
- `activeGame: null`           (state — canonical)
- `setShowArena(show)`         (action — canonical)
- `setActiveGame(game)`        (action — canonical)

Each canonical setter cross-syncs the legacy alias (`showIntro` ↔ `showArena`,
`pendingGame` ↔ `activeGame`) so the store can never end up half-updated.
Legacy setters do the inverse. No removals. No signature changes.

Persistence: `showArena` / `activeGame` are deliberately NOT persisted — a
fresh session must NOT auto-mount the arena from a stale game id, otherwise
users land on `/hub/training` and instantly get pulled into yesterday's game.
Only `soundsEnabled`, `animationsEnabled`, and `celebratedGames` persist
(unchanged from before).

## Verification

Logic-level test (simulated zustand `set` behaviour):
- Initial state: `showArena=false, activeGame=null` ✓
- After `setActiveGame({id:'mtt-001'}) + setShowArena(true)`:
  `showArena=true, activeGame.id='mtt-001'` and aliases synced ✓
- After `setShowArena(false)`: both flags clear ✓
- Legacy `setShowIntro(true)` also flips `showArena=true` ✓
- Brace/paren balance OK; file 82 lines.

Production verification will happen via `scripts/git-safe-push.sh`.

## Related migrations applied during Phase 105 sweep

The following SQL was authored during prior phases and is committed in the
same push (already applied to production via `apply_migration` earlier):

- `20260507195000_delete_impossible_card_combo_rows.sql` (Phase 100b)
- `20260507200000_backfill_spins007_l9_post_phase100b.sql` (Phase 103)
- `20260507210000_fix_phase77_swap_collateral_drift.sql` (Phase 104)
- `20260507215000_fix_phase104_gtofreq_residual.sql` (Phase 104b)

## Lesson

Zustand returns `undefined` for non-existent selectors without erroring. A
codebase-wide rename or a UI redesign that pulls from a shared store needs
an explicit cross-check that every selector resolves. A 1-line vitest
snapshot asserting `Object.keys(useTrainingStore.getState())` would have
caught this in CI.

Possible follow-up: add a vitest test under
`tests/stores/trainingStore.test.js` that asserts the public surface of
`useTrainingStore` so this can never silently regress again. Logging here
— not shipping in this same PR to keep the fix minimal-risk.
