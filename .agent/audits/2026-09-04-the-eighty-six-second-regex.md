# The World Hub's required checks: an 86-second regex, run four times, and a 424-second install

Date: 2026-09-04
Branch: `perf/wh-typecheck-installs-every-run`

## Where a World Hub push actually spends its time

Measured from per-step timestamps on PR #1332 (and the same shape on #1325,
#1327, #1328):

| job | wall | what it was |
| --- | --- | --- |
| `TypeScript Check` (required) | **7.90m** | 424s `npm ci`, 30s `tsc --noEmit` - and the `tsc` is advisory (`continue-on-error`) |
| `Pre-Deploy Safety Checks` (required) | **6.33m** | CHECK 11 87s, CHECK 13 85s, CHECK 12 86s, CHECK 20 55s |
| `U4.2: No phantom tables` (required) | 1.63m | the same script as CHECK 11, run again: 87s |
| `U4.3: Scheduled jobs actually succeed` (required) | 1.88m | 106s querying cron history |
| `No New Undefined Identifiers` (required) | 1.55m | 37s install, 37s check |
| `No New Silent Writes` (required) | 1.12m | 36s install |
| Vercel production build | 2.7m | fine |

Push → merge on those PRs was 9 to 21 minutes; push → live 12 to 24. The
Vercel half is not the problem.

## Finding 1: the regex

Three scripts - `check-phantom-tables.mjs` (CHECK 11 **and** U4.2),
`check-phantom-columns.mjs` (CHECK 13), `check-stranded-writers.mjs`
(CHECK 12) - each carried its own copy of:

```
/([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g
```

It **begins with an optional identifier group**. A pattern with no literal to
anchor on is attempted at every one of the ~32MB of characters in the scanned
tree, and at every attempt the optional group greedily eats an identifier,
fails on `.from(`, and backtracks through every shorter prefix before moving
one character on.

Profiled on the repo rather than reasoned about:

| step | time |
| --- | --- |
| walk 2,410 files | 27ms |
| read 32.8MB, find the 833 files containing `.from(` | 402ms |
| strip comments from those 833 | 171ms |
| the PostgREST schema fetch everyone assumed was the cost (7.8MB) | **1.4s** |
| **the regex over those 833 files** | **over 90s** (the profiler timed out) |

`check-phantom-columns.mjs` had a second quadratic on top: for every chained
method after every `.from(`, it sliced the rest of the file
(`clean.slice(pos)`) to test a `^`-anchored regex against it. And all three
computed a line number per match with `clean.slice(0, idx).split('\n')` - the
whole file re-split for each of thousands of matches.

### The fix

`scripts/ci/lib/from-calls.mjs`, one scanner the three scripts share. It finds
the literal `.from(` first - a literal prefix lets the engine skip straight to
candidates - and then reads the receiver BACKWARDS from that point with a
pattern anchored at the end of a 200-character window. Same receiver, same
storage flag, same table, same match position as the old pattern reported.
Line numbers come from a newline index built once per file. The chained-method
walk in the columns check uses a sticky regex evaluated at `pos` instead of a
slice.

| script | before | after |
| --- | --- | --- |
| `check-phantom-tables` | 92s | **5s** |
| `check-phantom-columns` | 89s | **3s** |
| `check-stranded-writers` | 109s | **3s** |

Every one measured on this Mac against production, old script and new script
back to back, `--json` output captured from both and compared whole: the
phantom list, the stale-allowlist list, the 421 referenced and 1,067 exposed
tables, the `stranded` and `clientOnly` sets - **identical, all four scripts.**

Four runs per pull request (CHECK 11, 12, 13 and U4.2), so this is roughly
**five and a half minutes off every World Hub pull request's critical path.**

`tests/the-from-scanner-is-fast-and-faithful.test.mjs` keeps the retired
pattern as an ORACLE and asserts the new scanner returns the identical list -
position, receiver, storage flag, table - on a corpus of every shape that ever
mattered (the storage bucket split across lines, `getClient().from(...)`, the
`mlbDb` foreign-project receiver) and on forty real API routes. Faster is
worthless if a phantom table slips through the new one that the old would have
caught. It also refuses any `check-*.mjs` that grows the leading-optional-group
pattern back.

## Finding 2: nothing cached node_modules

No World Hub workflow used `actions/cache` at all. `TypeScript Check` - a
required check - paid a full 1,324-package extract on every run, on a runner
shared with up to eleven others doing the same, for a 30-second advisory
typecheck. `cache: npm` on setup-node keeps only the tarballs.

The tree is cached now in the three required jobs that install (`type-check`,
`No New Undefined Identifiers`, `No New Silent Writes`), keyed on the lockfile
and the Node line, **and the install is skipped on a hit** - `npm ci` deletes
`node_modules` before installing, so an unguarded install throws the restored
tree away. Club Arena's critical-path job did exactly that for three days;
`tests/a-required-check-does-not-reinstall-a-restored-tree.test.mjs` pins the
pairing here before it can happen once.

CHECK 20's ad hoc `npm install typescript@5` (55s) is cached on its own path,
`node_modules/typescript`, so the Safety Checks job still carries no other
dependency and every other check sees the tree it always saw.

## What this should do to the numbers

| job | before | expected warm |
| --- | --- | --- |
| `TypeScript Check` | 7.90m | ~1m |
| `Pre-Deploy Safety Checks` | 6.33m | ~1.5m |
| `U4.2: No phantom tables` | 1.63m | ~0.3m |

That is a projection until the next real pull requests say otherwise; the
per-script numbers above are measured.

## Finding 3: 170 round trips, one at a time

`U4.3: Scheduled jobs actually succeed` (required, 106s in CI) runs
`check-cron-liveness.mjs`, which asked Supabase for two exact counts per
scheduled job - 85 jobs, 170 HEAD requests - and awaited each before starting
the next. The same 170 requests sixteen at a time: **32s → 1s locally**, and
the JSON it produces is byte-identical (`dead`, `silent`, `healthy`,
`excused` all the same). Nothing about what is counted changed.

## Still on the list, not done here
- **Autopilot merges on a 10-minute sweep.** Once the checks are fast, the
  wait for the sweep becomes the largest thing between green and merged.
- **`npm ci` under npm 11 refuses this repo's lockfile** (the comment in
  silent-write-guard.yml says so), so the Node 22 jobs fall back to the slow
  resolving `npm install` on every miss. Regenerating the lockfile once would
  make misses cheap too. Not touched here - a lockfile change in this repo
  needs its own review.
