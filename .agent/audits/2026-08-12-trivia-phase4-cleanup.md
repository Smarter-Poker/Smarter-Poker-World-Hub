# 2026-08-12 - Trivia phase 4 cleanup (dead client-mint paths removed)

Follows `.agent/audits/2026-08-11-trivia-phase4-migration-complete-12of12.md`.
That document closed the 12-of-12 server-grading migration; this one clears
the dead client-side payout code it deliberately left behind, and records
what is still outstanding.

## NOT PUSHED - the GitHub PAT is still dead

The GitHub MCP has been returning `Authentication Failed: Bad credentials`
since partway through phase 4, and the Cowork sandbox has no network egress,
so nothing in this document (or the 08-11 audit) has reached origin. The
CODE changes described below exist in the working tree only.

Push both audits and the cleanup together once the PAT is rotated:

    cd ~/Documents/Smarter-Poker-World-Hub
    bash scripts/git-safe-push.sh "refactor(trivia): remove dead client-mint paths + phase 4 audits"

Rotation procedure is in `PAT_EXPIRY_GUARD.md`. The same expired token is why
`push-velocity-watchdog` has been failing (runs 809-811+): the workflow reads
`secrets.GH_ADMIN_PAT`. Update that secret in the same pass and trigger one
manual run to confirm the alarm is live again - it is the thing that is
supposed to tell you pushes have stalled, and it has been blind.

## What changed here

### 1. `pages/hub/trivia/[mode].js` - all four dead credit calls removed

The page serves only `arcade / daily / history / rules / pro`, every one of
which is in `SERVER_GRADED_PAGE_MODES`, so all four call sites were already
unreachable. They are gone anyway: unreachable payout code sitting one
keystroke from live is how a client-side mint gets resurrected.

- **Settlement fallback** - the `else` of `if (useServerPayout)` credited
  `diamondsEarned + dailyBonusDiamonds` from the browser. Deleted; the
  server-payout branch above it is untouched and is the live path. A comment
  now states that a mode removed from the gate needs a server payout route,
  not a client credit.
- **`onDiamondsChange`** - settled hint purchases and stake deltas from the
  browser. The prop is no longer passed at all (hints are force-disabled
  under `serverGrader`, and stake deltas are recomputed server-side from the
  recorded answer sequence).
- **Double or Nothing** - the wager was previously held off with a
  `false &&` guard. The JSX, both RPC calls (win credit / loss debit), the
  `onDoubleOrNothing` + `showDoubleButton` props, the
  `showDoubleOrNothing` / `doubleAttempted` / `doubleQuestion` state, the
  `openDoubleOrNothing` bonus-question draw and the `DoubleOrNothing` import
  are all removed. The explanatory comment is preserved and now says how to
  bring the feature back (grade the bonus question through
  `session-answer`, pay from a route that owns the amount).

Orphans removed with them, each confirmed unreferenced first: the
`genUUID` / `gameRunIdRef` / `newGameRunId` / `getIdempotencyKey` chain
(it existed only to build `p_reference_id` values for browser credits -
server payouts carry their own idempotent references), the
`filterAndShuffle` import, and `sessionSeenIdsRef`.

### 2. `src/components/trivia/AllInMode.jsx` - deleted

Unreferenced (grep-confirmed zero importers before deletion) and carried a
client-computed stake/payout path plus a header warning never to wire it up
without server-side settlement. Deleted outright rather than stubbed. If
All-In Mode is ever wanted it must be rebuilt on the session flow.

### Verification

- Zero `rpc('add_diamonds_to_balance')` calls remain anywhere under
  `pages/hub/trivia/` or `src/components/trivia/`.
- `tsc --noEmit --allowJs --jsx preserve` clean on `[mode].js`.
- Immutable-rules spot check on `[mode].js`: no `.single()`, no raw
  `@supabase/supabase-js` import, no `req.query.userId` trust, no conflict
  markers, no imported-but-uncalled hooks, no emoji; all newly added text is
  pure ASCII.
- No behaviour change is expected for any live mode: every deleted path was
  already unreachable for the five modes this page serves.

## Still outstanding (unchanged by this pass)

1. **PAT rotation** (blocks the push, and the watchdog).
2. **Live play-tests.** Arcade is still the only mode ever played end to end
   (Antigravity, 2026-08-06). `daily / mixed / time-attack / endless /
   survival / mtt / cash / icm / gto` are code-verified only. One run each;
   they share a pattern, so one failure likely means several.
3. **PvP end-to-end match** never played. Expect on a real match: two
   `trivia_sessions` rows with `mode='pvp'`, the match row moving
   `active -> settling -> completed`, and exactly one `pvp_payout_*` or
   `pvp_refund_*` transaction per human.

## Out of scope (explicitly, not a regression)

**Atomic PvP matchmaking pairing.** If two players join simultaneously each
can create a separate match row. This race pre-dates the phase 4 migration
and was deliberately scoped out of it - the migration changed how a match is
graded and settled, not how two players are paired. Fixing it means
replacing the client-side insert in matchmaking with a single RPC that pairs
the two oldest waiters under a unique constraint and returns the same match
to both. Do not fold it into a grading/settlement change.
