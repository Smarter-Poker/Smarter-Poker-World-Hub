# Signup Runbook

When an alert fires, find the alert by name below. Each entry tells you:
**what it means**, **what to check first**, **how to fix**, **how to verify
the fix**.

This is the page you load at 3am. Bookmark it.

---

## ALERT: `signup_probe_failed`

**Source:** `/api/cron/signup-probe` returned 503 (cron-job.org or Vercel
cron logs the failure).

**What it means:** The synthetic probe tried to create + verify + delete a
test user and FAILED at one of: createUser, profile row visibility, wallet
row visibility, user_diamonds row visibility.

**Check first:**
1. Open https://smarter.poker/admin/signup-health (admin-secret required)
2. Look at "Trigger errors (1h)" — is it > 0?
3. Look at most recent `probe_heartbeats` row — what does `details.failed_step` say?
4. If `failed_step = signup`: Supabase /auth/v1/admin/users is rejecting
   the createUser call. Check Supabase status page.
5. If `failed_step = profiles | wallets | user_diamonds`: a trigger is
   failing. Query `signup_errors` table for the message.

**How to fix:**
- **`signup` step failed (HTTP 5xx from Supabase):** wait + retry. Supabase
  outage. Status page: https://status.supabase.com
- **`signup` step failed (HTTP 4xx):** SUPABASE_SERVICE_ROLE_KEY rotated
  or removed. Check Vercel env vars match what's in Supabase dashboard →
  Settings → API.
- **Trigger row missing (`profiles` etc):** the corresponding trigger
  threw. Run `SELECT * FROM signup_errors ORDER BY occurred_at DESC LIMIT 5`
  in Supabase. The error message tells you what to fix.
- **Common: "duplicate key value":** username collision (rare with our
  player_number sequence). Restart the sequence or fix the upsert clause.
- **Common: "permission denied":** SECURITY DEFINER function lost privs.
  Re-grant `INSERT ON public.<table> TO postgres`.

**Verify:**
```bash
curl -s https://smarter.poker/api/health/signup | jq
# Expect: status="ok", probe_runs_15m≥1, errors_1h=0
```

---

## ALERT: `signup_probe_stalled` (no heartbeats in 15m)

**Source:** `/api/health/signup` returns `status="warn"` with reason
"synthetic probe has not run in the last 15 minutes".

**What it means:** The cron job that runs the probe stopped firing. Could be:
- Vercel cron disabled
- Cron entry removed from `vercel.json`
- `CRON_SECRET` env var rotated and probe getting 401

**Check first:**
1. Vercel dashboard → Project → Settings → Crons. Confirm
   `/api/cron/signup-probe` is listed and enabled.
2. Vercel logs for `/api/cron/signup-probe` — is it being invoked? Last
   10 invocations show?
3. If invoked but failing — what's the response code? 401 = auth issue,
   500 = config issue.

**How to fix:**
- **Cron not listed:** add to `vercel.json` (file is in PROTECTED_FILES,
  manual edit required). Schedule: `*/5 * * * *`.
- **401 returned:** `CRON_SECRET` env var doesn't match. Either set it on
  Vercel project + restart the deployment, OR delete `CRON_SECRET` env
  entirely (the probe falls back to allowing all when unset).
- **500 / no response:** missing `SUPABASE_SERVICE_ROLE_KEY` env on
  Vercel. Check Vercel env vars.

**Verify:** wait 5–10 min, then `curl -s /api/health/signup | jq` —
`probe_runs_15m` should be ≥ 1.

---

## ALERT: `trigger_audit_failed`

**Source:** `/api/cron/trigger-audit` returns 503 with a list of failed
assertions.

**What it means:** A critical DB object is missing or has been silently
modified. The list of possible failures includes: trigger function
deleted, table dropped, unique index removed, view rebuild lost columns,
etc.

**Check first:**
1. The 503 response body has `failures: [...]` — read which assertion(s)
   failed.
2. Run that assertion's SQL directly in Supabase to confirm.

**How to fix per assertion:**
| Failed assertion | Fix |
|---|---|
| `three_triggers_on_auth_users` | A trigger was dropped. Re-apply the migration `harden_signup_2026_05_03`. |
| `handle_new_user_function_exists_nonempty` | Function was DROP'd or rewritten as no-op. Re-apply `harden_signup_2026_05_03`. |
| `handle_new_user_logs_to_signup_errors` | Function was rewritten WITHOUT the dual-write to signup_errors. We've lost observability. Re-apply migration. |
| `wallet_trigger_function_exists` | Wallet trigger function gone. Re-apply migration. |
| `diamonds_trigger_function_exists` | Diamonds trigger gone. Re-apply migration. |
| `wallets_unique_index_exists` | The `(user_id, wallet_type)` unique index was dropped. ON CONFLICT clauses will throw. Re-create the index manually. |
| `signup_errors_table_exists` | Forensic table dropped. Re-create from `harden_signup_2026_05_03`. |
| `probe_heartbeats_table_exists` | Heartbeat table dropped. Re-create from `add_probe_heartbeats_2026_05_03d`. |
| `signup_health_view_exists` | View dropped. Re-create from `harden_signup_view_exclude_probes_2026_05_03c`. |

