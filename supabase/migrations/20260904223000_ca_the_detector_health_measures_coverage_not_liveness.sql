-- =====================================================================
-- Detector health measured the wrong thing, and the gap it stepped over
-- was recorded nowhere. Project kuklfnapbkmacvwxktbh. Tier 3.
--
-- Three defects, all found by adversarial review of 20260904210000 -
-- the migration that introduced the rule they break. All three are the
-- same shape, which is PHASE5-CONTRACTS section 0 rule 1: an integrity
-- surface may never imply it is watching something it is not watching.
--
-- =====================================================================
-- DEFECT 1 (BLOCKER). HEALTH ANSWERED "did the process finish", NEVER
-- "is the mark keeping up with the felt".
-- =====================================================================
--
-- fn_ca_collusion_scan_advance stamps last_success_at on EVERY call,
-- and health derived `stale` from that alone. So a scan that runs
-- punctually and advances two minutes per thirty-minute cycle - falling
-- an hour further behind every hour - reported `status: live,
-- stale: false` forever. Proved in a rolled-back probe: an advance of
-- ZERO seconds flipped health to live.
--
-- `seconds_behind` was already computed by both read functions and read
-- by the worker into a variable it never used. The number was there the
-- whole time; nothing made a decision from it.
--
-- FIXED: staleness is now the OR of two independent questions - has the
-- process run recently, and is its coverage close to the present - and
-- a new `behind` status names the case where the answer to the first is
-- yes and to the second is no. That is the state a catch-up is in, and
-- it must not look like health.
--
-- =====================================================================
-- DEFECT 2 (BLOCKER). 1,241,438 HANDS WERE STEPPED OVER AND THE HOLE
-- WAS RECORDED NOWHERE.
-- =====================================================================
--
-- 20260904210000 seeded the mark at NOW deliberately, so the first run
-- would not face an unbounded catch-up, and its header called the gap
-- "recorded honestly rather than papered over". It was not recorded at
-- all: no column, no function, nothing. The moment the first fixed run
-- completed, health would have said `live` and every trace of the
-- 40-hour hole would have been gone.
--
-- That is exactly the defect src/lib/scanWindow.ts was written for -
-- its header describes 106,238 hands "never examined by anything and
-- never would be" - reintroduced at twelve times the size by the change
-- that cites that file as its justification.
--
-- Measured against production while writing this:
--   hands between the last successful scan (2026-09-03 02:00) and the
--   seeded mark (2026-09-04 18:43:31.916024) = 1,241,438
--
-- FIXED: the gap is a pair of columns on the state row, health returns
-- them, and health REFUSES to report `stale: false` while they are set.
-- Either somebody backfills it or the console keeps saying it is there.
--
-- =====================================================================
-- DEFECT 3 (HIGH). THE ASSERTION MOVED THE MARK, AND THE FOLLOW-UP
-- MIGRATION ONLY UNDID HALF OF IT.
-- =====================================================================
--
-- 20260904210000's future-clamp assertion called advance with
-- now() + 3 days; the clamp correctly returned now(), AND COMMITTED IT.
-- So the mark is the transaction's now(), not the seeded
-- now() - 30 minutes, and 20260904214500's header describes a value the
-- row does not hold. That migration spotted the principle exactly -
-- "an assertion that exercises a WRITE must undo what it wrote" - and
-- then cleared only last_success_at, leaving the field the same
-- assertion had also moved.
--
-- Not corrected by rewinding the mark: rewinding hands the first run
-- the unbounded catch-up the seed existed to avoid. It is recorded in
-- the gap columns instead, which is where it should have been.
--
-- ALSO FIXED HERE, from the same review:
--   * the advance is concurrency-safe (SELECT FOR UPDATE, and the
--     UPDATE takes the greatest of the two marks, so an overlapping
--     slow run cannot pull the mark backwards);
--   * a zero-row advance no longer answers ok;
--   * both health branches return the same keys, so a console cannot
--     read a missing field as zero;
--   * collusion_tracking gets the created_at index health was
--     seq-scanning 169,530 rows on every call (1.17s per render);
--   * anon and authenticated lose their default table grants on the
--     state row, so the deny-all posture does not rest on RLS having no
--     policy forever.
-- =====================================================================

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. THE GAP GETS A HOME
-- ---------------------------------------------------------------------
alter table public.ca_collusion_scan_state
  add column if not exists unscanned_from timestamptz,
  add column if not exists unscanned_to   timestamptz,
  add column if not exists unscanned_note text;

comment on column public.ca_collusion_scan_state.unscanned_from is
  'Start of a window no scan ever examined. While this is set, health refuses to report stale:false - a hole in the record is not health. Clear it only when the window has actually been rescanned (?since=&until=), never to tidy the dashboard.';

-- The real gap, measured rather than estimated: from the last run that
-- actually succeeded, to where 20260904210000 seeded the mark.
update public.ca_collusion_scan_state
   set unscanned_from = timestamptz '2026-09-03 02:00:00+00',
       unscanned_to   = last_window_end,
       unscanned_note = 'The detector was dead from 2026-09-03 02:00 UTC: it re-read a rolling 24h window every 30 minutes and stopped returning entirely when the platform passed ~700k hands/day. 1,241,438 hands were never examined. Rescan with ?since=&until= in MAX_SPAN_HOURS slices, then clear these three columns.',
       updated_at = now()
 where unscanned_from is null;

