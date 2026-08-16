# HANDOFF: Validate and enable server-authoritative trivia grading (arcade first)

**Created:** 2026-08-05 by Claude (Cowork session)
**For:** Antigravity (or any agent with a working browser automation path)
**Why a handoff:** every piece of this is built, deployed and DB-verified. The
only thing left needs a real browser playing a real game while signed in.
The Cowork session could not do it: the Claude-in-Chrome extension is not
connected, Chrome is granted read-only to computer-use, and the desktop-shell
guard blocked every click into the Smarter.Poker PWA. Keyboard-only
navigation reached the auth gate and stalled there. This is a genuine
tool-capability gap, not a scope dodge.

---

## STATE OF THE WORLD (verified, do not re-derive)

**Everything server-side is shipped, deployed and tested.** Production
`/api/health` served SHA `cde66bf0` at 2026-08-06T00:49Z. `main` tip is now
`7151511a`.

Commits, in order:

| SHA | What |
|---|---|
| `2335f765` + `98efe570` | Daily roster 20 -> 10 (daily mode ONLY, Dan's call) |
| `26fe51d1` | Server infra: migration, session-answer route, arcadeStakes lib, session-submit precedence |
| `1043ac5f` | useServerGradedRun grows `answer()` + `cashedOut` submit |
| `47d17d74` + `b611ed9e` | TriviaGame `serverGrader` prop + [mode].js session wiring (shipped DARK) |
| `cde66bf0` | Flipped arcade ON |
| `7151511a` | **Reverted the flip back to dark** - see "Why it was reverted" below |

**Database (project `kuklfnapbkmacvwxktbh`):**
- `20260804210000_trivia_server_grading` - APPLIED (was already applied by a
  prior session; confirmed by live probe: table exists, `award_trivia_run`
  returns 42501 to anon).
- `20260803190000_trivia_history_update_policy` - APPLIED (policy
  `trivia_history_update_own` confirmed present in `pg_policies`).
- `20260805090000_trivia_session_answers` - APPLIED this session via Supabase
  MCP `apply_migration`; in the ledger; column + RPC verified.
- `record_trivia_session_answer()` passed a 6-case live test suite (fresh
  answer, first-answer-wins on repeat with a different index, answer ordinal
  sequencing, skip handling, off-roster rejection, ownership isolation,
  closed-session rejection) - all inside a transaction that was rolled back.

**`trivia_sessions` has ZERO rows.** Nobody has ever played a server-graded
run. That is the entire remaining risk.

### Why the flip was reverted

`cde66bf0` turned arcade on in production without any play-through. Arcade is
a PAID mode (10 diamonds to enter). An unvalidated paid-entry path should not
sit live, so `7151511a` closed the gate again. Nothing else was rolled back -
the routes, the migration and the hook are all still deployed and working.
Re-enabling is a one-line change.

---

## WHAT YOU NEED TO DO

### TASK 1 (the blocker): play one arcade round on the flagged URL

Sign in as the test account and play a full arcade run at:

```
https://smarter.poker/hub/trivia/arcade?serverGrading=1
```

Test account: `daniel@bekavactrading.com` / `<TEST_USER_PASSWORD — see .env.local, never commit>`

The `?serverGrading=1` query flag activates the server-graded path for that
one session without enabling it for anyone else. No other user is affected
while you test.

**What MUST be true (fail any one of these and do not flip the gate):**

1. The lobby loads and Start charges 10 diamonds exactly once.
2. Each answer tap shows right/wrong feedback after a short delay
   (~100-300ms is expected - it is a server round trip now, not instant).
3. The correct option highlights correctly, and the wrong-answer shake and
   the explanation panel behave as they always did.
4. The stake pot builds on correct answers and busts to 0 on a wrong one,
   with the same numbers as before (1,2,3.. x streak multiplier).
5. Cash Out (available from question 6) pays the pot shown.
6. On completion, the diamonds on the results screen EQUAL the diamonds
   actually added to the balance. Check the balance before and after.
7. **No double-pay.** The whole point: the client must not credit anything.
   Verify in SQL after the run (see TASK 2).
8. Hints are hidden/disabled during a server-graded run (expected: the 50/50
   hint needs the answer key client-side, so it is deliberately off).

**Also worth trying:** answering a question, then reloading mid-run. The
first answer is binding server-side, so the verdict must not change.

### TASK 2: verify the run in SQL

Run these against project `kuklfnapbkmacvwxktbh` (Supabase MCP `execute_sql`
or the dashboard SQL editor):

```sql
-- The session the run created. Expect status='submitted', an answers map
-- with one entry per answered question, and sane score/diamonds.
SELECT id, mode, status,
       array_length(question_ids, 1) AS n_questions,
       (SELECT count(*) FROM jsonb_object_keys(answers)) AS n_answers,
       score, correct_count, diamonds_awarded, created_at, submitted_at
FROM trivia_sessions
ORDER BY created_at DESC
LIMIT 5;

-- CRITICAL: exactly ONE diamond credit for that run, from the server RPC.
-- A second row (reference id starting 'trivia_arcade_game_complete_') means
-- the client also paid = double-pay = STOP, do not flip the gate.
SELECT amount, type, description, reference_id, created_at
FROM diamond_transactions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'daniel@bekavactrading.com')
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

The server credit's `reference_id` looks like `trivia_session_<uuid>`. That
should be the ONLY credit for the run.

### TASK 3: flip the gate (only if TASK 1 and 2 both pass clean)

In `pages/hub/trivia/[mode].js`, around line 88:

```js
const SERVER_GRADED_PAGE_MODES = new Set([]);
```
becomes
```js
const SERVER_GRADED_PAGE_MODES = new Set(['arcade']);
```

Update the comment above it to say arcade is live and validated as of the
date you tested, and that remaining modes adopt one at a time. Commit
message: `feat(trivia): enable server-authoritative grading for arcade
(validated by live play-through)` and note the test evidence in the body.

Then ship it with `bash scripts/git-safe-push.sh "<message>"` and confirm
production `/api/health` serves your SHA before claiming done.

### TASK 4 (after arcade is stable a day or two): the remaining modes

Adopt one mode at a time, same pattern, testing each with
`?serverGrading=1` before adding it to the set. Suggested order (lowest
risk first): `mixed` -> `history`/`rules`/`pro` -> `daily` ->
`endless`/`survival`/`time-attack`.

**Do not half-adopt a mode.** A page must take the server branch entirely or
not at all; a server session plus the old client crediting pays twice. The
guard in `[mode].js` is `useServerPayout` - keep everything behind it.

Note: `endless`, `survival`, `time-attack` and `mixed` live on their OWN
pages (`pages/hub/trivia/endless.js` etc.), not under `[mode].js`, so they
each need the same wiring done separately. `survival-game.js` and
`StrategyTrivia.jsx` are the other client-graded surfaces.

### TASK 5 (separate, unblocked, and worth doing): pool depth

Measured 2026-08-05. Requirement is 1,200 servable (`quality_score >= 6`)
per dedicated category:

| Category | Servable | Margin |
|---|---|---|
| icm_chip_ev | 1,550 | +350 |
| cash_game_situations | 1,549 | +349 |
| mtt_situations | 1,549 | +349 |
| gto_theory | 1,545 | +345 |
| gto_scenarios | 1,530 | +330 |
| **rule_knowledge** | **301** | **-899** |
| poker_history | 294 | short of its ~420 need |
| tournament_facts | 277 | short of its ~600 need |
| famous_hands | 259 | short of its ~420 need |
| player_profiles | 254 | short of its ~420 need |

The generator IS producing (~170 questions/day across all categories, 30-40
per category in the last 48h) - so the autonomous pipeline is confirmed
working. But `rule_knowledge` backs the entire Rules mode at 20/day and sits
at 301. At its current ~18/day it needs ~7 weeks to reach 1,200.

**Suspected bug worth investigating:** the adaptive-volume planner in
`pages/api/cron/generate-trivia.js` is supposed to scale a short category's
quota from `GENERATE_PER_CATEGORY` (10) up to `ADAPTIVE_MAX_PER_CATEGORY`
(30) proportionally to its shortfall. `rule_knowledge` has by far the
largest shortfall of any category yet produced only 37 in 48h (~18/day),
roughly half the 30/run ceiling. Either the planner is not seeing the
shortfall correctly or the run is being capped elsewhere. Check
`buildDepthReport()` and the quota planner around line 952.

Also: `last_audited_at` is null on essentially every row - Phase D self-audit
only started 2026-08-04, so this is expected, not a bug. Worth re-checking in
a week to confirm it is actually marking rows.

---

## THINGS THAT WILL BITE YOU

- **`StrategyTrivia.jsx` is NOT dead code.** An old audit claimed nothing
  imports it. It actually powers `cash.js`, `icm.js` and `gto.js`. Deleting
  it breaks those modes.
- **PvP is still fully client-authoritative** (`pvpMatchmaking.js:296` writes
  whatever score the client sends) and horse matches pay house money on a
  self-reported win. That is a live mint loop, separate from all of the above
  and NOT addressed by any of this work. It needs its own server-grading
  pass. `useServerGradedRun` deliberately refuses `pvp` and `tournaments`
  (they settle through their own routes).
- **Blob-SHA verify every push if you use the GitHub MCP.** Transcribing
  files with box-drawing comment rules through `push_files` silently
  shortens those unicode runs (happened three times this session, always
  cosmetic, always caught by comparing `git hash-object` to the returned
  blob sha). If you have working `git push`, just use `git-safe-push.sh`.
- The `answers` column ordinal `n` preserves answer ORDER, which is what
  lets the server recompute arcade's sequence-dependent stake pot. Do not
  "optimize" it away.

## FILE MAP FOR THIS WORK

```
supabase/migrations/20260804210000_trivia_server_grading.sql   applied
supabase/migrations/20260805090000_trivia_session_answers.sql  applied
pages/api/trivia/session-start.js     serves questions, no answer key
pages/api/trivia/session-answer.js    binding first answer + verdict
pages/api/trivia/session-submit.js    grades, recomputes arcade pot, pays
src/lib/trivia/arcadeStakes.js        shared stake-pot rules
src/hooks/useServerGradedRun.js       client adapter (start/answer/submit)
src/components/trivia/TriviaGame.jsx  serverGrader prop
pages/hub/trivia/[mode].js            the gate + session lifecycle
.agent/audits/2026-08-05-trivia-server-grading-continuation.md  session record
TRIVIA_ECONOMY_MIGRATION_SPEC.md      original design doc
```
