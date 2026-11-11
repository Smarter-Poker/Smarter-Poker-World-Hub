# 255715: VercelDeploymentFailed (dpl_CW1YLaroptrFiBRmbFotkxg5Fj7Y, 2026-10-17)

Read 2026-11-11T16:50Z by the Production Alerts PRIMARY lane.

## What failed

- Alert row 255715 (`workers.deploy-error-poll`, `VercelDeploymentFailed`), commit
  `27da635bd19e39a379231fe9f5b9df0f89e6db59` (#2473).
- Vercel build log, `bld_pv7sffvlo`: `__tests__/marketplace-operations.test.mjs:501`
  `ERR_ASSERTION`, expected `/!\/__tests__\/printful-status\.test\.mjs/` to match
  `.vercelignore`, then `Command "npm run build:vercel" exited with 1`.
- #2473 added `__tests__/printful-status.test.mjs` to `test:marketplace` without
  its own `!/` line. (The file itself was uploaded: `.vercelignore` at 27da635
  already had `!/__tests__/*.test.mjs`. The contract requires the explicit line.)
- #2474 (`5adfc396`, 11:11Z the same day) added the line. Production has built
  READY ever since; current production `dpl_FAUJYAGutgTjWPxyLVjopytXriDk` at
  `0e1a1fef`.

## Root cause

The contract that failed runs in two places only: the Vercel build (after
merge) and Global Footer E2E's `npm run build` on the PR. Global Footer E2E
went red on #2473 (job 117378153765, conclusion `failure`), but it is not in
the main ruleset (required: No Conflict Markers, No New Undefined Identifiers,
Audit-marker registry vs. tree, U4.2, U4.3, TypeScript Check, Pre-Deploy
Safety Checks, Top bars own their safe-area inset). So the PR merged and the
production build failed.

## Hardening

| Item | Where |
|---|---|
| Regression test, fails before / passes after | `__tests__/the-vercel-build-ships-what-it-runs.law.test.mjs`: the 27da635 preimage (`__tests__/fixtures/vercel-build-inputs-27da635/`) is flagged; the required-gate assertion fails on main `0e1a1fef` and passes with this change |
| Invariant in the owning layer | Pre-Deploy Safety Checks (required) now runs the whole `marketplace-operations.test.mjs` and the law on every PR; the law also checks with git's ignore engine that every file the Vercel build command names survives `.vercelignore` (covers `tests/` and `e2e/`) |
| Recurrence detection | `pages/api/deploy-monitor.js` already writes `VercelDeploymentFailed` to `operational_alert_events` with `payload.target_task_id`; pinned by `__tests__/deploy-monitor-inbox.test.mjs` |
| CI gate | step "The Vercel Build's Contracts Run Before Merge" in `.github/workflows/build-safety-gate.yml` |

Local run: `node --test __tests__/marketplace-operations.test.mjs __tests__/the-vercel-build-ships-what-it-runs.law.test.mjs` -> 21 pass, 0 fail (0.4 s).
