# RLS Policy Consolidation — 2026-08-13

Performance-advisor phase. Outcome: `multiple_permissive_policies` warnings
**76 → 25**, with no change to any user's effective access.

Migrations `20260813010000`, `20260813020000`, `20260813030000` — all applied to
production and committed. CI guard: `scripts/check-rls-policy-scoping.mjs`
(CHECK 12 in `build-safety-gate.yml`).

---

## READ THIS FIRST: two false conclusions this audit reached

Both were caught by assertions rather than by review. Recorded because the
reasoning errors are easy to repeat and the second one nearly shipped.

### 1. "anon can delete the audit log" — WRONG

An earlier pass ran, as `anon`, `DELETE FROM clawbot_audit_log`, saw it
**succeed**, and concluded the table was writable by anyone.

It proved nothing. **RLS filters rows; it does not raise.** A `DELETE` matching
zero rows succeeds, and the table was empty at the time. The same mistake was
made on `training_progress`: a probe returned `0 rows`, which was read as "the
table is empty" when it actually meant "RLS filtered everything out — working
correctly."

Re-tested properly, by seeding a row inside a transaction that rolls back
(which required a real `profiles.id` for the FK and a non-null `game_id`):

```
SELECT another user's row: 0 of 4 visible -> filtered by RLS (correct)
DELETE another user's row: 0 of 4 deleted -> filtered by RLS (correct)
```

The policies were also never `TO public` — both are `TO service_role`. The
original `pg_policies` read had misattributed the roles column.

**Rule: assert on ROWS AFFECTED, never on "the statement did not error."**
Every check in these three migrations is written so it cannot pass vacuously —
including one that requires `clawbot_audit_log` to be non-empty before its read
test, precisely so the test cannot succeed for the wrong reason.

### 2. The advisor metric was over-counted by 3x — WRONG

The first reproduction of the advisor's metric reported **195** warnings. The
true figure was **64**. Cause:

```sql
select tbl, unnest(roles) as role, unnest(cmds) as cmd  -- WRONG
```

Multiple `unnest()` calls in the SELECT list **zip** in parallel and pad the
shorter array with NULL — they do not produce a cartesian product. Every policy
with 2 roles and 1 command yielded a bogus `(role2, NULL)` row, and unrelated
per-command policies collided into false duplicates.

Correct form, used in the migrations:

```sql
cross join lateral unnest(pol.roles) as r(role)
cross join lateral unnest(pol.cmds)  as cm(cmd)
```

---

## What was actually wrong

### The anti-pattern (51 policies)

```sql
CREATE POLICY "service role manages x" ON t
  FOR ALL USING (auth.role() = 'service_role');   -- no TO clause
```

No `TO` clause means **PUBLIC**, attaching the policy to every role. Postgres
evaluates that expression for every row of every statement by `anon` and
`authenticated` — where it is constant-false.

Measured on production rather than assumed:

```
db role anon          -> auth.role() = NULL
db role authenticated -> auth.role() = NULL
```

Never `service_role`. `auth.role()` reads the JWT role claim and PostgREST
derives the database role from that same claim, so they cannot diverge: a caller
whose claim is `service_role` runs **as** `service_role`, which has `BYPASSRLS`
and never consults policies. The predicate is true only for the one role that
ignores it.

Written `FOR ALL`, each also collides with all four commands for both roles:
**44 of 64 warnings (69%, 10 tables) came from just 13 policies.**

Fixed by `ALTER POLICY ... TO service_role` — 13 `FOR ALL` + 38 single-command.

### The 15 that must NOT be touched

Fifteen sibling policies also mention `service_role`, but as one branch of an OR
that grants real users access:

```sql
USING (auth.uid() = user_id OR auth.role() = 'service_role')
```

Re-scoping these would **revoke genuine user access** —
`social_posts."Users can create their own posts"`,
`trivia_pvp_queue."Users can delete own queue entry"`,
`venue_live_tables.*_service`, and others. `20260813030000` therefore does not
name policies by hand: it re-derives the "pure" set by normalising each
expression, and asserts all 15 mixed policies are still `TO public` afterwards.
Verified again after the fact — all 15 intact.

### Duplicates dropped (12)

