-- ============================================================================
-- trivia-playtest-verify.sql
-- Verification queries for Steps 6 and 7 of the Trivia Phase-4 briefing.
-- READ ONLY - every statement is a SELECT. Safe to run any number of times.
--
-- HOW TO USE
--   Play the modes first, then run these. The point is that "it looked fine on
--   screen" is not evidence: a client-computed score and a server-graded one
--   render identically. These queries check what actually landed in the DB.
--
--   Set your test user id once:
--     \set uid '00000000-0000-0000-0000-000000000000'
--   or replace :'uid' inline. Queries default to the last 6 hours.
-- ============================================================================


-- ── 1. STEP 6 SCOREBOARD - one row per mode you played ──────────────────────
-- Expect: 9 rows (daily, mixed, time-attack, endless, survival, mtt, cash, icm,
-- gto). A mode missing here never wrote a session: it did not grade server-side.
select
    mode,
    count(*)                                              as runs,
    max(created_at)                                       as last_run,
    count(*) filter (where status = 'submitted')          as submitted,
    count(*) filter (where status <> 'submitted')         as not_submitted,
    count(*) filter (where submitted_at is null)          as never_submitted,
    max(correct_count)                                    as best_correct,
    max(array_length(question_ids, 1))                    as questions_served,
    sum(coalesce(diamonds_awarded, 0))                    as diamonds_paid
from trivia_sessions
where user_id = :'uid'
  and created_at > now() - interval '6 hours'
group by mode
order by mode;


-- ── 2. RED FLAGS - anything returned here is a defect ───────────────────────
-- Each row names the mode and what is wrong with it.
select mode, id, created_at, issue from (
    select mode, id, created_at,
        case
            -- Paid modes must serve a full deck. A short deck means the pool
            -- query or the exclude list starved it.
            when mode <> 'daily' and coalesce(array_length(question_ids, 1), 0) < 10
                then 'served ' || coalesce(array_length(question_ids, 1), 0) || ' questions, expected 10'
            -- A submitted run with no grade is the signature of a client-graded
            -- run that never reached /api/trivia/session-submit.
            when status = 'submitted' and correct_count is null
                then 'submitted but correct_count is NULL - not graded server-side'
            -- Answers must be persisted for the server to have graded them.
            when status = 'submitted' and (answers is null or answers = '[]'::jsonb)
                then 'submitted with no answers recorded'
            -- diamonds_awarded NULL (not 0) means the payout step never ran.
            when status = 'submitted' and diamonds_awarded is null
                then 'submitted but diamonds_awarded is NULL - payout step did not run'
            when coalesce(diamonds_awarded, 0) < 0
                then 'negative diamonds_awarded'
            -- Left mid-run: fine once, suspicious as a pattern.
            when status <> 'submitted' and created_at < now() - interval '30 minutes'
                then 'abandoned in status=' || status
        end as issue
    from trivia_sessions
    where user_id = :'uid'
      and created_at > now() - interval '6 hours'
) f
where issue is not null
order by created_at;


-- ── 3. NO CLIENT-SIDE MINT - the whole point of the Phase-4 cleanup ─────────
-- Every trivia credit must carry a server-issued reference_id. The deleted
-- browser path wrote type='trivia_reward' with a getIdempotencyKey reference.
-- Anything here that is NOT attributable to a server route is a resurrection
-- of the client mint. Expect: rows only from award_trivia_run / session-submit
-- / pvp settlement.
select
    type,
    transaction_type,
    source,
    count(*)                              as txns,
    sum(amount)                           as total_diamonds,
    min(created_at)                       as first_seen,
    max(created_at)                       as last_seen,
    -- A NULL reference_id cannot be deduped and is the classic client-mint tell.
    count(*) filter (where reference_id is null) as null_reference_ids,
    (array_agg(distinct left(coalesce(reference_id, '<null>'), 40)))[1:5] as sample_refs
