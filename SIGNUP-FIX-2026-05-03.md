# Signup Failure — Post-Mortem & Fix (2026-05-03)

## Summary

**Zero successful signups between 2026-04-24 and 2026-05-03.** Last successful
email signup: April 24. Last successful Google signup: April 20. The auth
audit log had **0 rows total** — every observability dashboard returned
green because requests never reached Supabase.

## Root cause

`config/geo-blocks.json` `allow_paths` did not include `/auth/*` or
`/api/auth/*`. The Vercel edge middleware geo-blocked every page request
from a "restricted" jurisdiction (WA, UT, LA, ID, MT, SD, IN, MI, MS, TN
in the US, plus 14 denied countries) **before the request ever reached the
signup form, before Supabase, before any logging**. Users were silently
redirected to `/jurisdiction-blocked` with no telemetry.

Two compounding factors hid the failure:

1. **Trigger functions silently swallowed errors** with `EXCEPTION WHEN
   OTHERS THEN RAISE WARNING; RETURN NEW`. `RAISE WARNING` is not
   queryable. Any partial-provisioning failure was invisible.
2. **`auth.audit_log_entries` was empty** — likely 0-day retention. Even
   the events that DID make it through Supabase weren't persisted.

## What's now in place

### Database (already applied via migration `harden_signup_2026_05_03`)

- **`public.signup_errors`** — append-only error trail. Every trigger now
  dual-writes failures here so they're queryable.
- **`public.signup_health_view`** — single-row view powering
  `/api/health/signup`. Returns counts for 15m/1h/24h windows.
- **`profiles_player_number_seq`** — pre-created, no longer DDL'd inside
  the SECURITY DEFINER trigger.
- **All three on-signup triggers rewritten** to use the structured
  error-logging pattern.

### Code (in repo, ready to deploy)

- **`config/geo-blocks.json`** — `/auth/`, `/api/auth/`, `/api/sms/*`,
  `/api/promo/*` added to `allow_paths`.
- **`middleware.ts`** — hardcoded `AUTH_ALWAYS_ALLOW` defense-in-depth
  guard. Even if someone removes `/auth/` from the JSON again, the
  middleware allowlist still holds.
- **`pages/auth/login.js`** — `handleSignup` now (a) runs the canonical
  `validatePassword` (HIBP + entropy) and (b) redirects to `/auth/signup`
  for full provisioning. No more half-built accounts created here.
- **`pages/auth/signup.js`** — `handleOAuthSignIn` does an apex-domain
  pre-flight: if the user is on `www.smarter.poker`, it redirects to
  apex BEFORE starting OAuth. Fixes silent PKCE-verifier-not-found
  failures. The `?provider=` query param resumes OAuth on landing.
  PostHog `SIGNUP` funnel event deferred until after profile creation.
- **`pages/api/health/signup.js`** — read-only health endpoint backed by
  `signup_health_view`. Returns `ok` / `warn` / `degraded` with reasons.
- **`pages/api/cron/signup-probe.js`** — synthetic end-to-end probe.
  Creates a throwaway user, verifies all 4 downstream rows
  (auth.users, profiles, wallets, user_diamonds), deletes the user, and
  alerts via Resend + Sentry on failure. Self-cleans stale probes.
- **`__tests__/signup-hardening.test.mjs`** — 5 static guard tests that
  fail loudly if any of the above is regressed. Already wired into
  `build-safety-gate.yml` via the existing `node --test __tests__/*` step.
- **`scripts/apply-signup-hardening-2026-05-03.sh`** — idempotent re-apply
  script in case any of the file edits get reverted by autofix or a
  linter pass. Run anytime; no-ops if already applied.

## Bug-hunt findings (2026-05-03 second pass)

After the initial fix landed, I went looking for what we missed. Found and
fixed five additional bugs:

1. **Probe domain `.local` was a footgun** — RFC 6762 reserves `.local` for
   mDNS and some Supabase environments reject it. Switched to
   `probe.smarter.poker` (subdomain we own; never delivers email).
2. **`signup_health_view` counted probe users** — would have always shown
   green even if real signups were broken (the exact failure mode we're
   trying to detect). Migration `harden_signup_view_exclude_probes` filters
   probe emails out of `new_users_*`.
3. **`probe_runs_*` was always 0** — probe deletes its user immediately,
   so counting `auth.users WHERE email LIKE 'probe-%'` returned 0 even
   right after a successful probe. Added `public.probe_heartbeats` table
   that the probe writes to BEFORE cleanup. View reads from there.
4. **`SUPABASE_SERVICE_ROLE_KEY` in 6 of 7 `.env*` files is STALE** —
   tested each anon key against live Supabase; only `.env.production.local`
   returned 200. The others (`.env.production`, `.env.vercel`,
   `.env.vercel.local`, `.env.vercel-db`, `.env.verify.local`,
   `.env.example`) return 401. Production deploys are unaffected because
   Vercel uses its own UI-set env vars, but anyone running local builds or
   scripts will silently get 401s.