-- ---------------------------------------------------------------------
-- 2. THE ADVANCE, MADE SAFE UNDER CONCURRENCY
-- ---------------------------------------------------------------------
-- The dispatcher's client timeout does not cancel the worker, so a slow
-- run and the next cron fire overlap by design. Two runs read the same
-- mark, and whichever committed LAST won - so a run that covered less
-- ground could pull the mark behind one that covered more. Backwards is
-- the safe direction (re-read, never skip), but the function's own
-- comment asserted an invariant it did not hold.
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
  v_before timestamptz;
  v_after  timestamptz;
  v_rows   int;
begin
  -- FOR UPDATE serialises overlapping runs on this one row.
  select last_window_end into v_before
    from public.ca_collusion_scan_state
   limit 1
     for update;

  if not found then
    -- A caller told the state advanced when there is no state. Saying ok
    -- here would report a write that did not land.
    return jsonb_build_object('ok', false, 'reason', 'no_state_row');
  end if;

  -- Never backwards, never past now.
  v_after := least(greatest(coalesce(p_window_end, v_before), v_before), now());

  update public.ca_collusion_scan_state
     -- greatest() again, belt and braces: even if two sessions somehow
     -- interleave, the mark can only move forward.
     set last_window_end    = greatest(last_window_end, v_after),
         last_success_at    = now(),
         last_duration_ms   = p_duration_ms,
         last_scanned_hands = p_scanned_hands,
         last_findings      = p_findings,
         last_budget_hit    = coalesce(p_budget_hit, false),
         updated_at         = now();
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_rows_updated');
  end if;

  return jsonb_build_object('ok', true, 'from', v_before, 'to', v_after,
                            'advanced_seconds',
                            round(extract(epoch from v_after - v_before)));
end;
$$;

-- ---------------------------------------------------------------------
-- 3. HEALTH THAT MEASURES COVERAGE
-- ---------------------------------------------------------------------
create or replace function public.fn_ca_collusion_detector_health(
  p_cadence_minutes int default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cadence     int := greatest(coalesce(p_cadence_minutes, 30), 1);
  v_stale_after int := v_cadence * 3 * 60;
  s public.ca_collusion_scan_state;
  v_newest_finding timestamptz;
  v_since_success  numeric;
  v_behind         numeric;
  v_has_gap        boolean;
  v_process_stale  boolean;
  v_coverage_stale boolean;
  v_status         text;
begin
  select * into s from public.ca_collusion_scan_state limit 1;

  -- Indexed now (see section 5): this used to seq-scan 169,530 rows on
  -- every render of every integrity panel.
  select max(created_at) into v_newest_finding from public.collusion_tracking;

  if not found or s.last_success_at is null then
    -- NEVER RUN is its own answer. Collapsing it into stale tells an
    -- operator a brand-new detector is broken; collapsing it into live
    -- tells them a broken one is new. Every key the live branch returns
    -- is returned here too, as NULL, so a console cannot read a missing
    -- field as a zero.
    return jsonb_build_object(
      'ok', true, 'status', 'never_run', 'stale', true,
      'stale_after_seconds', v_stale_after,
      'cadence_minutes', v_cadence,
      'last_success_at', null,
      'seconds_since_success', null,
      'seconds_behind', null,
      'last_scanned_hands', null,
      'last_findings', null,
      'catching_up', null,
      'unscanned_from', s.unscanned_from,
      'unscanned_to', s.unscanned_to,
      'unscanned_note', s.unscanned_note,
      'has_unscanned_gap', s.unscanned_from is not null,
      'newest_finding_at', v_newest_finding);
  end if;

  v_since_success := extract(epoch from now() - s.last_success_at);
  v_behind        := extract(epoch from now() - s.last_window_end);
  v_has_gap       := s.unscanned_from is not null;

  -- TWO INDEPENDENT QUESTIONS. The process running is not the same as
  -- the coverage keeping up, and the old health only asked the first.
  v_process_stale  := v_since_success > v_stale_after;
  v_coverage_stale := v_behind > v_stale_after;

  v_status := case
                when v_process_stale  then 'stale'    -- it stopped running
                when v_coverage_stale then 'behind'   -- it runs, and loses ground
                else 'live'
              end;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    -- A HOLE IN THE RECORD IS NOT HEALTH. While an unscanned gap is
    -- recorded, this never answers false, whatever the process is doing.
    'stale', v_process_stale or v_coverage_stale or v_has_gap,
    'stale_after_seconds', v_stale_after,
    'cadence_minutes', v_cadence,
    'last_success_at', s.last_success_at,
    'seconds_since_success', round(v_since_success),
    'seconds_behind', round(v_behind),
    'last_scanned_hands', s.last_scanned_hands,
    'last_findings', s.last_findings,
    'catching_up', s.last_budget_hit,
    'unscanned_from', s.unscanned_from,
    'unscanned_to', s.unscanned_to,
    'unscanned_note', s.unscanned_note,
    'has_unscanned_gap', v_has_gap,
    'newest_finding_at', v_newest_finding);