from diamond_transactions
where user_id = :'uid'
  and created_at > now() - interval '6 hours'
group by type, transaction_type, source
order by last_seen desc;


-- ── 4. DOUBLE-PAY CHECK - idempotency actually working ──────────────────────
-- Any reference_id appearing more than once means a retry credited twice.
-- Expect: zero rows.
select reference_id, count(*) as times_paid, sum(amount) as total, min(created_at), max(created_at)
from diamond_transactions
where user_id = :'uid'
  and created_at > now() - interval '6 hours'
  and reference_id is not null
group by reference_id
having count(*) > 1
order by count(*) desc;


-- ── 5. ENTRY CHARGE - paid modes must debit before questions load ───────────
-- Expect one negative amount per paid run, before that run's payout.
select id, type, amount, description, reference_id, created_at
from diamond_transactions
where user_id = :'uid'
  and created_at > now() - interval '6 hours'
  and amount < 0
order by created_at;


-- ============================================================================
-- STEP 7 - PvP END TO END
-- ============================================================================

-- ── 6. MATCH LIFECYCLE - must reach 'completed' ─────────────────────────────
-- The briefing expects active -> settling -> completed. This shows where it
-- stopped. A match stuck in 'settling' means neither the sweep
-- (/api/cron/pvp-settle) nor the route (/api/trivia/pvp-settle-match) ran.
select
    id, status, stake_amount,
    challenger_id, opponent_id, player1_id, player2_id,
    challenger_score, opponent_score, player1_score, player2_score,
    winner_id, created_at, completed_at,
    case
        when status = 'completed' and completed_at is null then 'completed but completed_at NULL'
        when status = 'completed' and winner_id is null and challenger_score = opponent_score then 'draw (expected refunds)'
        when status = 'completed' and winner_id is null then 'completed with no winner and not a draw'
        when status <> 'completed' and created_at < now() - interval '30 minutes'
            then 'STUCK in ' || status || ' - settlement never ran'
    end as issue
from trivia_pvp_matches
where created_at > now() - interval '6 hours'
order by created_at desc
limit 20;


-- ── 7. EXACTLY ONE PAYOUT PER PLAYER PER MATCH ──────────────────────────────
-- The briefing's acceptance criterion. Expect exactly one row per human player
-- per completed match, reference pvp_payout_<matchId>_<userId> or
-- pvp_refund_<matchId>_<userId>. Two rows for one player is a double-pay;
-- zero rows for a completed match is an unpaid winner.
with m as (
    select id from trivia_pvp_matches
    where created_at > now() - interval '6 hours'
)
select
    substring(dt.reference_id from 'pvp_(?:payout|refund)_([0-9a-f-]{36})') as match_id,
    dt.user_id,
    count(*)     as payout_rows,
    sum(dt.amount) as total_paid,
    string_agg(distinct dt.reference_id, ' | ') as refs,
    case when count(*) > 1 then 'DOUBLE PAID' else 'ok' end as verdict
from diamond_transactions dt
where dt.created_at > now() - interval '6 hours'
  and dt.reference_id like 'pvp\_%'
group by 1, 2
order by 1, 2;


-- ── 8. PvP SESSIONS - one per participant ───────────────────────────────────
-- Expect two rows, mode='pvp', one per player, both graded.
select id, user_id, mode, status, correct_count, diamonds_awarded, created_at, submitted_at
from trivia_sessions
where mode = 'pvp'
  and created_at > now() - interval '6 hours'
order by created_at desc
limit 10;


-- ============================================================================
-- KNOWN GAP - NOT A REGRESSION, DO NOT CHASE
-- Atomic PvP matchmaking pairing: if two players join simultaneously each may
-- create a separate match row. Explicitly scoped OUT of the Phase-4 migration
-- and already recorded in .agent/audits/2026-08-12-trivia-phase4-cleanup.md.
-- If query 6 shows two half-empty matches created within a second of each
-- other, that is this gap - not something this pass introduced.
-- ============================================================================
