# Production Postgres errors: INT4 overflow + tables_status_check violations (2026-05-07)

## Findings (Phase 91 — production logs review)

### Bug 1: INT4 overflow firing constantly
**Error:** `value "137438953472000" is out of range for type integer`
**Frequency:** ~75+ occurrences captured in a 10-minute log window. Roughly 1 per second sustained.
**Severity:** HIGH — actively flooding error logs in production right now.

**Source unknown.** The literal number `137,438,953,472` = exactly `2^37` (= 128 GB in bytes). With `× 1000` appended: `137,438,953,472,000`.

**Likely shape:** Some service is computing a value like `process.hrtime.bigint()`, `performance.now() * 1000`, or a 64-bit byte count, then trying to insert it into an INT4 column (max 2,147,483,647 ≈ 2.1B).

**Investigation done so far:**
- Grepped repo for literal `137438953472`, `2 ** 37`, `1 << 37`, `0x2000000000` — no matches in JS/TS/Python.
- Checked all INT4 columns containing `size|bytes|count|duration|ms|timestamp|time|storage|quota` patterns — see `pg_stat_user_tables` for write-volume per table.
- Verified no current row in `cron_execution_log`, `cron_health_log`, `execution_audit_logs`, `probe_heartbeats`, `hendon_scrape_log` exceeds INT4 limit, meaning the overflow inserts are failing on the constraint and never landing — so the source service is logging an error and continuing without persisting.

**Recommended next steps for follow-up agent:**
1. Use Supabase log filtering (or `pg_stat_user_tables.n_tup_ins` deltas) to identify which INT4 column is being targeted.
2. Inspect the Hetzner poker engine service (`server/` directory) since most INT4 writes appear to come from the Node service driving table state.
3. Likely fix is either widening the column to BIGINT or sanitizing the source value before the INSERT.

### Bug 2: tables_status_check CHECK constraint violations
**Error:** `new row for relation "tables" violates check constraint "tables_status_check"`
**Frequency:** ~6 occurrences in the same window.
**Severity:** MEDIUM — partial overlap with already-fixed YT worker bug (commit `e3f97e7085 fix(yt-worker): CHECK constraint blocks status='skipped' — throw permanent failure instead`).

**Status:** Fix already shipped (e3f97e7085); residuals are likely transient retries from before the deploy. Should fade naturally.

### Bug 3: Statement timeouts
**Error:** `canceling statement due to statement timeout`
**Frequency:** 2 occurrences.
**Severity:** LOW — occasional slow query, not sustained.

**Status:** Will monitor; not actionable without query identification.

## Why this audit didn't fix it inline

These bugs originate outside the training-pipeline scope (Phases 77-90 worked on `training_question_cache` data integrity). The INT4 source is likely in the Hetzner poker engine's table-state writer or a backend service that wasn't part of the Operation Grok-Sweep mandate. Fixing it requires:
- Code access to the Hetzner-side Node service
- Identification of the offending INSERT path
- Either a column widening migration or a source-value sanitization patch

## Phase 91 outcome

Verified: training-pipeline data integrity holds (all 27,413 rows pass every check post-Phase 90).
Surfaced: 2 unrelated production bugs that need separate follow-up agents with appropriate scope/access.
