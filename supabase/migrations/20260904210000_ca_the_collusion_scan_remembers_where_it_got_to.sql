-- =====================================================================
-- The collusion detector gets a memory, and a way to say it is alive.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
--
-- =====================================================================
-- WHAT WAS WRONG
-- =====================================================================
--
-- The detector has been DEAD since 2026-09-03 02:00 UTC and nothing said
-- so. Measured from cron_execution_log on 2026-09-04:
--
--   success   4,110 runs, last one 2026-09-03 02:00
--   killed       82 runs, last one 2026-09-04 17:30
--
-- Per day: 48 successes on 09-02, then 5 successes and 43 kills on
-- 09-03, then 36 kills and zero successes on 09-04. It is scheduled
-- every 30 minutes and it is killed on every single run.
--
-- `killed` is not a timeout. The workers container's own sweeper
-- (src/lib/cronLogSweep.ts) marks a row `killed` when it is still
-- `running` THIRTY MINUTES after it started. So the scan was not slow,
-- it never finished at all.
--
-- =====================================================================
-- THE ACTUAL CAUSE, measured rather than guessed
-- =====================================================================
--
-- Not the database. During a live hang, pg_stat_activity showed NO
-- hand_history query from the scan - the process was busy in Node.
-- And not one of the four detectors: all of scanChipDump, scanSoftPlay,
-- scanTimingCorrelation and scanWinRateAnomaly are O(hands x players^2)
-- over fixed-size accumulators.
--
-- It is the SHAPE OF THE JOB. A cron that runs EVERY 30 MINUTES over a
-- ROLLING 24-HOUR WINDOW re-reads every hand up to 48 times. That was
-- survivable when the platform played 136,000 hands a day. Hands per
-- day over the week this broke:
--
--     2026-08-30    136,060
--     2026-08-31    273,569
--     2026-09-01    288,176
--     2026-09-02    431,646     <- last full day of successes
--     2026-09-03    769,943     <- last success 02:00, then killed
--     2026-09-04    530,244     <- every run killed
--
-- Volume roughly quintupled in four days. Measured on the live worker
-- while writing this: a 20-minute window (11,833 hands) completes in
-- 19s; a 1-hour window (27,592 hands) in 53s; a window large enough to
-- reach the 50,000-hand cap does not return at all.
--
-- THE SAME FLAW PRODUCED THE OTHER SYMPTOM. Re-scanning the same hand
-- 48 times means re-INSERTING the same finding 48 times - the handler
-- inserts and has never upserted, and its own header admits it
-- ("Source comment claims dedupe via upsert on tuple - actual JS uses
-- .insert() straight"). collusion_tracking holds 169,530 rows for
-- 81,323 distinct (pair, pattern) triples: a 2.1x duplication factor
-- that is entirely an artefact of the overlap.
--
-- =====================================================================
-- WHY THIS IS NOT FIXED WITH A UNIQUE INDEX
-- =====================================================================
--
-- The obvious move is a unique index on
-- (player_a, player_b, pattern_type, scan_date) with ON CONFLICT DO
-- NOTHING. It cannot be created: 25,714 groups already carry duplicates
-- and 68,253 rows would conflict, so the index demands DELETING 68,253
-- rows of history first.
--
-- That is treating the symptom and paying for it with evidence. Once
-- the scan reads each hand ONCE, the duplicates stop being produced,
-- and a finding that legitimately recurs on a later window is a real
-- second observation over different hands - which is a thing an
-- investigator wants to see, not a constraint violation.
--
-- The historical 2.1x bloat stays, and Phase 5's queue must dedupe ON
-- READ. PHASE5-CONTRACTS section 0 rule 3 already says so for a
-- different reason.
--
-- =====================================================================
-- WHAT THIS MIGRATION ADDS
-- =====================================================================
--
-- A memory. The scan stops asking "what happened in the last 24 hours"
-- and starts asking "what has happened since I last looked", which
-- makes its cost proportional to the platform's RATE rather than to its
-- HISTORY. At 30-minute cadence that is ~15,000 hands instead of
-- ~700,000, and it cannot drift back: the state row is the window.
--
-- And a heartbeat. A detector that has stopped must be loud somewhere
-- an operator looks - PHASE5-CONTRACTS section 0 rule 1 - and until now
-- the only evidence it had stopped was an absence in a table nobody
-- was watching.
-- =====================================================================

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. THE MEMORY
-- ---------------------------------------------------------------------
create table if not exists public.ca_collusion_scan_state (
  -- Single row, the ca_operator_policy pattern: a boolean primary key
  -- with a CHECK makes a second row impossible rather than merely
  -- unlikely, so every reader's `limit 1` is deterministic.
  id                 boolean primary key default true,
  constraint ca_collusion_scan_state_singleton check (id),

  -- The high-water mark. The next scan starts here.
  last_window_end    timestamptz not null,
  -- When a scan last COMPLETED. Distinct from last_window_end because a
  -- scan that covers nothing still ran.
  last_success_at    timestamptz,
  last_duration_ms   int,
  last_scanned_hands int,
  last_findings      int,
  -- True when the last run stopped on its own time budget rather than
  -- because it reached the end of the window. The window still advances
  -- only over what was actually read, so this is "there is more to do",
  -- never "some hands were skipped".
  last_budget_hit    boolean not null default false,
  updated_at         timestamptz not null default now()
);

comment on table public.ca_collusion_scan_state is
  'Where the collusion detector got to. The scan reads from last_window_end forward, so its cost is proportional to the platform''s hand RATE rather than to a fixed rolling window re-read every 30 minutes. last_success_at is the liveness signal an integrity console renders.';

-- SEEDED AT NOW, NOT AT THE EPOCH. A fresh state row pointing at the
-- beginning of time would make the first scan try to read 2.75 million
-- hands, which is the failure this migration exists to end. The
-- detector has been dead since 2026-09-03 and the gap is real; it is
-- recorded honestly rather than papered over by a catch-up that cannot
-- finish. `MAX_SPAN_HOURS` in the handler lets it walk forward a few
-- hours per run if somebody chooses to backfill by moving this row
-- back deliberately.
insert into public.ca_collusion_scan_state (id, last_window_end)
values (true, now() - interval '30 minutes')
on conflict (id) do nothing;

alter table public.ca_collusion_scan_state enable row level security;

-- ---------------------------------------------------------------------
-- 2. READ AND ADVANCE
-- ---------------------------------------------------------------------
-- Two functions rather than letting the worker write the table
-- directly, so the advance rule - never move the mark past what was
-- actually scanned - lives in ONE place and cannot be got wrong by a
-- caller.

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
           'seconds_since_success',
             case when s.last_success_at is null then null
                  else round(extract(epoch from now() - s.last_success_at)) end,
           'seconds_behind', round(extract(epoch from now() - s.last_window_end)))
    from public.ca_collusion_scan_state s
   limit 1;
