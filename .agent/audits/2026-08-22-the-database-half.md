# The database half, and the gate that was red for two unrelated reasons

**Date:** 2026-08-22
**Scope:** World Hub, plus one gate ported to Club Arena
**Predecessors:** `2026-08-22-anti-regression-hardening-completed.md`,
`2026-08-22-nothing-regresses-quietly.md`

The first two passes made merging safe and made publishing visible. This one
went after the last repo that had no gate of its own — the one that serves
production — and found that the reason it had no gate was two failures that had
nothing to do with each other.

---

## 1. Three real authorization holes, closed

`economy_invariants()` had been returning three failures, so `Pre-Deploy Safety
Checks` was red on `main`. Nothing required that check, so nothing stopped a
push and nobody looked. All three were real:

- **`no_client_writable_views`** — `club_memberships` and
  `v_spin_tier_availability` granted INSERT/UPDATE/DELETE to `anon` *and*
  `authenticated`. The second is not auto-updatable, so those grants could
  never have worked; the first is `security_invoker=true`, so its writes were
  RLS-checked — pointless rather than dangerous, but a write path nothing uses
  is a write path nobody watches.
- **`no_rls_off_tables_writable_by_clients`** — three migration backup tables
  with RLS off and INSERT/UPDATE/DELETE granted to **anon**. An unauthenticated
  visitor could write to tables holding user data. `spatial_ref_sys`
  additionally handed anon TRUNCATE.
- **`anon_mutating_definer_functions_check_auth_uid`** — six SECURITY DEFINER
  functions callable by anon that write rows and never consult `auth.uid()`.
  `fn_seed_horses_to_floor` spawns AI players into any club by uuid;
  `fn_ensure_upcoming_mtts` creates tournaments in any club by uuid.

Every change was a revocation of something nothing uses, verified before
writing: no code writes through either view, the backup tables are referenced
by no application code, and exactly one of the six functions has a caller —
`ca_refresh_stat_distribution`, from a cron route using the service-role key,
which keeps EXECUTE. `SELECT` is untouched everywhere.

**The first attempt failed, and the failure is the lesson.** Revoking from
`anon, authenticated` left `has_function_privilege('anon', ...)` returning
true: all six also carried `=X/postgres` — a PUBLIC grant — and anon is a
member of PUBLIC. The revocations *looked* like they worked. The post-apply
assertion said otherwise and rolled the entire migration back. `FROM PUBLIC` is
not optional, and an assertion that checks the outcome rather than the exit
code is why that mistake cost minutes instead of a month.

---

## 2. The gate then failed for a reason unrelated to the economy

`57014: canceling statement due to statement timeout`, after 49 seconds, with
all twelve invariants passing.

A check that is required to merge cannot fail for reasons unrelated to the
code — people learn to re-run it, then to ignore it. Fixed in both places:

- **In the database.** The two grant checks made 6,560 `has_table_privilege`
  calls (820 relations × 4 privileges × 2 roles). Postgres accepts a
  comma-separated privilege list and returns true if ANY is held — the same
  question in 2 calls per relation instead of 8. Deliberately still
  `has_table_privilege` rather than `aclexplode(relacl)`, because only the
  former accounts for privileges arriving via PUBLIC or role membership, which
  is exactly what made the first revocation attempt fail. The function also
  carries its own `statement_timeout`: a schema audit over 820 relations and
  2,286 functions is not a request-path query.
- **In the runner.** Measured immediately after: three identical calls returned
  200 in 879ms, 200 in 4915ms, and a **503** in 2764ms. The runner now retries
  transport failures — 5xx, 429, 57014, a thrown fetch — four times with
  backoff. **A false invariant is never retried**, because that is the signal.

---

## 3. Autopilot was never on the cron allowlist

The second reason the gate was red, and entirely separate.
`agent-autopilot.yml` carries an every-10-minutes sweep and was rolled out to
all seven repos without being added to CLAUDE.md §11.4 or the CHECK 6c
allowlist. CHECK 6 had been failing on every push since.

Added to both in the same commit, which is what the check's own error message
demands. It belongs on the allowlist rather than in Open Claw: Open Claw exists
for scheduled *application* logic that touches the database and the product.
Autopilot operates on GitHub pull requests through the GitHub API and needs the
runner's own credentials. Moving it would not be inconvenient — it would be the
wrong layer.

