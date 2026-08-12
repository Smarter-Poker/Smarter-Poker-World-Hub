# 2026-08-12 - Database verification baseline

A known-good snapshot of production (`kuklfnapbkmacvwxktbh`) that future
sessions can diff against. Every number here was read live, not inferred.

Two of the three tasks in the 2026-08-12 handoff turned out to be **already
done**; this record proves the end state rather than repeating the work.

---

## 1. The four "pending" migrations were already applied

The handoff said these existed on disk but had NOT reached the DB. They had -
twice. `supabase_migrations.schema_migrations` shows each applied on 2026-08-09
under its filename, and again on 2026-08-12 14:50-14:53 UTC under a snake_case
name:

| Migration | 08-09 version | 08-12 re-apply |
|---|---|---|
| views_readonly_and_invoker | 20260809162815 | 20260812145056 |
| trivia_tournaments_public_keep_definer_reads | 20260809162959 | 20260812145126 |
| economy_invariants_function | 20260809173414 | 20260812145251 |
| rls_off_write_surface_invariant | 20260809181923 | 20260812145332 |

They are written idempotently, so the double application is harmless. **I did
not apply them a third time** - re-running DDL that is already in its target
state adds risk and no information. I verified the intended END STATE instead.

### End state verified

| Assertion | Result |
|---|---|
| Application views still granting INSERT/UPDATE/DELETE/TRUNCATE to anon or authenticated | **0** |
| `anon` retains SELECT on `trivia_tournaments_public` | yes |
| `trivia_tournaments_public` reloptions | `(none)` - correctly NOT security_invoker |
| `public.economy_invariants()` exists | yes |

The reloptions check matters: migration `20260808201500` exists precisely to
revert `security_invoker` on that view. Under invoker semantics the READER
needs base-table privileges, and `anon` deliberately has none (the base table
carries `correct_index`/`explanation`), so setting the flag blanks the public
tournament listing for every logged-out visitor. Definer reads are the point
of the view; the bug was only ever that a definer view also carried WRITE
grants.

### The original exploit is closed - re-tested, not assumed

The `20260808200000` header documents an unauthenticated write that
**succeeded against production**. I re-ran it as the `anon` role inside a
transaction:

```sql
SET LOCAL ROLE anon;
UPDATE public.trivia_tournaments_public SET prize_pool = prize_pool WHERE id = <real>;
```

Result: **`insufficient_privilege`** - denied. In the same transaction, an
anon SELECT against the view still returned rows, confirming the read path
survived the fix. Both properties hold simultaneously, which is the whole
design.

### economy_invariants(): 12 / 12 PASS

| check | ok |
|---|---|
| deduct_diamonds_writes_both_balance_columns | true |
| add_diamonds_writes_both_balance_columns | true |
| no_profiles_balance_drift | true |
| balance_rpcs_not_executable_by_clients | true |
| award_v2_executable_by_service_role | true |
| profiles_economic_column_guard_trigger_present | true |
| authenticated_cannot_update_economic_columns | true |
| award_v2_vip_check_is_null_safe | true |
| easter_eggs_exempt_from_daily_cap | true |
| no_client_writable_views | true |
| anon_mutating_definer_functions_check_auth_uid | true |
| no_rls_off_tables_writable_by_clients | true |

`balance_rpcs_not_executable_by_clients = true` is the independent
confirmation of the finding that drove the whole trivia migration: the
browser cannot call a balance mutator. Build-gate CHECK 10's dependency
(the function existing) is satisfied.

---

## 2. The three tour / data-quality items: CLOSED as superseded

The handoff asked whether "06 tour registry seed", "07 the 84 tour stops" and
"08 data_quality constraint widening" needed generating. They do not:

| Item | State |
|---|---|
| 06 registry seed | Done - `tour_source_registry` holds 14 sources, `tour_scrape_registry` 13 configured scrapers |
| 07 the 84 tour stops | **Superseded** - `tour_stop_events` holds 598 rows and `tour_event_details` 462. Hand-seeding 84 would be a regression |
| 08 data_quality widening | Done - applied 2026-08-12 as `20260812145444 widen_live_tables_data_quality_for_simulated` and `20260812150221 allow_manual_research_data_quality_on_tour_tables` |

Every `tour_stop_events` row carries `data_quality = 'scraped_verified'` (one
distinct value). Newest row is dated 2026-04-07, so the corpus is real but not
freshly re-scraped - worth a look if tour listings appear stale, but that is a
scraper-cadence question, not a missing-migration one.

Empty tables `poker_tour_series_events`, `tour_events`, `tour_schedule_registry`
and `tour_schedule_sources` appear to be legacy/unused alongside the
`tour_stop_events` + `tour_event_details` pair that actually holds the data.

---

## 3. Trivia engagement baseline (diff future sessions against this)

`trivia_sessions`, all time:

| mode | status | sessions | players | diamonds paid | window |
|---|---|---|---|---|---|
| arcade | open | 12 | 1 | - | 2026-08-06 01:20 - 02:28 |
| arcade | submitted | 2 | 1 | 20 | 2026-08-06 02:05 - 02:29 |

`trivia_scores`, last 10 days: 2 runs, 1 player, arcade only.

**Interpretation.** The nine other modes and PvP have zero sessions because
there is no traffic at all, not because they fail - there have been no runs of
ANY mode in ten days beyond the arcade validation. Both submitted arcade runs
graded and paid correctly through the server path (20 diamonds total, single
`trivia_session_<uuid>` credit each, no client-side duplicate), which is the
known-good proof that server grading works end to end.

The 12 open vs 2 submitted sessions are abandoned runs. They expire after six
hours and pay nothing - expected, not a leak.

**What to diff against next session:** if any mode other than arcade appears
in `trivia_sessions`, that mode has had its first real play. Check it against
the double-pay query in
`.agent/audits/2026-08-12-trivia-mode-playtest.md` before trusting it.

---

## Still open (not addressed here)

- **GH_ADMIN_PAT Actions secret** - user-side; `push-velocity-watchdog` runs
  809+ keep failing until it is refreshed.
- **PvP matchmaking race** - simultaneous joins can create two match rows.
  Deliberately scoped out of the phase 4 grading/settlement work; it needs its
  own pass (an RPC pairing the two oldest waiters under a unique constraint).
- **Trivia hook trap** - `mixed.js`, `pvp.js`, `survival-game.js`,
  `endless.js` and `[mode].js` call `supabase.auth.getSession()` directly, and
  the pre-commit hook blocks commits touching them. Migrate those calls to
  `getAuthUser()` from `@/lib/authUtils` BEFORE the next edit to any trivia
  page, rather than reaching for `--no-verify`.
- **PvP 413 errors** observed during the Antigravity play-test remain
  undiagnosed.
