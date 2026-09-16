# 07 — Auth Outage

## When to use

- Sign-in failure rate > 5% over 5 minutes (Grafana "Auth success / min"
  panel).
- Application error spike on `pages/api/auth/*` or `lib/supabase/auth.ts` paths.
- MFA challenge endpoints returning 5xx.
- Supabase dashboard reports `auth` service degraded.
- Users reporting "stuck on loading" after entering password, or MFA
  codes rejected despite being correct.

## Prerequisites

- Supabase admin access (auth logs + service config).
- Vercel deploy access.
- Ability to temporarily disable MFA enforcement flags (ops runbook
  only — never done unannounced during normal operation).

## Symptoms

Auth flows on the platform run through Supabase Auth. The critical
paths are:

1. Password sign-in (`/api/auth/login` or direct Supabase client call).
2. MFA challenge (`/auth/mfa` + `/api/auth/mfa/verify`).
3. Step-up reauth for high-risk routes (gated by `requireMfaEnrolled`
   and `requireStepUp` middlewares).
4. Passwordless / OAuth flows (if enabled).

Failure modes:

**A. Supabase Auth degraded.** Everything auth-related failing. Status
page shows red. Nothing to fix in our code.

**B. Our auth code regression.** A recent deploy broke the login handler,
the MFA gate, or the session refresh logic. Isolated to our code paths.

**C. MFA data integrity.** A user's TOTP secret or backup codes got
corrupted (very rare, but has happened during migrations). Single-user
issue, not an outage, but looks like one if the user is loud.

**D. Rate-limiting ourselves.** Account-enumeration defense (Phase
6.1.19) or brute-force protection firing too aggressively after a
config change.

## Procedure

### Step 1 — Scope it

```bash
# Sign-in failure breakdown over last hour (Grafana panel link in #incidents pinned)
# OR via Supabase:
```

In Supabase dashboard → Auth → Logs, filter by event_type in
`('login_failed', 'token_refreshed_failed', 'mfa_challenge_failed')`
over the last hour. If the volume is uniform across users, it's a
platform issue (A or B). If it's concentrated on one user or one
org, it's C.

### Step 2 — Supabase degradation (A)

1. Check https://status.supabase.com. If Auth is listed as degraded,
   there's nothing we can do but wait.
2. Post an advisory to status.smarter.poker: "We are aware of sign-in
   issues caused by an upstream provider. Active sessions are
   unaffected. Next update in 15 minutes."
3. Do NOT attempt to migrate off Supabase Auth during an incident.
   That's a quarterly plan, not an incident response.

### Step 3 — Our code regression (B)

1. Correlate the failure start time with recent deploys (runbook 01
   step 1). If a deploy landed right before the spike, roll back (step
   2 of runbook 01).
2. If no obvious deploy correlation, grep recent changes to `auth` and
   `middleware`:
   ```bash
   git log --oneline --since="24 hours ago" -- pages/api/auth middleware.ts lib/auth
   ```
3. Identify the broken path. The Error signature usually tells you
   the file and line.
4. Fix forward or revert. Auth code is especially unsafe for fix-forward
   under time pressure — default to revert.

### Step 4 — Single-user MFA issue (C)

This is usually a support ticket, not an incident. If the user is truly
locked out:

1. Verify their identity out-of-band (email + second factor of your
   choice — company process).
2. In Supabase dashboard → Auth → Users, select the user.
3. Disable their MFA factor:
   ```sql
   -- Verify first
   SELECT id, type, created_at FROM auth.mfa_factors WHERE user_id = '<uuid>';
   -- Then disable
   UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = '<uuid>';
   ```
4. Force the user to re-enroll via `/auth/settings/mfa`.
5. Log the support action to the admin audit log (Phase 6.1.8) with the
   support ticket ID.

**Never export MFA secrets, even to the user.** If their authenticator
device is lost, they must re-enroll from scratch.

### Step 5 — Over-aggressive rate-limiting (D)

1. Check `middleware/rate-limit.ts` config values against prior known-good.
2. If a recent PR tightened rate-limits on auth paths and is causing
   legitimate rejection, revert that PR specifically. Rate-limit
   changes are a distinct review class and should not ride along with
   other features.
3. Verify by signing in from a test account — should succeed within
   three attempts.

### Step 6 — Verify recovery

- Sign-in failure rate < 1% for 10 minutes.
- MFA challenge p99 < 500ms.
- A test login with your own account succeeds end-to-end: password →
  MFA → session established → hit a gated route → succeed.

## Rollback

- **Code revert:** standard git revert + push, same as runbook 01.
- **MFA factor disable** (C): no direct rollback — the user re-enrolls.
  The audit log captures the action.
- **Rate-limit change revert** (D): the PR revert IS the rollback.

## Escalation

