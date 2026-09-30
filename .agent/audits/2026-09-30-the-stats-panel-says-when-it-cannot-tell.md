# The Stats panel says when it cannot tell, and the live smoke has an invocation

Date: 2026-09-30
Branch: `cw/diamond-wallet-stats-unknown-0930`
Base: `origin/main` at `dff3b1dc036f4bd9f730693598173e4f707420aa`

Two defects from a deep-dive audit of the World Hub diamond wallet. Both are
one rule read twice: CLAUDE.md 10.86 rule 1 for the first, 10.83 for the
second. Nothing else was touched.

---

## Defect 1 (severe): the Stats panel folded UNKNOWN into PENDING

### What a player saw

Open the wallet, press Stats, and watch an animated skeleton for ever. The
transaction list beside it rendered normally. No error, no message, no way to
tell whether the figures were still coming or were never coming.

### The mechanism, end to end

`src/components/store/DiamondWalletModal.jsx` had exactly two branches for the
panel:

```jsx
{showStats && !stats && (<div className={styles.statsPanel} aria-busy="true"> ... skeleton )}
{showStats && stats  && ( ... the figures )}
```

`!stats` was the only non-success branch. There was no loading gate on it and
nothing terminal after it, so it meant "loading" by assumption rather than by
evidence. And `stats` is null whenever `lifetime` is null - the `useMemo`
opens with `if (!lifetime) return null`.

The route hands back `lifetime: null` for two unrelated reasons. One is
ordinary: a Load More does not recompute a lifetime figure, so `statsPromise`
resolves `{ data: null }` on purpose. The other is a failure:
`pages/api/store/diamond-transactions.js` wraps its 5,000-row window select in
a `catch (statsErr)` that only `console.warn`s, and answers **HTTP 200**
anyway. One null value, two meanings, and the client could not tell them
apart - so it chose the harmless reading and animated for ever.

Phase 7 had already built this refusal ONE LEVEL DOWN. When
`fn_diamond_flow_by_kind` cannot be read, `topSources` is null and the panel
renders **"Breakdown Unavailable Right Now. Pull Down To Refresh."** The
breakdown had three outcomes. The panel containing it had two.

### The fix, at the route

The outcome is named instead of one null carrying two meanings:

```js
let lifetime = null;
let lifetimeStatus = offset === 0 ? 'unavailable' : 'paged';
```

- `'ok'` is assigned in exactly one place, after `lifetime` is built.
- `'unavailable'` is the INITIAL value on a first page, so every way of
  reaching the response without the figures - the catch, or a select that
  returns no rows array without erroring - reports could-not-tell by default.
  No path quietly upgrades a failed read.
- `'paged'` is what a Load More gets. It is not a verdict about anything, and
  the client never acts on it.

`lifetimeStatus` ships beside `lifetime` in the same 200 literal. **The request
still succeeds and still carries the rows.** The ledger is what the player came
for, and a failed stats read must not cost them it - which is why this is a
named outcome under a 200 rather than a 500.

### The fix, at the client

`statsRead` holds three states:

| state | meaning | rendered |
| --- | --- | --- |
| `'pending'` | the first-page read has not answered | the skeleton, `aria-busy="true"` |
| `'unavailable'` | the read SETTLED and could not be told | "Stats Unavailable Right Now. Pull Down To Refresh.", `aria-busy="false"` |
| `'ok'` | the figures arrived | the plates, the bars, the donut |

Four wiring points, so the skeleton cannot outlive the read on any path:

1. **At fetch start**, a first page resets to `'pending'` unless it is already
   `'ok'` - a retry means "asking again", and figures already read are kept
   rather than flashing back to a skeleton mid-refresh.
2. **On a successful first page**,
   `data.lifetimeStatus === 'ok' || data.lifetime` decides. The second half is
   deliberate: during a rollout the deployed route may predate the field, and
   then the presence of the figures is the only evidence there is. Absent, on
   a first page, that is UNKNOWN.
3. **In `finally`**, which every path runs: a first-page read still `'pending'`
   when it has demonstrably settled becomes `'unavailable'`. This covers what
   the success branch never reaches - no signed-in user, no session, a thrown
   fetch, a non-ok response. Each of those left the panel animating too.
4. **Except when a re-run is queued.** A response dropped because the player
   changed tab mid-flight is NOT settled - the existing deferred-refetch block
   re-runs it - so it stays pending rather than flashing a refusal nobody had
   a reason to see.

The copy is the phase 7 sentence with one word changed, so the two levels of
one panel speak with one voice. Title case, no em dash, and it renders in
`.statsFoot` inside `.statsPanel` - exactly where the breakdown message
already lives, so no new CSS and nothing new to check at 375px.

**It never shows a zero.** A figure nobody could compute is not the figure 0,
and telling a player who has earned 740,908 diamonds that they have earned
none is the failure the route's own comment was written about.

### The pin

`__tests__/the-stats-panel-says-when-it-cannot-tell.test.mjs`, 9 cases,
registered in `__tests__/_test-guards-exist.test.mjs` beside its phase 7
sibling - which is what CI CHECK 8 runs, and whose own reachability meta-guard
would fail if it were not.

The case that holds this defect is **"the skeleton is gated on a loading
state, not merely on !stats"**. It finds `statsSkeletonPlate` in the
comment-stripped source, walks back to the `{showStats &&` opening its branch,
and requires `statsRead === 'pending'` in between. It then sweeps every
`{showStats &&` branch in the file and fails any that tests `!stats` without
also testing `statsRead`. The extractor asserts its own anchor found at least
three branches before asserting anything about them, so a reformat that makes
the regex match nothing fails loudly instead of passing as "no ungated
branches" - 10.86 rule 1 applied to the guard itself.

