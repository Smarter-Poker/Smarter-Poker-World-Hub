# Rogue Agent Audit — Silent Catch Pattern Analysis

## Source Commits (Root Cause)
The following 3 commits introduced the catch-block corruption:

| Commit | Description | Impact |
|--------|-------------|--------|
| `844992521` | Globally replace all silent `.catch()` with console.warn | Collapsed multi-line catches |
| `cb3081614` | Globally replace all swallowed empty catch blocks | Same pattern |
| `b6606ba86` | Global remediation of 484 multiline empty catch blocks | Largest batch — 484 files |

## Files With Highest Silent Catch Density
These files have the most `[App] Handled exception` / `[App] Handled promise rejection` entries.
Some may be intentionally silent (fire-and-forget), but others may be hiding real bugs.

| File | Count | Risk Level |
|------|-------|------------|
| `src/hooks/useGTOTrainer.js` | 35 | 🟡 Review — training logic errors may be silenced |
| `src/engines/DeterministicGTOEngine.js` | 27 | 🟡 Review — GTO engine errors should propagate |
| `src/lib/poker-engine/brain/router.js` | 22 | 🔴 High — routing errors should NOT be silenced |
| `src/lib/poker-engine/LobbyManager.js` | 21 | 🔴 High — lobby state errors need visibility |
| `src/lib/poker-engine/GameController.js` | 18 | 🔴 High — game logic errors are critical |
| `src/hooks/useMessengerService.js` | 16 | 🟡 Review — messenger errors may cause silent failures |
| `pages/api/cron/deploy-error-poll.js` | 14 | 🟡 Review — deploy monitoring should surface errors |
| `src/hooks/useTableConnection.js` | 12 | 🔴 High — table connection drops need visibility |
| `src/lib/authUtils.js` | 10 | 🔴 High — auth failures must never be silenced |
| `src/components/ui/UniversalHeader.js` | 9 | 🟢 Low — UI header, non-critical |

## Recommendation
A future task should audit each 🔴 file and determine whether the silenced catch blocks should:
1. **Re-throw** — If the caller needs to know about the error
2. **Report to Sentry** — If we need visibility but not crash recovery
3. **Remain silent** — Only for truly fire-and-forget operations (view count increments, analytics pings)

## Prevention
The `/no-catch-corruption` agent workflow now prevents agents from collapsing catch blocks.
The pre-push hook CHECK 9 detects the corruption pattern before it can reach production.
