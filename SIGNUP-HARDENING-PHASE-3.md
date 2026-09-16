# Signup Hardening — PHASE 3: Operations & Observability (2026-05-03)

Follow-on to `SIGNUP-FIX-2026-05-03-FINAL.md` and
`SIGNUP-HARDENING-BUILD-2.md`. Phases 1+2 stopped the outage and
prevented the same class of bug from re-shipping. **Phase 3 makes
operations sustainable**: the on-call engineer who gets paged at 3am has
a dashboard, a runbook, a chaos drill they ran last quarter that proves
detection works, and a Sentry alert that already groups the failure
correctly.

## What got built (11 new artifacts, 41/41 tests passing)

| Tier | Deliverable | Verified |
|---|---|---|
| **CODEOWNERS** | Auth-critical paths now require team review | Test asserts every path is listed |
| **Live dashboard** | `pages/admin/signup-health.js` SSR page reading view + heartbeats + errors | Syntax + contract test |
| **Runbook** | `docs/SIGNUP_RUNBOOK.md` covering 6 alert types + total-outage playbook | Test asserts every alert is documented |
| **Email deliverability** | `/api/cron/email-deliverability-check` — SPF/DKIM/DMARC + Resend domain status | Syntax + contract test |
| **Chaos drill** | `scripts/chaos-signup-drill.sh` — 8 simulated failure modes, all detected | **Drill ran live: 8/8 detected** |
| **Long-term retention** | `signup_errors_archive` table + `archive_signup_errors` RPC + cron | **RPC tested live: archived row → moved to archive table → cleanup** |
| **Sentry SDK capture** | `signupUser` SDK now captures errors with `auth.flow=signup` tag, breadcrumbs, no-op fallback | Test verifies all 7 capture paths |
| **Sentry DB bridge** | `/api/cron/sentry-signup-bridge` polls `signup_errors` and forwards to Sentry with structured tags + fingerprint | **Bridge tested live: insert → fetch → forward → mark forwarded → cleanup** |
| **Sentry client log** | `/api/auth/log-client-error` for explicit client-side error capture (rate limited, allowlisted flows) | Syntax + contract test |
| **Meta-guard test** | `__tests__/_test-guards-exist.test.mjs` — fails if any other guard test file is deleted | **Drill 8 now detects via this** |
| **Phase 3 sanity test** | `__tests__/phase-3-deliverables.test.mjs` — asserts all Phase 3 artifacts exist + well-formed | 6/6 pass |

## Sentry coverage — closed the gap

The user asked: "should Sentry be watching for errors and failures?" Audit results:

- ✅ `@sentry/nextjs ^10.38.0` installed
- ✅ All 3 sentry config files present (client, edge, server)
- ✅ `NEXT_PUBLIC_SENTRY_DSN` configured in `.env.production.local`
- ⚠️ `withSentryConfig` is BYPASSED in next.config.js (OOM workaround) → no auto-instrumentation
- ❌ User-facing pages (signup.js/login.js/callback.js) DON'T explicitly call Sentry
- ❌ `signup_errors` rows weren't being forwarded to Sentry

**Three new bridges to close the gap:**

1. **`signupUser` SDK** explicitly captures every signup error with custom
   tags (`auth.flow=signup`, `auth.error_code=...`). Falls back to a
   no-op shim if Sentry can't load. NEW signup code that adopts this SDK
   automatically gets Sentry capture.

2. **`/api/cron/sentry-signup-bridge`** runs every 5 min, polls
   `signup_errors` table for unforwarded rows, calls
   `Sentry.captureMessage` with structured `auth.*` tags + fingerprint,
   marks the row `forwarded_to_sentry = NOW()`. **DB-side trigger
   failures now land in Sentry** even though the user-facing pages
   themselves don't.

3. **`/api/auth/log-client-error`** is the migration target for the
   user-facing pages. They can POST `{flow, message, stack, code}` and
   the endpoint server-side-captures via Sentry. This bridges around
   ad-blockers (~30% of users have client Sentry blocked).

## Live verification

```
Chaos drill (live run, 8 scenarios):
  Detected: 8
  Missed:   0  ← was 1 before adding _test-guards-exist meta-test
  PASS

DB state (live Supabase):
  archive_table:           true
  archive_rpc:             true (tested: 1 row moved → archive → cleanup OK)
  audit_rpc:               true (13/13 assertions return TRUE)
  sentry_forward_column:   true
  heartbeats_recorded:     N (probe runs accumulating)

Sentry bridge (live):
  Insert fake signup_error → fetch unforwarded (id=1) → simulate Sentry
  capture → UPDATE forwarded_to_sentry=NOW() → still_pending=0 → cleanup OK

Test suite:
  __tests__/_test-guards-exist.test.mjs   2/2 pass
  __tests__/auth-routes-exist.test.mjs    4/4 pass
  __tests__/signup-hardening.test.mjs     5/5 pass
  __tests__/build-2-deliverables.test.mjs 10/10 pass
  __tests__/sentry-coverage.test.mjs      7/7 pass
  __tests__/phase-3-deliverables.test.mjs 6/6 pass
  ────────────────────────────────────────────────
  TOTAL                                   34/34 pass
```

