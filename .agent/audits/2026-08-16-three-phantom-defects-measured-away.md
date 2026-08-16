# Three flagged defects, measured rather than assumed — all three were artifacts

Date: 2026-08-16 (UTC)

Three items were queued as real work today. Each dissolved when measured against
production. Recording the numbers so nobody spends a day re-chasing them, and so
the pattern itself is visible.

---

## 1. "Chips are disappearing from pots" — a broken metric, not a leak

**Reported:** `[FeeReconciler.bbj_drift]` — *"rake_records booked 8831.32 of BBJ
contribution, bbj_contributions received 8815.32 (drift 16). A positive drift
means chips left pots and never reached the jackpot pool."*

**Actual:** no chips left. `bbj_drift_since` summed two independent tables over
one time window. A hand's rake row and its pool row are written milliseconds
apart by different statements, so at the window edge one lands inside and the
other outside. Worse, `rake_records` rows with `hand_id IS NULL` inflate the
booked side while being impossible to match on the received side.

| metric | over the window that fired the alert |
|---|---|
| OLD (windowed sums) | drift **16.00** |
| NEW (per-hand join) | drift **−0.50** — the pool received *more* than was booked |
| truly unbanked | **4 hands out of ~24,000** |

Fixed in `20260816_bbj_drift_since_per_hand_linkage.sql`. Compares per hand on
`hand_id`, so a hand is counted on both sides or neither and the boundary
artifact is gone by construction rather than by widening a tolerance. Return
column names unchanged, so `FeeReconciler.ts` needed no change and the engine
needed no redeploy. Perf mattered: correlated-subquery form 3,414ms, hash-join
form 250ms.

**The engine's own write path was already correct.** `logBBJCollection` was
fixed on 2026-08-08 (`dacb6c8c5`) — 3 retries with backoff, `reportError` on
every failure instead of one hand in a hundred, and a `false` return so the
caller knows. That fix is deployed. I nearly re-implemented it from a 19-day
stale clone; checking the current file first is the only reason I didn't.

## 2. "45 of 162 unit test files are red" — the suite is green

Ran the full Club Arena suite at `83139ed10`:

```
Test files:  678 total — 678 passed
Tests:      1435 total — 1435 passed, 0 failed
```

The single initial failure was `Failed to resolve import "@sentry/node"`, which
is declared in `server/package.json` — a separate workspace whose deps had not
been installed. Installing them turned it green. CI agrees: latest completed
`CI — Build & Type Safety` is green.

Whatever produced "45 of 162 red" was measured in a broken environment.

## 3. "82 rake rows/day with null hand_id" — an incident artifact, already over

This was the one *real* signal the new metric surfaced, so it was worth
following. It is not an ongoing defect:

| window | rake rows | null `hand_id` | rate | chips stranded |
|---|---|---|---|---|
| 2026-08-15 15:00–01:00 (incident) | 9,231 | **185** | **2.0041%** | 41.50 |
| last 12 hours | 46,610 | **0** | **0.0000%** | 0.00 |
| last 3 hours | 11,035 | **0** | 0.0000% | 0.00 |

Null `hand_id` appears when a hand's rake is booked but the hand row never
persists — which is what happens when the engine is killed mid-hand. On
2026-08-15 that meant the security incident, the host migration, container
restarts and two forced reboots. Since the engine stabilised: **zero in 46,610
rows.**

No code change made. Writing a "fix" for a defect running at 0.0000% would be
inventing work, and the new `unlinkable_rows` / `unlinkable_chips` columns now
surface it immediately if it returns.

**Genuinely outstanding:** 41.50 chips booked on 2026-08-15 that reached neither
the pot nor the jackpot pool. Real, tiny, and Dan's call whether to write a
correcting entry or accept it. Not silently adjusted here — money ledgers should
not be edited by an agent on its own initiative.

---

## The pattern worth keeping

All three arrived as confident written claims — an alarm firing in production, a
line in an audit doc, a metric I had shipped myself hours earlier. Each was
wrong, and each would have cost a day. The cheap check was the same every time:
measure the thing directly before acting on the description of it.

Two of the three were *my own* framings. I told Dan chips were vanishing "about
2.4 a day, monotonic" before checking, and recommended the test suite as the
next phase before running it. The alarm being wrong is not an excuse for
repeating its claim.

## Also corrected today

- `restart-hetzner.sh` had the decommissioned engine IP hardcoded; it would have
  restarted the wrong box and reported success, because its health check read
  the public hostname rather than the host it touched. Now resolves from DNS and
  pins verification with `curl --resolve`.
- The engine host's read-only GitHub deploy key was removed during credential
  cleanup, silently breaking `auto-deploy-hetzner.yml`'s "Pull the exact commit
  onto the host" step. Restored (`id 160414789`, `read_only=true`) and fetch
  verified. Production was unaffected — it blocks future deploys, not the
  running game.
