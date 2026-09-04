-- =====================================================================
-- The mark never moved, because PostgREST refuses a WHERE-less UPDATE.
-- Project kuklfnapbkmacvwxktbh. Tier 3.
--
-- MEASURED, NOT REASONED. Calling the RPC the way the worker calls it -
-- POST /rest/v1/rpc/fn_ca_collusion_scan_advance as service_role:
--
--   {"code":"21000","message":"UPDATE requires a WHERE clause"}
--
-- The `authenticator` role carries `session_preload_libraries=safeupdate`,
-- so EVERY request that arrives through PostgREST runs with safe-update
-- mode on, and a WHERE-less UPDATE is refused - inside a SECURITY DEFINER
-- function as much as anywhere else. `ca_collusion_scan_state` is a
-- singleton with a boolean primary key, so the UPDATE had no WHERE and
-- never needed one. It was correct SQL and unreachable in production.
--
-- WHY IT PASSED EVERY TEST IT WAS GIVEN. `postgres` does not preload
-- safeupdate, so the function works perfectly from psql - which is where
-- 20260904210000's assertions ran, and 20260904223000's, and mine. It
-- works in a rolled-back probe. It works when a migration calls it. The
-- ONLY caller it fails for is the one that matters. A guard you cannot
-- reproduce in the tool you are testing with is a guard you will report
-- as working.
--
-- WHAT IT COST. The workers deploy landed at 18:57:35 UTC and the scan
-- has completed cleanly ever since: 19:00 in 12.1s, 19:30 in 50.2s, both
-- HTTP 200, both recorded `success` in cron_execution_log. And the state
-- row still reads:
--
--   last_window_end    2026-09-04 18:43:31.916024+00   (the migration's value)
--   last_success_at    null
--   last_scanned_hands null                            <- never once written
--
-- So the detector was reading hands, finding findings, inserting them,
-- and forgetting where it got to - re-reading the same window every 30
-- minutes forever, which is the exact behaviour the whole change set was
-- written to remove, arrived at from the other end. `last_scanned_hands`
-- being NULL is the proof: the advance has never landed a single row.
--
-- It answered 200 the whole time because the advance was best-effort by
-- design. That half is already fixed in the workers commit that lands
-- with this (a refused advance is a 500 now), but a loud failure is not
-- the same as a working one. This is the working one.
--
-- THE OTHER FIVE. Six functions in the whole schema hold a WHERE-less
-- write. The other five are called only by pg_cron and triggers, where
-- safeupdate is not loaded, so they work today - and each becomes this
-- bug the moment somebody wires it to an API route:
--
--   fn_ca_execute_epoch3_reset            -> ca_treasury_baseline
--   fn_rake_spec_rebuild_caps             -> ca_rake_schedule_caps
--   fn_rebuild_agent_commission_rollup    -> agent_commission_unsettled_rollup
--   pnm_refresh_venue_integrity_state_basics -> venue_location_integrity_state
--   sp_compact_hand_history               -> hand_history_compaction_policy
--
-- Left alone deliberately: two of them are money paths owned by other
-- work, and a blind edit to a treasury or rake function to satisfy a lint
-- is a worse idea than the lint. They are named here, and pinned by
-- __tests__/horses-an-rpc-write-has-a-where.test.mjs, so the next agent
-- to expose one has been told.
--
-- COUNT THEM PROPERLY OR DO NOT COUNT THEM. A first pass said eleven and
-- a second said two, and both were wrong, because a scan that does not
-- strip string literals and comments trips over their contents:
-- fn_resolve_settled_financial_alerts writes the note 'settled after the
-- alert was raised; the prize path credited this player', and that
-- semicolon ends the statement as far as a regex is concerned - so its
-- WHERE reads as missing. fn_ca_money_path_log has no UPDATE at all; the
-- match was inside an error message telling an operator how to reopen a
-- door. The scan below strips literals and comments first, which is why
-- its number can be trusted. A guard that miscounts is how the wrong
-- functions get "fixed".
-- =====================================================================

-- =====================================================================
-- TWO THINGS THIS MIGRATION ALSO UNDOES, BOTH MINE, BOTH RECORDED HERE
-- BECAUSE A CORRECTION THAT HIDES ITS OWN CAUSE IS NOT A CORRECTION.
--
-- 1. `Prefer: tx=rollback` IS NOT HONOURED BY THIS POSTGREST.
--
--    Having fixed the function, I proved it through PostgREST - the only
--    caller whose verdict counts - and sent the header `Prefer:
--    tx=rollback` so the probe would not commit. PostgREST honours that
--    header ONLY when it is configured `db-tx-end = commit-allow-override`,
--    and this deployment is not. The call returned
--    {"ok": true, "advanced_seconds": 988} AND COMMITTED, writing a run
--    record that never happened:
--
--      last_window_end     18:43:31.916024  ->  19:00:00
--      last_success_at     null             ->  19:41:22
--      last_scanned_hands  null             ->  123
--      last_duration_ms    null             ->  9
--      last_budget_hit     false            ->  true
--
--    123 hands in 9ms is not a scan, it is my argument list. Left there it
--    is precisely the failure 20260904214500 exists to prevent: a health
--    surface reporting a successful run that never ran. Section 11.5 says
--    probe inside a transaction you ROLL BACK, and I did ask for a
--    rollback - the mistake was TRUSTING the request instead of reading
--    the row afterwards. psql's transaction is the one that actually
--    rolls back. Through PostgREST, assume every call commits.
--
--    Restored below to the exact values it held, which are recorded above.
--    The mark goes back to 18:43:31.916024 rather than staying at 19:00,
--    even though the 19:00 and 19:30 runs did genuinely read that ground:
--    they read it, they inserted their findings, and they recorded
--    NOTHING, so "how far did they get" is something I would be inferring
--    from a duration, not reading from a row. The cost of putting it back
--    is one slightly longer window on the next run - about 75 minutes,
--    well inside the six-hour cap - and some duplicate findings. The cost
--    of leaving it forward is a hand nobody ever examined. Those are not
--    comparable.
--
-- 2. THE VERSION 20260904230000 WAS ALREADY TAKEN, by
--    `cash_games_slice_1_hardening`, between this file being written and
--    being registered - the same collision as 20260904170000 earlier
--    today. Registering it would have left the live function body filed
--    under another agent's migration name. Renamed to 20260904233000 and
--    re-applied so the registered version and the live body are the same
--    thing. ALWAYS read the INSERT's row count; `INSERT 0 0` is the whole
--    warning you get.
-- =====================================================================

begin;

set local lock_timeout = '3s';

create or replace function public.fn_ca_collusion_scan_advance(
  p_window_end     timestamptz,
  p_scanned_hands  int,
  p_findings       int,
  p_duration_ms    int,
  p_budget_hit     boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     boolean;
  v_before timestamptz;
  v_after  timestamptz;
  v_rows   int;
begin
  -- The id comes back with the mark so the UPDATE can be keyed on it.
  -- FOR UPDATE serialises overlapping runs on this one row; the
  -- dispatcher's client timeout does not cancel the worker, so a slow run
  -- and the next cron fire overlap by design.
  select s.id, s.last_window_end into v_id, v_before
    from public.ca_collusion_scan_state s
   limit 1
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_state_row');
  end if;

  v_after := least(greatest(coalesce(p_window_end, v_before), v_before), now());

  update public.ca_collusion_scan_state
     set last_window_end    = greatest(last_window_end, v_after),
         last_success_at    = now(),
         last_duration_ms   = p_duration_ms,
         last_scanned_hands = p_scanned_hands,
         last_findings      = p_findings,
         last_budget_hit    = coalesce(p_budget_hit, false),
         updated_at         = now()
   -- THE WHOLE FIX. The table is a singleton and this predicate selects
   -- exactly the row the SELECT above locked, so it changes nothing about
   -- what the statement does - and it is the difference between the
   -- function running and PostgREST refusing it with 21000 before a single
   -- row is touched. Never remove it as redundant. It is not redundant to
   -- safeupdate, which reads the statement, not the table.
   where id = v_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_rows_updated');
  end if;

  return jsonb_build_object('ok', true, 'from', v_before, 'to', v_after,
                            'advanced_seconds',
                            round(extract(epoch from v_after - v_before)));
end;
$$;

revoke all on function public.fn_ca_collusion_scan_advance(timestamptz, int, int, int, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_ca_collusion_scan_advance(timestamptz, int, int, int, boolean)
  to service_role;

-- ---------------------------------------------------------------------
-- PUT BACK WHAT THE POSTGREST PROBE COMMITTED
-- ---------------------------------------------------------------------
-- Conditional on the exact fabricated values, so re-running this file
-- after a REAL run has advanced the mark cannot rewind that run's work.
update public.ca_collusion_scan_state
   set last_window_end    = timestamptz '2026-09-04 18:43:31.916024+00',
       last_success_at    = null,
       last_duration_ms   = null,
       last_scanned_hands = null,
       last_findings      = null,
       last_budget_hit    = false,
       updated_at         = now()
 where id = true
   and last_scanned_hands = 123
   and last_duration_ms = 9
   and last_window_end = timestamptz '2026-09-04 19:00:00+00';

-- ---------------------------------------------------------------------
-- ASSERTIONS
-- ---------------------------------------------------------------------
-- safeupdate CANNOT be loaded from a session (`access to library
-- "safeupdate" is not allowed`), so this transaction cannot reproduce the
-- refusal the way PostgREST sees it. It asserts the STRUCTURE instead -
-- that every write in the body carries a WHERE - which is the property
-- safeupdate is checking. The behavioural proof is the PostgREST call
-- recorded in the header, and it is repeated by hand after this applies.
do $assert$
declare
  v_def   text;
  v_stmt  text;
  v_bad   int := 0;
  v_other text[] := '{}';
  r       record;
begin
  select regexp_replace(
           regexp_replace(lower(pg_get_functiondef(p.oid)), '--[^\n]*', ' ', 'g'),
           '''(?:[^'']|'''')*''', '''''', 'g')
    into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_ca_collusion_scan_advance';

  for v_stmt in
    select m[1] from regexp_matches(v_def, '(update\s+public\.[a-z_0-9]+[^;]*;)', 'g') as m
  loop
    if v_stmt not like '%where%' then v_bad := v_bad + 1; end if;
  end loop;

  if v_bad > 0 then
    raise exception 'ASSERT FAILED: % write statement(s) still have no WHERE. PostgREST will refuse this function with 21000.', v_bad;
  end if;
  raise notice 'ASSERT OK: every write in fn_ca_collusion_scan_advance carries a WHERE, so safeupdate will let it run.';

  -- The advance still works as SQL, and this assertion undoes its own
  -- write - a BEGIN..EXCEPTION block, because PL/pgSQL cannot ROLLBACK TO.
  declare
    v_before timestamptz;
    v_adv    jsonb;
  begin
    select last_window_end into v_before from public.ca_collusion_scan_state limit 1;
    begin
      v_adv := public.fn_ca_collusion_scan_advance(v_before + interval '1 minute', 7, 1, 42, true);
      if (v_adv ->> 'ok') <> 'true' then
        raise exception 'ASSERT FAILED: a legitimate advance was refused: %', v_adv;
      end if;
      raise exception using errcode = 'ZZ999', message = 'probe_undo';
    exception
      when sqlstate 'ZZ999' then null;
    end;
    if (select last_window_end from public.ca_collusion_scan_state limit 1) <> v_before then
      raise exception 'ASSERT FAILED: the assertion moved the mark and did not put it back';
    end if;
    raise notice 'ASSERT OK: the advance answers ok, and left the mark where it found it.';
  end;

  -- Name the others rather than touch them. Two are money paths owned by
  -- other work; a blind edit to satisfy a lint is worse than the lint.
  --
  -- Literals and comments are stripped FIRST. Without that this scan
  -- reports the wrong functions in both directions - see the header.
  for r in
    select p.proname,
           regexp_replace(
             regexp_replace(lower(pg_get_functiondef(p.oid)), '--[^\n]*', ' ', 'g'),
             '''(?:[^'']|'''')*''', '''''', 'g') as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname <> 'fn_ca_collusion_scan_advance'
  loop
    for v_stmt in
      select m[1] from regexp_matches(r.def, '((?:update|delete\s+from)\s+public\.[a-z_0-9]+[^;]*;)', 'g') as m
    loop
      if v_stmt not like '%where%' then
        v_other := v_other || r.proname;
        exit;
      end if;
    end loop;
  end loop;

  if array_length(v_other, 1) > 0 then
    raise notice 'NOTE: % other function(s) hold a WHERE-less write and would be refused if ever exposed through PostgREST: %',
      array_length(v_other, 1), array_to_string(v_other, ', ');
  end if;

  -- The probe's fabricated run record is gone, and nothing claims a run
  -- that did not happen.
  if exists (select 1 from public.ca_collusion_scan_state
              where last_scanned_hands is not null and last_success_at is null) then
    raise exception 'ASSERT FAILED: the state claims hands scanned with no successful run';
  end if;
  if exists (select 1 from public.ca_collusion_scan_state where last_scanned_hands = 123) then
    raise exception 'ASSERT FAILED: the PostgREST probe record is still there';
  end if;
  if (public.fn_ca_collusion_detector_health() ->> 'status') <> 'never_run' then
    raise exception 'ASSERT FAILED: health reports a run this detector has never completed';
  end if;
  raise notice 'ASSERT OK: the probe record is gone and health is back to never_run.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Removing the WHERE returns the detector to reading hands, writing
-- findings, and forgetting where it got to, while every log row says
-- success. Restore 20260904223000's body only if you have also moved the
-- caller off PostgREST.
-- =====================================================================
