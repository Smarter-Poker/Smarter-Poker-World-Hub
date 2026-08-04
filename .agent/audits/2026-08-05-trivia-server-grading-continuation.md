# 2026-08-05 - Trivia server-grading continuation (Cowork session)

Continuation of the 2026-08-04 trivia audit/rebuild handoff. All pushes went
through the GitHub MCP with per-file blob-SHA verification (one transcription
drift caught and resolved - see "Push drift incident" below).

## What was verified (do not re-derive)

- **The server-grading migration (20260804210000) IS applied to production.**
  Probed live via anon-key PostgREST (key extracted from src/lib/authUtils.js,
  public by design): `GET /rest/v1/trivia_sessions` returns `[]` (table exists,
  RLS holds) and `GET /rest/v1/rpc/award_trivia_run?p_...` returns 42501
  "permission denied" (function exists, anon EXECUTE revoked). Whoever pushed
  9ce484f8 "feat: enable server grading" (flag=true, 2026-08-04 15:55 CDT)
  evidently applied it. SERVER_GRADING_ENABLED=true is safe: no page imports
  useServerGradedRun yet.
- **Unknown: whether 20260803190000_trivia_history_update_policy is applied.**
  pg_policies is not probeable via anon REST. Check on next DB access:
  `SELECT policyname FROM pg_policies WHERE tablename='trivia_user_question_history';`
- Pool-depth numbers still not obtained (needs SQL access; the query is in the
  2026-08-04 handoff and in TRIVIA_ECONOMY_MIGRATION_SPEC.md section 5).

## Decisions by Dan (2026-08-05)

1. **Daily roster drops to 10, DAILY MODE ONLY.** Dedicated modes
   (rules/mtt/cash/icm) intentionally stay at 20/run, so the 1,200/category
   pool-depth requirement is UNCHANGED. (The 2026-08-04 handoff's claim that
   dropping the daily roster halves the requirement to 600 was wrong - the
   1,200 comes from the dedicated modes' 20/day, not from daily.)
2. **Per-answer round trip** for server-graded instant feedback (vs end-of-run
   reveal). First answer is binding; verdict revealed only after it persists.

## Shipped this session (all on main, blob-SHA verified)

- 2335f765 + 98efe570: daily roster 20 -> 10. triviaEngine.ts daily
  questionsCount/description; /api/trivia/daily ROSTER_SIZE. Client [mode].js
  needed no change (slices to modeConfig.questionsCount).
  ROSTER_TAG_PER_CATEGORY stays 3 (1 served slot + 2 headroom).
- 26fe51d1: per-answer server grading infrastructure. NO callers yet - prod
  behavior unchanged until page adoption:
  - supabase/migrations/20260805090000_trivia_session_answers.sql -
    trivia_sessions.answers jsonb + record_trivia_session_answer()
    (first-answer-wins, service-role only). **NOT YET APPLIED.**
  - pages/api/trivia/session-answer.js - records binding answer, returns
    verdict + explanation.
  - src/lib/trivia/arcadeStakes.js - stake-pot rules extracted from
    TriviaGame.jsx (STAKE_VALUES, multiplier from streak BEFORE the answer,
    bust on wrong, skip neutral, cash-out floor 6 answered).
  - pages/api/trivia/session-submit.js - server-recorded answers override the
    client array; arcade payout = server-recomputed pot (0 for abandoned runs
    without legitimate cash-out), clamped 50/run + 40/day.

## Remaining (priority order)

1. Apply 20260805090000_trivia_session_answers.sql (and confirm
   20260803190000). Route: Supabase MCP apply_migration (connector suggested
   to Dan, not yet connected) or the already-logged-in dashboard SQL editor
   tab. session-answer/session-submit 500 if called before this - fine, zero
   callers.
2. Pool-depth query + new_48h pipeline check (same access).
3. Page adoption: [mode].js + TriviaGame async verdicts, arcade first, behind
   an adopted-modes set so it ships dark; flip after browser-testing with the
   test account. A page must fully adopt or not at all - the old
   add_diamonds_to_balance path must be skipped for server-graded runs or the
   run pays twice.
4. PvP is STILL client-authoritative (pvpMatchmaking.js:296) - separate work.

## Push drift incident (technique note)

Transcribing daily.js (33.9KB, box-drawing comment rules) through push_files
dropped 4 chars from each of 9 unicode rule lines (108 bytes). Caught by
blob-SHA comparison; proven cosmetic-only by locally replaying the shortening
(transformed hash == pushed blob 644a1fc7). Local file was synced to match
origin. Lesson unchanged from the handoff: hash-object before push, compare
GitHub's returned blob SHA, and keep NEW files pure ASCII (all four files in
26fe51d1 transcribed byte-exact on the first attempt).

## Environment notes (this session)

- Cowork sandbox: no network at all (github/supabase both unreachable).
  GitHub MCP works. No Supabase MCP connected yet.
- Control_Chrome MCP: list_tabs/open_url work; get_page_content and
  execute_javascript return "Chrome is not running" (the known dead state).
  Workaround for GET probes: open_url + computer-use screenshot/zoom (Chrome
  is read-tier). Supabase REST accepts ?apikey= as query param; cowork
  web_fetch rejects such URLs as too long.
- Claude-in-Chrome extension not connected/signed in.