$$;

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
begin
  select last_window_end into v_before from public.ca_collusion_scan_state limit 1;

  -- NEVER BACKWARDS. A late or retried run that reports an older window
  -- must not rewind the mark and cause the next scan to re-read hands
  -- already covered - that is the 48x overlap coming back through the
  -- side door.
  --
  -- And never into the FUTURE: a worker with a skewed clock could
  -- otherwise skip every hand between now and its idea of now.
  v_after := least(greatest(coalesce(p_window_end, v_before), v_before), now());

  update public.ca_collusion_scan_state
     set last_window_end    = v_after,
         last_success_at    = now(),
         last_duration_ms   = p_duration_ms,
         last_scanned_hands = p_scanned_hands,
         last_findings      = p_findings,
         last_budget_hit    = coalesce(p_budget_hit, false),
         updated_at         = now();

  return jsonb_build_object('ok', true, 'from', v_before, 'to', v_after,
                            'advanced_seconds',
                            round(extract(epoch from v_after - v_before)));
end;
$$;

-- ---------------------------------------------------------------------
-- 3. HEALTH, which is what makes a dead detector visible
-- ---------------------------------------------------------------------
-- PHASE5-CONTRACTS section 0 rule 1: an integrity surface may never
-- imply it is watching something it is not watching. This is the read
-- every integrity panel renders BEFORE its own content, and it is
-- deliberately blunt: `stale` is a boolean an operator does not have to
-- interpret.
--
-- The threshold is derived from the cadence rather than guessed, which
-- is the lesson Phase 3's heartbeat taught the hard way: a flat 300s
-- against an 8.6-minute engine cycle declared a healthy fleet stale 83%
-- of the time, and a warning that is on more often than it is off is
-- one an operator learns to scroll past. Three missed runs at a
-- 30-minute cadence is 90 minutes.
create or replace function public.fn_ca_collusion_detector_health(
  p_cadence_minutes int default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cadence int := greatest(coalesce(p_cadence_minutes, 30), 1);
  v_stale_after int := v_cadence * 3 * 60;
  s public.ca_collusion_scan_state;
  v_newest_finding timestamptz;
begin
  select * into s from public.ca_collusion_scan_state limit 1;
  select max(created_at) into v_newest_finding from public.collusion_tracking;

  if not found or s.last_success_at is null then
    -- NEVER RUN is not the same as STALE, and neither is the same as
    -- healthy. A console that collapses the three tells an operator a
    -- brand-new detector is broken, or a broken one is new.
    return jsonb_build_object(
      'ok', true, 'status', 'never_run', 'stale', true,
      'stale_after_seconds', v_stale_after,
      'newest_finding_at', v_newest_finding);
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', case when extract(epoch from now() - s.last_success_at) > v_stale_after
                   then 'stale' else 'live' end,
    'stale', extract(epoch from now() - s.last_success_at) > v_stale_after,
    'stale_after_seconds', v_stale_after,
    'cadence_minutes', v_cadence,
    'last_success_at', s.last_success_at,
    'seconds_since_success', round(extract(epoch from now() - s.last_success_at)),
    'seconds_behind', round(extract(epoch from now() - s.last_window_end)),
    'last_scanned_hands', s.last_scanned_hands,
    'last_findings', s.last_findings,
    -- "There is more to do", never "hands were skipped": the mark only
    -- ever advances over what was actually read.
    'catching_up', s.last_budget_hit,
    'newest_finding_at', v_newest_finding);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. ACL
