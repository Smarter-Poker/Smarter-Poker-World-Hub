-- ===========================================================================
-- fn_training_leaderboard_record — the atomic leaderboard writer
-- ===========================================================================
--
-- WHY THIS FILE EXISTS, GIVEN THE FUNCTION IS ALREADY LIVE.
--
-- This function has been running in production since 0589ed07 ("route
-- save-progress writes through atomic fn_training_leaderboard_record RPC"),
-- but its CREATE statement was never committed. The only trace of it in the
-- repository was the migration that HARDENS it:
--
--     20260809022107_revoke_client_execute_on_training_leaderboard_record.sql
--
-- which revokes EXECUTE from public/anon/authenticated and opens with a
-- `RAISE EXCEPTION` assertion if the function is missing. So a clean
-- `supabase db reset`, and every preview/branch database, failed at that
-- migration — and any environment that got past it had NO atomic writer at
-- all, leaving pages/api/training/save-progress.js:96 to report all four
-- period writes as failed. Production was fine; nothing else was.
--
-- The timestamp is deliberately 20260809022000 — one minute and seven seconds
-- before the revoke migration — so the two apply in the only order that works.
--
-- Applying this against production is a no-op: the body below is a byte-level
-- transcription of `pg_get_functiondef` taken from the live database on
-- 2026-08-15, so CREATE OR REPLACE rewrites the function to exactly what it
-- already is. GRANTs are deliberately NOT restated here; the revoke migration
-- that follows owns the permission surface.
--
-- WHAT IT DOES, AND WHY IT IS A FUNCTION RATHER THAN CLIENT CODE.
--
-- The previous implementation was a read-modify-write in a Next.js handler:
-- SELECT the row, add to the counters in JavaScript, UPDATE it back. Two
-- sessions finishing inside that window both read `sessions_completed = n` and
-- both wrote `n + 1`, losing one. Multi-table training makes that the NORMAL
-- case rather than a race — four tables finish within a second or two of each
-- other by design. Every counter below is therefore incremented server-side
-- inside a single INSERT ... ON CONFLICT DO UPDATE, which is atomic per row.
--
-- Three details worth keeping:
--   * `accuracy` is RECOMPUTED from the new totals rather than averaged with
--     the old percentage — averaging percentages weights a 3-hand session the
--     same as a 50-hand one.
--   * `best_streak` uses greatest(), so a worse session can never lower it.
--   * `gtow_score_avg` is a running mean that only counts sessions which
--     supplied a score, so a null score leaves the average untouched instead
--     of dragging it toward zero.
--   * `score_scale = 2` marks the row as using the SIGNED -100..+100 scale
--     (roadmap #25). The column DEFAULTS to 1 (legacy) precisely so the
--     schema is correct in both deploy orders; only this writer sets 2.
-- ===========================================================================

create or replace function public.fn_training_leaderboard_record(
  p_user_id     uuid,
  p_period_type text,
  p_period_key  text,
  p_answered    integer,
  p_correct     integer,
  p_is_perfect  boolean,
  p_best_streak integer default null,
  p_gtow_score  numeric default null,
  p_ev_loss     numeric default null
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into training_leaderboard as tl (
    user_id, period_type, period_key,
    sessions_completed, questions_answered, questions_correct,
    accuracy, perfect_rounds, best_streak,
    gtow_score_avg, ev_loss_total, score_scale, updated_at
  ) values (
    p_user_id, p_period_type, p_period_key,
    1, greatest(p_answered, 0), greatest(p_correct, 0),
    case when p_answered > 0
         then round((greatest(p_correct,0)::numeric / p_answered) * 100, 2)
         else 0 end,
    case when p_is_perfect then 1 else 0 end,
    coalesce(p_best_streak, 0),
    p_gtow_score, coalesce(p_ev_loss, 0), 2, now()
  )
  on conflict (user_id, period_type, period_key) do update set
    sessions_completed = tl.sessions_completed + 1,
    questions_answered = tl.questions_answered + greatest(p_answered, 0),
    questions_correct  = tl.questions_correct  + greatest(p_correct, 0),
    accuracy = case
      when tl.questions_answered + greatest(p_answered,0) > 0
      then round(((tl.questions_correct + greatest(p_correct,0))::numeric
                 / (tl.questions_answered + greatest(p_answered,0))) * 100, 2)
      else 0 end,
    perfect_rounds = tl.perfect_rounds + (case when p_is_perfect then 1 else 0 end),
    best_streak = greatest(tl.best_streak, coalesce(p_best_streak, 0)),
    -- running mean over sessions; only counts sessions that supplied a score
    gtow_score_avg = case
      when p_gtow_score is null then tl.gtow_score_avg
      when tl.gtow_score_avg is null then p_gtow_score
      else round((tl.gtow_score_avg * tl.sessions_completed + p_gtow_score)
                 / (tl.sessions_completed + 1), 2) end,
    ev_loss_total = coalesce(tl.ev_loss_total, 0) + coalesce(p_ev_loss, 0),
    updated_at = now();
$function$;

-- Post-apply assertion: the function must exist with the nine-argument
-- signature save-progress.js calls. A signature drift here fails silently at
-- runtime (PostgREST reports "function not found" into a catch), so assert it
-- here where the failure is loud.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fn_training_leaderboard_record'
      and p.pronargs = 9
  ) then
    raise exception 'fn_training_leaderboard_record/9 missing after apply';
  end if;
end $$;
