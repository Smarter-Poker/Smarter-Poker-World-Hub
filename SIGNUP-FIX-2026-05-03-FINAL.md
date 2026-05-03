# Signup Failure — FINAL POST-MORTEM (2026-05-03)

Three passes of investigation. Everything verified live against Supabase.

## Executive summary

- **Root cause**: `/auth/*` and `/api/auth/*` were missing from
  `geo-blocks.json` `allow_paths`. Vercel edge middleware silently
  redirected every signup attempt from WA/UT/LA/ID/MT/SD/IN/MI/MS/TN to
  `/jurisdiction-blocked` BEFORE the request ever reached Supabase.
- **Last successful real signup**: April 24 (email), April 20 (Google).
- **Damage period**: 9 days, zero observability (auth audit log was empty).

## Three passes of investigation

### Pass 1 — Initial fix (8 deliverables)
Root-cause patch + DB migration adding `signup_errors` table + 3 trigger
rewrites with structured error logging + middleware allowlist guard +
login.js parity + signup.js apex-OAuth pre-flight + health endpoint +
synthetic probe + 5-test regression suite + idempotent re-apply script.

### Pass 2 — Bug hunt (5 additional fixes)
- Probe email TLD switched from `.local` (RFC 6762 reserved) to
  `probe.smarter.poker` (subdomain we own).
