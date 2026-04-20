# 05 — Ledger Drift

## When to use

- Nightly reconciliation cron reports variance > $0.01 between
  double-entry sums.
- The `wallets.balance` or `clubs.chip_pool` write-protection trigger
  fires (see Phase 4.1.6a).
- `/api/admin/ledger/drift-check` returns non-zero variance.
- Any user-visible balance inconsistency reported in support (e.g.
  balance visible on World Hub differs from Club Arena).
- Sentry fingerprint: `ledger_post_imbalance`.

**This is always at minimum SEV-2. Financial integrity is the single
most important invariant the platform maintains.**

## Prerequisites

- Supabase admin access (read + ability to run controlled writes).
- A second operator on the call — all ledger writes require four-eyes
  confirmation.
- Familiarity with the double-entry ledger schema (see Phase 4.1.1
  audit doc and `docs/LEDGER.md`).

## Symptoms

Prior incident #58 established that bulk-insert crons can drift ledger
totals in absurdly large amounts ($804.5M was the headline number) if
idempotency keys aren't honored. Assume drift is real until proven
otherwise — it is very rarely a monitoring false-positive.

## Procedure

### Step 1 — STOP THE BLEEDING FIRST

Before any investigation, prevent further drift:

1. **Pause all write-heavy crons** in `vercel.json`:
   - `ledger-reconciliation`
   - `diamond-minting`
   - `chip-settlement`
   - `rake-distribution`
   - any other job that writes to `ledger_entries`, `wallets`, or
     `clubs.chip_pool`.
2. Commit the pause + redeploy:
   ```bash
   git commit -am "chore(ledger): pause write crons pending drift investigation"
   git push origin main
   ```
3. **Set engine to read-only mode** so in-flight games finish but no new
   hands start:
   ```bash
   ssh engine.smarter.poker
   pm2 set engine:READ_ONLY_MODE true
   pm2 restart engine
   ```

Yes, this is disruptive. It is less disruptive than compounding drift.

### Step 2 — Quantify the drift

```sql
-- Double-entry sum (should be zero)
SELECT COALESCE(SUM(amount_cents), 0) AS net_drift
  FROM ledger_entries;

-- Per-account reconciliation
SELECT account_id,
       COALESCE(SUM(amount_cents), 0) AS balance_from_ledger,
       (SELECT balance_cents FROM wallets w WHERE w.id = le.account_id) AS balance_cached
  FROM ledger_entries le
 GROUP BY account_id
HAVING COALESCE(SUM(amount_cents), 0) <>
       (SELECT balance_cents FROM wallets w WHERE w.id = le.account_id)
 LIMIT 50;
```

Capture both results. The `net_drift` row is the system-wide variance;
the per-account table identifies specific affected wallets.

### Step 3 — Identify the source

```sql
-- Which cron or endpoint wrote the most recent entries?
SELECT source, COUNT(*) AS row_count, MAX(created_at) AS last_seen
  FROM ledger_entries
 WHERE created_at > now() - interval '24 hours'
 GROUP BY source
 ORDER BY last_seen DESC;

-- Look for duplicate idempotency keys (double-posting)
SELECT idempotency_key, COUNT(*) AS n
  FROM ledger_entries
 WHERE created_at > now() - interval '24 hours'
 GROUP BY idempotency_key
HAVING COUNT(*) > 1
 LIMIT 20;
```

Any `idempotency_key` with `n > 1` is a violation of Phase 4.1.3 — the
source code in the corresponding `lib/ledger/*.ts` is missing or
mis-using the idempotency guard.

### Step 4 — Corrective posting (NOT deletion)

**NEVER DELETE LEDGER ROWS.** Ledger entries are append-only by design
and their deletion invalidates the audit trail. Always correct by
posting a compensating entry.

For each duplicate pair, post a correction:

```sql
-- Example: one double-posted credit to wallet X of +100 cents
INSERT INTO ledger_entries
  (account_id, amount_cents, type, source, idempotency_key, description)
VALUES
  ('<wallet-id>', -100, 'correction', 'runbook-05',
   'correction-<original-idempotency-key>',
   'Compensate duplicate post from incident <id>');
```

Do this **one at a time** and verify net_drift decreases by the
expected amount after each insert. If you batch corrections, you lose
observability when one of them is wrong.

### Step 5 — Second-operator verification

After all corrections are posted, the second operator (required from
Step 1) reruns the net_drift query from Step 2. Both operators sign off
in `#incidents` with:

```
/confirm-ledger: net_drift=<value>, checker=<name>, operator=<name>
```

Only proceed once both numbers match and net_drift == 0.

### Step 6 — Patch the bug

The write that caused the drift must be fixed before re-enabling
anything. Typical fixes:

- Missing idempotency-key check — add it. Every ledger post must pass
  through `lib/ledger/post.ts` which enforces idempotency_key uniqueness.
- Missing transaction boundary — wrap the write in `pg_transaction`
  along with the cross-balance read-check.
- Race condition — use `SELECT ... FOR UPDATE` inside the transaction,
  not separate reads.

Open a PR. The PR must include a regression test in
`tests/ledger/regression/` that would have caught this drift. PR
requires **two reviewers** for merge, not one.

### Step 7 — Resume operations

Only after the patch is on main AND all drift is reconciled:

1. Un-pause crons in `vercel.json` and redeploy.
2. Clear engine read-only mode:
   ```bash
   ssh engine.smarter.poker
   pm2 set engine:READ_ONLY_MODE false
   pm2 restart engine
   ```
3. Monitor the next scheduled reconciliation run for green.

## Rollback

There is no "rollback" of a compensating ledger entry — by design,
corrections are additive, not destructive. If a correction was wrong,
post another correction to fix the correction. The audit trail is the
point.

For the code patch, standard git revert applies — but only after
re-pausing the crons, because an un-reverted bug continues to drift.

## Escalation

- **Immediately notify the CTO** for any drift > $1,000 USD equivalent.
  Below that, the engineering lead is enough.
- **If corrections fail to close the drift** (net_drift doesn't reach
  zero after all known duplicates are compensated), there's a second
  class of bug — stop and page the lead. Do not keep posting entries
  blindly.
- **If the drift involves real money** (cashouts posted, purchases
  completed), loop in Finance and Legal. This may be a reportable event
  depending on amount and jurisdiction.

## Postmortem

Always required. Always SEV-2 or SEV-1.

Include:

- Exact drift amount (in cents, not rounded).
- Number of affected accounts.
- Time from first bad write to detection — this is the alerting
  effectiveness metric.
- Whether the compensating-entry process was clean (any re-corrections
  needed? that's a process bug too).
- The specific code path that drifted and the test that now guards it.
- A yes/no on whether the reconciliation cron's threshold was set
  correctly — if drift was caught below threshold by luck, the threshold
  needs tightening.

Financial integrity postmortems get circulated at the all-hands. This is
the highest-signal learning event the platform produces — treat the
writeup accordingly.
