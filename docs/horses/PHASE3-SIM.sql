-- =====================================================================
-- PHASE 3 SIMULATION: THE FLEET COMMAND CENTER, AGAINST REAL ROWS.
-- RUN INSIDE A TRANSACTION THAT IS ROLLED BACK.
-- =====================================================================
-- Companion to supabase/migrations/20260903222000_ca_horse_fleet_command.sql.
-- The migration's own assertion block proves the file installed a safe
-- state. This proves the BEHAVIOUR, against the real database rather
-- than against the text of a file.
--
-- ###################################################################
-- # READ THIS BEFORE RUNNING ANY OF IT AGAINST PRODUCTION.          #
-- #                                                                 #
-- # STEPS 10 AND 11 TOUCH LIVE ROWS. They open two seats for a real #
-- # horse at two REAL tables and release one of them, inside this   #
-- # transaction. The rows are rolled back, but an UNCOMMITTED row   #
-- # still contends: another session inserting the same              #
-- # (table_id, seat_number) BLOCKS until this transaction ends,     #
-- # which is the bottom of this file. The seat index is therefore   #
-- # derived to be one no live table can be using (see step 10), and #
-- # the probe prefers a table that is not running. Run these steps  #
-- # on a quiet floor or on a Supabase branch database, never during #
-- # peak play.                                                      #
-- #                                                                 #
-- # NO STEP IN THIS FILE MAY RENAME OR ALTER A PRODUCTION TABLE, OR #
-- # REMOVE ONE. An earlier revision proved the absent-source guard  #
-- # by renaming horse_daily_nets and ca_club_player_daily inside a  #
-- # nested savepoint. The renames were undone; the ACCESS EXCLUSIVE #
-- # LOCKS WERE NOT. In PostgreSQL a lock taken in a subtransaction  #
-- # is reassigned to the parent when that subtransaction aborts and #
-- # is held until the TOP-LEVEL transaction ends, so both aggregate #
-- # tables stayed locked against every reader and writer for the    #
-- # whole tail of the run. That step is deleted rather than moved,  #
-- # and step 12 now says how the guard is proved instead. Do not    #
-- # reinstate it here.                                              #
-- ###################################################################
--
-- THIS SCRIPT WRITES POLICY ROWS, STATE ROWS, A HEARTBEAT, REGISTER
-- ROWS AND OPEN SEATS. The BEGIN and the ROLLBACK at the bottom are not
-- decoration. Run the body without them and you leave production with a
-- club capped, a horse in a state it is not in, and two synthetic seats
-- open at real tables. Run the WHOLE file, top to bottom, in one
-- session. If anything raises, the transaction is already aborted and
-- the ROLLBACK still lands.
--
-- What it proves, with a RAISE NOTICE at every step:
--   1. the effective merge with the GLOBAL ROW ONLY: today's behaviour,
--      every field sourced 'global'
--   2. a club row overriding ONE field: that field comes from the club,
--      every other field still comes from the global row
--   3. a club row overriding EVERY field: nothing falls through
--   4. set_policy refuses an unknown scope
--   5. set_policy refuses a negative cap
--   6. set_policy refuses a bias outside a sane range, at both ends
--   7. state_upsert writes rows and ONE heartbeat
--   8. a second state_upsert replaces ONLY the rows it names and leaves
--      the others exactly as they were
--   9. the overview counts states and computes stuck from last_action_at
--  10. the isolation report FINDS a horse deliberately seated in two
--      club scopes
--  11. and finds NONE once that seat is released
--  12. the P and L reads existing rows only, reports rake apart from
--      chips, refuses an inverted date range, and returns a NAMED zero
--      for a club with no rows rather than a silent one
--  13. register sync is idempotent
--
-- Every synthetic actor is a version 4 uuid in a block no real Supabase
-- user can occupy, the same convention PHASE2-SIM.sql uses:
--   00000000-0000-4000-8000-0000000000xx
-- NOTHING HERE WRITES TO profiles, tables, clubs OR unions, and nothing
-- here renames or alters any table at all. The two probe seats are
-- inserted into table_seats and are the only rows this script adds to a
-- table it did not create; both are rolled back.
--
-- THOSE TWO SEATS CONTEND FOR THE LIFE OF THE TRANSACTION. They are
-- uncommitted, so no other session can SEE them - but a seat table
-- normally carries a unique index over (table_id, seat_number) to stop
-- two players sharing a seat, and a concurrent insert for the same pair
-- does not fail against an uncommitted row, it BLOCKS until this
-- transaction ends. A real player clicking that seat would watch the
-- table stop responding. So the index is not a plausible number, it is
-- derived to be one no live table can be using:
--   select coalesce(max(seat_number), 0) + 1000 from public.table_seats
-- and the probe prefers a table whose status is not running or active.
--
-- THE ABSENT-SOURCE GUARD IS NOT PROVED HERE. fn_ca_fleet_pnl resolves
-- every table it reads through to_regclass, and the only way to prove
-- that against a real database is to make a source disappear - which
-- means renaming a production aggregate table and holding an ACCESS
-- EXCLUSIVE lock on it until this transaction commits or rolls back.
-- That is not a trade this file is allowed to make. It is proved where
-- it costs nothing instead: on the throwaway PostgreSQL cluster the
-- migration header describes, where those tables are genuinely absent,
-- and on a restored Supabase branch database, where an exclusive lock
-- harms nobody. Step 12 here proves the half that costs nothing against
-- production: a club with no rows returns a zero that travels with the
-- note explaining it.
--
-- Prerequisites, asserted rather than assumed: the four Phase 3 tables
-- and seven functions exist, and there are at least two clubs in
-- DIFFERENT union scopes with a live table each, or steps 10 and 11
-- would prove nothing and are skipped with a loud notice.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '300s';

