# 07 — Auth Outage

## When to use

- Sign-in failure rate > 5% over 5 minutes (Grafana "Auth success / min"
  panel).
- Sentry spike on `pages/api/auth/*` or `lib/supabase/auth.ts` paths.
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
3. Identify the broken path. The Sentry fingerprint usually tells you
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
