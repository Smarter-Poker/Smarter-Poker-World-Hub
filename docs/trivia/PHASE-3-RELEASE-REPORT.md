# Trivia Casino Realism — Phase 3 Release Report

Question quality, deterministic selection, and session integrity.

Owner: `p3-questions` (for root; product owner Dan) · Date: 2026-09-30 · Production project `kuklfnapbkmacvwxktbh`

**Flags turned on: none.** PvP, PvP horses, tournaments and tournament horses stay off. The new
engine for solo play ships dark (`TRIVIA_P3_SOLO_ENGINE_V3`, default off). The free-mode legacy
fallback is off (`TRIVIA_FREE_LEGACY_FALLBACK_ENABLED`, default off). The new selector runs in
shadow beside today's selection and only records comparisons (`TRIVIA_P3_SHADOW_SELECTOR`, on
unless set to `false`).

## What now exists

**One definition of an eligible question, owned by the database.** A question may be served in
paid or competitive play only when it passed the audit, scores 7 or better (provisional), is well
formed, is the one kept copy of any duplicate, is not quarantined, has no open counted report, is
explicitly allowed for the mode, and, for timed play, can be read inside the clock (at least 8
seconds, or words ÷ 4 + 5). Every paid and competitive read uses that definition
(`trivia_eligible_questions_serving_v1`): solo pools, the daily roster, PvP seeding, the
generator's tagging pass and the new engine. Before this release 1,151 unverified questions could
reach paid play. Now 14,829 of 25,354 questions are eligible, and none of them breaks a rule.

**Curation records.** Every question has an append-only revision history (25,354 baseline
revisions) and one curation row: its source, last review, the modes and clocks it fits, its report
state and any quarantine reason. Quarantine records cannot be deleted or released twice. Review
records are append-only and keep the reviewer, model, version, evidence and time. The daily
generator's self-audit now claims deterministic review batches and records each verdict through
the database. The database decides the effect: verified; failed and demoted; demoted after three
inconclusive reviews; quarantined for broken structure; or not applied because the question
changed after it was reviewed. 1,187 questions wait in that queue.

**Duplicates.** 3,930 duplicate copies are now aliases of 21,424 canonical questions. No question
row was deleted, so history keeps its links, and only the canonical copy can be served.

**Reports.** The existing Report button now goes through one rate-limited database step. A report
counts only when the reporter is an established human (account at least 24 hours old, not a horse)
who was actually shown the question. One counted report removes the question from paid and
competitive play at once. Three counted reporters quarantine it. Each player may send 10 reports a
day and hold 25 open. Operations triage the restricted queue at
`/api/admin/trivia-question-reports` (admin secret only), marking each report upheld, dismissed or
duplicate.

**Deterministic engine (`trivia-engine/3`).** Rosters, option order and grading are decided in the
database from a server secret the browser never sees:

- The same scope (a match, a tournament round, a daily date) always gets the same balanced roster.
  Categories are rotated and difficulty is split 20/50/30. Fresh questions come first, then
  questions under a shared cooldown, then questions the players have already seen.
- Every player gets a private option order.
- Answers and timing are judged in the database. It refuses duplicate answers, foreign questions,
  out-of-range choices, the old self-graded request shape, client timing fields, late answers
  (beyond a 1.5-second grace) and answers to another player's session.
- Competitive sessions hide verdicts until the scope closes. The grader refuses open PvP and
  tournament sessions, so it cannot be used as an answer oracle.
- Sessions, timers and submissions carry signed, versioned contracts (`trivia-session/1`,
  `trivia-timer/1`, `trivia-submission/1`).
- Each competitive seat has one active session, with reconnect. Start, answer, submit, stats,
  achievements and reward are all retry-safe.
- Tournaments get a preflight that reserves unique questions for every round. A 256-player
  bracket needs 8 rounds × 10 = 80 questions and a 512-player bracket needs 90. 13,229 eligible
  questions fit the 20-second shot clock.

**Sessions tidied.** 11 stale open sessions were expired and recorded. 2 open PvP sessions are held
untouched because they are evidence for quarantined matches. Of the 5 old sessions that were
submitted without stats, 4 were verified and backfilled at session level. The fifth is a PvP
session and was refused for the same held-evidence reason.

**Stray entry charge closed.** `/api/diamonds/spend` used to accept a `trivia_entry` charge,
which could take diamonds without opening a session. Nothing in the app sent it and no such charge
has ever been recorded, so the route now refuses it by name (`trivia_entry_charged_at_session_start`).
The only Trivia entry charge left is the one the database makes inside the session start.

**Achievements.** The 30 achievement criteria now live in the database, and the engine records
achievement events. No diamond reward is displayed for any achievement.

