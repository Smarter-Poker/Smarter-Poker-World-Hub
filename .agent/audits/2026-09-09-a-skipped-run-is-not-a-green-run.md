# The estate's red-on-main detector counted a skipped run as a green one

2026-09-09. Found while finishing the Club Arena table-art work, not by a
failure - which is the point, because the whole job of this detector is to make
sure a failure does not have to be found by accident.

## What was wrong

`scripts/ci/check-main-is-green.mjs` scans every repo's `main`, keeps the newest
run per workflow, and alarms when that run failed:

```js
const latest = list[0];
if (latest.conclusion !== 'failure') continue;
```

The listing is fetched with `status=completed`, and **completed includes
`skipped` and `cancelled`**. Its own green line admitted it: *"every workflow's
latest run on main is green or neutral."* Neutral was being counted as health.

A `workflow_run` listener with a concurrency group produces mostly no-ops - it
skips when the workflow it listens for did not succeed, and cancels when a newer
run takes the lock. Such a workflow interleaves no-ops with verdicts by
construction, so it is STRUCTURALLY invisible to "is the newest run a failure".

The consecutive-failure walk had the same hole one line down: it `break`s on any
non-failure, so a single `cancelled` between two failures reset the count to one
and the clock to minutes, filing a day-old outage as a fresh transient.

## Measured, 2026-09-09

| repo | workflow | what was hidden |
| --- | --- | --- |
| Club Arena | `Post-Deploy E2E (production)` | **24 failures in 21 hours, no success.** 46 runs in a 300-run window, 7 verdicts, all 7 failures, newest run `cancelled`. Never once named. |
| World Hub | `Push Delivery Watchdog` | latest run `cancelled` with a failed verdict directly behind it |
| World Hub | `E2E Tests (Playwright)` | reported `fresh` while being **12 consecutive failed verdicts over 16h** - the reset-clock hole |

Post-Deploy E2E matters most: it is the only suite that looks at the LIVE site
after a publish, and it had been failing on real defects the whole time -
stalled tables reported by `/health`, three customization/mission specs timing
out at 60s, a union route rendering neither the forge nor its prerequisite, and
a `Could Not Load Your Daily Bonus` console error on a critical page.

## The rule

Only a run that reached a VERDICT is evidence. `success` is green;
`failure`, `timed_out` and `startup_failure` are red - the last two were also
invisible, because only the literal string `failure` counted.
`skipped`, `cancelled`, `neutral`, `action_required` and `stale` are stepped over
rather than believed. A workflow with no verdict in the window is not an alarm:
no evidence is a question, and this detector does not page on questions.

Classification moved into `scripts/ci/lib/workflowVerdicts.mjs` as pure
functions, so it can be tested without the network - which the inline version
could not be, and which is why this shipped unnoticed.

## Before and after, run live against the estate

| | workflows named |
| --- | --- |
| before | 12 |
| after | 14 |

Two genuinely new (Club Arena Post-Deploy E2E, World Hub Push Delivery Watchdog)
and one reclassified from `fresh` to `SILENT` (E2E Tests (Playwright), correctly
- it is 16 hours old). Both versions already exit 1, so the alarm state does not
change; its accuracy does.

The identical fix ships in Club Arena in PR #4071, because two copies of this
detector disagreeing about what red means is its own defect.

Guard: `__tests__/a-skipped-run-is-not-a-green-run.test.mjs`, wired into CHECK 8
of `build-safety-gate.yml` so it actually runs.
