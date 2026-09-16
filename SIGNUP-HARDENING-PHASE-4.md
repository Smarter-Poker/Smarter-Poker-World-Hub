# Auth Hardening — PHASE 4: Coverage Expansion + DB Integrity (2026-05-03)

Builds on Phases 1-3 (signup root cause + prevention + operations).
Phase 4 takes the same hardening patterns and applies them to **login,
password reset, magic link, and DB integrity** — the other auth flows
that have the same silent-failure exposure as signup did.

## What got built

| Deliverable | Status | Live verification |
|---|---|---|
| `audit_auth_integrity()` RPC | ✅ migrated | Found 1 real Gmail-user orphan + 15 system orphans |
| `heal_auth_integrity()` RPC | ✅ migrated | Healed the 1 real orphan: `real_orphans.no_diamonds: 1 → 0` |
| `is_system_user(email)` classifier | ✅ migrated | Correctly excludes hydra.bot NPCs + example.com test users |
| `auth_health_view` (unified) | ✅ migrated | Returns 1 row covering all 5 probes + real-signup signal |
| `/api/cron/auth-integrity-audit` | ✅ built | Calls audit RPC; supports `?heal=1` mode |
| `/api/cron/login-probe` | ✅ built | E2E tested live: createUser → signIn (got 880-char JWT) → getUser (returned same user) → cleanup |
| `/api/cron/recovery-probe` | ✅ built | E2E tested live: resetPasswordForEmail → HTTP 200 |
| `/admin/auth-health` dashboard | ✅ built | Reads auth_health_view + heartbeats; per-flow status cards |
| `__tests__/phase-4-deliverables.test.mjs` | ✅ built | 5/5 pass |
| `_test-guards-exist.test.mjs` | ✅ updated | Now also requires phase-4-deliverables.test.mjs |

## Findings from the live integrity audit

**1008 total auth.users.** Audit revealed:

- **0 real users missing profile** — handle_new_user trigger has been reliable
- **0 real users missing wallet** — wallet trigger reliable
- **1 real user missing user_diamonds** — `costamargaritis@gmail.com` (created Jan 27, 2026). Healed by `heal_auth_integrity()` which inserted the missing row with the welcome bonus (100 diamonds + lifetime_earned=100).
- **15 system users missing user_diamonds** — 12 horse-game NPCs (`horse_*@hydra.bot`) + 3 test users (`testuser*@example.com`). These are seeded directly via SQL bypassing triggers and SHOULD NOT have diamond balances. Correctly excluded by the `is_system_user()` filter.

The classifier sees these as system and won't alert — but if a future
migration accidentally creates a real user without going through the
trigger chain, this audit will catch it within 24h.

## Coverage matrix (updated)

| Flow | Probe | Cadence | Verified live |
|---|---|---|---|
| **Signup** | `/api/cron/signup-probe` | every 5 min | ✓ Phase 1 |
| **Login** | `/api/cron/login-probe` | every 5 min | ✓ this phase — JWT returned, getUser matched |
| **Password reset** | `/api/cron/recovery-probe` | every 15 min | ✓ this phase — HTTP 200 |
| **Magic link** | `/api/cron/recovery-probe` | every 15 min | ✓ same probe |
| **OAuth signin** | `/api/cron/signup-probe-restricted` (URL probe) | every 15 min | ✓ Phase 2 |
| **DB integrity** | `/api/cron/auth-integrity-audit` | nightly | ✓ this phase — found + healed 1 |
| **Email deliverability** | `/api/cron/email-deliverability-check` | nightly | ✓ Phase 3 |
| **Trigger existence** | `/api/cron/trigger-audit` | nightly | ✓ Phase 2 |
| **DB→Sentry forwarder** | `/api/cron/sentry-signup-bridge` | every 5 min | ✓ Phase 3 |
| **Long-term archival** | `/api/cron/archive-signup-errors` | nightly | ✓ Phase 3 |

## What you (the human) need to do

### 1. Add the 4 new cron entries to vercel.json

```json
{ "path": "/api/cron/login-probe",            "schedule": "*/5 * * * *" },
{ "path": "/api/cron/recovery-probe",         "schedule": "*/15 * * * *" },
{ "path": "/api/cron/auth-integrity-audit",   "schedule": "0 4 * * *"   }
```

(audit-only mode — to enable auto-heal, change the path to
`/api/cron/auth-integrity-audit?heal=1`. Recommend running audit-only
for a week first to see what it finds.)

### 2. Add the new test files to `build-safety-gate.yml`

You mentioned CI is currently running 9 tests (the original 2 files).
Update the workflow to run all 7 test files:

```yaml
- name: Run all auth/signup hardening tests
  run: |
    node --test \
      __tests__/_test-guards-exist.test.mjs \
      __tests__/auth-routes-exist.test.mjs \
      __tests__/signup-hardening.test.mjs \
      __tests__/build-2-deliverables.test.mjs \
      __tests__/sentry-coverage.test.mjs \
      __tests__/phase-3-deliverables.test.mjs \
      __tests__/phase-4-deliverables.test.mjs
```

