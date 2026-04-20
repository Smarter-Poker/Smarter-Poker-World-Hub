# 04 — Cron Failure

## When to use

- `/api/admin/cron-health` returns non-green for any job.
- Sentry shows repeated errors from a `pages/api/cron/*` route.
- A scheduled scraper reports 0 new records for > 2 consecutive runs.
- Vercel dashboard shows a cron invocation error rate > 10% in an hour.

## Prerequisites

- Admin secret to access `/api/admin/*`.
- Vercel deploy access.
- GitHub write access to `Smarter-Poker-World-Hub`.
- Supabase admin for the `smarter-poker` project.

## Symptoms

Recent cron failure patterns we've actually hit:

**A. Missing env key** (the `supabaseKey` class). ~216 failed invocations
per day in the horse/content family until #25 landed the shared
`lib/supabaseAdmin` helper. Symptom: every invocation 500s immediately
on startup.

**B. Scraper upstream change.** External site changed its markup or
rate-limited us. Symptom: invocation completes but inserts 0 rows.

**C. Timeout.** Cron exceeds Vercel's per-invocation cap. Symptom:
`Task timed out after 60.00 seconds` in logs.

**D. Infinite loop / unbounded query.** Cron never completes, or
completes but hits the DB connection limit. Symptom: pooler saturation
alert (see runbook 02).

## Procedure

### Step 1 — Identify the failing job(s)

```bash
# All-up cron health
curl -s https://smarter.poker/api/admin/cron-health \
  -H "x-admin-secret: $ADMIN_SECRET" | jq

# Last 20 invocations per job (Vercel CLI)
vercel logs --scope smarter-poker hub-vanguard --follow=false | \
  grep -i 'cron' | head -40
```

The cron-health endpoint returns per-job timestamps. Anything with
`lastSuccess` > 2× its schedule is failing.

### Step 2 — Read the most recent error

In Vercel logs, filter by the job's path (e.g. `/api/cron/horse-sync`).
The error line will be near the invocation's end. Classify against A–D.

### Step 3A — Missing env key

1. Confirm which env var is missing:
   ```bash
   vercel env ls --scope smarter-poker hub-vanguard production
   ```
2. If the var is genuinely missing, add it:
   ```bash
   vercel env add <VAR_NAME> production --scope smarter-poker
   ```
3. If the var exists but the cron isn't reading it, suspect import
   pattern. Every cron must use:
   ```js
   import { supabaseAdmin } from '@/lib/supabaseAdmin';
   ```
   **Never** instantiate the client with env reads inside the handler —
   Next.js tree-shakes those at build time.
4. Redeploy to pick up the env change:
   ```bash
   git commit --allow-empty -m "chore: redeploy to pick up <VAR>"
   git push origin main
   ```

### Step 3B — Scraper upstream change

1. Pause the cron in `vercel.json` (comment out the schedule) and redeploy
   so it stops throwing.
2. Open the target site in a browser and compare its HTML to the
   selectors in `scripts/scrapers/<name>.js`.
3. Update the selectors and test locally:
   ```bash
   node scripts/scrapers/<name>.js --dry-run
   ```
4. Commit the selector fix and re-enable the cron in `vercel.json`.

### Step 3C — Timeout

1. Check what the cron is doing. Common causes: unbounded query (no
   `LIMIT`), large upstream fetch without streaming, per-row API call
   instead of batch.
2. Add pagination. Process N rows per invocation, not all of them:
   ```js
   const { data } = await supabaseAdmin
     .from('table')
     .select('*')
     .eq('status', 'pending')
     .limit(500);
   ```
3. If the cron legitimately needs more than 60s, move it to the Hetzner
   cron-01 host (systemd timer). See runbook 05 for that migration
   pattern.
4. Never raise the Vercel timeout past 60s on a cron — we've had 10-minute
   runaway crons before and they're painful to kill.

### Step 3D — Infinite loop / unbounded query

Same remediation as 3C — add a `LIMIT` or a stopping condition. Also:

1. Pause the cron immediately (comment schedule + redeploy). This stops
   the bleeding on Supabase connection pool.
2. Identify the runaway invocation in Vercel logs. If it's still running
   (shouldn't be — timeout should kill it — but check), you may need to
   redeploy to cycle the function.
3. Fix, test locally with a `LIMIT 1`, then re-enable.

### Step 4 — Backfill the missed work

If the cron was broken for hours, a backfill may be needed:

- **Horse/Content cron:** the sync is idempotent, one manual hit from
  `/api/admin/cron-trigger?job=horse-sync` catches up.
- **Scraper cron:** if we missed a tournament listing, run the scraper
  manually over the missed date range. See
  `scripts/scrapers/<name>.js --from=YYYY-MM-DD --to=YYYY-MM-DD`.
- **Ledger/reconciliation cron:** NEVER backfill blindly. Any missed
  ledger work goes through runbook 05.

### Step 5 — Verify

```bash
# Run the job manually to confirm the fix
curl -X POST https://smarter.poker/api/admin/cron-trigger \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"job":"<job-name>"}' | jq

# Confirm cron-health is green again
curl -s https://smarter.poker/api/admin/cron-health \
  -H "x-admin-secret: $ADMIN_SECRET" | jq '.jobs["<job-name>"]'
```

## Rollback

- **Env var changes:** `vercel env rm <VAR>` (production) then redeploy.
- **Selector updates:** standard `git revert` on the offending commit.
- **Cron pause:** re-enable the schedule in `vercel.json` and redeploy.
- **Backfill:** financial or ledger backfills have their own rollback
  via runbook 05; scrapers are idempotent so no rollback needed.

## Escalation

- If `/api/admin/cron-health` itself is failing, the middleware or
  admin secret is broken — page the lead immediately, this is a
  security-adjacent issue.
- If a single scraper has been broken > 48 hours, stop the cron
  entirely (remove from `vercel.json`) and open a ticket to either fix
  or retire it. Don't leave broken crons on the schedule.

## Postmortem

Required if:

- Any ledger or reconciliation cron missed more than one scheduled run.
- A cron leaked connections and caused a pool-exhaustion incident
  (runbook 02 territory).
- A cron was silently broken (no alerts) for > 24 hours — that's an
  alerting gap, not just a cron bug.

Include: the failure class (A/B/C/D), how long the cron was broken
before detection, and whether the monitoring coverage matrix
(`pages/api/admin/cron-health.js`) actually includes this cron. If not,
add it.