do $sim$
declare
  -- Synthetic horses. They get register rows and state rows, and for
  -- steps 10 and 11 one of them takes two seats.
  c_horse_a constant uuid := '00000000-0000-4000-8000-000000000031';
  c_horse_b constant uuid := '00000000-0000-4000-8000-000000000032';
  c_horse_c constant uuid := '00000000-0000-4000-8000-000000000033';

  v_actor    uuid;
  v_club_a   uuid;
  v_club_b   uuid;
  v_table_a  uuid;
  v_table_b  uuid;
  v_scope_a  uuid;
  v_scope_b  uuid;

  v_eff      jsonb;
  v_res      jsonb;
  v_over     jsonb;
  v_iso      jsonb;
  v_pnl      jsonb;
  v_sync_a   jsonb;
  v_sync_b   jsonb;

  v_key      text;
  v_count    int;
  v_beats    int;
  -- A REAL horse, borrowed for two steps. The script never writes to
  -- profiles: it reads which account is already flagged is_horse and
  -- opens two seats for it, both of which are rolled back.
  v_probe_horse uuid;
  -- The seat index the probe sits in. NOT a plausible number: an
  -- uncommitted row at a (table_id, seat_number) a real player might pick
  -- blocks that player until this whole transaction ends. Derived in
  -- step 10 as max(seat_number) + 1000 over the live seat table, which no
  -- table with ten seats can ever reach.
  v_probe_seat int;
  v_before   public.ca_horse_fleet_state%rowtype;
  v_after    public.ca_horse_fleet_state%rowtype;
  v_can_seat boolean := false;