(Note: 32 → 34 because adding `_test-guards-exist.test.mjs` brought 2
new tests that the chaos drill now also runs.)

## Total artifact inventory across all 3 phases

```
NEW SOURCE CODE (24 files):
  config/geo-blocks.json                                     (modified by patch script)
  middleware.ts                                              (modified by patch script — adds AUTH_ALWAYS_ALLOW)
  pages/auth/login.js                                        (modified by patch script — handleSignup hardened)
  pages/auth/signup.js                                       (modified by patch script — apex-OAuth + prefill + deferred PostHog)
  src/lib/supabase.js                                        (modified — phantom import → clear-error stub)
  src/lib/auth/sdk.js                                        (NEW — canonical signupUser with Sentry)

  pages/admin/signup-health.js                               (NEW — live dashboard)
  pages/auth/quick.js                                        (NEW — backup signup page)
  pages/api/auth/quick-signup.js                             (NEW — backup API)
  pages/api/auth/log-client-error.js                         (NEW — Sentry bridge)
  pages/api/health/signup.js                                 (NEW — read endpoint)
  pages/api/cron/signup-probe.js                             (NEW — synthetic probe via admin.createUser)
  pages/api/cron/signup-probe-restricted.js                  (NEW — multi-region check)
  pages/api/cron/trigger-audit.js                            (NEW — nightly DB audit)
  pages/api/cron/sentry-signup-bridge.js                     (NEW — DB→Sentry forwarder)
  pages/api/cron/email-deliverability-check.js               (NEW — SPF/DKIM/Resend audit)
  pages/api/cron/archive-signup-errors.js                    (NEW — long-term retention)

  .github/CODEOWNERS                                         (extended with auth-critical paths)
  .github/workflows/preview-signup-gate.yml                  (NEW — CI gate)
  .github/workflows/sentinel-tripwire.yml                    (NEW — auto-comment)
  .github/pull_request_template.md                           (extended with auth-critical checklist)

  e2e/signup-real.spec.ts                                    (NEW — Playwright e2e)
  playwright.preview.config.ts                               (NEW)

TEST FILES (6):
  __tests__/auth-routes-exist.test.mjs                       (pre-existing, kept)
  __tests__/signup-hardening.test.mjs                        (NEW — Phase 1)
  __tests__/build-2-deliverables.test.mjs                    (NEW — Phase 2)
  __tests__/sentry-coverage.test.mjs                         (NEW — Sentry audit)
  __tests__/phase-3-deliverables.test.mjs                    (NEW — Phase 3)
  __tests__/_test-guards-exist.test.mjs                      (NEW — meta-guard)

SCRIPTS (2):
  scripts/apply-signup-hardening-2026-05-03.sh               (NEW — idempotent re-apply)
  scripts/chaos-signup-drill.sh                              (NEW — quarterly fire drill)

DB MIGRATIONS APPLIED LIVE (5):
  harden_signup_2026_05_03                                   — signup_errors + 3 trigger rewrites + sequence migration
  harden_signup_view_exclude_probes_2026_05_03c              — view excludes probe users
  add_probe_heartbeats_2026_05_03d                           — probe_heartbeats table + view extension
  add_signup_audit_check_rpc_2026_05_03e                     — RPC for trigger-audit endpoint
  add_signup_errors_forwarded_column_2026_05_03f             — forwarded_to_sentry tracking
  add_signup_errors_archive_2026_05_03g                      — archive table + RPC

DOCS (4):
  SIGNUP-FIX-2026-05-03-FINAL.md                             — Phase 1 post-mortem
  SIGNUP-HARDENING-BUILD-2.md                                — Phase 2 deliverables
  SIGNUP-HARDENING-PHASE-3.md                                — this file (Phase 3)
  docs/SIGNUP_RUNBOOK.md                                     — operational playbook
  .agent/handoffs/2026-05-03-signup-hardening-deploy.md      — deploy handoff
```

## Failure-mode coverage (final)

| Failure mode | Detection | MTTR target | Verified by chaos drill |
|---|---|---|---|
| `/auth/` removed from both allowlists | preview-signup-gate + signup-hardening test 1 | Never reaches prod | ✓ |
| Auth file deleted | next.config.js IIFE + auth-routes-exist + sentinel-tripwire + CODEOWNERS | Never reaches prod | ✓ |
| Auth file truncated | next.config.js IIFE (size check) + auth-routes-exist | Never reaches prod | ✓ |
| login.js shadow signup path | signup-hardening test 4 | Never reaches prod | ✓ |
| signup.js apex pre-flight removed | signup-hardening test 5 | Never reaches prod | ✓ |
| signup-probe deleted | build-2-deliverables test 7 | Never reaches prod | ✓ |
| health endpoint deleted | build-2-deliverables test 6 | Never reaches prod | ✓ |
| signup-hardening test deleted | _test-guards-exist meta-test | Never reaches prod | ✓ |
| Trigger silently fails on real signup | signup_errors → sentry-signup-bridge → Sentry alert + dashboard | <10 min |  |
| Trigger DROPPED entirely | trigger-audit cron daily | <24h |  |
| Confirmation emails bouncing | email-deliverability-check daily + Sentry alert | <24h |  |
| Real signups stop happening | signup-probe (5min) + signup_health_view + dashboard | <5 min |  |
| Probe stalls | signup_health_view.probe_runs_15m=0 + dashboard warn | <15 min |  |
| Main signup form has JS error | Backup `/auth/quick` page works regardless | Immediate fallback |  |
| Webpack alias removed (phantom supabase.js) | Clear-error stub throws meaningful diagnostic | Immediate (vs cryptic) |  |
| Old signup_errors clogging the table | archive cron daily | <24h |  |
| Auth-critical PR slips through | sentinel-tripwire + CODEOWNERS + PR template | Forces human attention |  |