**With both fixed, `Pre-Deploy Safety Checks` is now a required status check on
`main`.** World Hub went from the least protected branch in the estate to the
most thoroughly gated, without breaking publishing.

---

## 4. Seven phantom columns: one dead endpoint, one dead feature

With the economy closed, the gate moved on to CHECK 13.

**`pages/api/poker/profile-aggregate.js` was DEAD, not degraded.** It selected
`venue_checkins.text`; the column is `message`. That select 42703s, and the
very next line is `if (checkinsErr) return res.status(500)`. Every profile page
load has been a 500 since it shipped.

The same file's Following query carried four separate fictions, none of which
could ever have returned a row: `.eq('follower_id')` (the column is `user_id`),
`created_at` (it is `followed_at`), three PostgREST embeds where **no foreign
key exists**, and `tours` — a table that does not exist in this database at
all. Its error was destructured away entirely, so the tab rendered empty rather
than failing. Details are now hydrated with one query per page type, the same
pattern the venue enrichment above it already used.

**The avatar cosmetics case is different, and it is the finding that mattered
most.** The columns were *missing from production*, not misspelled in code.
`20260821210000_user_avatars_cosmetics.sql` and
`20260821210001_profiles_cosmetics.sql` had sat in `supabase/migrations/` for a
day and were never applied. Avatar frames and auras are fully built around
them — the gallery renders them, the service maps them, the context writes them
— and every write failed 42703 into a catch block.

That is the **database half of merged-but-never-published**, and it was
invisible to every gate here, because the code was correct and only the schema
disagreed.

---

## 5. The gate that would have caught it

`CHECK 17 / check-migrations-applied.mjs`: diff the branch against its base,
read what its new migrations DECLARE, and ask the live PostgREST OpenAPI
document whether those things exist.

It reads `ALTER TABLE ... ADD COLUMN` as well as `CREATE`. Club Arena's
existing version of this gate reads only `CREATE`, and would have watched both
stranded migrations go straight past — they added COLUMNS, the tables already
existed, and every other gate stayed green. That version has now been upgraded
too.

Three details decide whether a gate like this survives contact:

- **It cannot skip silently.** A shallow checkout makes the diff impossible, so
  it exits 2 and says so, and the job checks out with `fetch-depth: 0`. A gate
  that reports success for a check it never ran is worse than none.
- **It ignores constraints.** `ADD CONSTRAINT` reads identically to `ADD
  COLUMN` under that regex; without the filter every constraint is a phantom
  column forever and the gate is disabled within a week.
- **Functions warn, they do not fail.** PostgREST lists only what the API role
  can see, so a service-role-only function is absent for a legitimate reason.

---

## 6. World Hub has a publish watchdog now

Club Arena got one this morning. World Hub is the harder case: it deploys
through Vercel's git integration, so there is no workflow to watch. A build
that errors, sits queued, is superseded and never retried, or goes to BLOCKED
because Vercel cannot attribute the commit author leaves `main` moving while
smarter.poker serves something older.

`/api/health` reports the short sha it was built from. The watchdog compares it
to `main` every fifteen minutes, stays quiet inside a 20-minute budget because
a Vercel build is 3-5 minutes, and **never deploys anything** — §1.3 forbids
`vercel deploy` and deploy hooks. Instead it asks the Vercel API what happened
to the deployment for that specific sha, and draws the one distinction that
matters: a deployment in state ERROR is a build to read, while *no deployment
at all* means the git integration never fired, which does not retry itself.

---

## Where it stands

| | |
|---|---|
| All 7 repos | `pull_request` + `non_fast_forward` + required checks, zero bypass actors except World Hub's sync App |
| World Hub | 7 required checks including its full safety gate; a direct push is refused |
| Economy invariants | 12 of 12 green |
| Publish | watchdogs on both halves of the chain, self-healing once per sha on the Club Arena side |
| Diamond Arena | parked on Dan's instruction — it becomes a 1:1 Club Arena clone once Club Arena is finished, so its 63 TypeScript errors are in code that will be replaced. `Production Build` gates it; `TypeScript Check` stays honest about not gating anything |
| PepNationLab | six pull requests conflicted for 41-68 days, now named in a self-updating issue. Each needs resolving hunk by hunk |
