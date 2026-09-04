# The collusion detector scanned, found, wrote, and forgot

**2026-09-04. Smarter-Poker-World-Hub + smarter-poker-workers + Supabase
`kuklfnapbkmacvwxktbh`.** Written because three separate fixes each looked
finished, and each was verified with a tool that could not see the failure.

## What was wrong, in the order it was found

**1. The scan could not finish.** `collusion-scan` read a rolling 24-hour
window every 30 minutes, so it re-read every hand up to 48 times. Survivable
at 136,000 hands a day; fatal at 770,000. From 2026-09-03 02:00 UTC it stopped
returning at all - not slow, never finished - and the only trace was the
container's stale sweeper marking the row `killed` half an hour later. Nothing
watched that table. **~40 hours with no collusion detection, and no screen
said so.**

Fixed by making the scan resume from a mark in Postgres
(`ca_collusion_scan_state`) instead of re-reading a rolling window, with keyset
paging, a row ceiling and a wall-clock budget. A real 30-minute window now
completes in 7.1 seconds.

**2. Health measured whether the process ran, never whether it was keeping
up.** `last_success_at` is stamped on every advance, including a zero-second
one, so a scan advancing two minutes per thirty-minute cycle - losing an hour
every hour - reported `live, stale:false` forever. `seconds_behind` was
computed by both read functions and used by nothing.

Fixed: staleness is the OR of two independent questions, and a `behind` status
names the state between running and keeping up.

**3. The 1,241,438 hands the seeded mark stepped over were recorded nowhere.**
The migration that seeded the mark called the gap "recorded honestly rather
than papered over" and created no column, no function, nothing. The first
completed run would have erased every trace of it.

Fixed: `unscanned_from` / `unscanned_to` / `unscanned_note` on the state row,
returned by health, and health refuses to answer `stale: false` while they are
set.

**4. And the mark never moved once.** Not slowly. Never.

```
POST /rest/v1/rpc/fn_ca_collusion_scan_advance
{"code":"21000","message":"UPDATE requires a WHERE clause"}
```

`authenticator` carries `session_preload_libraries=safeupdate`, so every
request through PostgREST runs in safe-update mode and a WHERE-less UPDATE is
refused before a row is touched - inside a SECURITY DEFINER function as much
as anywhere else. `ca_collusion_scan_state` is a singleton with a boolean
primary key, so its UPDATE had no WHERE and looked like it never needed one.

## The part worth remembering

**`postgres` does not preload safeupdate.** The function worked from psql,
worked in a rolled-back probe, worked when a migration called it. THREE
migrations asserted it and all three passed. The only caller it failed for was
the only one that mattered.

The evidence it left was a shape, not an error: the workers deploy landed at
18:57:35 and the scan completed cleanly afterwards - 19:00 in 12.1s, 19:30 in
50.2s, both HTTP 200, both `success` in `cron_execution_log` - while
`last_scanned_hands` stayed NULL. It was reading hands, finding findings,
inserting them, and forgetting where it got to. That is the behaviour the
whole change set existed to remove, reached from the other end.

**Rule: a guard you cannot reproduce in the tool you are testing with is a
guard you will report as working.** For anything reached through PostgREST,
the verification is a PostgREST call.

Six functions in this schema hold a WHERE-less write. The other five run only
under pg_cron or triggers, where safeupdate is not loaded, so they work today
and become this bug the moment somebody exposes one as an RPC:
`fn_ca_execute_epoch3_reset`, `fn_rake_spec_rebuild_caps`,
`fn_rebuild_agent_commission_rollup`,
`pnm_refresh_venue_integrity_state_basics`, `sp_compact_hand_history`. Named,
pinned, and deliberately not touched - two are money paths owned by other
work, and a blind edit to a treasury or rake function to satisfy a lint is a
worse idea than the lint.

## Two mistakes of my own, recorded rather than tidied away

**`Prefer: tx=rollback` is not honoured by this PostgREST deployment.** It
needs `db-tx-end = commit-allow-override`. Having fixed the function I proved
it through PostgREST and sent that header so the probe would not commit. It
committed: a run record of 123 hands in 9ms, which is my argument list, not a
scan. Left there it is exactly the failure one of these migrations exists to
prevent - a health surface reporting a run that never happened. Restored to
the exact prior values.