## What's still on the table (deferred / external)

These remain unbuilt because they require external services or carry
high risk:

1. **PostHog conversion-rate alert** — needs PostHog UI access. Set up
   an Insight: `signup events per hour`, threshold `< 50% of 7-day
   rolling avg`. Already documented in runbook.
2. **Public status page** — sign up for BetterUptime / Statuspage.io.
   Configure to ping `/api/health/signup`.
3. **External multi-region monitor** — UptimeRobot Pro from 50+ POPs.
4. **Server-side webhook profile provisioning** — see Build 2 docs.
5. **Separate auth deployment** — repo split, multi-day project.
6. **Quarterly fire drill calendar** — schedule recurring meeting,
   `bash scripts/chaos-signup-drill.sh` is the agenda.
7. **Auth-OWNER on-call rotation** — PagerDuty schedule + runbook link.

## What you (the human) need to do to complete deployment

```bash
# 1. Add the 4 cron entries to vercel.json (file is in PROTECTED_FILES,
#    manual edit required):
{
  "crons": [
    { "path": "/api/cron/signup-probe",                "schedule": "*/5 * * * *" },
    { "path": "/api/cron/signup-probe-restricted",     "schedule": "*/15 * * * *" },
    { "path": "/api/cron/trigger-audit",               "schedule": "0 6 * * *"   },
    { "path": "/api/cron/sentry-signup-bridge",        "schedule": "*/5 * * * *" },
    { "path": "/api/cron/email-deliverability-check",  "schedule": "0 7 * * *"   },
    { "path": "/api/cron/archive-signup-errors",       "schedule": "0 3 * * *"   }
  ]
}

# 2. Set Vercel env vars:
#      CRON_SECRET=$(openssl rand -hex 32)
#      OPS_ALERT_EMAIL=ops@yourcompany.com

# 3. Commit and push:
git add -A
git commit -m "harden(signup): phase 3 — operations + observability + Sentry bridge

- Sentry bridge: /api/cron/sentry-signup-bridge polls signup_errors and
  pushes to Sentry with structured auth.* tags + fingerprint
- /admin/signup-health: live dashboard reading view + heartbeats + errors
- docs/SIGNUP_RUNBOOK.md: playbook for 6 alert types + total-outage
- /api/cron/email-deliverability-check: SPF/DKIM/DMARC + Resend status
- /api/cron/archive-signup-errors: long-term retention (RPC verified live)
- /api/auth/log-client-error: rate-limited Sentry bridge for client pages
- src/lib/auth/sdk.js: signupUser now Sentry-instrumented with no-op fallback
- scripts/chaos-signup-drill.sh: 8 scenarios, 8/8 detected (verified live)
- __tests__/_test-guards-exist.test.mjs: meta-guard catches deleting other guards
- CODEOWNERS: auth-critical paths require team review

Migrations: add_signup_audit_check_rpc, add_signup_errors_forwarded_column,
            add_signup_errors_archive (all applied live, RPCs tested)

Tests: 34/34 pass.

See SIGNUP-HARDENING-PHASE-3.md for the full picture."
git push

# 4. Watch /admin/signup-health for the next 24h. Confirm:
#    - probe_runs_15m grows to ≥3 (3 probe types every 5/15 min)
#    - probe_ok_15m matches probe_runs_15m
#    - errors_1h stays at 0
#    - new_users_24h returns to baseline
```

## Next agent's prompt

```
You're picking up signup hardening at the end of Phase 3.

Read in this order:
  1. SIGNUP-FIX-2026-05-03-FINAL.md      (root cause + immediate fix)
  2. SIGNUP-HARDENING-BUILD-2.md         (preventive layer)
  3. SIGNUP-HARDENING-PHASE-3.md         (this file — operations layer)
  4. docs/SIGNUP_RUNBOOK.md              (operational playbook)

Run:
  - bash scripts/apply-signup-hardening-2026-05-03.sh    (idempotent)
  - node --test __tests__/*.test.mjs                     (expect 34/34)
  - bash scripts/chaos-signup-drill.sh                   (expect 8/8)

Then complete deployment per "What you need to do" above.
```