- **Supabase Auth unreachable > 15 minutes:** open a direct support
  case with Supabase (not just the status page — they don't always
  correlate automatic alerts to specific projects). Page the lead.
- **A spike of `mfa_challenge_failed` from a narrow IP range** during
  an outage: this may be credential-stuffing taking advantage of
  confusion. Tighten rate-limiting and escalate to the security
  contact.
- **Any successful bypass of MFA** (user reports being able to log in
  without their second factor when they shouldn't): SEV-1. Disable the
  account, capture logs, page the lead and the security contact
  immediately.

## Postmortem

Required for:

- Any auth outage > 10 minutes of degraded sign-in.
- Any MFA bypass or MFA-data corruption event.
- Any aggressive rate-limit config change that reached prod without
  review.

Include: the failure class, affected user count (from Supabase auth
logs — they're tagged by user_id), whether the deploy guardrails
should have caught a code regression pre-merge, and for C issues,
whether a recurring pattern suggests an MFA enrolment UX issue rather
than individual user error.

---

## Appendix — Failure Class E: Missing auth-flow files (2026-05-02 incident)

### What happened

On 2026-05-02 every signup attempt — Google OAuth and email/password —
404'd in production. Vercel runtime logs showed:

```
GET /auth/callback | 404
```

`pages/auth/callback.js` had been silently deleted from the repo.
`signup.js` and `login.js` both tell Supabase to redirect to
`${origin}/auth/callback` after the auth handshake (`emailRedirectTo`
for email confirmation, `redirectTo` for OAuth). With no file at that
route, every user got dead-ended after the redirect.

A subsequent audit found two more rotted routes:

- `/auth/forgot-password` — the "Forgot password?" button on
  `/auth/login` 404'd.
- `/auth/reset-password` — the recovery flow had no landing page.

`pages/hub/settings.js` was also calling `resetPasswordForEmail` with
`redirectTo: /hub/reset-auth`, which is an *auth-clearing* utility,
not a password-reset form — so the in-app reset path was broken too.

### Why the existing guardrails missed it

- `pages/auth/` was not in `SENSITIVE_PATHS` or `PROTECTED_FILES` in
  `pages/api/deploy-autofix.js`. Autofix could overwrite or delete
  files there without a PR.
- Pre-push hook CHECK 6 only warned about `/auth/signin` *string
  references*; it did not validate that referenced files existed on
  disk.
- The `npm prebuild` lifecycle hook was added briefly but never ran
  on Vercel — Vercel invokes `next build` directly, bypassing
  `npm run build`.

### What's now in place to prevent recurrence (Failure Class E)

The auth-critical file set is:

```
pages/auth/callback.js
pages/auth/login.js
pages/auth/signup.js
pages/auth/forgot-password.js
pages/auth/reset-password.js
pages/api/auth/ensure-profile.js
```

If any of these is missing or truncated, multiple guards fire:

1. **`next.config.js`** — synchronous `fs.existsSync` check at the top
   of the file. `next build` and `next dev` both fail with a clear
   error before compilation begins. This is the production-blocking
   guard — Vercel cannot ship without it passing.
2. **`__tests__/auth-routes-exist.test.mjs`** — `node --test` guard.
   Single source of truth for the file list.
3. **`.github/workflows/build-safety-gate.yml` CHECK 8** — runs the
   above test on every push and PR to `main`.
4. **`scripts/pre-push-hook.sh` CHECK 6** — local hard block before
   `git push` lands on the remote.
5. **`pages/api/deploy-autofix.js`** — files are in `PROTECTED_FILES`
   (autofix never modifies them) and `pages/auth/` is in
   `SENSITIVE_PATHS` (any change must ship via PR).

### Diagnosis when this recurs

```bash
# Step 1 — confirm the 404 in runtime logs
# (Vercel dashboard → Logs → filter path /auth/callback or status 404)

# Step 2 — check which auth files are present at HEAD
for f in pages/auth/callback.js pages/auth/login.js pages/auth/signup.js \
         pages/auth/forgot-password.js pages/auth/reset-password.js \
         pages/api/auth/ensure-profile.js; do
  if [ ! -f "$f" ]; then echo "MISSING: $f"; fi
done

# Step 3 — find the deletion commit
git log --diff-filter=D --name-only --since="7 days ago" -- pages/auth/ pages/api/auth/

# Step 4 — restore from the parent of the deleting commit
git checkout <parent-sha> -- <missing-path>
git commit -m "fix(auth): restore <file> deleted by <SHA>"
git push
```

### Symptoms unique to Class E

- All sign-in attempts succeed up to the moment of redirect, then 404.
- Active sessions are unaffected (token refresh path doesn't touch
  these files).
- Supabase Auth logs look healthy — the failure is downstream of
  Supabase, on our redirect target.
- No application error is recorded because the 404 is served by Next.js's
  static 404 handler, not by application code.
