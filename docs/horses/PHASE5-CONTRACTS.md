# Phase 5 contracts - Game integrity and case management

Binding for every agent building Phase 5. The Phase 1 to Phase 4 contracts
still apply in full.

Phase 5 spans TWO repositories. The console and its database live in the World
Hub; the detector that feeds it lives in `smarter-poker-workers`, and section 1
is about that.

## 0. The safety rule that outranks everything here

**AN INTEGRITY SURFACE MAY NEVER IMPLY IT IS WATCHING SOMETHING IT IS NOT
WATCHING.**

Phase 4's rule was that an operator must not be told a player is stopped when
they are not. Phase 5's is the same failure one level up: a review queue that
renders "0 open cases" over a detector which has not run since Tuesday reads
exactly like a clean platform, and an operator who trusts it stops looking.
That is worse than having no queue at all, because a missing screen prompts a
question and a confident empty one does not.

Everything below follows from that:

1. **Every integrity panel states the FRESHNESS of what it is showing, and
   states it as loudly as the finding itself.** Not a timestamp in a corner: a
   detector that has not produced inside its own expected cadence is a red
   banner over the queue, in the same words the Fleet Command health tab uses
   for a missing heartbeat.

2. **Empty is never rendered as clean.** Every queue distinguishes three
   states, exactly as the Phase 4 observation log does: nothing to review,
   nothing produced to review, and unknown because a source could not be read.
   The third is never collapsed into either of the first two.

3. **A score is not a verdict, and a queue is not an accusation.** 169,509 of
   the 169,530 rows in `collusion_tracking` are one pattern type and 99.99% of
   them are already `cleared`. A panel that lists them all as "suspicious
   pairs" has not surfaced anything; it has buried the twenty-one rows that
   matter. Phase 5 shows what an operator can act on, and says plainly how much
   it filtered and why.

4. **HORSES ARE PLAYERS (CLAUDE.md 10.5).** Every detector, every queue, every
   case and every sanction covers horses exactly as it covers humans, and
   `p_include_horses` defaults to true. This phase is where the temptation is
   sharpest - a collusion pair of two horses looks like noise to filter - and
   it is exactly the reasoning that produced the `is_horse` filter in
   `fn_settle_tournament_rake`. Two horses colluding is a defect in
   HorseBehavior and an operator needs to see it. The horse's timing
   distribution belongs BESIDE the humans', which is what makes a human
   outlier visible at all.

5. **No case decides anything by itself.** A case records evidence and a human
   decision. Nothing in this phase restricts, sanctions or moves a chip as a
   side effect of a detector firing. The sanction path is Phase 4's
   `ca_player_restrictions`, through the same maker-checker gate, with
   enforcement still off until Dan turns it on.

6. **Confiscation and victim redistribution are MONEY** and follow CLAUDE.md
   10.6 in full: read the outcome rather than assume it, never pay twice, never
   claw back for our own defect, prove it in a rolled-back transaction first,
   and be able to write the paragraph. Phase 5 builds the ledger and the
   decision record; it does not invent a new money path.

## 1. THE FIRST TASK, AND IT IS NOT IN THIS REPO

**The collusion detector has been dead since 2026-09-03 02:00 UTC, and nothing
said so.** Measured from `cron_execution_log` on 2026-09-04:

| status | first seen | last seen | runs |
| --- | --- | --- | --- |
| `success` | 2026-05-03 08:30 | **2026-09-03 02:00** | 4,110 |
| `killed` | 2026-08-22 20:00 | **2026-09-04 17:30** | 82 |

Per day: 48 successes on 2026-09-02, then 5 successes and 43 kills on 09-03,
then 36 kills and zero successes on 09-04. It is scheduled every 30 minutes
in Open Claw and it is being killed on every single run.

**The cause is growth, and the numbers are unambiguous.** `collusion-scan`
pages up to `MAX_SCAN_HANDS = 50_000` rows of `hand_history` per run, pulling
the full `actions` JSONB for each, over a rolling 24-hour window. Hands per
day:

```
2026-08-30   136,060
2026-08-31   273,569
2026-09-01   288,176
2026-09-02   431,646     <- last full day of successes
2026-09-03   769,943     <- last success was 02:00, then killed
2026-09-04   530,244     <- every run killed
```

