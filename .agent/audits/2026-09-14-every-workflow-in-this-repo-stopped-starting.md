# 2026-09-14: every workflow in this repo stopped starting at ~13:41 UTC

Found while shipping the mobile phase 11 sweep. Not caused by it, and bigger
than it: **no GitHub Actions run in this repository has started since about
13:41 UTC.** Every run, on every event, ends `startup_failure` before a single
job exists.

## What was measured

`gh run list --limit 30` at 14:10 UTC: **30 of 30 runs `startup_failure`**,
spanning six event types and five branches, including `main` itself.

    14:06:06Z  startup_failure  push                agent/codex-union-accounting/...
    14:02:10Z  startup_failure  push                fix/toke-tracker-phase11-sweep
    13:56:59Z  startup_failure  deployment_status   preview/codex-mac-dependencies...
    13:50:47Z  startup_failure  schedule            main
    13:47:45Z  startup_failure  pull_request        agent/codex-marketplace/...
    13:47:45Z  startup_failure  push                main
    13:41:34Z  startup_failure  push                main

`gh api .../actions/runs/34852980452/jobs` returns `total_count: 0` - the run
never reached a job, so there is no log to read and nothing went red in a way
a human would notice. The runs simply appear and die.

## What it is NOT (each one checked, not assumed)

| Hypothesis | Check | Result |
| --- | --- | --- |
| A bad workflow file on this branch | `git log 482c80aff47..cc66a84d951 -- .github/` | no workflow changed between the branch point that worked at 13:41 and the one that fails |
| A bad workflow file on `main` | parsed all 38 files at `origin/main` as YAML | 38 valid, 0 invalid |
| Actions disabled for the repo | `GET /repos/.../actions/permissions` | `{"enabled": true, "allowed_actions": "all"}` |
| A disabled workflow | `GET /repos/.../actions/workflows` | all active |
| No runners / all runners busy | `GET /repos/.../actions/runners` | 18 self-hosted runners, all `online`, all `busy=false` |
| A GitHub incident | githubstatus.com summary API | All Systems Operational, Actions operational, 0 open incidents |

## What is left, and why it is Dan's

The account that owns this repository is a **User**, not an organisation, so
Actions minutes bill to a personal plan. A spending limit reaching zero
produces exactly this signature: runs are created, refuse to start, and never
produce a job. The billing API that would confirm it has moved
(`GET /users/:user/settings/billing/actions` now answers `410 This endpoint
has been moved`), and this token cannot read the replacement.

**An agent does not touch billing** (CLAUDE.md 10.85, and a financial decision
is one of RULE 0's human-only exceptions). So this is recorded rather than
acted on. The thing to look at is the Actions spending limit / payment method
on the `Smarter-Poker` account.

If that is not it, the next read is the Actions usage page for the account,
which also states a limit breach in plain language.

## Why this matters more than the pull request that found it

**The merge gate is blind, and it is failing OPEN.** PR #1800 reports
`MERGEABLE / CLEAN` right now. `CLEAN` means GitHub considers every required
status check satisfied - and they are "satisfied" because they never ran.
This is the exact hazard Club Arena CLAUDE.md 1.2.5 documents: *a ruleset
counts a skipped required check as satisfied.*

Three pull requests merged after the failures began:

    #1796  13:41:31Z
    #1797  13:44:13Z
    #1794  13:47:42Z

Their checks may have completed before the breakage; that has not been
established here. What IS established is that anything merging from now on
merges with no gate behind it.

Two consequences while this lasts:

1. **Do not merge anything, including by hand.** A green tick on a pull
   request today means "no check ran", not "the checks passed".
2. **Nothing is publishing either.** The Vercel build is triggered off `main`
   and the publish watchdog is itself a workflow, so a missed publish would
   currently raise no issue. Verify production the way section 1.5 requires -
   read `/api/health` and compare the sha - rather than trusting a merge.

## State of the work that found it

- Mobile phase 11 (`1e11fd39cc1`, PR #1793) and its plural-text fix
  (`131fc8c663b`, PR #1796) are merged and confirmed live: production
  `/api/health` served `50844dbf82f`, which contains both, and all five
  `/hub/toke-tracker` routes re-probed clean at 375.
- The sweep (PR #1800, branch `fix/toke-tracker-phase11-sweep`) is pushed and
  open. It is **not** merged, deliberately. Locally it is green: 13 targeted
  test files, `tsc --noEmit`, `next build`, and browser probes at 375 and 1280
  all pass, plus a browser measurement of the Add Down modal's image-mapped
  controls (44/44/44px, painted fields 18px). It should merge through the
  normal gate once Actions runs again.