**Verify:** re-trigger the cron manually — `curl https://smarter.poker/api/cron/trigger-audit -H "Authorization: Bearer $CRON_SECRET"` — should return 200.

---

## ALERT: `signup_conversion_drop` (PostHog)

**Source:** PostHog Insight tracking `signup` events per hour drops below
50% of 7-day rolling average.

**What it means:** Real users are getting fewer accounts created than
normal. This is the LEADING indicator — probe still might pass, but
something about the user-facing path is broken.

**Check first:**
1. https://smarter.poker/admin/signup-health — is the probe green?
2. If yes (probe green, real signups dropped): the bug is in the form
   itself, not the API.
3. Open https://smarter.poker/auth/signup in incognito — does the form
   render?
4. Open browser devtools → Network tab → submit a fake signup → look at
   the request. Does it 200?
5. If form errors with no network call — JS error. Check `/admin/signup-health`
   error log and the first-party `client_crash_log` records for the signup route.

**How to fix:**
- **Geo-block regression:** confirm `/auth/signup` returns 200, not 307. If
  307: re-apply `scripts/apply-signup-hardening-2026-05-03.sh`.
- **JS error in signup.js:** revert the most recent change to the file
  (autofix bot has a history of this) and redeploy.
- **Supabase rate limit hit:** check Supabase logs. Increase rate limit in
  dashboard → Authentication → Rate Limits.
- **Email deliverability dropped:** users sign up but never confirm. Check
  `/api/cron/email-deliverability-check` last result. Resend domain
  verification might have lapsed.

**Verify:** wait 1h. PostHog conversion should return to baseline.

---

## ALERT: `email_deliverability_failed`

**Source:** `/api/cron/email-deliverability-check` (nightly) returns 503.

**What it means:** Confirmation emails are bouncing or not being delivered.
Users sign up, never get the email, never confirm, never become real users.
This silently kills conversion.

**Check first:**
1. The 503 body lists failed checks. SPF/DKIM/DMARC/Resend domain status.
2. https://www.mail-tester.com/ — send a test from your Resend account
   to get a deliverability score.
3. Resend dashboard → Domains → smarter.poker — is it "Verified"?

**How to fix:**
- **DKIM record missing:** add the `resend._domainkey TXT` record to your
  DNS as shown in Resend dashboard.
- **SPF too restrictive:** ensure `include:_spf.resend.com` is in the
  TXT record for smarter.poker.
- **DMARC `p=reject`:** add `p=quarantine` first to gather data, then
  `p=reject` once aligned.
- **Resend API key revoked:** rotate `RESEND_API_KEY` in Vercel env.

**Verify:** rerun the cron manually — should return 200.

---

## ALERT: `login_probe_failed` (Phase 4)

**Source:** `/api/cron/login-probe` returned 503.

**What it means:** Synthetic user can sign UP but cannot sign IN. Distinct
from signup-probe — could mean: password hashing changed, JWT signer
broken, refresh-token endpoint down, GoTrue session table corrupted.

**Check first:**
1. `/admin/auth-health` — what does the Login flow card show? `failed_step` value?
2. `failed_step = login` (signInWithPassword): rate limit on Supabase OR
   wrong password format OR GoTrue down.
3. `failed_step = getuser`: session JWT is being issued but doesn't
   verify. Likely JWT signing keys rotated without app restart.

**How to fix:**
- **GoTrue rate limit:** lower the per-cron probe count or increase the
  Supabase rate limit. Don't disable the probe.
- **JWT signer rotated:** restart all Vercel deployments (forces them to
  pick up the new JWKS). Sometimes a Supabase platform restart auto-rotates.
- **Session-table corruption:** run `SELECT * FROM auth.sessions WHERE
  user_id NOT IN (SELECT id FROM auth.users)` — orphan rows? Delete them.

**Verify:**
```bash
curl https://smarter.poker/api/cron/login-probe -H "Authorization: Bearer $CRON_SECRET"
# expect: {"status":"ok","steps":{"create":{"ok":true},"login":{"ok":true},"getuser":{"ok":true}}}
```

---

## ALERT: `recovery_probe_failed` (Phase 4)

**Source:** `/api/cron/recovery-probe` returned 503.

**What it means:** Either password-reset request OR magic-link request
is failing at the API level. Users can't reset their password OR can't
sign in via magic link.

**Check first:**
1. `/admin/auth-health` Recovery flow card: which sub-flow failed?
2. `flows.password_reset.error` or `flows.magic_link.error` in the response

**How to fix:**
- **`Email rate limit exceeded`:** Supabase auth rate limit. Increase in
  dashboard → Authentication → Rate Limits.
- **`Database error`:** check signup_errors for related entries.
- **HTTP 5xx:** Supabase outage. Wait + retry.

**Note:** these probes verify the API ACCEPTS the request. Actual email
delivery requires `email-deliverability-check` (separate cron).

---

## ALERT: `auth_integrity_audit: real orphans detected` (Phase 4)