end;
$$;

-- The state read gains the gap too, so the worker can report it.
create or replace function public.fn_ca_collusion_scan_state()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'ok', true,
           'last_window_end', s.last_window_end,
           'last_success_at', s.last_success_at,
           'last_duration_ms', s.last_duration_ms,
           'last_scanned_hands', s.last_scanned_hands,
           'last_findings', s.last_findings,
           'last_budget_hit', s.last_budget_hit,
           'unscanned_from', s.unscanned_from,
           'unscanned_to', s.unscanned_to,
           'seconds_since_success',
             case when s.last_success_at is null then null
                  else round(extract(epoch from now() - s.last_success_at)) end,
           'seconds_behind', round(extract(epoch from now() - s.last_window_end)))
    from public.ca_collusion_scan_state s
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 4. ACL, restated, plus the table grants the first migration left
-- ---------------------------------------------------------------------
-- RLS is on with no policy, so this is inert today. But the whole
-- guarantee rested on nobody ever adding a permissive policy, and an
-- UPDATE on this one row is a way to make the detector skip arbitrary
-- ground while health reports live. A defence that good deserves not to
-- be implicit.
revoke all on table public.ca_collusion_scan_state from anon, authenticated;

do $acl$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.fn_ca_collusion_scan_state()',
    'public.fn_ca_collusion_scan_advance(timestamptz, int, int, int, boolean)',
    'public.fn_ca_collusion_detector_health(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$acl$;

-- ---------------------------------------------------------------------
-- 5. THE INDEX HEALTH WAS MISSING
-- ---------------------------------------------------------------------
-- max(created_at) over collusion_tracking was a parallel seq scan of
-- 169,530 rows, 340ms of the 1.17s every integrity panel would pay
-- before rendering anything - on a table that grows forever.
create index if not exists idx_collusion_tracking_created_at
  on public.collusion_tracking (created_at desc);

-- ---------------------------------------------------------------------
-- 6. ASSERTIONS - and this time they undo what they write
-- ---------------------------------------------------------------------
do $assert$
declare
  v_h      jsonb;
  v_before timestamptz;
  v_adv    jsonb;
begin
  select last_window_end into v_before from public.ca_collusion_scan_state limit 1;

  v_h := public.fn_ca_collusion_detector_health();

  if (v_h ->> 'has_unscanned_gap') <> 'true' then
    raise exception 'ASSERT FAILED: the 1.24M-hand gap is not recorded';
  end if;
  if (v_h ->> 'stale') <> 'true' then
    raise exception 'ASSERT FAILED: health reports fresh while an unscanned gap is recorded. A hole in the record is not health.';
  end if;
  raise notice 'ASSERT OK: the gap is recorded (% to %), and health refuses to call that fresh.',
    v_h ->> 'unscanned_from', v_h ->> 'unscanned_to';

  -- Every key the live branch returns must exist in the never_run
  -- branch too, or a console reads a missing field as a zero.
  if not (v_h ? 'seconds_behind' and v_h ? 'catching_up' and v_h ? 'cadence_minutes') then
    raise exception 'ASSERT FAILED: the never_run branch omits keys the live branch returns';
  end if;
  raise notice 'ASSERT OK: both health branches return the same keys.';

  -- The advance must work, and this assertion must not leave its own write
  -- behind - the lesson 20260904214500 named and then only half-applied.
  --
  -- PL/pgSQL CANNOT issue SAVEPOINT / ROLLBACK TO. The parser refuses it
  -- outright, which is what rejected the first draft of this file. The
  -- supported equivalent is a BEGIN ... EXCEPTION block: entering one opens
  -- an implicit savepoint, and an exception leaving it rolls back everything
  -- the block wrote. So the probe checks its result and then throws a private
  -- errcode on purpose. Only that errcode is caught, so a genuine assertion
  -- failure below still aborts the whole migration.
  begin
    v_adv := public.fn_ca_collusion_scan_advance(v_before + interval '1 minute', 1, 0, 1, true);
    if (v_adv ->> 'ok') <> 'true' then
      raise exception 'ASSERT FAILED: a legitimate advance was refused: %', v_adv;
    end if;
    raise exception using errcode = 'ZZ999', message = 'probe_undo';
  exception
    when sqlstate 'ZZ999' then
      null;  -- expected. The probe's write is undone by leaving this block.
  end;

  if (select last_window_end from public.ca_collusion_scan_state limit 1) <> v_before then
    raise exception 'ASSERT FAILED: the assertion moved the mark and did not put it back';
  end if;
  raise notice 'ASSERT OK: the advance works, and this assertion left the mark exactly where it found it.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Rolling back returns health to reporting `live` for a detector losing
-- ground, and erases the record of 1,241,438 unexamined hands. If the
-- gap is genuinely closed, clear the three columns instead:
--
--   update public.ca_collusion_scan_state
--      set unscanned_from = null, unscanned_to = null, unscanned_note = null;
--
-- and only after the window has actually been rescanned.
-- =====================================================================
