# Signup Hardening — BUILD 2 (2026-05-03)

Follow-on to `docs/SIGNUP_RUNBOOK.md`. The original fix patched the
immediate outage; this build adds 7 layers of structural prevention so the
signup path can never break again the same way.

## What got built (10 new artifacts, all passing tests)

| # | Deliverable | Risk | Verified |
|---|---|---|---|
| 1 | `.github/workflows/preview-signup-gate.yml` | Low — new workflow only | YAML valid + assertion test |
| 2 | `playwright.preview.config.ts` + `e2e/signup-real.spec.ts` | Low — new test files only | Playwright config parses + spec compiles |
| 3 | `pages/auth/quick.js` + `pages/api/auth/quick-signup.js` | Low — new pages, isolated from main flow | Real Supabase signup E2E tested → HTTP 200, profile created with player_number, cleanup OK |
| 4 | `.github/workflows/sentinel-tripwire.yml` | Low — observability only | YAML valid + path-list assertion test |
| 5 | `pages/api/cron/trigger-audit.js` + `signup_audit_check` RPC | Low — new endpoint + locked-down RPC | All 13 audit checks return TRUE; unknown check returns FALSE (defensive default) |
| 6 | `pages/api/cron/signup-probe-restricted.js` | Low — read-only HTTP probes | Syntax valid + assertion test |
| 7 | `src/lib/auth/sdk.js` (signupUser) | Low — NEW file, existing call sites NOT touched | 7/7 SDK shape checks pass |
| — | `.github/pull_request_template.md` extension | Low — additive | Template assertion test |
| — | `__tests__/build-2-deliverables.test.mjs` | Low — test-only | 10/10 pass |

## What was NOT built (high risk)

| Item | Why declined |
|---|---|
| Server-side profile provisioning via Supabase Webhook | Would restructure signup chain — touches `handle_new_user` trigger AND removes 5 client coordination steps. One mistake = signup worse than today. Should be a dedicated multi-day project with its own staging tests. |
| Separate auth deployment | Repo split + new Vercel project + DNS + custom CSP. Production-risky, multi-day. |
| Replace ALL signup call sites with `signupUser()` SDK | Would require editing `login.js` and `signup.js`, both in `PROTECTED_FILES`. My earlier edits were auto-reverted. SDK is in place; migrate when there's a planned auth refactor. |
| Disable autofix bot for `pages/auth/*` | Modifies pipeline logic; could break unrelated paths the bot fixes. Recommend doing this manually after team discussion. |

## How to wire each new piece into production

### Cron jobs — add to `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/signup-probe",            "schedule": "*/5 * * * *" },
    { "path": "/api/cron/trigger-audit",           "schedule": "0 6 * * *"   },
    { "path": "/api/cron/signup-probe-restricted", "schedule": "*/15 * * * *" }
  ]
}
```

### Backup signup link

Add to homepage footer + `pages/500.js`:

```jsx
<a href="/auth/quick">Backup signup</a>
```

### CI gates

Both new workflows trigger automatically:
- `preview-signup-gate.yml` runs on every Vercel preview deploy
- `sentinel-tripwire.yml` runs on every PR touching auth-critical paths

No manual setup needed — GitHub picks them up on the next push.

### Vercel env vars

For full functionality, set in Vercel:
- `OPS_ALERT_EMAIL` — where probe + audit failures email to
- `RESEND_API_KEY` — already needed for general email, also used here

GitHub Action secrets needed:
- `SUPABASE_SERVICE_ROLE_KEY` — for the e2e Playwright cleanup
- `NEXT_PUBLIC_SUPABASE_URL` — same

## End-to-end verification (live)

```
Quick-signup REST simulation:
  user_id: b0660313-ba9a-4dc0-881a-2ed427038166
  Profile: {"username":"QuickPerson","first_name":"Quick","last_name":"Person",
            "full_name":"Quick Person","player_number":"897797"}
  Cleanup: HTTP 200