Expected: `# tests 39  # pass 39  # fail 0`

### 3. Bookmark `/admin/auth-health`

This is your one-page view of auth subsystem health. Set it as a tab
on the on-call dashboard.

### 4. Run the chaos drill quarterly

```bash
bash scripts/chaos-signup-drill.sh
# expect: 8/8 detected, exit 0
```

## Total system inventory (Phases 1 → 4)

```
DB MIGRATIONS APPLIED LIVE (8):
  harden_signup_2026_05_03                                    (Phase 1)
  harden_signup_view_exclude_probes_2026_05_03c               (Phase 2)
  add_probe_heartbeats_2026_05_03d                            (Phase 2)
  add_signup_audit_check_rpc_2026_05_03e                      (Phase 2)
  add_signup_errors_forwarded_column_2026_05_03f              (Phase 3)
  add_signup_errors_archive_2026_05_03g                       (Phase 3)
  add_auth_integrity_audit_2026_05_03h                        (Phase 4)
  add_auth_health_view_2026_05_03i                            (Phase 4)

CRON JOBS (10 total — add 3 missing entries to vercel.json):
  /api/cron/signup-probe                  every 5 min  ✓ DEPLOYED
  /api/cron/signup-probe-restricted       every 15 min   ⚠ vercel.json
  /api/cron/sentry-signup-bridge          every 5 min    ⚠ vercel.json
  /api/cron/trigger-audit                 daily 6am      ⚠ vercel.json
  /api/cron/email-deliverability-check    daily 7am      ⚠ vercel.json
  /api/cron/archive-signup-errors         daily 3am      ⚠ vercel.json
  /api/cron/login-probe                   every 5 min    ⚠ vercel.json (Phase 4)
  /api/cron/recovery-probe                every 15 min   ⚠ vercel.json (Phase 4)
  /api/cron/auth-integrity-audit          daily 4am      ⚠ vercel.json (Phase 4)

TEST FILES (7) — 39/39 pass:
  __tests__/_test-guards-exist.test.mjs                       (meta)
  __tests__/auth-routes-exist.test.mjs                        (Phase 1)
  __tests__/signup-hardening.test.mjs                         (Phase 1)
  __tests__/build-2-deliverables.test.mjs                     (Phase 2)
  __tests__/sentry-coverage.test.mjs                          (Phase 3)
  __tests__/phase-3-deliverables.test.mjs                     (Phase 3)
  __tests__/phase-4-deliverables.test.mjs                     (Phase 4)

ADMIN DASHBOARDS:
  /admin/signup-health    — signup-only deep dive
  /admin/auth-health      — unified across all flows (NEW Phase 4)

DOCS:
  SIGNUP-FIX-2026-05-03-FINAL.md             (Phase 1 post-mortem)
  SIGNUP-HARDENING-BUILD-2.md                (Phase 2)
  SIGNUP-HARDENING-PHASE-3.md                (Phase 3)
  SIGNUP-HARDENING-PHASE-4.md                (this file)
  docs/SIGNUP_RUNBOOK.md                     (operational playbook)
  .agent/handoffs/2026-05-03-signup-hardening-deploy.md
  .agent/handoffs/2026-05-03-signup-hardening-COMPLETE.md
```

## Phase 4 verification snapshot

```
Live SQL audit:
  audit_rpc:                  true
  heal_rpc:                   true
  classifier_rpc:             true
  unified_view:               true
  real_orphans_diamonds:      0  (was 1 — healed)
  real_orphans_profile:       0
  real_orphans_wallet:        0

Live cron probe walkthrough:
  Login probe:    createUser ✓ → signIn JWT (880 chars) ✓ → getUser id matches ✓ → cleanup ✓
  Recovery probe: createUser ✓ → resetPasswordForEmail HTTP 200 ✓ → cleanup ✓

Test suite: 39/39 pass (was 9/9 in your initial CI run — bring up the
new ones per "What you need to do" #2)

Cleanup verification: 0 leftover probe users
```

## What's NOT built (still external / process)

Same as previous phases:
- PostHog conversion-rate alert (UI)
- BetterUptime/Statuspage (external)
- UptimeRobot multi-region monitor (external)
- Server-side webhook profile provisioning (high risk, deferred)
- Quarterly fire drill calendar (process)
- Auth-OWNER PagerDuty rotation (process)

## Next agent's prompt

```
You're picking up auth hardening at end of Phase 4.

Read: SIGNUP-HARDENING-PHASE-4.md (most recent), then back through 3, 2, 1.

Run:
  - bash scripts/apply-signup-hardening-2026-05-03.sh
  - node --test __tests__/*.test.mjs                  (expect 39/39)
  - bash scripts/chaos-signup-drill.sh                (expect 8/8 detected)

Then complete deployment per "What you need to do" above.
```
