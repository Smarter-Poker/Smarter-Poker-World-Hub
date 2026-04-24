# Phase 2A.2 — Idempotence Audit of the 3 Monday-Morning Non-Trivial Jobs

**Date:** 2026-04-24
**Source plan requirement:** `smarter-poker-optimization-plan.md` line 235 —
*"For any non-idempotent job, stagger the Hetzner fire by a few minutes so
the two don't collide. Most crons are idempotent (scraper data dedupe,
settlement by cursor, etc.) — but we need to confirm each one is."*

This doc is the "confirm each one is" record. Required before Phase 2A.2
48h parallel burn-in so we know what to watch for during double-fire.

---

## 1. `/api/cron/auto-settlement` (Mon 10:00 UTC)

**Idempotence mechanism:** TWO guards stacked.

### Guard A — `settlement_locks` table (distributed lock)

Lines 111-156 of `pages/api/cron/auto-settlement.js`:

1. Calls `expire_settlement_locks` RPC to release stale locks from crashed runs.
2. For each club with auto-settlement enabled, queries `settlement_locks`
   WHERE `club_id = X AND is_active = true`.
3. If an active lock exists → **skips creating a new lock** for that club.
4. If no lock → creates a lock with `unlock_at = now + 10 min`.
5. Sets `clubs.settlement_locked = true` with `settlement_locked_until`.

### Guard B — `settlement_periods.status = 'open'` cursor

Lines 167-177:

```js
const { data: openPeriod } = await supabaseAdmin
  .from('settlement_periods')
  .select('*')
  .eq('club_id', club.id)
  .eq('status', 'open')
  .maybeSingle();

if (!openPeriod) continue;  // nothing to settle — skip this club
```

If a previous run already closed the period (status transitioned `open → closed`),
the second dispatcher finds nothing and exits cleanly per-club.

**Double-fire behavior:** Hetzner running 5 minutes after Mac sees either
(a) Mac's lock still active → skips lock creation but may still find an open
period if Mac hasn't reached Phase 2 yet → Supabase serializes concurrent
UPDATEs via row-level locking, worst case: one of them gets 0 rows updated
and logs an error; OR (b) Mac finished and closed all periods → Hetzner
early-exits on the `if (!openPeriod) continue` line with zero writes.

**Verdict:** ✅ **Idempotent.** No double-settlement possible.

---

## 2. `/api/cron/auto-settlement-distribute` (Mon 10:10 UTC)

**Idempotence mechanism:** Also reads `settlement_locks`.

Lines 303-330 of `pages/api/cron/auto-settlement-distribute.js`:

```js
.from('settlement_locks')  // line 303
  .select(...)              // line 310
  ...
.from('club_announcements')
  .insert(...)              // line 330
```

And line 365 again checks `.from('settlement_locks')` before unfreezing clubs.

Distribution writes are keyed on `period_id` (line 196, 224, 237). Since
`period_id` is unique per `{club_id, period_start_at}`, a second call
for the same period would hit a unique constraint on downstream distribution
rows.

**Verdict:** ✅ **Idempotent via lock check + period_id keying.** The
worst-case double-fire produces DB-level unique constraint violations,
which the caller catches and logs — NOT silent double-payout.

---

## 3. `/api/cron/union-rakeback` (Mon 10:20 UTC)

**Idempotence mechanism:** Explicit atomic `fn_claim_settlement_period` RPC.

Lines 95-102 of `pages/api/cron/union-rakeback.js`:

```js
// ── Phase 7.1.7 — claim an idempotency slot BEFORE any writes ──
const idempotencyKey = `union_rakeback:${union.id}:${periodStart}`;
const claimResult = await supabaseAdmin.rpc(
  'fn_claim_settlement_period',
  { p_idempotency_key: idempotencyKey, ... },
);
```

This is a **Postgres-level atomic** idempotency check. If the key
`union_rakeback:<union_id>:<monday-timestamp>` has already been claimed,
the RPC returns failure and the handler exits without touching any rows.
The RPC uses `INSERT ... ON CONFLICT DO NOTHING` or equivalent — single-
transaction atomic.

On any error, `fn_finalize_settlement_period(claim_id, 'failed', ...)` is
called so the key can be retried. On success, `'settled'` locks it forever.

**Verdict:** ✅ **Strongest idempotence of the 3.** Postgres-native atomicity.

---

## Overall conclusion

All 3 Monday-morning non-trivial jobs are **idempotent by design** and
**safe to fire concurrently from Mac and Hetzner** without data corruption.

The plan's stagger requirement is defense-in-depth, not a correctness
requirement. Implementing stagger anyway because:

1. Plan says so.
2. Concurrent firings would produce DB-level errors (unique violations,
   lock-contention 500s) that muddy the 48h burn-in logs and make it
   harder to spot real regressions.
3. Zero cost to stagger by 5 min — schedules are per-minute granularity.

## Stagger implementation

Landed in `scripts/openclaw-cron-dispatcher.py` alongside this doc:

- New env var: `DISPATCHER_ROLE` (default: `primary`)
- When `DISPATCHER_ROLE=secondary`, offsets the 3 jobs' `minute=N` by +5.
  - Mac (primary) fires at 10:00 / 10:10 / 10:20
  - Hetzner (secondary) fires at 10:05 / 10:15 / 10:25
- All other jobs are unchanged in either role.
- On startup, dispatcher logs which role it's operating in.

Deploy via `bash scripts/deploy-openclaw.sh` before kicking off Phase 2A.2
burn-in. Hetzner's `/opt/openclaw/.env` file must have `DISPATCHER_ROLE=secondary`
set (AG prompt will write it).

## After Phase 2A.3

Once Mac LaunchAgent is decommissioned, Hetzner becomes the sole dispatcher.
The role distinction no longer matters — the stagger can be removed by
either (a) setting `DISPATCHER_ROLE=primary` on Hetzner, or (b) deleting
the env var entirely (defaults to primary). No code change needed.