Volume roughly quintupled in four days. A fixed 50,000-row page with a JSONB
column attached stopped fitting inside the dispatcher's kill budget, and the
scan has produced nothing since. `collusion_tracking`'s newest `scan_date` is
2026-08-28.

**Consequences that matter for this phase:**

- The platform has had NO collusion detection for roughly forty hours.
- Building I1's review queue first would have produced a screen that says
  "nothing new to review" over a detector that cannot run. Section 0 rule 1
  exists because of this exact discovery.
- `MAX_SCAN_HANDS` was already a truncation: 50,000 of 530,000 daily hands is
  under 10% of the window even when the scan completes, and the code knows
  (`handsTruncated`), but nothing surfaces it to an operator.

**The handler is `src/routes/collusion-scan.ts` in
`~/Documents/smarter-poker-workers`** (the dispatcher maps
`/api/cron/collusion-scan` to the workers VM at `/cron/collusion-scan`; there
is no such route in the World Hub, and `https://smarter.poker/api/cron/collusion-scan`
correctly answers 404). So the fix is a branch in that repo, with its own CI,
and it comes BEFORE the queue that reads its output.

Shape of the fix, to be confirmed against the code:

- Make the window and the page size adapt to volume, or shard the scan across
  the hour, rather than one fixed 50k page every 30 minutes.
- Select only the columns the detectors actually use; the `actions` JSONB is
  needed only by TIMING_CORRELATION and is the bulk of the payload.
- Report `handsTruncated` and the covered fraction into the row the console
  reads, so a partial scan is visible as partial rather than as a clean bill.
- Add a liveness assertion the way Phase 3's heartbeat does: a detector that
  has not produced inside its cadence must be loud somewhere an operator looks.

### 1.1 Done, and what the console must render because of it

The scan resumes from `ca_collusion_scan_state` instead of re-reading a
rolling 24 hours (workers `fix/collusion-scan-remembers`; World Hub migrations
`20260904210000`, `20260904214500`, `20260904223000`). A real 30-minute window
now completes in 7.1 seconds. Three things follow that the console CANNOT
render as ordinary health:

1. **`has_unscanned_gap`.** 1,241,438 hands between 2026-09-03 02:00 and the
   seeded mark were never examined by anything. They are recorded on the state
   row (`unscanned_from`, `unscanned_to`, `unscanned_note`), and
   `fn_ca_collusion_detector_health` REFUSES to answer `stale: false` while
   they are set. The banner says so until somebody rescans that window with
   `?since=&until=` and clears the columns. Do not clear them to tidy the
   dashboard.

2. **`status: 'behind'` is not `status: 'live'`.** Health asks two independent
   questions - has the process run recently, and is its coverage close to the
   present. The first version asked only the first, so a scan advancing two
   minutes per thirty-minute cycle reported `live` forever while losing an hour
   every hour. `seconds_behind` is the number to render, and `catching_up` is
   true whenever the window held more than the run read.

3. **The pair thresholds saw a day and now see half an hour.** Every pattern
   counts hands a pair shared INSIDE ONE RUN'S WINDOW, and `>=15` / `>=30` were
   chosen when a run was 24 hours. A pair whose shared hands are spread across
   runs is not aggregated by anything yet and cannot trigger. The scan reports
   `detection_span_minutes` and `detection_thresholds.aggregates_across_runs:
   false`; **the queue must show it**, because section 0 rule 1 is exactly
   about not implying wider cover than exists.

   Closing it properly is a rolling per-pair counter - `(player_a, player_b,
   pattern)` totals carried across runs, decayed by age - so a signal can
   accumulate the way it did when one window was a day. That is detector work,
   it belongs in this phase, and it is written here rather than left as an
   unstated regression.

## 2. What the data actually supports

Re-measured from production on 2026-09-06 at 10:04 UTC, after the detector
repair and removal of the horse suppression. These are moving counts, not
fixtures:

| Table | Rows | What it can support |
| --- | --- | --- |
| `collusion_tracking` | 176,153 | I1. 6,630 open observations and 169,523 cleared history |
| `anti_cheat_flags` | 16 | I2. Small and real |
| `anti_cheat_events` | 6 | I2 context |
| `hand_history` | 3,231,827 | I7 investigator search |
| `horse_decision_latency` | 84 | I5, still thin and horse-only |
| `ca_collusion_signals` | 104 | I1 and I4. Seven-day pairwise chip-flow signals, all horse-versus-horse at measurement time |
| `signup_abuse_log` | **0** | I3 has no data at all |
| `user_devices` | **0** | I3 has no data at all |