**Monitoring.** The existing daily pool guard (13:30 UTC) now expires stale sessions and runs nine
question and session health checks. It raises alerts through the platform alert pattern
(`operational_alert_events`, source `worldhub.trivia-questions`) with stable episode keys, and
records a health run each time. A health run that cannot finish raises its own alert
(`TriviaQuestionHealthCheckFailed`, one per day), so the checks cannot go quiet unnoticed.

## Exit gate

| Gate item | Result | Evidence |
|---|---|---|
| Paid/competitive queries return zero failed, unset, low-quality, incompatible, or duplicate-canonical questions | Production after install: 14,829 served, with 0 unverified, 0 below quality 7, 0 quarantined, 0 duplicate fingerprints, 0 malformed and 0 without modes. The tournament pool is limited to the 13,229 that fit its clock. Every paid read goes through the eligible view | `docs/trivia/evidence/phase3-questions-install-20260930.json` → `production.pool_independent_check`, `replica.results.pool_has_only_verified_quality_canonical_unquarantined` |
| One thousand golden-seed replays are identical | 1,000 of 1,000 identical: across two databases built in opposite row order, across connections, across two independent runs, and against the JavaScript reference engine | `docs/trivia/evidence/phase3-golden-seeds.json`, `__tests__/trivia-phase-3-engine.test.mjs`, `replica.results.golden_1000_*` |
| No public DTO or browser request exposes an answer key or grading oracle | Every browser-facing response of the new engine is checked to be key-free. Competitive verdicts stay hidden until the scope closes, and the grader refuses open PvP and tournament sessions. Browser roles have no read or write on any Phase 3 table or view, no execute on any Phase 3 function, and no read of `trivia_questions` | `replica.results.dto_no_key:*`, `no_grading_oracle_while_competitive_open`, `acl_*`; `production.readback.acl`; `production.browser_roles_on_trivia_questions` |
| Session start/resume/submit survives refresh, two tabs, retry, and process failure without double charge, lost score, or missing stats | On the replica: a start charges once and resumes; parallel starts give one session and one charge; parallel answers, submits and settlements give one result and one award; a failure mid-settlement rolls back and the retry settles once; stats are recorded exactly once. In production after the cleanup: 0 stale open sessions and 0 submitted without stats | `replica.results`: `solo_start_charges_once_and_resumes`, `concurrent_*`, `submit_retry_safe_identical`, `process_failure_rolls_back_then_retry_settles`, `stats_recorded_exactly_once`, `seat_reconnect_resumes_second_session_refused`; `production.operations` |
| The eligible inventory supports the maximum nightly bracket with no question reuse | 256 players: 8 rounds and 80 unique questions needed, 13,229 available, and at least 967 in every category. 512 players: 9 rounds, 90 needed. The replica built both brackets with no repeat | `production.readback.capacity`, `replica.results.tournament_256_eight_rounds_80_unique`, `tournament_512_nine_rounds_90_unique` |
| Question and session domain alerts are active | The nine health conditions compute cleanly in production: healthy, no open condition. The first scheduled run (13:30 UTC on release day) timed out before recording anything; this was fixed the same day (see below). The health check now takes 1.6–4.3 s under the 8 s service limit, and a run that cannot finish raises its own alert. The next scheduled run is the live proof | `production.operations.health`, `post_release`, `replica.results.health_metrics_and_stable_episode_keys`, `pages/api/cron/trivia-pool-guard.js` |

Replica suite: 74 of 74 checks passed in three runs. The third run installed Phase 2 first on a
copy of the production-data replica (`replica.runs`).

## Live verification (2026-09-30)

- Production serves the release: `/api/health` reports the merge commit on `hub-vanguard`.
- Today's daily roster has 10 questions, all in the eligible pool and allowed for daily. The response
  carries only id, question, options, category and difficulty, so no answer key.
- Without sign-in, session answer, session submit, question reports and the admin triage queue all
  refuse (401).
- No Trivia session had started since the release by 11:20 UTC, so the shadow comparison has no
  production rows yet. It records on the next session a player starts.

## Installed migrations

| Version | Name |
|---|---|
| 20260930060554 | `trivia_p3_question_curation` |
| 20260930061357 | `trivia_p3_roster_session_engine` |
| 20260930141736 | `trivia_p3_engine_speed` |
| 20260930142146 | `trivia_p3_health_speed` |

Both files were proven on copies of the production-data replica before install, and both were
installed outside the DDL break window. The first migration's data statements were also rehearsed
on production inside a rolled-back transaction. Each migration asserts its own postconditions, and
all of them passed on install. After install, production's Phase 3 catalog equals the replica's: 54
functions and 7 views with identical definition digests.

## After release: the first scheduled health run

The first scheduled pool-guard run (13:30 UTC) reached the new health check, but the check ran past
the 8-second limit the service account has, so no health run or alert was recorded. Measuring it
showed two slow paths.

- **The health check** read the eligible pool nine times and hashed every question through a
  helper the database cannot inline. It took 4–6 seconds.
