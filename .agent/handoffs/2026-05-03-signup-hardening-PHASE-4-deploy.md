# HANDOFF — Signup Hardening Phase 4 Deploy (2026-05-03)

## Status going in

Phases 1-3 are LIVE in production (deployed earlier today, commit `f21a08fcf2`).
Phase 4 code + DB migrations are ready in the working tree but **not
committed, not deployed, not in vercel.json**. The previous agent verified
everything works end-to-end against live Supabase but cannot push code or
edit `vercel.json` (in PROTECTED_FILES).

You're picking up where they stopped.

## What's already done (don't redo)

- ✅ DB migrations applied LIVE: `add_auth_integrity_audit_2026_05_03h`,
  `add_auth_health_view_2026_05_03i`. RPCs `audit_auth_integrity()`,
  `heal_auth_integrity()`, `is_system_user()` are callable.
- ✅ Real production orphan healed: `costamargaritis@gmail.com` had been
  missing user_diamonds since Jan 27, now fixed via `heal_auth_integrity()`.
- ✅ Phase 4 code in working tree (uncommitted):
  - `pages/api/cron/auth-integrity-audit.js`
  - `pages/api/cron/login-probe.js`
  - `pages/api/cron/recovery-probe.js`
  - `pages/admin/auth-health.js`
  - `__tests__/phase-4-deliverables.test.mjs`
  - `__tests__/_test-guards-exist.test.mjs` (updated to require Phase 4 file)
  - `docs/SIGNUP_RUNBOOK.md` (extended with 3 new alert sections)
  - `SIGNUP-HARDENING-PHASE-4.md`
- ✅ E2E live verified: login probe got real JWT (880 chars) + getUser
  matched. Recovery probe got HTTP 200. Audit RPC found + healed 1 real
  orphan. Health view returns single row.
- ✅ All 39 tests pass: `node --test __tests__/*.test.mjs`
- ✅ Chaos drill: 8/8 detected.

## Step 1: Verify the working tree is sane

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# All 7 test files should be present and pass
node --test \
  __tests__/_test-guards-exist.test.mjs \
  __tests__/auth-routes-exist.test.mjs \
  __tests__/signup-hardening.test.mjs \
  __tests__/build-2-deliverables.test.mjs \
  __tests__/sentry-coverage.test.mjs \
  __tests__/phase-3-deliverables.test.mjs \
  __tests__/phase-4-deliverables.test.mjs
# Expect: # tests 39  # pass 39  # fail 0

# Chaos drill should detect all 8 known failure modes
bash scripts/chaos-signup-drill.sh
# Expect: Detected: 8  Missed: 0  exit 0

# Working tree should show the Phase 4 changes uncommitted
git status --short
# Expect: 5 new files in pages/api/cron + pages/admin + __tests__ + docs
# Plus modified _test-guards-exist.test.mjs and SIGNUP_RUNBOOK.md
```

If any of these fail, **STOP**. Re-run the patch script first:
`bash scripts/apply-signup-hardening-2026-05-03.sh` (idempotent).

## Step 2: Add 3 NEW cron entries to vercel.json

`vercel.json` is in `PROTECTED_FILES` (autofix bot won't touch it).
Manually add to the existing `crons` array:

```json
{ "path": "/api/cron/login-probe",          "schedule": "*/5 * * * *" },
{ "path": "/api/cron/recovery-probe",       "schedule": "*/15 * * * *" },
{ "path": "/api/cron/auth-integrity-audit", "schedule": "0 4 * * *"   }
```

The audit cron starts in audit-only mode. To enable auto-heal once you
trust it (recommend after 7 days of clean runs), change the path to
`/api/cron/auth-integrity-audit?heal=1`.

Verify the JSON parses:
```bash
python3 -c "import json; d=json.load(open('vercel.json')); print('crons:', len(d.get('crons', [])))"
# Expect: crons: 9 (was 6 after Phase 3, +3 from Phase 4)
```

## Step 3: Update build-safety-gate.yml to run ALL 7 test files

Your last CI run reported "9/9 pass" — that's only 2 of the 7 test files.
The other 30 tests are not being enforced. Find this block in
`.github/workflows/build-safety-gate.yml` (around CHECK 8):

```yaml
node --test __tests__/auth-routes-exist.test.mjs
```

Replace it with:

```yaml
node --test \
  __tests__/_test-guards-exist.test.mjs \
  __tests__/auth-routes-exist.test.mjs \
  __tests__/signup-hardening.test.mjs \
  __tests__/build-2-deliverables.test.mjs \
  __tests__/sentry-coverage.test.mjs \
  __tests__/phase-3-deliverables.test.mjs \
  __tests__/phase-4-deliverables.test.mjs
