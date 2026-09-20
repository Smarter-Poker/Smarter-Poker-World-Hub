# 02 — Database Degraded

## When to use

- Supabase project status page shows red for `api`, `db`, or `realtime`.
- `/api/health` reports `db.status: degraded` or latency > 2000ms.
- Application error spike of `PGRST` errors, connection timeouts, or `57P01`
  (admin-shutdown) rows.
- Club Arena wallet / hand-history pages show "Unable to load" at scale.

## Prerequisites

- Supabase admin access to the `smarter-poker` project.
- `psql` or the Supabase SQL editor.
- Ability to restart Vercel deployments (connection pool bleed).

## Symptoms

Three common failure modes — identify which before acting.

**A. Connection pool exhaustion.** Intermittent 503s. Supabase dashboard
shows `max_clients` utilization > 90%. Common on traffic spikes or after
a runaway cron.

**B. Query plan regression.** Specific pages slow but DB itself is
healthy. One or more queries moved to a sequential scan. Grafana shows
p99 on `/api/...` spiking on one route family.

**C. Instance-level degradation.** Everything is slow. CPU pegged or
I/O saturated on the Supabase dashboard. Usually correlates with a bad
migration or an accidentally-non-indexed new column.

## Procedure

### Step 1 — Confirm scope

Hit the public health and DB-specific checks:

```bash
curl -s https://smarter.poker/api/health | jq '.checks.db'
curl -s https://smarter.poker/api/admin/health \
  -H "x-admin-secret: $ADMIN_SECRET" | jq
```

Check Supabase dashboard → `smarter-poker` → Reports → API Overview. Note
the p95 and error-rate curves over the last hour.

### Step 2 — Identify failure mode A / B / C

**For A (pool exhaustion):** Supabase dashboard → Database → Pooler →
Sessions. If > 90% utilization, go to Step 3A.

**For B (plan regression):** Supabase dashboard → Reports → Query
Performance. Sort by `total_time`. The top offender will jump out with
a recent `calls` spike. Go to Step 3B.

**For C (instance-level):** Supabase dashboard → Reports → Database
Health. Look at CPU and Disk I/O. If both pegged, go to Step 3C.

### Step 3A — Resolve pool exhaustion

1. Identify the leaking caller. In the pooler stats, filter by long-idle
   sessions (`state = 'idle'` with `state_change` > 5 minutes old). Group
   by `application_name` — this is the Vercel function or cron name.
2. If a cron is the culprit, pause it in `vercel.json` (comment out the
   schedule) and redeploy. Come back and fix the leak offline.
3. If a Vercel function is the culprit, the typical fix is a missing
   `await supabase.auth.signOut()` or a forgotten `pool.end()`. Grep the
   function for non-awaited Supabase calls.
4. As a last resort, raise the pool size temporarily: Supabase dashboard
   → Database → Pooler → Settings → Default pool size. **Add a ticket to
   roll it back** — enlarging the pool is a mitigation, not a fix.

### Step 3B — Resolve plan regression

1. Copy the slow query from the Query Performance page.
2. Prefix with `EXPLAIN (ANALYZE, BUFFERS)` and run in the SQL editor.
3. If you see `Seq Scan` on a large table where an index should apply,
   check `pg_indexes` for the expected index. If missing, a recent
   migration may have dropped it. Recreate:

   ```sql
   -- Example: if an index on hands.table_id went missing
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hands_table_id
     ON hands (table_id);
   ```

   `CONCURRENTLY` avoids a write-lock on the table. Always use it in prod.
4. If the index exists but the planner isn't using it, run
   `ANALYZE <table>;` — stats may be stale after a bulk insert.

### Step 3C — Resolve instance-level degradation

1. Check recent migrations:
   ```bash
   cd ~/Documents/Smarter-Poker-World-Hub
   git log --oneline -20 supabase/migrations/
   ```
   If a migration landed in the last hour, that's your prime suspect.

2. Look at `pg_stat_activity` for long-running queries:
   ```sql
   SELECT pid, now() - query_start AS runtime, state, query
     FROM pg_stat_activity
    WHERE state != 'idle'
      AND query_start < now() - interval '30 seconds'
    ORDER BY runtime DESC
    LIMIT 20;
   ```

3. If there's a single runaway query, terminate it:
   ```sql
   SELECT pg_terminate_backend(<pid>);
   ```
   Note the `query` column in the timeline doc — that's the bug to fix.

4. If measurements prove the instance is undersized, resolve the assigned capacity blocker under current owner authority and applicable non-Actions budget limits. No additional human approval is required; retain the diagnosis, cost and resulting provider evidence.

### Step 4 — Reset the connection pool after mitigation

After any of the above, drain stale Vercel connections by triggering a
fresh deploy of the main app (an empty commit is fine):

```bash
cd ~/Documents/Smarter-Poker-World-Hub
git commit --allow-empty -m "chore: bump deploy to reset DB pool"
git push origin main
```

New serverless functions will build fresh pools against the recovered DB.

### Step 5 — Verify recovery

- `/api/health` DB latency < 200ms for 5 minutes straight.
- Supabase dashboard error rate < 0.5% for 10 minutes.
- A spot-check query runs in milliseconds:
  ```bash
  curl -s https://smarter.poker/api/health | jq '.checks.db.latencyMs'
  ```

## Rollback

- **Migration rollback.** If a migration caused the regression, create a
  new migration that reverses it — never edit the original file.
  Supabase migration files are immutable once in `main`.
- **Pool size rollback.** If you enlarged the pool as a mitigation,
  return it to the previous value after the root cause is fixed.
- **Cron pause rollback.** Re-enable the cron in `vercel.json` once the
  leak is patched.

## Escalation

- If Supabase's own status page shows a vendor-side issue, open a ticket
  at https://supabase.com/support and page the engineering lead. Don't
  attempt migrations during a vendor incident.
- If the DB is unresponsive and you can't open the dashboard, contact
  Supabase support by email (support@supabase.com) with the project ref.
- If queries return results but they look wrong (stale or partial), STOP
  and escalate to SEV-1 — this is data integrity, not performance, and
  jumps to runbook 05 (ledger drift) if financial tables are involved.

## Postmortem

Required for:

- Any event where DB latency exceeded 5s for > 2 minutes.
- Any migration-induced incident.
- Any pool-size increase that remained in place > 24 hours (implies the
  leak wasn't actually found).

Include in the postmortem: the failure mode (A/B/C), the root query or
migration, and the monitoring gap that let it get to prod (no EXPLAIN
check? no staging dry-run? no index audit?).
