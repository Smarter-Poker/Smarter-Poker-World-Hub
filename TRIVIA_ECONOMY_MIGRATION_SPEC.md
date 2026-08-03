# TRIVIA SERVER-AUTHORITATIVE ECONOMY — MIGRATION SPEC
**Date:** 2026-08-03 · **Author:** Claude (full trivia audit session)
**Status:** The 22 page-level fixes shipped in `b147cd9d85` close the accidental-loss and honest-player bugs. The items below are the *structural* holes that page-level code cannot close. They involve real currency and should ship as one coordinated migration.

---

## 1. The core problem (one sentence)

Every solo game mode grades answers **in the browser**, ships the **answer key** (`correct_index`) to the client, computes its own reward, and credits itself by calling the `add_diamonds_to_balance` RPC with an **arbitrary positive amount** — so any authenticated user can mint diamonds from the devtools console in one line, and every leaderboard score is forgeable.

Evidence (all verified on current code):
- `survival-game.js`, `endless.js`, `mixed.js`, `time-attack.js`, `[mode].js` — client-side grading + direct `supabase.rpc('add_diamonds_to_balance', { p_amount: <client-computed>, p_reference_id: <client-chosen> })`.
- `triviaQuestionLoader.js` `POOL_COLUMNS` includes `correct_index, explanation` (self-acknowledged in its own comments).
- Daily caps (`diamondCap.js`) run client-side and **fail open** (query error → "0 earned today").
- PvP (`pvpMatchmaking.js:296`): winner determined by comparing two **self-reported** scores; horse matches pay **house money** on a self-reported win.
- `/api/trivia/submit` — the server-grading endpoint — exists but has **zero callers**, and wiring it up naively would misgrade everything because `shuffleOptions` discards the permutation (client index space ≠ DB index space).

## 2. Target design

One server-authoritative session flow, reused by every mode:

1. **Serve without answers.** `fetchRandomQuestionPool(..., { withoutAnswers: true })` already exists (`POOL_COLUMNS_NO_ANSWER`). Server route creates a `trivia_sessions` row: `(id, user_id, mode, question_ids[], permutations jsonb, entry_ref, created_at)`. Options are permuted **server-side** per session (the tournament pipeline already does exactly this — copy `tournament-round-questions.js`'s pattern).
2. **Client submits display-indices.** `POST /api/trivia/submit` body: `{ sessionId, answers: [{questionId, displayIndex}] }`. Server maps display→original via the stored permutation, grades against `correct_index`, and rejects any questionId not in the session (this also kills the current "grade arbitrary IDs" hole in submit.js).
3. **Award in the same transaction.** A `SECURITY DEFINER` RPC `award_trivia_run(session_id)` computes the reward server-side from graded results, applies the per-mode daily cap **in SQL**, writes `trivia_scores`, the diamond ledger row, and `trivia_user_question_history` atomically. Idempotent on `session_id`.
4. **Lock the mint.** Revoke `authenticated` execution of `add_diamonds_to_balance` for positive amounts (or wrap it: positive credits only via SECURITY DEFINER functions; client keeps only spend paths, which are already server-checked against balance).
5. **Instant feedback stays.** The client can keep per-question feedback by having submit accept incremental batches (endless), or by returning per-question verdicts on each submit call. Latency budget: one round-trip per answer is fine at 24s/question; endless can batch every N answers with optimistic UI.

**Effort:** ~2-3 days. One migration (sessions table + RPC + grants), one shared client hook, five call-site swaps. The tournament pipeline is the proven in-repo template.

## 3. PvP-specific (real stakes, highest urgency after §2)

- **Server grading:** PvP questions must be served without `correct_index` and graded server-side (§2 flow with `matchId` as the session). Client-submitted `score` in `submitMatchScore` must die.
- **Settlement sweep:** a cron tick (pattern: `tournament-lifecycle.js`) that force-settles `trivia_pvp_matches` stuck `active` past deadline: forfeit the no-show, refund both if neither submitted. Idempotent per-match reference ids (already the house style). Today an opponent disconnect **permanently locks the player's stake** — the page-level fix only made the UI honest about it.
- **Atomic pairing:** matchmaking currently lets both players create separate match rows on simultaneous join. Replace `findMatch`'s client-side insert with one RPC that pairs the two oldest waiters under a unique constraint and returns the same match to both.
- **Horse economics:** until server grading lands, house-funded horse payouts are a minting loop for anyone who edits `playerScoreRef`. Consider capping horse winnings or disabling real-stake horse matches in the interim.

## 4. Tournament payout retry

`tournament-lifecycle.js` flips `active→completed` **before** paying, and never revisits `completed` tournaments — a single failed `moveDiamonds` call means that entrant is never paid (log line literally says "manual settlement required"). Per-user payout refs already make retries safe; add a `payout_pending` re-sweep so the engine actually retries. ~1 hour of work.

## 5. History & pool integrity

- **RLS:** add an UPDATE policy (`user_id = auth.uid()`) on `trivia_user_question_history` so `seen_at` refreshes on legitimate replays. Three pages currently work around the missing policy with `ignoreDuplicates: true`, which leaves stale `seen_at` values that let a day-59 replay re-serve two days later.
- **Cron over-tagging:** the roster cron tags **200 rows/day** (20 × 10 categories) with `daily_date` + `last_used_at`, but the daily endpoint now serves exactly 20. The other 180/day are locked out of rotation for 60 days for nothing — ~10,800 questions, most of the pool target. Cut `ROSTER_PER_CATEGORY` to 2 (or tag only served rows).
- **Pool depth verification (blocked on admin login):** the 60-day guarantee needs ≥1,200 servable (qs≥6) questions per dedicated category, ≥15,000 total — and a daily endless grinder can mathematically exceed any realistic pool (1,000 q/session cap). Ship the oldest-seen-first degradation as an acknowledged rule, and run the depth queries (list in the audit report) from `/admin/trivia-pool` once logged in.
- **Fact-check hookup:** cron-generated questions (`source='cron-generate:grok-3-mini'`) were invisible to the Phase-52 audit filters — the dashboard side is fixed in `b147cd9d85`-adjacent commits; verify the **audit cron itself** (workers VM, `/cron/generate-trivia-questions` era) uses the same corrected filter, else AI questions serve unaudited forever.
- **Near-dup dedup:** generation dedup is exact-normalized-text only; the `embedding` column exists — add a cosine-similarity gate at insert to stop paraphrase inflation of pool counts.

## 6. Smaller items worth batching in

- `diamondCap.js` fails **open** on query error — flip to fail-closed once awards are server-side (moot after §2).
- `shuffleOptions` should emit its permutation (`q._order`) so any interim client→submit wiring maps indices correctly.
- `StrategyTrivia.jsx` (117KB) is dead code — no page imports it; its timer/lifeline/cap hardening is unreachable. Decide: delete, or restore the dedicated strategy-mode pages that used it.
- Endless post-`gameOver` displays: survival HUD double-counts speed bonuses (visual only).
- Marketing copy: daily banner says "10 questions", roster is 20.

## 7. Suggested sequence

1. §4 tournament payout retry (1h, zero risk, real money owed).
2. §2 core migration behind a flag, mode by mode: arcade → category modes → endless/survival/mixed → daily.
3. §3 PvP grading + sweep + pairing RPC.
4. §5 RLS policy + cron tagging cut + audit-filter verification.
5. §6 cleanup batch.