```

After this lands, the next push that breaks any of the 39 guards will
fail CI before merge.

## Step 4: Commit and push

```bash
git add -A
git commit -m "harden(auth): phase 4 — coverage expansion + DB integrity

Adds login + recovery + magic-link probes (parity with signup-probe),
DB integrity audit + auto-heal RPCs (verified live: detected + healed
1 real Gmail-user orphan from January), unified /admin/auth-health
dashboard, runbook entries for new alerts.

Migrations applied live:
  add_auth_integrity_audit_2026_05_03h
  add_auth_health_view_2026_05_03i

New cron jobs (require vercel.json entries — see this commit):
  /api/cron/login-probe                every 5 min
  /api/cron/recovery-probe             every 15 min
  /api/cron/auth-integrity-audit       daily 4am (audit-only mode)

CI: build-safety-gate now runs all 7 test files (39 tests vs 9 prior).

Tests: 39/39 pass. Chaos drill: 8/8 detected.

See SIGNUP-HARDENING-PHASE-4.md for the full picture."
git push
```

## Step 5: Post-deploy verification (within 10 min)

```bash
# 1. Unified dashboard reachable (admin-gated, hit with x-admin-secret)
curl -I https://smarter.poker/admin/auth-health \
  -H "x-admin-secret: $ADMIN_ROUTE_SECRET"
# Expect: 200

# 2. Manually trigger each new cron to confirm they work
for path in login-probe recovery-probe auth-integrity-audit; do
  echo "─── $path ───"
  curl -s "https://smarter.poker/api/cron/$path" \
    -H "Authorization: Bearer $CRON_SECRET" | jq '.status'
done
# Expect:
#   login-probe:           "ok"
#   recovery-probe:        "ok"
#   auth-integrity-audit:  "ok" (real_orphans should be 0/0/0)
```

## Step 6: Within 24h — confirm crons firing automatically

```sql
-- Run via Supabase SQL editor
SELECT * FROM public.auth_health_view;

-- Expect non-zero values for *_runs_15m on signup-probe + login-probe,
-- and *_runs_24h ≥ 1 for the daily crons (integrity, email, archive).
```

If any flow shows `runs_15m = 0` after 15 min, the cron isn't firing.
Check Vercel → Project → Settings → Crons.

## Rollback

If anything breaks:

```bash
# 1. Revert the code commit
git revert HEAD --no-edit && git push

# 2. The 2 new DB migrations are ADDITIVE-ONLY (new tables/RPCs). They
#    don't need rollback — leaving them in place is safe and the code
#    revert prevents anything from calling them.

# 3. If you really want to drop them:
DROP VIEW public.auth_health_view;
DROP FUNCTION public.audit_auth_integrity();
DROP FUNCTION public.heal_auth_integrity();
DROP FUNCTION public.is_system_user(text);
```

## Reference docs

Read in priority order:
1. `SIGNUP-HARDENING-PHASE-4.md` — what just got built (this batch)
2. `docs/SIGNUP_RUNBOOK.md` — operational playbook including 3 new alerts
3. `SIGNUP-HARDENING-PHASE-3.md` — observability layer (Sentry bridge etc)
4. `SIGNUP-HARDENING-BUILD-2.md` — preventive layer
5. `SIGNUP-FIX-2026-05-03-FINAL.md` — root cause + Phase 1 fix

When done, commit one final ack:

```
ops(auth): phase 4 deployed — login + recovery + integrity probes live
```
