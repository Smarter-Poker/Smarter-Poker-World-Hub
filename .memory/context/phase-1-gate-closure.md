# Phase 1 Gate — Final Closure Record

**Date:** 2026-04-24
**Source plan:** `~/Documents/smarter-poker-optimization-plan.md` line 176 — "Gate to Phase 2"

---

## The 4 gate criteria and how they resolved

| Criterion | Target | Evidence | Status |
|---|---|---|---|
| Build time | < 25 min on 3 consecutive deploys | 16+ consecutive deploys under 5 min (Phase 1.4 `cpus:2`), best 4.68 min | ✅ GREEN (exceeded by 5×) |
| No OOM errors | 3 consecutive deploys | Zero OOM across all Phase 1.1-1.4 deploys + every deploy after | ✅ GREEN |
| Playwright E2E pass rate = baseline | Match baseline | 21 failures on post-Phase-1 dispatch run `24868752797`, **all pre-existing** — see analysis below | ⚠️ BASELINE-MATCHED BUT VACUOUS (details below) |
| No new Sentry errors spiking | No regression | Zero new cron-path error signatures; live deploys serve `/api/health` OK; no user-facing complaints | ✅ GREEN |

## Playwright criterion analysis — why it's vacuous

Ran `workflow_dispatch` against origin/main HEAD (SHA `7ec173596f`) on 2026-04-24. Result:

- Run id `24868752797`
- Duration 11.8 min
- 125 passed / 21 failed / 2 skipped
- `conclusion=failure` because exit code 1

**The 21 failures fall into 5 buckets, NONE caused by Phase 1 work:**

1. `e2e/012-api-health.spec.ts` (11 tests) — API health + middleware-protected routes. Requires a running server at `http://localhost:3000`. Workflow builds Next.js (step 6 PASSES) but never starts a dev server before tests run. Tests hit a dead port.
2. `e2e/013-header-stats.spec.ts` (4 tests) — header profile data (diamonds, XP, level). Requires logged-in session + seed data. CI has no test user.
3. `e2e/014-cron-health.spec.ts` (3 tests) — middleware protection on cron endpoints. Same dead-localhost problem as bucket 1.
4. `e2e/06-smoke.spec.ts:77` (1 test) — "500 page exists". Needs running server.
5. `e2e/07-auth.spec.ts:19, 50` (2 tests) — strict locator mode violation: `locator('input[type="password"]')` matches 2 elements (signup has password + confirm-password). The test code needs `.first()`. UI evolved after the test was written.

**Evidence that none of these were caused by Phase 1:**

- All 5 spec files were last modified in commit `460380a76` (E2E suite expansion) or `c7928b8a4` (tour logos). Both pre-date `de7c8911a` (first Phase 1 commit).
- Phase 1 commits touched only `next.config.js`, `package.json`, `package-lock.json`. Zero test-file changes.
- `grep -c "npm run dev\|next dev\|playwright.*webServer"` in `.github/workflows/e2e-tests.yml` returns **0** — the workflow has never started a dev server in its entire history. Bucket 1/3/4 failures would have existed since this workflow was created.

## What this means for Phase 2 readiness

Phase 1's gate is closed on the 3 criteria that can actually be measured, and the Playwright criterion is matched against a pre-existing baseline. Phase 1 optimization work is fully ratified. Phase 2A, 2B, 3, 4 are unblocked with respect to Phase 1 regression risk.

## Technical debt flagged for later

The `e2e-tests.yml` workflow is effectively a no-op for the 21 infrastructure-dependent tests. It should either:

- **Option A:** Add a step 6.5 that `npm run start &` after the build + waits for :3000, then runs tests against localhost. Plus seed a test Supabase user for the header-stats tests.
- **Option B:** Change `NEXT_PUBLIC_BASE_URL` in the workflow from `http://localhost:3000` to `https://smarter.poker` so tests hit production. Faster, simpler, but means test failures could be caused by real prod incidents (not just test code). Good for API security checks, bad for auth/header tests.

The 2 `07-auth.spec.ts` locator-strict failures are pure test-code bugs — trivially fixed by changing `locator('input[type="password"]')` to `locator('input[type="password"]').first()` or equivalent.

None of this is blocking. Park it as a "Phase 4 — ongoing optimization" sub-task.

## Artifacts

- Workflow run: https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/runs/24868752797
- Dispatch SHA: `7ec173596f`
- Step 7 log: 1,787 lines pulled to `/tmp/pw-logs/Playwright E2E Tests/7_Run Playwright tests.txt` during analysis.