---

## Defect 2 (honesty): the live smoke had no invocation, and the record said otherwise

`scripts/ci/diamond-wallet-live-smoke.mjs` appeared in **no workflow, no npm
script and no import**, and is not one of the guards
`__tests__/_test-guards-exist.test.mjs` pulls in. Its only references were two
source comments and
`.agent/audits/2026-09-29-phase-8-the-route-and-the-client-agree.md`, which
ended the section describing it with "A drift on either side has a reader
(10.83)". For the offline half that was true. For the live half it was not.

That is 10.83 read in the direction it usually is not: a check nobody can see
is not a check, and a record claiming one exists is worse than no record,
because the next agent reads it, believes the coverage, and stops looking.

**Running on demand is the correct design and it stays.** No cron, no
`vercel.json` entry, no `pages/api/cron/` handler, no GitHub `schedule:`
trigger, no Claude scheduled task (World Hub CLAUDE.md 10.9 and 11.3, Club
Arena 10.85; CHECK 6 fails on the net-new counts regardless). What it lacked
was a way to be found and a record that told the truth.

Changed:

- `package.json` gains one script beside the existing `smoke:*` family:
  `"smoke:diamond-wallet": "node scripts/ci/diamond-wallet-live-smoke.mjs"`.
- The phase 8 note carries a dated **CORRECTED 2026-09-30** block. The
  overstated sentence is gone, and **WHO RUNS IT, AND WHEN** is stated plainly:
  by hand, by the agent delivering a change to the diamond wallet (the route,
  the modal, or any of the three RPCs behind them), TWICE - once BEFORE the
  release on current `main` for a baseline, once AFTER the live `commitSha` is
  verified. The exit code is the verdict, and UNKNOWN (3) is not a pass.
- The script's own header says the same thing, so the two cannot drift.
- The duplicate "must never become scheduled" paragraph lower in that note was
  folded into the one above it. Two copies of one rule is how a record starts
  disagreeing with itself, and the new suite counts it to keep it at one.

---

## Discrimination proof

A guard that passes against a broken tree is not a guard. Each fix was undone
on purpose, one at a time, in the working tree; the suite was run; the tree was
restored from a byte-for-byte copy taken first and verified by md5 afterwards.
Baseline before and after: **9 pass, 0 fail**.

| # | mutation | result |
| --- | --- | --- |
| 1 | client: skeleton branch back to `{showStats && !stats && (` | 7 pass, **2 fail** |
| 2 | client: the terminal unavailable branch deleted, skeleton left gated | 7 pass, **2 fail** |
| 3 | client: the `finally` settle removed, so only the success branch decides | 8 pass, **1 fail** |
| 4 | route: `lifetimeStatus` dropped from the 200 literal | 8 pass, **1 fail** |
| 5 | route: initial value flipped to `offset === 0 ? 'ok' : 'paged'` | 8 pass, **1 fail** |
| 6 | route: the stats catch turned into `return res.status(500)` | 8 pass, **1 fail** |
| 7 | `package.json`: the `smoke:diamond-wallet` script removed | 7 pass, **2 fail** |
| 8 | phase 8 note: the overstated "has a reader (10.83)" sentence restored | 8 pass, **1 fail** |

Gates run, on this branch:

```
node --experimental-vm-modules --test \
  __tests__/the-stats-panel-says-when-it-cannot-tell.test.mjs \
  __tests__/_test-guards-exist.test.mjs \
  __tests__/the-stats-panel-is-summed-in-sql.test.mjs
```

---

## Scope

Two things were deliberately NOT changed:

- **No scheduling of any kind was added** for defect 2. The brief forbids it,
  three sections of doctrine forbid it, and an npm script is the whole of what
  the defect asked for.
- **`__tests__/the-route-and-the-client-agree.test.mjs` was not edited.** It
  describes the smoke as running "on demand", which is accurate; its
  response-shape case compares `data.lifetimeStatus` in the client against the
  route's 200 literal and passes as written, because both halves of the
  boundary were changed together.

No migrations, no DDL, no database writes, no production SQL at all. No
credential was read, printed or rotated. Files touched:

```
pages/api/store/diamond-transactions.js                        route: lifetimeStatus
src/components/store/DiamondWalletModal.jsx                    client: three states
scripts/ci/diamond-wallet-live-smoke.mjs                       header: who runs it, and when
package.json                                                   smoke:diamond-wallet
.agent/audits/2026-09-29-phase-8-the-route-and-the-client-agree.md   the correction
__tests__/the-stats-panel-says-when-it-cannot-tell.test.mjs    new, 9 cases
__tests__/_test-guards-exist.test.mjs                          one import line
.agent/audits/2026-08-31-training-phase-2-inventory.json       regenerated
```

The last one is a generated artifact, not an edit. `scripts/training-surface-inventory.mjs`
records the LINE NUMBER of every surface it finds, and
`__tests__/training-surface-inventory.test.mjs` fails when the checked-in file
disagrees with a fresh run. Adding lines to `DiamondWalletModal.jsx` shifted 35
of them, so the file was regenerated with `--write`, as that test's own message
instructs. The whole diff is 70 lines: 35 `"line"` values and the 35 `"id"`
strings that embed them, every one of them a `DiamondWalletModal.jsx:<line>`
offset. Nothing else in the 3.2 MB document moved. It was verified red before
the regeneration and green after, and it is green on `origin/main` without this
branch, so the staleness is this change's and was not inherited.
