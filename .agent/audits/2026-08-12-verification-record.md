# Verification Record — 2026-08-12

A known-good baseline for future sessions to diff against. Every number here
was read from production, not inferred. Where a claim was checked and found
false, that is recorded too — a stale warning costs as much time as a missing one.

## Trivia — server-grading baseline

Measured via `trivia-playtest-verify.sql` against production, 30-day window:

| mode | runs | submitted | graded NULL | payout NULL | last run |
|---|---|---|---|---|---|
| arcade | 14 | 2 | 0 | 0 | 2026-08-06 02:29 UTC |
| all 8 others | 0 | — | — | — | never |

Reading: the server-grading path **works**. Both submitted arcade runs have a
non-null `correct_count` and `diamonds_awarded`, which is the signature of a run
graded by `/api/trivia/session-submit` rather than by the browser. `graded NULL`
or `payout NULL` above zero on a future run means grading silently fell back to
the client — that is the regression to watch for.

The other eight modes (`daily`, `mixed`, `time-attack`, `endless`, `survival`,
`mtt`, `cash`, `icm`, `gto`) are code-verified but have **never been played**.
They have no baseline. First live run of each is still outstanding.

Re-run `trivia-playtest-verify.sql` after any play-test. It checks what landed in
the database rather than what appeared on screen: a client-computed score and a
server-graded one render identically, so the screen is not evidence.

## Phase-4 cleanup — verified complete

Claimed incomplete in the 2026-08-12 briefing; found already done and audited here.

- All 4 unreachable `add_diamonds_to_balance` calls removed from
  `pages/hub/trivia/[mode].js`. Zero live client-mint calls remain in
  `pages/hub/trivia/` or `src/components/trivia/`.
- `src/components/trivia/AllInMode.jsx` deleted (807 lines, zero imports).
- Commit `5ad93dbaf6`: 206 deletions vs 50 additions. Every added line is an
  explanatory comment except one import, which resolves to real exports and is
  used at lines 385 and 424.
- The live `useServerPayout` branch is intact.
- Gates: `tsc --noEmit` exit 0, eslint `no-undef` + rules-of-hooks exit 0.

## Two briefing warnings that did not survive checking

**The pre-commit "hook trap" is a false alarm.** The briefing states `mixed.js`,
`pvp.js`, `survival-game.js`, `endless.js` and `[mode].js` all call
`supabase.auth.getSession()` directly and will be blocked on the next edit.
Measured: **zero** occurrences in all five files. They already use `getAuthUser`
(29 occurrences across `pages/hub/trivia/`). No trivia file trips the hook, and
no migration is needed before editing them.

**`06-tour-registry-seed.sql` is superseded — closed, not applied.** It seeded
`tour_schedule_sources` for the workers `fetch()` route. That route cannot reach
the Cloudflare-protected schedules (WSOP, WSOP Circuit, WPT, PokerGO, NAPT) at
all. `scripts/tour_stealth_scraper.py` replaced it, reading
`tour_source_registry` (14 active tours) through Scrapling StealthySession +
camoufox. `tour_schedule_sources` is still 0 rows and should stay that way.

## Migrations applied 2026-08-12

All recorded in `supabase_migrations.schema_migrations`. Note the MCP assigns a
**current** timestamp rather than the source filename's version, so a later
`supabase db push` may still see the original `202608082*` files as unapplied.
Re-applying them is harmless — every one is idempotent — but expect it.

| applied version | name | effect |
|---|---|---|
| 20260812145056 | views_readonly_and_invoker | revoked client write grants on all public views |
| 20260812145126 | trivia_tournaments_public_keep_definer_reads | kept DEFINER read semantics on the public view |
| 20260812145251 | economy_invariants_function | 11-invariant function |
| 20260812145332 | rls_off_write_surface_invariant | 12th invariant, full set |
| (same session) | widen_live_tables_data_quality_for_simulated | `venue_live_tables` admits `simulated` |
| (same session) | allow_manual_research_data_quality_on_tour_tables | `tour_stop_events` + `poker_series` admit `manual_research` |
| (same session) | provenance_trigger_admits_manual_research | `enforce_scrape_provenance()` admits `manual_research` |

### Security posture, asserted live (not assumed)