- `signup_health_view` rewrite — was counting probe users → would have
  always shown green even with real signups broken (the EXACT failure
  mode we're trying to detect).
- Added `public.probe_heartbeats` table — probe deletes its user
  immediately, so without a dedicated heartbeat table we couldn't tell
  if the probe itself stalled.
- Polling-with-backoff replaced fixed 800ms sleep (empirically: triggers
  fire at 0ms — synchronous in-txn).
- Stale `.env*` audit — 6 of 7 files have anon keys returning 401.

### Pass 3 — Deeper hunt (4 more fixes)
- **Probe was burning ~288 confirmation emails/day** to a non-MX domain
  (Supabase `mailer_autoconfirm: false` means it tries to send for every
  signup). Switched probe to `admin.auth.admin.createUser({ email_confirm: true })`
  — same trigger chain, zero email burn.
- **`signup_email_prefill` was dead code** — login.js wrote it,
  signup.js never read it. Added mount-time useEffect.
- **`src/lib/supabase.js` was a phantom import** — re-exported from
  `@smarter-poker/commander-shared/lib/supabase` which DOES NOT EXIST.
  Build only worked because of the next.config.js webpack alias.
  Replaced with a clear-error stub.
- **`code_challenge_method` was blank in OAuth init test** — turned out
  to be a layer confusion: PKCE secures the SPA↔Supabase leg, not
  Supabase↔Google. Behavior is correct.

## End-to-end verification (live Supabase, this machine)

### Probe via admin.createUser (the production path)
```
createUser:    user_id=51f5beae-95be-41bb-895f-c95e6b7bd5d3
  ✓ profiles created
  ✓ wallets created
  ✓ user_diamonds created
  heartbeat: HTTP 201
  cleanup: HTTP 200
  total 1010ms
```

### Real signup with full metadata (the user-facing path)
```
user_id: 80c77d3f-5e72-4639-b40d-e52b790c64c4
Profile: {
  username: "realperson",
  first_name: "Real",
  last_name: "Person",
  full_name: "Real Person",
  player_number: 897795,
  access_tier: "Full_Access"
}
user_metadata seen by trigger: {
  birth_year: 1990, city: "NYC", state: "NY",
  first_name: "Real", last_name: "Person", full_name: "Real Person",
  poker_alias: "realperson", email_verified: false, phone_verified: false
}
```

### Google OAuth chain
```
provider=google → Supabase /authorize → 302 to accounts.google.com
  client_id: 975303446258-27veknpfc8mlog60h... ✓ valid
  redirect_uri (Google's): https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/callback ✓
  scope: email+profile ✓
  state: eb6f91fe-3ee0-... ✓ set
Final redirect_to allowlist:
  smarter.poker     ✓ accepted
  www.smarter.poker ✓ accepted (apex-OAuth pre-flight handles PKCE scope)
```

### Database state
```
new_users_24h: 0           ← real signups (correctly excludes probes)
probe_runs_15m: 1          ← probe heartbeat recorded
probe_ok_15m: 1            ← probe succeeded
trigger_errors_1h: 0       ← clean
test_users_in_db: 0        ← all e2e tests cleaned up
heartbeats_recorded: 2     ← real heartbeats from this session
```

### Tests
```
__tests__/auth-routes-exist.test.mjs   4/4 pass
__tests__/signup-hardening.test.mjs    5/5 pass
next.config.js IIFE                    aborts build if any auth file missing
```

## What's now in place

### Database (live)
- `public.signup_errors` — append-only trigger error trail
- `public.probe_heartbeats` — probe self-health tracking
- `public.signup_health_view` — distinguishes real vs probe signups
- 3 trigger functions rewritten with structured error logging
- `profiles_player_number_seq` pre-created (no DDL inside triggers)

### Code
- `config/geo-blocks.json` — `/auth/`, `/api/auth/`, `/api/sms/*`,
  `/api/promo/*` in `allow_paths`
- `middleware.ts` — hardcoded `AUTH_ALWAYS_ALLOW` defense-in-depth
- `pages/auth/login.js` — `handleSignup` calls `validatePassword` +
  routes to `/auth/signup`
- `pages/auth/signup.js` — apex-OAuth pre-flight, deferred PostHog
  `SIGNUP` event, `signup_email_prefill` mount-time read
- `src/lib/supabase.js` — clear-error stub (was phantom import)
- `pages/api/health/signup.js` — backed by `signup_health_view`
- `pages/api/cron/signup-probe.js` — uses `admin.createUser` (no email
  burn), polling for trigger rows, dual heartbeat write
- `__tests__/signup-hardening.test.mjs` — 5 regression guards
- `scripts/apply-signup-hardening-2026-05-03.sh` — idempotent re-apply

## What you need to do (no agent can)

1. **Add the cron entry to `vercel.json`**:
   ```json
   { "path": "/api/cron/signup-probe", "schedule": "*/5 * * * *" }
   ```
2. **Set in Vercel env**: `CRON_SECRET`, `OPS_ALERT_EMAIL` (for probe alerts).
3. **Rotate or delete the 6 stale `.env*` files** (production unaffected;
   only local dev is broken):
   - `.env.production`, `.env.vercel`, `.env.vercel.local`,
     `.env.vercel-db`, `.env.verify.local`, `.env.example` — all return 401
   - `.env.production.local` — works, keep it
4. **Commit and push** — local HEAD = origin/main, but my edits are
   uncommitted. Live deploy is on `0edb21d8`, origin/main is `80dbe8eba3`,
   3 commits behind:
   ```bash
   git add -A
   git commit -m "harden(signup): full investigation + fixes — see SIGNUP-FIX-2026-05-03-FINAL.md"
   git push
   ```
5. **After deploy, verify live**:
   ```bash
   curl -s https://smarter.poker/api/health/signup | jq
   # Expect: status=warn (no real signups in 1h), probe_runs_15m≥1
   ```

## Failure-mode-to-guard map

| Failure mode | Guard |
|---|---|
| `/auth/` removed from geo-blocks.json | `middleware.ts` AUTH_ALWAYS_ALLOW + signup-hardening test |
| Critical auth file deleted | `next.config.js` IIFE + auth-routes-exist test + deploy-autofix PROTECTED_FILES |
| Trigger silently fails | `signup_errors` table + view shows trigger_errors_1h |
| Auth audit log empty | We don't depend on it — `signup_errors` is our source of truth |
| Real users stop signing up | Probe runs every 5 min, alerts via email + Sentry |
| Probe itself stalls | `probe_heartbeats` last_probe_at + view shows probe_runs_15m |
| New simple-signup form bypasses validation | signup-hardening test 4 fails CI |
| OAuth breaks for www users | signup-hardening test 5 fails CI |
| Webpack alias removed → supabase imports break | clear-error stub at src/lib/supabase.js |