**Source:** `/api/cron/auth-integrity-audit` returns
`status: "real_orphans_detected"` with non-zero counts in `real_orphans`.

**What it means:** Real (non-system) auth.users exist without their
profile, wallet, or user_diamonds row. They're broken users — they can
sign in but the app crashes on first request because expected DB rows
are missing.

**Check first:**
1. Response body shows the counts: `real_orphans.no_profile`, `.no_wallet`,
   `.no_diamonds`.
2. Query for the affected users:
   ```sql
   SELECT u.id, u.email, u.created_at,
     EXISTS(SELECT 1 FROM profiles p WHERE p.id=u.id) AS has_profile,
     EXISTS(SELECT 1 FROM wallets w WHERE w.user_id=u.id) AS has_wallet,
     EXISTS(SELECT 1 FROM user_diamonds d WHERE d.user_id=u.id) AS has_diamonds
   FROM auth.users u
   WHERE u.deleted_at IS NULL
     AND NOT public.is_system_user(u.email)
     AND (NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=u.id)
       OR NOT EXISTS(SELECT 1 FROM wallets w WHERE w.user_id=u.id)
       OR NOT EXISTS(SELECT 1 FROM user_diamonds d WHERE d.user_id=u.id));
   ```
3. Are there entries in `signup_errors` for these users? That tells you
   WHICH trigger failed.

**How to fix:**
```bash
# Heal the orphans (idempotent)
curl "https://smarter.poker/api/cron/auth-integrity-audit?heal=1" \
  -H "Authorization: Bearer $CRON_SECRET"
# Re-run the audit to confirm:
curl "https://smarter.poker/api/cron/auth-integrity-audit" \
  -H "Authorization: Bearer $CRON_SECRET"
# expect real_orphans counts now 0
```

If the audit immediately re-detects orphans on the next run, a trigger
is actively failing. Run `trigger-audit` and check `signup_errors`.

---

## ALERT: signup-hardening test failure on a PR

**Source:** GitHub Action `Build Safety Gate` fails on
`__tests__/signup-hardening.test.mjs`.

**What it means:** The PR removed a regression guard. One of:
- `/auth/` path removed from `geo-blocks.json` allow_paths AND
  `middleware.ts` AUTH_ALWAYS_ALLOW
- `/api/health/signup` deleted
- `/api/cron/signup-probe` deleted
- `login.js` reverted to bare `signUp` (no validation)
- `signup.js` lost the apex-OAuth pre-flight

**How to fix:**
- Look at the failed assertion message — it tells you which guard regressed.
- Either restore the guard in this PR, OR add a test that proves the new
  approach protects the same failure class.

**Do NOT** remove the test to make CI pass. The next outage will be
expensive.

---

## RUNBOOK: total signup outage (zero new users)

**Symptoms:**
- `signup_probe_failed` AND
- `signup_conversion_drop` AND
- `/admin/signup-health` shows `new_users_24h = 0`

**Step 1: Quick diagnosis**
```bash
# Is the page even reachable?
curl -I https://smarter.poker/auth/signup
# 200 → form loads. 307 → geo-block. 5xx → server down.

# Does Supabase work?
curl https://kuklfnapbkmacvwxktbh.supabase.co/auth/v1/settings -H "apikey: <ANON>"
# 200 → Supabase up. 503/504 → Supabase down.
```

**Step 2: Failover to backup signup**
- Direct users to https://smarter.poker/auth/quick (the simplified
  emergency form). It bypasses the main JS bundle.
- Tweet/post on the status page that you're investigating.

**Step 3: Bisect**
- Was there a recent deploy? `git log origin/main --oneline -10`
- Roll back to the last known-good commit:
  ```bash
  git revert HEAD --no-edit && git push
  ```
- Wait 90 sec for Vercel to redeploy.
- Re-test signup.

**Step 4: If revert doesn't fix**
- Was a Supabase migration applied? Check Supabase → Database → Migrations.
- Was an env var changed? Vercel → Settings → Env Vars → audit log.
- Check `signup_errors` table for clues on what's failing.

**Step 5: Recover**
- Once signup is working, run the synthetic probe manually to confirm:
  ```bash
  curl https://smarter.poker/api/cron/signup-probe -H "Authorization: Bearer $CRON_SECRET"
  ```
- Write a postmortem. Add a new test/guard that catches this class of
  failure. Update this runbook.

---

## Quick reference

| Thing | URL |
|---|---|
| Live dashboard | https://smarter.poker/admin/signup-health |
| Health probe | https://smarter.poker/api/health/signup |
| Backup signup | https://smarter.poker/auth/quick |
| Supabase project | https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh |
| Browser crash records | First-party `client_crash_log`, filtered by route/section |
| Vercel project | https://vercel.com/<org>/smarter-poker-world-hub |
| Resend domain | https://resend.com/domains |
| Original outage post-mortem | `SIGNUP-FIX-2026-05-03-FINAL.md` |
| Hardening tests | `__tests__/signup-hardening.test.mjs` |
| Re-apply patches | `bash scripts/apply-signup-hardening-2026-05-03.sh` |