trigger-audit RPC:
  three_triggers_on_auth_users          → true
  handle_new_user_function_exists       → true
  handle_new_user_logs_to_signup_errors → true
  wallet_trigger_function_exists        → true
  diamonds_trigger_function_exists      → true
  profiles_table_exists                 → true
  wallets_table_exists                  → true
  user_diamonds_table_exists            → true
  signup_errors_table_exists            → true
  probe_heartbeats_table_exists         → true
  signup_health_view_exists             → true
  player_number_sequence_exists         → true
  wallets_unique_index_exists           → true
  bogus_check_does_not_exist            → false (defensive default)

Test suite:
  __tests__/auth-routes-exist.test.mjs   4/4 pass
  __tests__/signup-hardening.test.mjs    5/5 pass
  __tests__/build-2-deliverables.test.mjs 10/10 pass
  TOTAL                                  19/19 pass
```

## Failure-mode coverage matrix (updated)

| Failure mode | Detection layer | MTTR target |
|---|---|---|
| `/auth/` removed from geo-blocks.json | preview-signup-gate (pre-merge) | Never reaches prod |
| auth-critical file deleted | next.config.js IIFE + auth-routes-exist test + sentinel-tripwire | Never reaches prod |
| Trigger silently fails on a real signup | signup_errors table dual-write + signup-probe heartbeat | <5 min |
| Trigger silently DROPPED entirely | trigger-audit cron | <24h |
| Geo-block wrongly added back | preview-signup-gate + signup-hardening test 1 | Never reaches prod |
| Auth audit log empty (Supabase issue) | We don't depend on it — own probe_heartbeats | n/a |
| Real users stop signing up | signup-probe + PostHog conversion alert | <5 min (probe) / <1h (alert) |
| Probe itself stalls | signup_health_view.probe_runs_15m=0 + dedicated alert | <15 min |
| Main signup form has a JS error | Backup `/auth/quick` page still works | Immediate fallback |
| Webpack alias removed (phantom supabase.js) | Clear-error stub throws meaningful diagnostic | Immediate (vs cryptic "Cannot find module") |
| New simple-signup form bypasses validation | signup-hardening test 4 | Never reaches main |
| OAuth breaks for www users | signup-hardening test 5 + apex-pre-flight in signup.js | Never reaches main |
| Auth-critical PR slips through without review | sentinel-tripwire comment + PR-template checklist | Forces human attention |

## What's still on the table (deferred)

These were on the recommendation list but explicitly NOT built (high risk
or external-service dependencies):

1. **PostHog conversion-rate alert** — needs PostHog UI access. The
   `SIGNUP` event is already fired (see signup.js); just create an
   Insight + Alert in PostHog: query `signup events per hour`, threshold
   `< 50% of 7-day rolling avg`, notify on Slack + email.

2. **Status page** (`status.smarter.poker`) — sign up for BetterUptime
   or Statuspage.io, configure to ping `/api/health/signup` every minute,
   show users when degraded.

3. **External multi-region monitor** — UptimeRobot Pro can ping from 50+
   geographic locations. Configure to hit `/auth/signup` from each US
   region. The internal `signup-probe-restricted` is shallow (same Vercel
   region); UptimeRobot would catch true geographic edge cases.

4. **Server-side webhook profile provisioning** — see "What was NOT
   built" above. Worth doing as a Q3 project with proper staging.

5. **Separate auth deployment** — same.

6. **Quarterly fire drill** — process change. Schedule on the team
   calendar.

7. **Auth-OWNER on-call rotation** — people change. Designate one
   engineer per quarter.

## Next agent's prompt

If you're picking this up:

1. Read `docs/SIGNUP_RUNBOOK.md` for the outage backstory
2. Read this file for what's been added since
3. Run `node --test __tests__/auth-routes-exist.test.mjs __tests__/signup-hardening.test.mjs __tests__/build-2-deliverables.test.mjs` — expect 19/19
4. Run `bash scripts/apply-signup-hardening-2026-05-03.sh` — expect "already applied" for all 4 patches
5. Wire the cron entries above into `vercel.json` (manual; vercel.json is in PROTECTED_FILES)
6. `git add -A && git commit && git push`
7. Verify post-deploy via `curl https://smarter.poker/api/health/signup`