The migration assertion blocks executed as `anon` against production:

- anon **can** read `trivia_tournaments_public` — the public listing works.
- anon **cannot** write through it — the confirmed anonymous write path to
  `prize_pool` / `winners` / `status` / `entry_fee` is closed.
- anon holds **no** SELECT on the `trivia_tournaments` base table — answers
  (`correct_index`, `explanation`) are not exposed.
- Client write grants on public views: **0**.
- `economy_invariants()`: **12 checks, 0 failing.**

A privilege assertion is not a behaviour assertion. "The grant still exists" and
"the query still works" are different claims, and only the second is what users
experience — this is why the assertions probe as `anon` rather than reading the
catalog alone.

## Tour calendar — loaded

`07-tour-stops-2026.sql`: 84 verified 2026-27 stops across 16 tours (WSOP
Circuit, WPT, MSPT, RunGood, PokerGO, Venetian, SHRPO, Borgata, Bay 101 and
others), each written to both `tour_stop_events` and `poker_series`.

| metric | before | after |
|---|---|---|
| upcoming stops (`stop_end_date >= today`) | 47 | **128** |
| upcoming series (`end_date >= today`) | 5 | **86** |

Verified by canonical md5 of `(tour_code, stop_name, stop_start_date,
stop_end_date, stop_venue, stop_city, stop_state, buy_in)` — source file vs
database — matching exactly on both tables. A single wrong character in any date
would have broken the hash. Missing: 0. Mismatched: 0.

### Why this needed three schema changes, and what was refused

The bundle was written with `data_quality='confirmed'`, which no table permitted.
The obvious shortcut — relabel the rows `scraped_verified` so they fit — was
**refused**. These rows were compiled by reading each tour's official published
schedule; calling them verified scrapes is a false provenance claim, and it is
the identical bug corrected on `venue_live_tables` the day before, where modelled
simulator output was asserting it had been observed. A constraint should not be
able to force code to lie about where data came from.

So the vocabulary was widened instead, in three places that all had to move:

1. CHECK on `tour_stop_events`
2. CHECK on `poker_series`
3. `enforce_scrape_provenance()` — a BEFORE INSERT trigger that hardcoded the
   same three-value list and rejected rows **before** the CHECK was evaluated,
   making step 2 dead code on its own.

`tour_stop_events` has no such trigger, which is why the failure surfaced
asymmetrically: the tour-stop batch succeeded while the series batch failed in
the same schema state. The trigger's attribution guard (`scrape_html_hash` and
`scrape_timestamp` mandatory) was left untouched and still enforced — every one
of the 168 rows satisfies it and carries `source` and `source_url` as well.

### Gotcha for anyone re-verifying these rows

Comparing a Postgres `string_agg` aggregate against a Python-sorted hash **will**
report a false mismatch: Postgres orders by locale collation, Python by
codepoint. Force `ORDER BY ... COLLATE "C"`. This produced a spurious
"corruption" signal once during this work. It is an artifact of the check, not
the data.

## Known gaps — deliberately not fixed

**Atomic PvP matchmaking.** Two players joining simultaneously may each create a
separate match row. Scoped out of the Phase-4 migration; a pre-existing race, not
a regression. It needs its own pass: a server-side RPC pairing the two oldest
waiters under a unique constraint. Do not fold it into grading or settlement work.

**PvP has never been played end-to-end.** Code and schema verified only.
Queries 6–8 of `trivia-playtest-verify.sql` cover it when someone does.

**`venue_daily_tournaments` carries three redundant triggers**
(`trg_enforce_scrape_provenance_tournaments`, `trg_enforce_provenance`,
`ensure_provenance_vdt`) all executing `enforce_scrape_provenance()` on every
insert and update. Harmless but wasteful. Untouched.

**PokerAtlas live daemon down since 2026-08-01.** `venue_live_history` and
`game_live_history` stop dead that day; the cash-games simulator is modelling on
data that has not grown in 11 days. Its log directory is empty — no heartbeat, no
logs. The daemon has the asyncio guard and does load `.env.local`, so this is a
launchd-layer failure. The watchdog now escalates persistently-failed recoveries
rather than retrying in silence, which is what would have surfaced this on day 2.
