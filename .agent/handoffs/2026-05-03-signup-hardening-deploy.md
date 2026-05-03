# HANDOFF — Signup Hardening Deploy (2026-05-03)

## Context

Cowork session just completed a 3-pass investigation + fix for the signup
outage that began 2026-04-24 (zero successful signups for 9 days). Root
cause was geo-block middleware silently redirecting every signup attempt
from 10 US states to /jurisdiction-blocked before reaching Supabase.

DB migrations are LIVE on production Supabase (`kuklfnapbkmacvwxktbh`):
  - `harden_signup_2026_05_03`
  - `harden_signup_view_exclude_probes_2026_05_03c`
  - `add_probe_heartbeats_2026_05_03d`

Code edits are in the working tree, NOT committed. Read
`SIGNUP-FIX-2026-05-03-FINAL.md` for the full backstory before touching
anything.

## What you must do (in order)

### 1. Verify the working tree is sane

```bash
cd ~/Documents/Smarter-Poker-World-Hub
node --test __tests__/auth-routes-exist.test.mjs __tests__/signup-hardening.test.mjs
# Expect: 9 tests, 9 pass, 0 fail
git status --short
# Expect: edits to config/geo-blocks.json, middleware.ts, pages/auth/login.js,
# pages/auth/signup.js, src/lib/supabase.js
# + new files: pages/api/health/signup.js, pages/api/cron/signup-probe.js,
#              __tests__/signup-hardening.test.mjs,
#              scripts/apply-signup-hardening-2026-05-03.sh,
#              SIGNUP-FIX-2026-05-03-FINAL.md
```

If tests fail OR files missing → STOP and run:

```bash
bash scripts/apply-signup-hardening-2026-05-03.sh
```

It's idempotent. Says "already applied" if everything is in place.

### 2. Add the cron schedule to vercel.json

`vercel.json` has 0 cron entries. The synthetic signup probe needs one.
**vercel.json is in PROTECTED_FILES so manually edit, do not delegate to
autofix.**