The 6,630 open `collusion_tracking` observations are 6,188
`TIMING_CORRELATION`, 437 `CHIP_DUMP`, one `SOFT_PLAY`, and four old
`WIN_RATE_ANOMALY` rows. The last two days contain 6,623 open observations:

| Pattern | Observations | Distinct pairs | Score range | Median | Horse / horse | Horse / human | Human / human |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `TIMING_CORRELATION` | 6,185 | 5,497 | 50 to 100 | 66 | 6,181 | 4 | 0 |
| `CHIP_DUMP` | 437 | 432 | 80 to 100 | 82 | 437 | 0 | 0 |
| `SOFT_PLAY` | 1 | 1 | 66 | 66 | 1 | 0 | 0 |

This means the queue is no longer a two-dozen-row surface and score alone no
longer identifies what deserves the next review. Horses share one deterministic
HorseLogic engine, so timing correlation dominates by construction. The queue
must group repeated observations by canonical player pair, rank direct and
corroborated value-transfer evidence ahead of timing-only evidence, and disclose
the complete pattern and participant composition. It must never achieve that
ordering by removing horse rows.

`ca_collusion_signals` is no longer dormant. Its 104 rows were produced by the
separate seven-day chip-flow detector, and 18 pairs overlapped an open
`collusion_tracking` pair when measured. The Phase 5 queue therefore reads both
sources and makes overlap visible rather than presenting either source as the
whole detector population.

### 2.1 Queue ranking contract

The queue is one row per canonical unordered player pair, not one row per
detector observation. `player_a_id` is the lower UUID and `player_b_id` is the
higher UUID for grouping only; the evidence keeps the detector's original
direction. The active population combines open `collusion_tracking` rows with
`ca_collusion_signals` rows. It reports the total observations, distinct
patterns, detector sources, first and last seen times, maximum suspicion score,
money-flow measures, participant composition and any attached case state.

Ranking is lexicographic and explainable. It never manufactures one decimal
"risk score" from unlike evidence:

1. **Active case.** A pair already attached to an open or investigating case
   remains at the top until the operator resolves it.
2. **Multiple signal families.** Evidence from both source tables or from
   multiple independent pattern families ranks next.
3. **Seven-day money flow.** A `ca_collusion_signals` observation, including
   its separately labelled chip-flow and duel-repeat variants, ranks next.
4. **Chip-dump pattern.** A `collusion_tracking` `CHIP_DUMP` ranks next.
5. **Other non-timing evidence.** `SOFT_PLAY`, `WIN_RATE_ANOMALY` or an
   unresolved anti-cheat flag ranks next.
6. **Timing only.** Pairs whose only evidence is `TIMING_CORRELATION` remain
   reachable and paginated in the final tier.

Within a tier, the stable tie-break order is distinct evidence windows
descending, absolute net flow descending for money-flow tiers, gross flow
descending, evidence sample size descending, last seen descending, then the
two canonical player UUIDs ascending. Null measures sort last. Raw detector
scores are disclosed inside their own family but never compared across
families. The API returns the tier and the reasons that placed the pair there,
so the console can explain the order without reverse-engineering it.

Every response returns unfiltered totals for each tier, pattern and participant
composition before applying an operator's view filters. The default composition
is all players and `p_include_horses` defaults to true. An operator may narrow
the view to horse / horse, horse / human or human / human, but composition never
changes rank and is never an implicit exclusion. A dedicated timing-only view
and its own count keep the 6,078-plus correlated HorseLogic rows visible without
letting them bury chip-flow evidence.

Pagination uses the complete ranking tuple as a cursor rather than offset, with
a bounded page size. The queue state is also explicit: `review_available` when
groups exist, `nothing_to_review` when a healthy producing source has no active
groups, `nothing_produced` when the detector has not produced an observation,
and `unknown` when a source or its health cannot be read. The console must not
infer any of these states from an empty array.