- **The tournament preflight** was worse. With entrants who have play history it took 15–16
  seconds for 256- and 512-player brackets, so it could never have run through the service account.
  The database misjudges the size of the eligible pool and so matched it row by row against the
  players' seen questions.

Two forward migrations fixed both the same day (`trivia_p3_engine_speed`, `trivia_p3_health_speed`).
Nothing a caller sees changed: no signature, grant, key or output. Before install, the old and new
versions were run side by side on production data inside rolled-back transactions:

- 60 of 60 rosters were identical, across all 15 profiles, with players' seen questions, scarcity,
  exclusions and oversized counts.
- The 256- and 512-player tournament plans were identical.
- Capacity was identical for every bracket size, and so were the health metrics.

The replica suite then passed 74 of 74 again with the same golden-seed result. Measured through the
service account afterwards:

- the preflight takes about 2.5 seconds;
- a roster takes 0.2–0.3 seconds;
- the health check takes 1.6–4.3 seconds, depending on load.

A health run that cannot finish now also raises its own alert. Evidence: `post_release` in the
evidence file.

## Rollout

- **Stage A (live with this release).** Solo and daily play keep today's session flow, but every
  question is drawn from the eligible view. When the eligible pool cannot fill a paid roster, the
  request fails closed; there is no fallback. The new selector builds the same roster in shadow and
  records the comparison (`trivia_shadow_selector_runs`). Today every solo, PvP and tournament
  profile fills from the eligible pool.
- **Stage B (owner decision).** Setting `TRIVIA_P3_SOLO_ENGINE_V3=true` moves solo play onto the
  deterministic engine. A session always finishes on the engine that started it.
- **Free fallback (owner decision).** Setting `TRIVIA_FREE_LEGACY_FALLBACK_ENABLED=true` lets the
  free modes (daily, history, rules, pro) top up from the relaxed legacy pool. Paid play never
  falls back.
- **PvP and tournaments** stay off. Phases 5 and 6 build on the published roster and session
  interface (`trivia_open_session_v3`, `trivia_preflight_tournament_v1` and the rest).

## Provisional values (the owner may change them with a new policy or profile version)

| Value | Setting |
|---|---|
| Quality threshold | 7 of 10 (eligibility policy 1) |
| Reading time | at least 8 seconds, or words ÷ 4 + 5 seconds |
| Difficulty mix | 20% easy, 50% medium, 30% hard |
| Reports | established = a human account at least 24 hours old that was shown the question; 1 counted report excludes the question from paid play; 3 counted reporters quarantine it; 10 a day and 25 open per player |
| Inconclusive reviews before demotion | 3 |
| Answer grace | 1,500 ms |
| Seen-question window | 60 days |
| PvP profile | 20 questions, verdicts after the match closes, 14-day shared cooldown |
| Tournament profile | 10 questions a round, 20-second shot clock, verdicts after the round closes, 60-day shared cooldown |

## Pending, and why

- **Solo on the new engine and the free fallback** are off until the owner enables them.
- **PvP and tournament play** stay off. They belong to Phases 5 and 6.
- **Ledger-linked rewards.** Phase 2's journal switch is off, so solo rewards keep today's path
  (`award_trivia_run_v2`, same formulas and caps). The new engine feeds it the database's own grade.
- **Held evidence.** 2 open PvP sessions and 1 submitted PvP session stay untouched as evidence for
  quarantined matches until the PvP phase resolves them.
- **Live proof of the alerts.** The next scheduled pool-guard run (13:30 UTC) should record the
  first health run. If it cannot finish, it raises `TriviaQuestionHealthCheckFailed` instead.
- **Backfill depth.** The 4 backfilled sessions predate the 2026-08-16 answer reshuffle, so their
  per-question verdicts cannot be rebuilt. They were verified and recorded at session level: score
  formula, roster, and reward and entry references.

## Findings outside this phase (reported, not fixed)

- **Generation outpaces review.** The generator adds about 50 unverified questions a day, and the
  self-audit reviews about 15. The review queue (1,187) will keep growing. Unverified questions
  never reach paid play, so this limits pool growth, not safety. Raising the review batch size or
  adding a reviewer is an owner decision.
- **Old manual cleanup scripts will be refused.** `scripts/v12-gold-audit.js`,
  `v12-refined-audit.js`, `ante-audit.js`, `deep-cleanup.js`, `sync-cleanup.js`, `full-sweep.js`,
  `option-count-check.js` and `fix-near-duplicates.js` delete rows from `trivia_questions`. Question
  history now blocks deletes, so these scripts will fail. This is intended: retire a question by
  quarantining it.
- **Dead browser fallback.** `pages/hub/trivia/[mode].js` falls back to reading `trivia_questions`
  from the browser. Browser roles have not been able to read that table since Phase 1, so the
  fallback always fails and can be removed.