5. **Polling-with-backoff replaced fixed 800ms sleep** — empirical e2e
   test showed trigger rows are visible at 0ms (synchronous in-txn). The
   polling is harmless safety net for future async-trigger changes.

E2E verification (against live Supabase, run from this machine):
```
Step 1 signup: user_id=52fb8ec7-...  (1352ms)
  ✓ profiles      visible after 0ms
  ✓ wallets       visible after 0ms
  ✓ user_diamonds visible after 0ms
  cleanup DELETE: HTTP 200
  heartbeat insert: HTTP 201
  Final view: new_users_15m=0  probe_runs_15m=1  probe_ok_15m=1  errors_1h=0
```

## Manual steps (not auto-applied)

1. **Add the cron entry to `vercel.json`** so the synthetic probe runs:

   ```json
   {
     "path": "/api/cron/signup-probe",
     "schedule": "*/5 * * * *"
   }
   ```

   `vercel.json` is in `PROTECTED_FILES` so the autofix bot won't touch
   it — manual edit is correct here.

2. **Set the alert env vars in Vercel**:
   - `OPS_ALERT_EMAIL` — where probe failures email to
   - `RESEND_API_KEY` — already set (verify)
   - `RESEND_FROM_EMAIL` — already set (verify)

3. **Commit & push** the file changes:

   ```bash
   git add -A
   git commit -m "harden(signup): geo-allow /auth/, login.js parity, middleware guard, apex-OAuth, health probe + alerts"
   git push
   ```

4. **Verify in production after deploy**:

   ```bash
   # 1. Health endpoint is reachable
   curl -s https://smarter.poker/api/health/signup | jq

   # 2. Real signup works end-to-end (use a fresh email)
   # → Visit https://smarter.poker/auth/signup, complete the form
   # → Should land on /hub with a player_number assigned

   # 3. Verify the user landed in the DB
   # (run via Supabase SQL editor)
   #   SELECT id, email, created_at FROM auth.users
   #   WHERE created_at > now() - interval '5 minutes';
   ```

5. **Audit and rotate stale env files** — six `.env*` files have anon
   keys that return 401 against live Supabase. Vercel deploys use UI env
   vars so production is unaffected, but local dev / scripts / one-off
   commands will silently fail with "Invalid API key":
   ```
   .env.production       → 401 (stale)
   .env.production.local → 200 (current — keep)
   .env.vercel           → 401 (stale)
   .env.vercel.local     → 401 (stale)
   .env.vercel-db        → 401 (stale)
   .env.verify.local     → 401 (stale)
   .env.example          → 401 (intentional placeholder, but worth a comment)
   ```
   Recommended: delete the stale .local-suffix-less files and `.env.vercel*`,
   keeping only `.env.production.local` and `.env.example` (with a comment
   explaining the latter is a template).

6. **Watch the probe** for the first 24h after deploy:

   ```sql
   SELECT * FROM public.signup_health_view;
   SELECT * FROM public.signup_errors ORDER BY occurred_at DESC LIMIT 20;
   ```

## How this prevents recurrence

| Failure mode | Guard |
|---|---|
| Someone removes `/auth/` from `geo-blocks.json` | `middleware.ts` AUTH_ALWAYS_ALLOW; signup-hardening.test.mjs check 1 |
| Someone deletes a critical auth file | `next.config.js` IIFE; `__tests__/auth-routes-exist.test.mjs`; `deploy-autofix.js` PROTECTED_FILES |
| Trigger function silently fails | Dual-write to `public.signup_errors`; surfaced by health view |
| Supabase audit log goes empty again | We don't depend on it — our own `signup_errors` table is the source of truth |
| Real users stop signing up for any reason | `/api/cron/signup-probe` runs every 5 min and pages on failure |
| New "simple signup" form gets added that bypasses validation | `signup-hardening.test.mjs` check 4 fails CI |
| OAuth breaks for www.smarter.poker users | `signup-hardening.test.mjs` check 5 fails CI |

## Files changed in this fix

```
config/geo-blocks.json                                          (modified)
middleware.ts                                                   (modified)
pages/auth/login.js                                             (modified)
pages/auth/signup.js                                            (modified)
pages/api/health/signup.js                                      (NEW)
pages/api/cron/signup-probe.js                                  (NEW)
scripts/apply-signup-hardening-2026-05-03.sh                    (NEW)
__tests__/signup-hardening.test.mjs                             (NEW)
SIGNUP-FIX-2026-05-03.md                                        (NEW — this file)
```

Plus the Supabase migration `harden_signup_2026_05_03` applied via
`apply_migration` (creates `signup_errors`, `signup_health_view`,
rewrites `handle_new_user`, `handle_new_user_v2_create_wallet`,
`initialize_user_diamonds`).