Section 11.5 says probe inside a transaction you ROLL BACK, and I did ask for
a rollback. The mistake was trusting the request instead of reading the row
afterwards. **psql's transaction is the one that actually rolls back. Through
PostgREST, assume every call commits.**

**A migration version was claimed underneath me for the second time today.**
`20260904230000` went to `cash_games_slice_1_hardening` between the file being
written and being registered, exactly as `20260904170000` had. Renamed to
`20260904233000` and re-applied so the registered version and the live body
are the same thing. `INSERT 0 0` on the registration is the whole warning you
get - read the row count.

## A counting lesson, since three scans gave three answers

Asked how many functions hold a WHERE-less write, a naive regex said eleven, a
second said two, and the truth is six. Both wrong scans tripped over string
literals: `fn_resolve_settled_financial_alerts` writes a note containing
"raised; the prize path credited this player", and that semicolon ends the
statement as far as a regex is concerned, so a perfectly good WHERE reads as
missing. `fn_ca_money_path_log` has no UPDATE at all - the match was inside an
error message telling an operator how to reopen a door. Strip literals and
comments first. A guard that miscounts is how the wrong function gets fixed.

## What shipped

| Where | What |
| --- | --- |
| `20260904210000` | the scan gets a mark, and keyset paging to use it |
| `20260904214500` | the mark must not claim a run that never happened |
| `20260904223000` | health measures coverage, and the gap is recorded |
| `20260904233000` | the advance carries a WHERE, and the probe's write is undone |
| workers #64 | resume from the mark; budget; keyset order |
| workers #66 | the cursor as an index cond; the catch-up flag; 500 on a failed advance; `cron_execution_log.result` stops being `{}` |
| `__tests__/horses-an-rpc-write-has-a-where.test.mjs` | proved red by removing the WHERE |

## 5. And then it hung anyway, with everything measurably fast

With the mark fixed and deployed, the 20:30 run sat at `running` for over ten
minutes. Every component was then measured rather than reasoned about:

| Part | Measured |
| --- | --- |
| read, 40,000 hands over the same window | 37.6s from a laptop, ~800ms per page, **flat with page depth** |
| whole handler over those 40,000 real hands | **525ms**, 297,630 actions, 2,665 findings |
| horse lookup, 300 ids | 695ms, HTTP 200 |
| payload | 56 MB for 51,297 hands (643 bytes of actions each) |

The flat page cost is the index-cond fix working. Everything measured is fast,
so the run was not slow. **It was stuck**, and nothing in the process could say
so, because the wall-clock budget covered the read and only the read.

Three ceilings, none of which existed:

1. **A single page had none.** The read budget is checked BETWEEN pages, so a
   page that never answers is never noticed - the loop cannot reach its own
   check. A budget that only applies while the thing is making progress is not
   a budget.
2. **The horse lookup, the insert, the state read and the advance had none.**
3. **The supabase client had no fetch timeout at all**, so a stuck connection
   was held for the life of the process.

**Item 3 is not the fix, and this is the part worth carrying forward.**
Measured: with a fetch that only settles when aborted, the abort fires - and
the supabase-js call above it still never settles, and re-issues the request.
A caller can hang with a perfectly good fetch timeout underneath it. So the
deadline has to live where the `await` is, where `Promise.race` does not care
what the library does with a rejection.

None of them retry. An aborted request may already have executed, and
replaying a write is a money-integrity hazard (Club Arena CLAUDE.md section
2). These turn an invisible hang into a loud failure. That is all they do.

Finding this required reproducing the entire handler locally against 40,000
real rows, because `cron_execution_log` recorded a duration and nothing else.
The response now carries per-phase timings and they land in `result`, so the
next one says where the time went.

## Still open

The pair thresholds (>=15 shared hands, >=30 for win rate) were chosen when
one run was 24 hours and a resumed run is ~30 minutes, so a pair whose shared
hands are spread across runs cannot trigger. Disclosed in the scan's response
(`detection_span_minutes`, `detection_thresholds.aggregates_across_runs:
false`) rather than left as a silent regression. Closing it means a rolling
per-pair counter carried across runs; it is written into PHASE5-CONTRACTS
section 1.1 as detector work.

The 1,241,438-hand gap is recorded, not closed. Health will keep saying so
until somebody rescans that window with `?since=&until=` in six-hour slices
and clears the three columns. Do not clear them to tidy the dashboard.