Insert this object into the `crons` array (create the array if it
doesn't exist):

```json
{ "path": "/api/cron/signup-probe", "schedule": "*/5 * * * *" }
```

Verify shape with:

```bash
python3 -c "import json; d=json.load(open('vercel.json')); print(d.get('crons', []))"
```

### 3. Set Vercel env vars

In Vercel UI → Project → Settings → Environment Variables:

| Var | Value | Why |
|---|---|---|
| `CRON_SECRET` | generate with `openssl rand -hex 32` | Vercel sends this as Bearer; probe `validateCronAuth` checks it |
| `OPS_ALERT_EMAIL` | your ops inbox | probe emails alerts here on failure |
| `RESEND_API_KEY` | (verify already set) | enables alert emails via Resend |
| `RESEND_FROM_EMAIL` | (verify already set) | from-address for alert emails |

### 4. Audit and rotate stale `.env*` files

Six `.env*` files have anon keys that return HTTP 401 against live
Supabase. Production deploys are unaffected (Vercel uses UI env vars),
but local dev / scripts silently 401:

```
.env.production       → STALE 401
.env.production.local → CURRENT 200 (keep)
.env.vercel           → STALE 401
.env.vercel.local     → STALE 401
.env.vercel-db        → STALE 401
.env.verify.local     → STALE 401
.env.example          → STALE 401 (this one's intentional but undocumented)
```

Recommended: delete the stale `.env.production`, `.env.vercel*`,
`.env.verify.local`. Add a comment to `.env.example` clarifying it's a
template.

Verify with:

```bash
URL="https://kuklfnapbkmacvwxktbh.supabase.co"
for f in .env*; do
  K=$(grep -h '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  [ -z "$K" ] && continue
  echo "$f: $(curl -s -o /dev/null -w '%{http_code}' $URL/auth/v1/settings -H "apikey: $K")"
done
```

### 5. Commit and push

```bash
git add -A
git commit -m "harden(signup): full 3-pass investigation + fixes

Root cause of the 2026-04-24 → 2026-05-03 signup outage was edge
middleware geo-blocking /auth/* paths — users in WA/UT/LA/ID/MT/SD/IN/
MI/MS/TN got 307'd to /jurisdiction-blocked before reaching Supabase,
auth audit log empty, every dashboard green.

Fixes:
- config/geo-blocks.json: /auth/, /api/auth/, /api/sms/*, /api/promo/*
  in allow_paths
- middleware.ts: hardcoded AUTH_ALWAYS_ALLOW defense-in-depth guard
- pages/auth/login.js: handleSignup calls validatePassword + redirects
  to canonical /auth/signup (no more shadow simple-form path)
- pages/auth/signup.js: apex-OAuth pre-flight (PKCE verifier scope),
  signup_email_prefill mount-time read, deferred PostHog SIGNUP event
- src/lib/supabase.js: clear-error stub (was phantom import)
- pages/api/health/signup.js: NEW — backed by signup_health_view
- pages/api/cron/signup-probe.js: NEW — synthetic probe via
  admin.createUser (zero email burn), polls trigger rows, dual-writes
  heartbeat
- __tests__/signup-hardening.test.mjs: NEW — 5 regression guards
- scripts/apply-signup-hardening-2026-05-03.sh: NEW — idempotent
  re-apply

DB migrations applied separately:
  harden_signup_2026_05_03
  harden_signup_view_exclude_probes_2026_05_03c
  add_probe_heartbeats_2026_05_03d

Adds public.signup_errors (trigger error trail), public.probe_heartbeats
(probe self-health), rewrites public.signup_health_view to exclude
probe users from real-signup counts.

Live deploy currently 3 commits behind origin/main (0edb21d8 vs
80dbe8eba3). This commit + push will trigger Vercel rebuild.

Verification: bash scripts/apply-signup-hardening-2026-05-03.sh + node
--test __tests__/signup-hardening.test.mjs (9/9 pass).

See SIGNUP-FIX-2026-05-03-FINAL.md for the full investigation."

git push
```

### 6. Post-deploy verification

Wait for Vercel build to complete, then:

```bash
# Health endpoint up
curl -s https://smarter.poker/api/health/signup | jq

# Expect: status="warn" (no real signups in 1h yet),
#         probe_runs_15m grows to ≥1 within 5min of cron starting

# Real signup smoke test — use a fresh email you control
# Visit https://smarter.poker/auth/signup, complete form, confirm email,
# verify you land on /hub with a player_number assigned
```

Within 24h, query the live DB to confirm probe + real signups are
flowing:

```sql
-- via Supabase SQL editor
SELECT * FROM public.signup_health_view;
SELECT * FROM public.signup_errors ORDER BY occurred_at DESC LIMIT 20;
SELECT count(*), max(occurred_at) FROM public.probe_heartbeats
WHERE occurred_at > now() - interval '1 hour';
```

Expected after 24h on healthy system:
- `new_users_24h` > 0 (real signups happening again)
- `probe_runs_1h` ≈ 12 (every 5 min)
- `probe_ok_15m` = `probe_runs_15m` (probe success rate 100%)
- `errors_1h` = 0
- `signup_errors` table empty or only contains transient nonblocking warnings

## Rollback

If signups break worse after deploy:

```bash
# 1. Revert the code commit
git revert HEAD --no-edit && git push

# 2. The DB migrations are forward-compatible and don't need rollback —
#    they only ADD tables/views and rewrite triggers to be more
#    defensive. If you really need to revert the trigger functions to
#    their pre-fix state, the originals are in the previous migration:
#    SELECT prosrc FROM pg_proc WHERE proname='handle_new_user';
#    (compare against pre-2026-05-03 state in supabase/migrations/)
```

## What this does NOT cover

- Vercel preview deployments — every preview URL would need to be in
  Supabase Site URL allow_redirects (or use *.vercel.app wildcard)
- Mobile native apps using deep-linking auth — out of scope
- Apple Sign-In / Discord OAuth — `external.apple/discord: false` in
  Supabase config; enable in dashboard if you want them
- Email confirmation deliverability — separate concern; check Resend
  domain verification + DKIM/SPF if confirmation emails bounce

## Files of interest

- `SIGNUP-FIX-2026-05-03-FINAL.md` — full post-mortem
- `scripts/apply-signup-hardening-2026-05-03.sh` — re-apply script
- `__tests__/signup-hardening.test.mjs` — regression guards
- `pages/api/health/signup.js` — read endpoint
- `pages/api/cron/signup-probe.js` — synthetic probe

When done, commit ONE final message:

```
ops(signup): cron + env wired, deploy verified, post-mortem on file
```