Seven exact-duplicate pairs, each verified byte-identical by a pre-flight that
aborts if anyone has since edited one. Plus three `backtest_*` anon/auth merges
and two deliberate tightenings.

The tightening with teeth — **`trivia_scores` INSERT**. Two permissive policies
were OR'd:

```sql
"Users can insert scores"           WITH CHECK (uid = user_id OR user_id IS NULL)
"Users can insert their own scores" WITH CHECK (uid = user_id)
```

The looser one won, so **any caller could insert an ownerless score row** —
unbounded leaderboard pollution. Production had 0 such rows and every insert
site runs authenticated, so the loose policy was dropped. A post-check attempts
an ownerless insert and requires it to fail.

---

## Also verified during this phase

- **`promo_wagering_ledger` is fine.** It has RLS on with zero policies
  (deny-all), which looked like it would block writes even after the `.catch()`
  fix. It does not: `record_promo_wagering` is `SECURITY DEFINER` and
  `ChipBridge` calls it with `SUPABASE_SERVICE_ROLE_KEY`, which holds the only
  EXECUTE grant. The empty ledger was caused solely by the `.catch()` thenable
  bug, now fixed.
- **The `.catch()` fixes are live on main** — 0 sites across all 14 previously
  affected files, CHECK 11 gates at baseline 0. A local run reporting 29 sites
  was a **stale local clone**; `git rev-parse HEAD` did not match `origin/main`.
  Do not trust the local checkout in this environment.
- **`spatial_ref_sys`** has RLS disabled with read grants. PostGIS
  extension-owned reference data (coordinate systems), not user data. Expected.
- 12 tables have RLS on with no policies = deny-all. Safe; service_role
  bypasses.

---

## Open — needs Dan's decision (product scope, not defects)

The remaining 25 warnings are all "an intentionally public policy coexists with
a redundant owner-scoped one." Not bugs. But four of them make user data
readable by **unauthenticated** visitors, which is a product call, not a
technical one:

| Table | Exposure |
|---|---|
| `survival_progress` | `"Survival progress is viewable by all"` — every user's progress, readable by `anon` |
| `trivia_pvp_matches` | `"Users can view all matches"` — all PvP match records, readable by `anon` |
| `friendships` | `"Public read access"` — the social graph |
| `player_stats` | `"Player stats are public"` |

Low impact today (0–3 rows each), but these grow with the user base. If any of
these should be members-only, say which and it is a one-line policy change per
table. I did not change them unilaterally because each plausibly backs a public
leaderboard.

## Open — carried forward

- **1,223 unused indexes** (INFO). `stats_reset` is NULL, so the counters are
  lifetime-cumulative and trustworthy. Not yet acted on — dropping indexes is
  write-latency-positive but read-risky, and wants a separate pass.
- `auth_db_connections_absolute` — dashboard setting, 1 finding.
- Velocity guard + referral monthly cap lost in the v3 `award_diamonds_v2`
  rewrite.
- Login formula change (`c_login_base` 5→10, `c_login_step` 2→5,
  `c_login_max` 25→110) — a **4.4x** increase, still needs Dan's confirmation
  given "we aren't rich and don't have a ton of money to give away."

---

## Operational notes

- `ALTER POLICY` takes `AccessExclusiveLock`. The first attempt **deadlocked**
  against live traffic and rolled back cleanly. Hence `SET LOCAL lock_timeout`,
  and hence all measurement happens *before* any lock is taken.
- A probe can legitimately **raise** rather than return rows: reading
  `admin_audit_log` as `anon` throws `permission denied for function
  fn_is_platform_admin`, because another policy on that table calls a function
  `anon` cannot execute. The probe records that as `-1` and compares it like any
  other value — error-before and error-after is unchanged behaviour.
- CHECK 12 uses a **date cutoff (20260813), not a frozen count**. The first
  version froze a count of 64 historical occurrences derived from the stale
  local clone. A baseline you cannot verify is worse than none, because it fails
  the build for reasons unrelated to the change at hand.
- CHECK 12 was tested both ways before shipping: it catches the `FOR ALL` and
  single-command forms, and correctly does **not** flag mixed OR-policies,
  already-scoped policies, or pre-cutoff history.
