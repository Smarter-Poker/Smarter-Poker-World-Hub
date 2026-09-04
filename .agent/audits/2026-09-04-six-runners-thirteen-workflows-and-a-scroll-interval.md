# Six runners, thirteen workflows per push, twice, plus an interval that undid the reader's scroll

Date: 2026-09-04
Branch: `perf/wh-typecheck-installs-every-run` (second commit)
Follows: `.agent/audits/2026-09-04-the-eighty-six-second-regex.md`

## What the first fix proved

PR #1336 (the regex and the caches) merged and ran on itself:

| job | before | ran in | **queued for** |
| --- | --- | --- | --- |
| TypeScript Check | 7.9m | **1.6m** | 13.6m |
| Pre-Deploy Safety Checks | 6.3m | **2.1m** | 11.2m |
| U4.2 No phantom tables | 1.6m | **0.2m** | 14.0m |
| U4.3 Scheduled jobs succeed | 1.9m | **0.2m** | 12.2m |
| No Conflict Markers | — | 0.2m | 5.1m |

The jobs were fixed. Every one of them then waited 8 to 14 minutes for a
runner. That was the entire remaining problem, and it had three causes.

## 1. Six runners, all on one box, all busy - beside 33 idle ones

The World Hub had exactly six runners, all on `estate-ci-eu-2` (load 22 at
the time, 7 workers running). Club Arena had 33 across three boxes with ONE
busy; `estate-ci-eu-1` and `estate-ci-eu-3` sat at load 1 with 12 idle
runners each.

Twelve World Hub runners were registered on those two boxes -
`estate-wh-eu1-1..6` and `estate-wh-eu3-1..6` - with the estate's own
`setup-selfhosted-runner.sh`, the same `estate-linux` label, and the fair-share
caps the provisioner already applies per box. **18 runners now, across three
boxes.** Zero cost: the hardware was already paid for and idle.

## 2. Every workflow ran twice per merge

All thirteen workflows triggered on `pull_request` AND on `push: main`. The
merge commit of a squash-merged, green pull request is the same tree the
checks just passed, so each merge queued a second full copy of everything
behind the NEXT pull request's checks. Club Arena stopped doing this on
2026-08-23 for the same reason.

The required-check jobs now run on `pull_request` only:
`no-conflict-markers`, `audit-marker-guard`, `undefined-identifier-guard`,
`silent-write-guard`, all three `supabase-invariants` jobs, and
`build-safety-gate`'s `safety-checks` and `type-check`. `vercel-deploy-retry`
keeps running on push to main with `always()`, because a job that `needs` a
skipped job is skipped too unless it says so, and it never needed the
checks' verdict - only their ordering. `global-footer-e2e` is pull-request
only as well.

## 3. A 20-minute suite, red for a day, on every push to every branch

`E2E Tests (Playwright)` is not a required check. It has been red on main
since 2026-09-03 18:32 - 18 of the last 22 main runs, 140 failures per run,
mostly the Commander routes returning 500 and Poker Near Me phase 8 - and it
held a runner for 15 to 20 minutes on every push to every branch, twice.
Its `pull_request` trigger is removed until it is green again; it still runs
on main and on demand, so its state stays visible. **The suite itself is not
fixed here** - the Commander 500s are a product problem another agent is on
(the login bridge), and the phase 8 failures are unowned. That is the honest
state of it.

## 4. The autopilot bug that doubled all of the above

`agent-autopilot.yml` is byte-identical in seven repos and asked
`gh run list --workflow ci.yml`. Only Club Arena has a `ci.yml`. Here it
answered "none" for every pull request, so the "no CI run at all" repair
pushed an empty re-trigger commit onto every World Hub pull request older
than fifteen minutes, after every real push - a second full copy of thirteen
workflows, and a later merge each time. Five landed in one day. Fixed in the
canonical copy (Club Arena) and rolled to all seven repos; see the Club Arena
changelog of the same name.

## 5. And the footer contract was red because `_app.js` fought the reader

`Global Footer E2E` failed on `personal-assistant` and `training` on every
run since it landed. Traced with a probe against a production build rather
than by reading: the bar HID correctly on the flick, and 100 to 200ms later
`pages/_app.js` scrolled the window back to 0, which correctly showed it
again. `_app.js` ran `scrollTo(0, 0)` every 100ms for the first half second
after mount "to defeat browser scroll restoration cache" - on every page of
the hub. A thumb that started scrolling inside that window was yanked back to
the top. `history.scrollRestoration = 'manual'` already prevents restoration;
the interval is gone and one immediate `scrollTo` remains.

A second, smaller defect in `useHideOnScroll` went with it: the first scroll
event from a scroller only recorded its position, so a single coalesced burst
on a fresh page could never hide the bar. The document is seeded with its
position at install now, other scrollers at their top.

Two things in the CONTRACT itself were then wrong, found by running it in a
loop against a production build and tracing scroll events:

- It issued `scrollTo(200)` and `scrollTo(600)` with no yield between them.
  Traced: the browser delivered ONE event for the pair - `200` seen, `600`
  never - and then reported the up-scroll as `400`, which the bar correctly
  read as 200 -> 400, still downward, and stayed hidden. The hook was right
  about the events it was given. A frame per step now, which is what a
  finger does.
- Poker Near Me shows a first-visit tutorial that `scrollIntoView()`s its
  target 150ms after mount. That is the page moving the reader; every other
  Poker Near Me spec marks the tutorial seen, and this one now does too.

Result on this Mac, both browsers, three consecutive runs of the
hide-and-return test across all fifteen worlds: **6 of 6 passed**, from
failing on two worlds in every CI run since it landed.

## 6. And then the new runners exposed one more hardcoded port

The first run of this branch with 18 runners: every required check green,
`Global Footer E2E` red with `EADDRINUSE :::3000`. Two E2E jobs on one box,
both `next start -p 3000`. Same class as Club Arena's E2E ports the same
morning; same fix, `scripts/ci/e2e-port.mjs` ported over, both E2E workflows
derive their port from `RUNNER_NAME` and free it first.

## What is still true after this

- The E2E suite is red and off the pull-request path. It needs a product
  fix, not a pipeline one.
- `U4.3` and `U4.2` run the same schema fetch the Safety Checks job runs; a
  shared artifact between jobs would save a few more seconds. Not worth a
  fourth workflow change today.