-- ---------------------------------------------------------------------
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
-- 5. ASSERTIONS
-- ---------------------------------------------------------------------
do $assert$
declare
  v_n     int;
  v_state jsonb;
  v_adv   jsonb;
begin
  select count(*) into v_n from public.ca_collusion_scan_state;
  if v_n <> 1 then
    raise exception 'ASSERT FAILED: expected exactly one state row, found %', v_n;
  end if;

  v_state := public.fn_ca_collusion_scan_state();
  if (v_state ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: state read did not answer ok';
  end if;
  raise notice 'ASSERT OK: one state row, seeded at %.', v_state ->> 'last_window_end';

  -- The mark must refuse to go backwards. This is the whole reason the
  -- advance is a function and not an UPDATE the worker writes.
  v_adv := public.fn_ca_collusion_scan_advance(
             (v_state ->> 'last_window_end')::timestamptz - interval '6 hours',
             0, 0, 0, false);
  if (v_adv ->> 'to')::timestamptz < (v_state ->> 'last_window_end')::timestamptz then
    raise exception 'ASSERT FAILED: the scan mark moved BACKWARDS, which re-creates the overlap this migration exists to remove';
  end if;
  raise notice 'ASSERT OK: the mark refuses to rewind.';

  -- And must refuse to jump past now, which would skip every hand in
  -- between.
  v_adv := public.fn_ca_collusion_scan_advance(now() + interval '3 days', 0, 0, 0, false);
  if (v_adv ->> 'to')::timestamptz > now() + interval '1 second' then
    raise exception 'ASSERT FAILED: the mark jumped into the future, skipping every hand between now and then';
  end if;
  raise notice 'ASSERT OK: the mark refuses to skip ahead of now.';

  -- Health must distinguish never_run from stale from live.
  if (public.fn_ca_collusion_detector_health() ->> 'status') is null then
    raise exception 'ASSERT FAILED: health returned no status';
  end if;
  raise notice 'ASSERT OK: detector health answers %.',
    public.fn_ca_collusion_detector_health() ->> 'status';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Rolling this back returns the detector to reading a rolling 24-hour
-- window every 30 minutes, which is the shape that killed it. Prefer
-- moving the state row rather than dropping it: setting
-- last_window_end backwards makes the next scans walk forward and
-- backfill, a few hours per run.
--
-- begin;
--   drop function if exists public.fn_ca_collusion_detector_health(int);
--   drop function if exists public.fn_ca_collusion_scan_advance(timestamptz, int, int, int, boolean);
--   drop function if exists public.fn_ca_collusion_scan_state();
--   drop table if exists public.ca_collusion_scan_state;
-- commit;
-- =====================================================================