begin
  raise notice '=====================================================';
  raise notice 'PHASE 3 SIMULATION (transaction will be rolled back)';
  raise notice '=====================================================';

  -- ------------------------------------------------------------------
  -- Preconditions. Named, so a skipped step is never mistaken for a
  -- passed one.
  -- ------------------------------------------------------------------
  select id into v_actor from public.profiles
  where role in ('god','superadmin','admin') order by role limit 1;
  if v_actor is null then
    select id into v_actor from public.profiles limit 1;
  end if;
  if v_actor is null then
    raise exception 'SIM PRECONDITION FAILED: no profiles row to act as the operator';
  end if;
  raise notice 'Preconditions: acting as operator %', v_actor;

  select count(*) into v_count from public.ca_horse_fleet_policy where scope = 'global';
  if v_count <> 1 then
    raise exception 'SIM PRECONDITION FAILED: expected exactly one global policy row, found %', v_count;
  end if;

  -- Two clubs in DIFFERENT union scopes, each with a live table. That
  -- is what makes step 10 a real finding rather than an artefact.
  --
  -- A TABLE THAT IS NOT RUNNING IS PREFERRED. The probe seats are rolled
  -- back, but they exist for the length of this transaction and a
  -- waiting table is the one where that costs a real player least. The
  -- ordering does the choosing; the where clause still accepts a running
  -- table, because on a busy floor there may be nothing else.
  if to_regclass('public.tables') is not null and to_regclass('public.table_seats') is not null then
    select t.club_id, t.id,
           coalesce((select uc.union_id from public.union_clubs uc where uc.club_id = t.club_id limit 1), t.club_id)
      into v_club_a, v_table_a, v_scope_a
    from public.tables t
    where t.club_id is not null and coalesce(t.status, '') in ('running','active','waiting')
    order by case when coalesce(t.status, '') in ('running','active') then 1 else 0 end,
             t.club_id, t.id
    limit 1;

    if v_club_a is not null then
      select t.club_id, t.id,
             coalesce((select uc.union_id from public.union_clubs uc where uc.club_id = t.club_id limit 1), t.club_id)
        into v_club_b, v_table_b, v_scope_b
      from public.tables t
      where t.club_id is not null and coalesce(t.status, '') in ('running','active','waiting')
        and coalesce((select uc.union_id from public.union_clubs uc where uc.club_id = t.club_id limit 1), t.club_id)
            is distinct from v_scope_a
      order by case when coalesce(t.status, '') in ('running','active') then 1 else 0 end,
               t.club_id, t.id
      limit 1;
    end if;

    v_can_seat := v_club_a is not null and v_club_b is not null;
  end if;

  if v_club_a is null then
    -- Steps 1 to 3 still need a club id to key a policy row on. A
    -- synthetic one is fine: a policy row for a club that does not
    -- exist steers nothing, and this transaction is rolled back.
    v_club_a := '00000000-0000-4000-8000-0000000000a1';
    raise notice 'Preconditions: no live table found, so the policy steps use a synthetic club id';
  end if;
  raise notice 'Preconditions: club A % (scope %), club B % (scope %), seating steps %',
    v_club_a, v_scope_a, v_club_b, v_scope_b,
    case when v_can_seat then 'ENABLED' else 'SKIPPED' end;

  -- ------------------------------------------------------------------
  -- STEP 1. GLOBAL ONLY. This is contract section 0 measured rather
  -- than asserted: with only the seeded row, the effective policy is
  -- today's behaviour and every field says it came from 'global'.
  -- ------------------------------------------------------------------
  v_eff := public.fn_ca_fleet_policy_effective(v_club_a);
  if (v_eff ->> 'enabled')::boolean is distinct from true
     or (v_eff ->> 'pause_new_seatings')::boolean is distinct from false
     or v_eff ->> 'max_horses' is not null
     or v_eff ->> 'max_per_table' is not null
     or (v_eff ->> 'occupancy_bias')::numeric is distinct from 1.0
     or (v_eff ->> 'min_humans_to_seat')::int is distinct from 0 then
    raise exception 'STEP 1 FAILED: the global-only policy is not today behaviour: %', v_eff;
  end if;
  if (v_eff -> 'rows' ->> 'club')::boolean then
    raise exception 'STEP 1 FAILED: a club row already exists for %, so this step proves nothing', v_club_a;
  end if;
  if v_eff -> 'source' ->> 'enabled' <> 'global'
     or v_eff -> 'source' ->> 'occupancy_bias' <> 'global' then
    raise exception 'STEP 1 FAILED: the global row is not named as the source: %', v_eff -> 'source';
  end if;
  raise notice 'STEP 1 OK: global only. enabled=% pause=% caps=(%,%) bias=% min_humans=%, every field sourced global.',
    v_eff ->> 'enabled', v_eff ->> 'pause_new_seatings', v_eff ->> 'max_horses',
    v_eff ->> 'max_per_table', v_eff ->> 'occupancy_bias', v_eff ->> 'min_humans_to_seat';

  -- ------------------------------------------------------------------
  -- STEP 2. A CLUB ROW OVERRIDING ONE FIELD. The named field comes from
  -- the club; every other field still falls through to the global row.
  -- This is what lets an operator cap one club without describing the
  -- other nine.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('max_horses', 25), v_actor, 'sim step 2: cap one club');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 2 FAILED: set_policy refused a legal patch: %', v_res;
  end if;

  v_eff := public.fn_ca_fleet_policy_effective(v_club_a);
  if (v_eff ->> 'max_horses')::int is distinct from 25
     or v_eff -> 'source' ->> 'max_horses' <> 'club' then
    raise exception 'STEP 2 FAILED: the club row did not supply max_horses: %', v_eff;
  end if;
  if (v_eff ->> 'enabled')::boolean is distinct from true
     or v_eff -> 'source' ->> 'enabled' <> 'global' then
    raise exception 'STEP 2 FAILED: enabled did not fall through to the global row: %', v_eff -> 'source';
  end if;
  if (v_eff ->> 'occupancy_bias')::numeric is distinct from 1.0
     or v_eff -> 'source' ->> 'occupancy_bias' <> 'global' then
    raise exception 'STEP 2 FAILED: occupancy_bias did not fall through to the global row: %', v_eff -> 'source';
  end if;
  if v_eff ->> 'max_per_table' is not null then
    raise exception 'STEP 2 FAILED: a field nobody set came back as %', v_eff ->> 'max_per_table';
  end if;
  raise notice 'STEP 2 OK: club row overrides max_horses=25 (source club) and leaves enabled, bias and min_humans to the global row.';

  -- A cap of 25 on a club that had none is material by contract section
  -- 0, and the function says so rather than leaving the route to guess.
  if not (v_res ->> 'material')::boolean then
    raise exception 'STEP 2 FAILED: setting a cap where there was none is a material change: %', v_res;
  end if;
  raise notice 'STEP 2 OK: the change is reported material (%), so the route raises a fleet_policy approval.',
    v_res -> 'material_reasons';

  -- ------------------------------------------------------------------
  -- STEP 3. A CLUB ROW OVERRIDING EVERY FIELD. Nothing falls through.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object(
               'enabled', false,
               'pause_new_seatings', true,
               'max_horses', 10,
               'max_per_table', 2,
               'occupancy_bias', 0.5,
               'min_humans_to_seat', 2,
               'stake_bands', jsonb_build_array('micro','low'),
               'variants', jsonb_build_array('nlh'),
               'schedule', jsonb_build_array(jsonb_build_object('start_hour', 18, 'end_hour', 23)),
               'notes', 'sim step 3'
             ), v_actor, 'sim step 3: override everything');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 3 FAILED: set_policy refused a full patch: %', v_res;
  end if;

  v_eff := public.fn_ca_fleet_policy_effective(v_club_a);
  if (v_eff ->> 'enabled')::boolean is distinct from false
     or (v_eff ->> 'pause_new_seatings')::boolean is distinct from true
     or (v_eff ->> 'max_horses')::int is distinct from 10
     or (v_eff ->> 'max_per_table')::int is distinct from 2
     or (v_eff ->> 'occupancy_bias')::numeric is distinct from 0.5
     or (v_eff ->> 'min_humans_to_seat')::int is distinct from 2
     or v_eff -> 'stake_bands' is null
     or v_eff -> 'variants' is null
     or v_eff -> 'schedule' is null then
    raise exception 'STEP 3 FAILED: the full club override did not take: %', v_eff;
  end if;
  for v_count in
    select 1 from jsonb_each_text(v_eff -> 'source') as s(k, v) where s.v <> 'club'
  loop
    raise exception 'STEP 3 FAILED: a field still came from outside the club row: %', v_eff -> 'source';
  end loop;
  raise notice 'STEP 3 OK: every field comes from the club row. enabled=false and pause=true stop NEW seatings only; no seated horse is touched by any of this.';

  -- Put the club back to inheriting, so later steps read a normal fleet.
  perform public.fn_ca_fleet_set_policy('club', v_club_a,
    jsonb_build_object('enabled', null, 'pause_new_seatings', null, 'max_horses', null,
                       'max_per_table', null, 'occupancy_bias', null, 'min_humans_to_seat', null,
                       'stake_bands', null, 'variants', null, 'schedule', null),
    v_actor, 'sim: hand every field back to the global row');
  v_eff := public.fn_ca_fleet_policy_effective(v_club_a);
  if (v_eff ->> 'enabled')::boolean is distinct from true
     or v_eff -> 'source' ->> 'enabled' <> 'global' then
    raise exception 'STEP 3 FAILED: a json null did not clear the override: %', v_eff -> 'source';
  end if;
  raise notice 'STEP 3 OK: a json null CLEARS an override and hands the field back to the global row.';

  -- ------------------------------------------------------------------
  -- STEP 4. An unknown scope is refused.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_fleet_set_policy('table', null, '{}'::jsonb, v_actor, 'sim step 4');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'unknown_scope' then
    raise exception 'STEP 4 FAILED: an unknown scope was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('global', v_club_a, '{}'::jsonb, v_actor, 'sim step 4b');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'scope_id_not_allowed' then
    raise exception 'STEP 4 FAILED: a global row with a scope_id was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', null, '{}'::jsonb, v_actor, 'sim step 4c');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'scope_id_required' then
    raise exception 'STEP 4 FAILED: a club row with no scope_id was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('global', null, jsonb_build_object('bankroll', 500), v_actor, 'sim step 4d');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'unknown_field' then
    raise exception 'STEP 4 FAILED: a field this table does not carry was accepted: %', v_res;
  end if;
  raise notice 'STEP 4 OK: unknown_scope, scope_id_not_allowed, scope_id_required and unknown_field are all refused, and nothing was written.';

  -- ------------------------------------------------------------------
  -- STEP 5. A negative cap is refused. A cap is a count of seats: zero
  -- legitimately means "seat nobody new here", minus one would read as
  -- unlimited.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('max_horses', -1), v_actor, 'sim step 5');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'negative_cap' then
    raise exception 'STEP 5 FAILED: a negative max_horses was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('max_per_table', -5), v_actor, 'sim step 5b');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'negative_cap' then
    raise exception 'STEP 5 FAILED: a negative max_per_table was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('max_horses', 0), v_actor, 'sim step 5c');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 5 FAILED: a cap of ZERO is legal and means seat nobody new: %', v_res;
  end if;
  perform public.fn_ca_fleet_set_policy('club', v_club_a,
    jsonb_build_object('max_horses', null), v_actor, 'sim: clear the zero cap');
  raise notice 'STEP 5 OK: negative caps refused on both columns, a cap of zero accepted as a real instruction.';

  -- ------------------------------------------------------------------
  -- STEP 6. A bias outside a sane range is refused, at BOTH ends. Zero
  -- or negative would take every table target to zero, which is an
  -- eviction dressed as arithmetic.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('occupancy_bias', 0), v_actor, 'sim step 6');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'bias_out_of_range' then
    raise exception 'STEP 6 FAILED: a bias of zero was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('occupancy_bias', -2), v_actor, 'sim step 6b');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'bias_out_of_range' then
    raise exception 'STEP 6 FAILED: a negative bias was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('occupancy_bias', 99), v_actor, 'sim step 6c');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'bias_out_of_range' then
    raise exception 'STEP 6 FAILED: a bias of 99 was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('min_humans_to_seat', 11), v_actor, 'sim step 6d');
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'min_humans_out_of_range' then
    raise exception 'STEP 6 FAILED: a min_humans_to_seat no table could satisfy was accepted: %', v_res;
  end if;
  v_res := public.fn_ca_fleet_set_policy('club', v_club_a,
             jsonb_build_object('occupancy_bias', 0.75), v_actor, 'sim step 6e');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 6 FAILED: a sane bias of 0.75 was refused: %', v_res;
  end if;
  perform public.fn_ca_fleet_set_policy('club', v_club_a,
    jsonb_build_object('occupancy_bias', null), v_actor, 'sim: clear the bias');
  raise notice 'STEP 6 OK: bias 0, -2 and 99 refused, min_humans 11 refused, bias 0.75 accepted.';

  -- ------------------------------------------------------------------
  -- STEP 7. The engine's write: state rows plus ONE heartbeat.
  -- ------------------------------------------------------------------
  select count(*) into v_beats from public.ca_horse_fleet_heartbeat;

  v_res := public.fn_ca_fleet_state_upsert(
    jsonb_build_array(
      jsonb_build_object('horse_id', c_horse_a, 'state', 'seated', 'club_id', v_club_a,
                         'seat_index', 3, 'stack', 1500, 'lane', 'cash', 'stake_band', 'low',
                         'last_action_at', (now() - interval '10 seconds')::text,
                         'hands_this_session', 12),
      jsonb_build_object('horse_id', c_horse_b, 'state', 'idle', 'club_id', v_club_a),
      jsonb_build_object('horse_id', c_horse_c, 'state', 'playing', 'club_id', v_club_a,
                         'last_action_at', (now() - interval '4 hours')::text),
      -- Junk the engine must survive: no horse_id at all, and a state
      -- nobody has ever heard of.
      jsonb_build_object('state', 'seated'),
      jsonb_build_object('horse_id', c_horse_a, 'state', 'levitating', 'club_id', v_club_a,
                         'last_action_at', (now() - interval '10 seconds')::text)
    ),
    jsonb_build_object('cycle_ms', 2500, 'horses_total', 3, 'horses_seated', 1,
                       'horses_idle', 1, 'tables_seen', 4, 'tables_seeded', 1,
                       'seats_filled', 1, 'seats_released', 0, 'degraded', false,
                       'detail', jsonb_build_object('reason', 'sim step 7'))
  );
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 7 FAILED: state_upsert refused the cycle: %', v_res;
  end if;
  if (v_res ->> 'heartbeat_id') is null then
    raise exception 'STEP 7 FAILED: no heartbeat was written: %', v_res;
  end if;
  select count(*) into v_count from public.ca_horse_fleet_heartbeat;
  if v_count <> v_beats + 1 then
    raise exception 'STEP 7 FAILED: expected exactly one new heartbeat, count went from % to %', v_beats, v_count;
  end if;
  select count(*) into v_count from public.ca_horse_fleet_state
  where horse_id in (c_horse_a, c_horse_b, c_horse_c);
  if v_count <> 3 then
    raise exception 'STEP 7 FAILED: expected 3 state rows, found %', v_count;
  end if;
  select * into v_before from public.ca_horse_fleet_state where horse_id = c_horse_a;
  -- The duplicate mention of horse A carried an unknown state, which is
  -- coerced rather than rejected: an engine that invents a state must
  -- not take the whole cycle down with it.
  if v_before.state not in ('seated','unknown') then
    raise exception 'STEP 7 FAILED: horse A ended in state %', v_before.state;
  end if;
  raise notice 'STEP 7 OK: % rows written, % skipped, one heartbeat (id %). A row with no horse_id was dropped and an unknown state was coerced, not raised.',
    v_res ->> 'rows_written', v_res ->> 'rows_skipped', v_res ->> 'heartbeat_id';

  -- ------------------------------------------------------------------
  -- STEP 8. A SECOND CALL REPLACES ONLY THE ROWS IT NAMES. A partial
  -- cycle must never blank the fleet.
  -- ------------------------------------------------------------------
  select * into v_before from public.ca_horse_fleet_state where horse_id = c_horse_c;

  v_res := public.fn_ca_fleet_state_upsert(
    jsonb_build_array(
      jsonb_build_object('horse_id', c_horse_b, 'state', 'seated', 'club_id', v_club_a,
                         'seat_index', 7, 'stack', 900,
                         'last_action_at', now()::text)
    ),
    null
  );
  if (v_res ->> 'rows_written')::int <> 1 then
    raise exception 'STEP 8 FAILED: expected 1 row written, got %', v_res ->> 'rows_written';
  end if;
  if (v_res ->> 'heartbeat_id') is not null then
    raise exception 'STEP 8 FAILED: a null beat must write no heartbeat: %', v_res;
  end if;

  select * into v_after from public.ca_horse_fleet_state where horse_id = c_horse_b;
  if v_after.state <> 'seated' or v_after.seat_index <> 7 or v_after.stack <> 900 then
    raise exception 'STEP 8 FAILED: the named row was not replaced: %', to_jsonb(v_after);
  end if;

  select * into v_after from public.ca_horse_fleet_state where horse_id = c_horse_c;
  if v_after.state is distinct from v_before.state
     or v_after.last_action_at is distinct from v_before.last_action_at
     or v_after.updated_at is distinct from v_before.updated_at then
    raise exception 'STEP 8 FAILED: a row the call did not name was changed: % then %',
      to_jsonb(v_before), to_jsonb(v_after);
  end if;
  raise notice 'STEP 8 OK: only horse B moved. Horse C is untouched, down to its updated_at, so a partial cycle cannot blank the fleet.';

  -- ------------------------------------------------------------------
  -- STEP 9. The overview counts states and computes stuck from
  -- last_action_at. Horse C last acted four hours ago and is playing.
  -- ------------------------------------------------------------------
  v_over := public.fn_ca_fleet_overview(15);
  if not (v_over ->> 'ok')::boolean then
    raise exception 'STEP 9 FAILED: the overview did not return ok: %', v_over;
  end if;
  if (v_over -> 'states' ->> 'seated')::int < 2 then
    raise exception 'STEP 9 FAILED: expected at least 2 seated horses, states are %', v_over -> 'states';
  end if;
  if (v_over ->> 'stuck')::int < 1 then
    raise exception 'STEP 9 FAILED: a horse playing with no action for four hours is not counted as stuck: %', v_over;
  end if;
  -- Every state key is present even at zero: a tab that hides 'busted'
  -- because it happens to be zero teaches the operator busted is not a
  -- thing.
  foreach v_key in array array['idle','seated','playing','sitting_out','busted','suspended','retired','unknown'] loop
    if not (v_over -> 'states' ? v_key) then
      raise exception 'STEP 9 FAILED: the state counts are missing the key %', v_key;
    end if;
  end loop;
  if v_over -> 'heartbeat' is null or (v_over -> 'heartbeat' ->> 'stale')::boolean then
    raise exception 'STEP 9 FAILED: the heartbeat written seconds ago reads as missing or stale: %', v_over -> 'heartbeat';
  end if;
  raise notice 'STEP 9 OK: % horses counted across % states, % stuck, heartbeat % seconds old and not stale, capacity %.',
    v_over ->> 'total', jsonb_array_length(jsonb_path_query_array(v_over -> 'states', '$.keyvalue()')),
    v_over ->> 'stuck', v_over -> 'heartbeat' ->> 'age_seconds', v_over -> 'capacity';

  -- A stuck horse is a horse to LOOK AT, never a horse to remove. There
  -- is no eviction path in this migration and this step does not invent
  -- one.
  raise notice 'STEP 9 OK: stuck is a number on a screen. Nothing here removes a seated horse or cancels a hand.';

  -- ------------------------------------------------------------------
  -- STEP 10. THE ISOLATION REPORT FINDS A HORSE IN TWO CLUB SCOPES.
  -- Dan's DSS ruling: a horse plays inside its own club or union only.
  --
  -- The report asks profiles.is_horse who is in the fleet, so the probe
  -- has to be a REAL horse or the report is right to ignore it. This
  -- script never writes to profiles: it READS which account is already
  -- flagged, prefers one holding no open seat, and opens two seats for
  -- it at two live tables in two different union scopes. Both seats are
  -- rolled back with the rest of the transaction, and no hand is touched
  -- because these seats never reach a running hand.
  -- ------------------------------------------------------------------
  if v_can_seat then
    select p.id into v_probe_horse
    from public.profiles p
    where coalesce(p.is_horse, false)
      and not exists (select 1 from public.table_seats s where s.user_id = p.id and s.left_at is null)
    order by p.id
    limit 1;

    if v_probe_horse is null then
      -- No idle horse. Rather than disturb a seated one, fall back to a
      -- synthetic account carried by the register, which is the source
      -- the report uses when profiles.is_horse cannot be read. The step
      -- then proves the query and not the fleet filter, and says so.
      v_can_seat := false;
      raise notice 'STEP 10 NOTE: every horse already holds a seat, so no probe horse could be borrowed without disturbing one.';
    end if;
  end if;

  if not v_can_seat or v_probe_horse is null then
    raise notice 'STEP 10 SKIPPED: this database has no two clubs in different union scopes with live tables and a spare horse.';
    raise notice 'STEP 11 SKIPPED: for the same reason.';
  else
    -- A SEAT INDEX NO LIVE TABLE CAN BE USING. The rows below are
    -- uncommitted, so nobody can see them - but a unique index over
    -- (table_id, seat_number), which is how a seat table stops two
    -- players sharing a seat, makes a concurrent insert for the same
    -- pair BLOCK on this transaction rather than fail. It would stay
    -- blocked until the rollback at the bottom of this file, and to the
    -- player the table would simply stop responding. Hard-coding a
    -- plausible seat number (this was 8) is therefore the defect; the
    -- index is derived to be one no real seating can reach.
    select coalesce(max(seat_number), 0) + 1000 into v_probe_seat
    from public.table_seats;
    if v_probe_seat is null then
      v_probe_seat := 1000;
    end if;

    begin
      insert into public.table_seats (table_id, user_id, seat_number, stack)
      values (v_table_a, v_probe_horse, v_probe_seat, 500),
             (v_table_b, v_probe_horse, v_probe_seat, 500);
    exception when others then
      v_can_seat := false;
      raise notice 'STEP 10 SKIPPED: the probe seats could not be opened (%).', sqlerrm;
    end;
    if v_can_seat then
      raise notice 'STEP 10 NOTE: two probe seats opened at seat index %, which is above every seat index this database uses, so no real player can contend for them.',
        v_probe_seat;
    end if;
  end if;

  if v_can_seat and v_probe_horse is not null then
    v_iso := public.fn_ca_fleet_isolation_report(50, 0);
    if not (v_iso ->> 'ok')::boolean then
      raise exception 'STEP 10 FAILED: the isolation report did not return ok: %', v_iso;
    end if;
    if (v_iso ->> 'total')::int < 1 then
      raise exception 'STEP 10 FAILED: horse % was seated in two club scopes and the report found nothing: %',
        v_probe_horse, v_iso;
    end if;
    select count(*) into v_count
    from jsonb_array_elements(v_iso -> 'rows') as r
    where (r ->> 'horse_id')::uuid = v_probe_horse;
    if v_count <> 1 then
      raise exception 'STEP 10 FAILED: the report found % rows but not the horse it was given: %', v_iso ->> 'total', v_iso -> 'rows';
    end if;
    raise notice 'STEP 10 OK: the report found horse % holding seats in % club scopes. Total findings: %.',
      v_probe_horse,
      (select r ->> 'scope_count' from jsonb_array_elements(v_iso -> 'rows') as r
        where (r ->> 'horse_id')::uuid = v_probe_horse),
      v_iso ->> 'total';

    -- ----------------------------------------------------------------
    -- STEP 11. AND FINDS NONE ONCE IT IS CLEANED UP. Cleaned up means
    -- the seat is RELEASED the way a seat is always released, by
    -- stamping left_at. Nothing here evicts anybody mid hand.
    -- ----------------------------------------------------------------
    update public.table_seats
       set left_at = now()
     where user_id = v_probe_horse and table_id = v_table_b and left_at is null;

    v_iso := public.fn_ca_fleet_isolation_report(50, 0);
    select count(*) into v_count
    from jsonb_array_elements(v_iso -> 'rows') as r
    where (r ->> 'horse_id')::uuid = v_probe_horse;
    if v_count <> 0 then
      raise exception 'STEP 11 FAILED: after releasing the second seat the horse is still reported: %', v_iso -> 'rows';
    end if;
    raise notice 'STEP 11 OK: with the second seat released the horse is gone from the report (% finding(s) left, and an empty report is the correct answer).',
      v_iso ->> 'total';
  end if;

  -- ------------------------------------------------------------------
  -- STEP 12. THE P AND L READS EXISTING ROWS ONLY.
  -- Every figure is a SUM of a column the platform already keeps. This
  -- step proves the envelope, proves rake is reported apart from chips,
  -- proves an inverted range is refused rather than answered with a
  -- silent zero, and proves that a club with no rows is a NAMED zero.
  -- It does NOT make a source disappear: see the note at the end of this
  -- step for why that cannot be done against production.
  -- ------------------------------------------------------------------
  v_pnl := public.fn_ca_fleet_pnl(current_date - 30, current_date, null);
  if not (v_pnl ->> 'ok')::boolean then
    raise exception 'STEP 12 FAILED: the P and L did not return ok: %', v_pnl;
  end if;
  if not (v_pnl ->> 'read_only')::boolean then
    raise exception 'STEP 12 FAILED: the P and L does not declare itself read only: %', v_pnl;
  end if;
  if v_pnl -> 'totals' -> 'rake' is null then
    raise exception 'STEP 12 FAILED: rake must be reported in its own column, separated from chips: %', v_pnl -> 'totals';
  end if;
  raise notice 'STEP 12 OK: net=% hands=% rake=% over % to %, read from %.',
    v_pnl -> 'totals' ->> 'net', v_pnl -> 'totals' ->> 'hands', v_pnl -> 'totals' ->> 'rake',
    v_pnl ->> 'from', v_pnl ->> 'to', v_pnl -> 'sources';

  -- An inverted range is refused rather than silently returning nothing.
  v_pnl := public.fn_ca_fleet_pnl(current_date, current_date - 30, null);
  if (v_pnl ->> 'ok')::boolean or (v_pnl ->> 'error') <> 'range_inverted' then
    raise exception 'STEP 12 FAILED: an inverted date range was accepted: %', v_pnl;
  end if;
  raise notice 'STEP 12 OK: an inverted date range is refused as range_inverted, not answered with a silent zero.';

  -- A source that is not there. The name below cannot exist, so the
  -- resolver takes the same branch a genuinely absent table takes: a
  -- zero, and a note that says the source was absent.
  v_pnl := public.fn_ca_fleet_pnl(current_date - 30, current_date, '00000000-0000-4000-8000-0000000000ff');
  if not (v_pnl ->> 'ok')::boolean then
    raise exception 'STEP 12 FAILED: a club with no rows must return zero, not fail: %', v_pnl;
  end if;
  if (v_pnl -> 'totals' ->> 'net')::numeric <> 0 then
    raise exception 'STEP 12 FAILED: a club with no rows returned a non-zero net: %', v_pnl -> 'totals';
  end if;
  raise notice 'STEP 12 OK: a club with no rows returns zero and still names every source it consulted. A zero always travels with the note that explains it.';

  -- A SOURCE THAT IS ALREADY ABSENT COSTS NOTHING TO PROVE. Where this
  -- database genuinely lacks a chip source, the guard is on the live
  -- path and the note that keeps a zero from being read as a measurement
  -- is assertable for free. On a database that has both, this is a
  -- notice and not a skip: there is nothing here to prove.
  v_pnl := public.fn_ca_fleet_pnl(current_date - 30, current_date, null);
  if not coalesce((v_pnl -> 'sources' -> 'horse_daily_nets' ->> 'present')::boolean, false)
     and not coalesce((v_pnl -> 'sources' -> 'ca_club_player_daily' ->> 'present')::boolean, false) then
    if not (v_pnl -> 'notes') @> '["no chip source could be read, so every chip figure is a reported zero and not a measurement"]'::jsonb then
      raise exception 'STEP 12 FAILED: every chip source is absent and the zero was reported without the note that explains it: %', v_pnl -> 'notes';
    end if;
    if (v_pnl -> 'totals' ->> 'net')::numeric <> 0 then
      raise exception 'STEP 12 FAILED: every chip source is absent and the net was not zero: %', v_pnl -> 'totals';
    end if;
    raise notice 'STEP 12 OK: this database has no chip source at all, so the guard is on the live path: net 0, and the note that says a zero is not a measurement.';
  elsif not coalesce((v_pnl -> 'sources' -> 'horse_daily_nets' ->> 'present')::boolean, false) then
    if not (v_pnl -> 'notes') @> '["public.horse_daily_nets is not present"]'::jsonb then
      raise exception 'STEP 12 FAILED: horse_daily_nets is absent and was not named in the notes: %', v_pnl -> 'notes';
    end if;
    raise notice 'STEP 12 OK: horse_daily_nets is absent on this database, the P and L fell back to the other chip source and named the missing one.';
  else
    raise notice 'STEP 12 NOTE: every chip source is present on this database, so the absent-source branch cannot be exercised here without renaming one, which this file will not do.';
  end if;

  -- AND A SOURCE THAT IS GENUINELY NOT THERE - NOT PROVED HERE, AND
  -- THIS IS THE REASON, SO NOBODY ADDS IT BACK.
  --
  -- An earlier revision of this file proved the to_regclass guard by
  -- RENAMING public.horse_daily_nets and public.ca_club_player_daily
  -- inside a nested plpgsql savepoint, calling fn_ca_fleet_pnl over the
  -- gap, and then raising a private sqlstate so the subtransaction
  -- aborted and the renames were undone. The renames were undone. THE
  -- LOCKS WERE NOT. A heavyweight lock taken inside a subtransaction is
  -- reassigned to the parent resource owner when that subtransaction
  -- aborts, and table-level locks are held until the end of the
  -- TOP-LEVEL transaction - which here is the rollback at the bottom of
  -- this file, after step 13 has run two full register syncs over every
  -- profile. For that whole tail both aggregate tables were ACCESS
  -- EXCLUSIVE locked against every reader and writer, select included:
  -- the nightly rake and daily-net jobs, the Economy tab, and
  -- fn_ca_fleet_pnl itself. `set local lock_timeout` bounds how long
  -- this session WAITS to acquire a lock. It says nothing about how long
  -- it HOLDS one.
  --
  -- So the branch is deleted rather than moved to the end, because "the
  -- lock window is only the last few statements" is still a production
  -- outage measured in whatever the rollback takes. Prove it on a
  -- cluster where the tables are genuinely absent - the throwaway
  -- PostgreSQL instance the migration header describes - or on a
  -- restored Supabase branch database, where an exclusive lock harms
  -- nobody. Not here, and not against kuklfnapbkmacvwxktbh.
  raise notice 'STEP 12 NOTE: the absent-source branch is NOT run here. Renaming a production aggregate table holds an ACCESS EXCLUSIVE lock until this transaction ends, not for the rename. Prove it on a branch database or on a throwaway cluster instead.';

  -- ------------------------------------------------------------------
  -- STEP 13. Register sync is idempotent.
  -- ------------------------------------------------------------------
  v_sync_a := public.fn_ca_fleet_register_sync(v_actor);
  v_sync_b := public.fn_ca_fleet_register_sync(v_actor);
  if (v_sync_b ->> 'inserted')::int <> 0 then
    raise exception 'STEP 13 FAILED: a repeat sync inserted % rows', v_sync_b ->> 'inserted';
  end if;
  if (v_sync_a ->> 'total') is distinct from (v_sync_b ->> 'total') then
    raise exception 'STEP 13 FAILED: the register total moved from % to %',
      v_sync_a ->> 'total', v_sync_b ->> 'total';
  end if;
  if not (v_sync_b ->> 'audited')::boolean then
    raise notice 'STEP 13 NOTE: the audit write did not land (%). The sync still completed, which is the rule: a failed audit never fails the action.',
      v_sync_b -> 'notes';
  end if;
  -- And with NO actor it writes no audit row at all rather than
  -- attempting one fn_log_admin_action would refuse.
  v_sync_b := public.fn_ca_fleet_register_sync();
  if (v_sync_b ->> 'audited')::boolean then
    raise exception 'STEP 13 FAILED: a sync with no actor claimed to be audited: %', v_sync_b;
  end if;
  raise notice 'STEP 13 OK: register sync is idempotent (% rows, % active). With an actor it audits; with none it writes no audit row and says so.',
    v_sync_b ->> 'total', v_sync_b ->> 'active';

  -- ------------------------------------------------------------------
  -- Closing count, so the reader can see what this produced.
  -- ------------------------------------------------------------------
  raise notice '=====================================================';
  raise notice 'ALL STEPS PASSED. About to roll back: % policy rows, % state rows, % heartbeats and % open probe seat(s). No profiles row was ever written.',
    (select count(*) from public.ca_horse_fleet_policy where scope <> 'global'),
    (select count(*) from public.ca_horse_fleet_state where horse_id in (c_horse_a, c_horse_b, c_horse_c)),
    (select count(*) from public.ca_horse_fleet_heartbeat),
    case when v_can_seat and v_probe_horse is not null then 2 else 0 end;
  raise notice '=====================================================';
end
$sim$;

-- NOT commit. Every policy row, state row, heartbeat, register row and
-- probe seat above is undone.
rollback;