**Therefore I3 (multi-accounting link graph) is DEFERRED**, for the same reason
Phase 4 deferred markers of harm: `signup_abuse_log` and `user_devices` are
both empty, so the graph would have no edges and the panel could not be told
apart from a broken one. It needs the device and signup pipeline first, and
that is not console work. Say so on the tab rather than shipping an empty
graph.

**I5 (bot and RTA indicators) SHIPS NARROWED.** `horse_decision_latency` has 84
rows and there is no equivalent table for humans, so a timing distribution
comparing the two cannot be built honestly yet. What ships is the distribution
that CAN be read from `hand_history.actions[]`, with the horse rows beside the
human ones per section 0 rule 4, and an explicit statement of how many hands it
covers.

## 3. Database

One migration, one transaction, additive only, same discipline as Phase 4.

`ca_integrity_cases` - the case, and the only place a verdict lives.

```
id            uuid primary key default gen_random_uuid()
subject_ids   uuid[] not null          -- one or many; a collusion case has two
kind          text not null            -- 'collusion','chip_dumping','multi_accounting',
                                       -- 'bot_or_rta','abuse','other'
status        text not null default 'open'   -- 'open','investigating','decided','closed'
severity      text                     -- 'low','medium','high'
opened_by     uuid not null
opened_at     timestamptz not null default now()
assigned_to   uuid
decision      text                     -- 'no_action','warned','restricted','confiscated'
decision_note text
decided_by    uuid
decided_at    timestamptz
created_at    timestamptz not null default now()
```

`ca_integrity_case_items` - the evidence, immutable once attached:
`(case_id, item_type, item_ref, detail jsonb, added_by, added_at)`. `item_type`
in `('collusion_row','flag','hand','restriction','note','observation')`.
Evidence is APPENDED and never edited; a mistaken attachment is retracted with
a retraction row, never deleted, for the same reason Phase 4 soft-deletes a
note.

`ca_integrity_sanctions` - the sanction ledger (I8):
`(id, case_id, subject_id, kind, amount, restriction_id, approval_id,
applied_by, applied_at, reversed_at, reversed_by, note)`. `kind` in
`('warning','restriction','confiscation')`. A `restriction` sanction carries
the `ca_player_restrictions.id` it created rather than duplicating the state -
there is ONE restriction record on this platform and Phase 4 owns it.

RPCs, all SECURITY DEFINER, service_role only, ACL restated in the file, reads
audit nothing:
`fn_ca_integrity_queue`, `fn_ca_integrity_case_open`,
`fn_ca_integrity_case_add_item`, `fn_ca_integrity_case_assign`,
`fn_ca_integrity_case_decide`, `fn_ca_integrity_pairs` (the chip-dumping
matrix), `fn_ca_integrity_timing` (I5), `fn_ca_integrity_detector_health`
(section 0 rule 1 - the freshness every panel renders).

## 4. Console

New route `/api/horses/integrity-admin`, sections `queue`, `case`, `pairs`,
`flags`, `timing`, `hands`, `health`; actions `open_case`, `add_item`,
`assign`, `decide`, `sanction`.

Permissions: reads `players.read`; case writes `moderation.write`; a
`confiscation` sanction additionally requires `money.write` AND goes through
the Phase 2 approvals queue as kind `sanction`, because it moves chips.

New tab `integrity`, label "Integrity", code split, permission `players.read`.

Every section renders the detector-health banner from
`fn_ca_integrity_detector_health` before its own content.

## 5. Tests

The four-file split, plus a law file
`__tests__/horses-phase5-integrity-is-honest.law.test.mjs` pinning:

- No integrity read excludes a horse, and every `p_include_horses` defaults true.
- Every queue distinguishes empty-clean from empty-unproduced from unknown.
- The freshness banner is derived from a live read, never a constant.
- Nothing in the phase restricts, sanctions or moves a chip as a side effect
  of a detector row; a decision is always a human write.
- Evidence is append-only: no path deletes a case item.

## 6. Verification before Phase 6

The detector is producing again and its liveness is visible in the console;
migration applied, registered and dry-run first; a rolled-back production sim;
console tests, all gates and the build green; branch pushed; an adversarial
review pass with its findings closed; and the panel RENDERED IN A BROWSER at
desktop and 375px before the phase is called done - Phase 4 proved that step
finds defects the tests cannot.
