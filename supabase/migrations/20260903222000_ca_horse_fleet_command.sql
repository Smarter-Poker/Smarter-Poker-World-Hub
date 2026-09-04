-- =====================================================================
-- Phase 3: the Fleet Command Center, database half
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
-- Contract: docs/horses/PHASE3-CONTRACTS.md sections 0 and 1.
--
-- WHAT THIS IS
-- Four new tables and seven SECURITY DEFINER functions that let an
-- operator SEE the horse fleet and, later, shape how many of its
-- members take seats. Nothing existing is altered. Every object in this
-- file is new, so no GRANT, REVOKE, RLS or DDL statement here can take
-- away anything anybody holds today.
--
-- SECTION 0 IS THE POINT OF THE WHOLE FILE
-- "THE FLEET KEEPS RUNNING EXACTLY AS IT DOES TODAY UNTIL A POLICY ROW
-- SAYS OTHERWISE, AND NO CONTROL MAY REACH INSIDE A HAND."
-- Three consequences are built into the schema rather than left to the
-- engine to remember:
--   1. The single seeded global row carries TODAY'S behaviour, field for
--      field: enabled true, pause_new_seatings false, no caps at all,
--      occupancy_bias 1.0, min_humans_to_seat 0, no band, variant or
--      schedule restriction. Reading it changes nothing, which is why
--      the assertion block below refuses to let the migration finish if
--      any of those values is anything else.
--   2. Every steering column is NULLABLE. A club row overrides the
--      fields it names and leaves the rest to the global row, so the
--      console can cap one club without describing the other nine.
--   3. fn_ca_fleet_policy_effective FAILS OPEN. With no global row, no
--      club row, or no rows at all it returns exactly the hardcoded
--      defaults above and says source 'default' for every field. An
--      empty table and today's behaviour are the same thing.
-- Nothing here can remove a seated horse: there is no eviction RPC and
-- no column an engine could read as one. The kill switch is
-- pause_new_seatings, and its whole meaning is "seat nobody NEW".
--
-- HORSES ARE PLAYERS (CLAUDE.md 10.5)
-- Quotas shape HOW MANY horses take seats. Nothing here shapes how a
-- seated horse is treated: same timers, same pauses, same rules, same
-- pay. ca_horse_fleet_state is a MIRROR the engine publishes for the
-- console to read. No engine path reads it back to decide anything
-- about a hand, and this file adds no chip movement of any kind. The
-- P and L function READS rows the platform already keeps and never
-- recomputes a number.
--
-- WHY THE READ RPCs FILE NO AUDIT ROW
-- fn_log_admin_action REFUSES a null actor. Phase 2 shipped two read
-- functions whose signatures carry no actor and which called it with
-- p_admin_user_id := null anyway: the write failed on every call and the
-- failure went into a raise notice, so the file claimed a trail it never
-- had (see 20260903121500). Four of the seven functions here are pure
-- reads with no actor - fn_ca_fleet_policy_effective, fn_ca_fleet_overview,
-- fn_ca_fleet_isolation_report and fn_ca_fleet_pnl - and NONE of them
-- mentions fn_log_admin_action. fn_ca_fleet_state_upsert is machine
-- telemetry written once per cycle by the engine, not an operator
-- action, and contract section 1 says so explicitly: no audit row there
-- either, or the trail becomes a cycle log.
--
-- THE ONE DELIBERATE DEVIATION FROM THE CONTRACT'S SIGNATURES
-- Contract section 1 writes `fn_ca_fleet_register_sync() returns jsonb`.
-- It is a WRITE and it must be audited, but a zero-argument function has
-- no actor to audit as, which is the exact trap Phase 2 fell into. The
-- function is therefore declared
-- `fn_ca_fleet_register_sync(p_actor uuid default null)`, so
-- `fn_ca_fleet_register_sync()` still resolves and the contract's call
-- still compiles. With an actor it files an audit row. With no actor -
-- the backfill in this file, or a scheduled sync - it SKIPS the call and
-- returns audited:false with a reason, rather than attempting a write
-- that can only fail. An unattributable action is not written down as
-- somebody else's.
--
-- DEFENSIVE READS: EMPTY RATHER THAN FAILING
-- fn_ca_fleet_overview, fn_ca_fleet_isolation_report and fn_ca_fleet_pnl
-- read tables this file does not create and cannot see from here:
-- profiles, tables, table_seats, union_clubs, horse_daily_nets,
-- club_rake_daily_user and ca_club_player_daily. Every one of those
-- reads is guarded by to_regclass and issued as dynamic SQL, and the
-- money functions resolve their COLUMN names out of
-- information_schema.columns at run time from a candidate list. A
-- missing table or a differently spelled column returns an empty
-- section, a zero total and a named note in `sources`. It never raises.
-- The rule is: a console tab that says "no data, and here is which
-- source was missing" is useful; a console tab that 500s is not. The
-- companion rule is that a total is never invented - an absent source
-- reports zero AND says the source was absent, so a zero is never
-- mistaken for a measurement.
--
-- ROW LEVEL SECURITY
-- RLS is ENABLED on all four tables and NO policy is created for anon
-- or authenticated. service_role bypasses RLS, so the console's service
-- role client and the engine's service key are the only readers and
-- writers. A browser holding a user JWT sees zero rows. Revoking
-- privileges on tables created moments ago in this same file takes
-- nothing away from anyone, which keeps contract section 0 intact.
--
-- LOCKING, AND THE EXPLICIT TRANSACTION
-- Every DDL statement creates a new object, so nothing contends with
-- live traffic. The register backfill inserts roughly one thousand rows
-- into a table created three statements earlier.
--
-- The file opens its own BEGIN and closes its own COMMIT, and both
-- `set local` lines sit inside them. SET LOCAL outside a transaction is a
-- no-op with a warning, so under a runner that does not wrap the file
-- (psql -f) the migration would otherwise run with the server's default
-- lock_timeout and statement_timeout while claiming these. The
-- re-verification raised that as N-5 against the Phase 2 family and asked
-- for a begin/commit in future files; this is a future file.
--
-- VERIFIED BEFORE APPLYING
-- Applied to a throwaway PostgreSQL 16 cluster - the closest version
-- available to the agent that wrote this; every feature it uses (stored
-- generated columns, identity columns, make_interval, the jsonb
-- containment and path operators) behaves identically in 17 - against a
-- stub of the ten objects it reads, seeded with production's shape:
-- three operators, 1000 profiles carrying is_horse, three clubs across
-- two unions, forty live tables, 120 open seats and daily money rows.
-- Confirmed there: the file applies clean, the assertion block passes,
-- applying it TWICE changes no row and re-runs every assertion, the
-- pasted ROLLBACK executes in the order written and leaves nothing
-- behind, anon and authenticated hold no privilege on any of the four
-- tables or seven functions, and docs/horses/PHASE3-SIM.sql passes all
-- thirteen steps and rolls back to zero residue.
--
-- Also confirmed directly, because these are the claims this header
-- makes and a claim nobody measured is a guess:
--   * SECTION 0. With the whole policy table EMPTIED,
--     fn_ca_fleet_policy_effective still returns enabled true, pause
--     false, no caps, bias 1.0, min_humans 0, and source 'default' for
--     every field.
--   * DEFENSIVE READS. Applied to a COMPLETELY BARE database - no
--     profiles, no tables, no table_seats, no union_clubs, none of the
--     three money tables - the migration still applies, the assertion
--     block still passes, and afterwards fn_ca_fleet_pnl,
--     fn_ca_fleet_overview and fn_ca_fleet_isolation_report all return
--     ok with zeros, empty rows and a note naming every absent source.
--   * THE P AND L PRECEDENCE. With horse_daily_nets alone renamed away
--     it falls back to ca_club_player_daily and says so; with every chip
--     source renamed away it reports zero and says the zero is not a
--     measurement. Neither ever double counts, because the fallback only
--     runs when the primary source could not be read.
--   * THE ISOLATION RULING. A horse given open seats in two clubs of the
--     SAME union is not a finding; the same horse given seats in two
--     DIFFERENT unions is; releasing one seat empties the report. A
--     human seated in two unions never appears at all.
--
-- CHANGED AFTER THAT RUN, BY THE PHASE 3 ADVERSARIAL REVIEW (2026-09-03)
-- This file had not been applied anywhere when the review landed, so it
-- was corrected in place rather than by a follow-up migration. Six
-- changes, none of them to a table, a column, a signature or an ACL:
--   * H-1 and M-7. fn_ca_fleet_set_policy's materiality block now also
--     scores occupancy_bias, min_humans_to_seat, stake_bands, variants
--     and schedule, and puts an absolute floor of 5 under a cap cut. Five
--     fields that can stop the whole fleet seating were below the line.
--   * M-2. The audit row is filed under 'global' for the global scope,
--     which is the id /api/horses/fleet-admin uses, rather than
--     'global:global'.
--   * M-6. The probe-residue check is scoped to the probe's own heartbeat
--     ids instead of asserting the whole table is empty.
--   * M-9. `stuck` measures from coalesce(last_action_at,
--     session_started_at, last_seen_at) in both the count and the sample.
--   * L-6. The file opens its own transaction, so its `set local` lines
--     are not no-ops under a runner that does not wrap it.
-- The throwaway-cluster run above predates these six. The claims it
-- made still hold - none of them touches schema, defaults, ACLs or the
-- defensive reads - but the assertion block was extended rather than
-- re-run against a cluster, because no PostgreSQL is available to the
-- agent that made these edits. The three new assertions (the fresh-horse
-- stuck delta, the scoped heartbeat residue and the audit target id) are
-- written to abort the migration if they are wrong, which is the point of
-- putting them there rather than in a document.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- The steering table. ONE row per scope, and every steering column is
-- nullable on purpose: null means "I have no opinion, ask the wider
-- scope", which is what makes a club row an OVERRIDE rather than a
-- replacement.
--
-- Contract section 1 asks for `primary key (scope, coalesce(scope_id,
-- '00000000-0000-0000-0000-000000000000'))`. Postgres has no expression
-- primary key, so the coalesce is materialised as a stored generated
-- column and the primary key is (scope, scope_key). That is the same
-- key with the same collapse of null to the zero uuid, and it gives
-- upserts a real conflict target to name. The zero uuid is a SENTINEL,
-- never an account: no auth.users row can hold it.
--
-- The DEFAULTS on enabled, pause_new_seatings, occupancy_bias and
-- min_humans_to_seat are today's behaviour, so a raw insert that names
-- none of them produces a permissive row. fn_ca_fleet_set_policy names
-- every column explicitly, so a club row created through the RPC gets
-- NULL in the fields its patch did not mention and inherits them.
create table if not exists public.ca_horse_fleet_policy (
  scope              text not null,
  scope_id           uuid,
  scope_key          uuid generated always as
                       (coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  enabled            boolean default true,
  pause_new_seatings boolean default false,
  max_horses         int,
  max_per_table      int,
  occupancy_bias     numeric default 1.0,
  min_humans_to_seat int default 0,
  stake_bands        text[],
  variants           text[],
  schedule           jsonb,
  notes              text,
  updated_by         uuid,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint ca_horse_fleet_policy_pk primary key (scope, scope_key),
  constraint ca_horse_fleet_policy_scope_known
    check (scope in ('global', 'club', 'union')),
  -- A global row with a scope_id would be a SECOND global row that
  -- fn_ca_fleet_policy_effective never looks at, which is the failure
  -- mode where the console shows a policy the engine is not reading.
  constraint ca_horse_fleet_policy_global_is_unscoped
    check ((scope = 'global') = (scope_id is null)),
  -- A cap is a count. Zero is a legitimate cap meaning "seat nobody
  -- new here"; a negative one is a typo that would read as unlimited.
  constraint ca_horse_fleet_policy_caps_not_negative
    check (coalesce(max_horses, 0) >= 0 and coalesce(max_per_table, 0) >= 0),
  -- The bias SCALES a target. Zero or negative would take every table
  -- to zero seats, which is an eviction dressed as arithmetic, and the
  -- upper bound stops a fat finger asking for a hundred times today.
  constraint ca_horse_fleet_policy_bias_sane
    check (occupancy_bias is null or (occupancy_bias > 0 and occupancy_bias <= 10)),
  -- Ten seats is the widest table on the platform, so eleven humans is
  -- a rule no table can ever satisfy.
  constraint ca_horse_fleet_policy_min_humans_sane
    check (min_humans_to_seat is null or (min_humans_to_seat >= 0 and min_humans_to_seat <= 10))
);

comment on table public.ca_horse_fleet_policy is
  'Fleet steering. One global row carries today behaviour; club and union rows override field by field where not null. Empty table means today behaviour.';
comment on column public.ca_horse_fleet_policy.scope_key is
  'Stored coalesce(scope_id, zero uuid). Gives the contract primary key (scope, coalesce(scope_id, ...)) a real conflict target.';
comment on column public.ca_horse_fleet_policy.pause_new_seatings is
  'The kill switch. Stops NEW seatings only. It never removes a seated horse and never cancels a hand.';
comment on column public.ca_horse_fleet_policy.occupancy_bias is
  'Scales the engine occupancy target. The engine clamps so a bias can never take a table below one seat.';

-- What the fleet is doing right now, as the engine last published it.
-- A MIRROR for the console, not an input: no engine path reads this
-- table back to decide anything about a hand.
create table if not exists public.ca_horse_fleet_state (
  horse_id            uuid primary key,
  state               text not null default 'unknown',
  club_id             uuid,
  table_id            uuid,
  seat_index          int,
  stack               numeric,
  last_action_at      timestamptz,
  last_seen_at        timestamptz not null default now(),
  session_started_at  timestamptz,
  hands_this_session  int not null default 0,
  lane                text,
  stake_band          text,
  bankroll            numeric,
  note                text,
  updated_at          timestamptz not null default now(),
  constraint ca_horse_fleet_state_state_known
    check (state in ('idle','seated','playing','sitting_out','busted','suspended','retired','unknown'))
);

comment on table public.ca_horse_fleet_state is
  'One row per horse, upserted by the engine once per seeding cycle. Console read model only; nothing reads it back into a hand.';
comment on column public.ca_horse_fleet_state.last_action_at is
  'When this horse last acted. Drives the stuck count: seated or playing with no action inside the window.';

-- The fleet pulse. One row per cycle. The console reads the newest row
-- and a 24 hour window, which is why the only index that matters is
-- beat_at descending.
create table if not exists public.ca_horse_fleet_heartbeat (
  id             bigint generated always as identity primary key,
  beat_at        timestamptz not null default now(),
  cycle_ms       int,
  horses_total   int,
  horses_seated  int,
  horses_idle    int,
  horses_stuck   int,
  tables_seen    int,
  tables_seeded  int,
  seats_filled   int,
  seats_released int,
  policy_version timestamptz,
  degraded       boolean not null default false,
  detail         jsonb
);

comment on table public.ca_horse_fleet_heartbeat is
  'One row per engine cycle. degraded true means the policy read failed and the engine fell back to its hardcoded defaults.';
comment on column public.ca_horse_fleet_heartbeat.detail is
  'Free form. detail.reason is what the console shows when a cycle seated nobody, so a stopped fleet can explain itself.';

-- The GLI-19 disclosure record: an authoritative list of every
-- simulated account, its owner entity and its funding source. Rows are
-- NEVER deleted. A horse that stops existing is stamped retired_at, so
-- the answer to "which simulated accounts were live in March" survives.
create table if not exists public.ca_horse_fleet_register (
  horse_id       uuid primary key,
  disclosed      boolean not null default true,
  owner_entity   text,
  funding_source text,
  created_at     timestamptz,
  registered_at  timestamptz not null default now(),
  retired_at     timestamptz,
  note           text
);

comment on table public.ca_horse_fleet_register is
  'GLI-19 disclosure. Every is_horse profile appears here. Never deleted: a vanished horse is stamped retired_at.';
comment on column public.ca_horse_fleet_register.created_at is
  'The profiles.created_at of the horse, copied at sync time, so the register can say how long the account has existed.';

-- ---------------------------------------------------------------------
-- 2. Indexes for the queries the console and the engine actually run
-- ---------------------------------------------------------------------

-- The Health tab counts by state. The contract asks for state by state.
create index if not exists ca_horse_fleet_state_state_idx
  on public.ca_horse_fleet_state (state);

-- The Roster tab filters by club and then by state. The contract asks
-- for state by club; the state column rides along so the common
-- two-filter read is index only.
create index if not exists ca_horse_fleet_state_club_idx
  on public.ca_horse_fleet_state (club_id, state);

-- The stuck count is "seated or playing and no action inside N
-- minutes". Partial, because the other six states can never be stuck.
create index if not exists ca_horse_fleet_state_stuck_idx
  on public.ca_horse_fleet_state (last_action_at)
  where state in ('seated', 'playing');

-- Heartbeat newest first: the console reads the last row on every
-- render and a 24 hour window on the Health tab.
create index if not exists ca_horse_fleet_heartbeat_beat_at_idx
  on public.ca_horse_fleet_heartbeat (beat_at desc);

-- Policy lookup by scope and scope_id. The primary key is (scope,
-- scope_key) and scope_key is generated, so a lookup written the way a
-- human writes it - scope = 'club' and scope_id = $1 - has no index to
-- use without this one. The engine issues that query once per club per
-- 60 seconds.
create index if not exists ca_horse_fleet_policy_scope_idx
  on public.ca_horse_fleet_policy (scope, scope_id);

-- The Register tab lists the live fleet, which is every row that has
-- not been retired.
create index if not exists ca_horse_fleet_register_active_idx
  on public.ca_horse_fleet_register (registered_at desc)
  where retired_at is null;

-- ---------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------
-- Enabled with NO policy for anon or authenticated on purpose. Nobody
-- reaches these tables through a user JWT. service_role bypasses RLS
-- and the console's server side client and the engine's service key are
-- the only callers. These tables say where every horse is sitting and
-- how much it is carrying, which is not a browser's business.

alter table public.ca_horse_fleet_policy    enable row level security;
alter table public.ca_horse_fleet_state     enable row level security;
alter table public.ca_horse_fleet_heartbeat enable row level security;
alter table public.ca_horse_fleet_register  enable row level security;

revoke all on public.ca_horse_fleet_policy    from public, anon, authenticated;
revoke all on public.ca_horse_fleet_state     from public, anon, authenticated;
revoke all on public.ca_horse_fleet_heartbeat from public, anon, authenticated;
revoke all on public.ca_horse_fleet_register  from public, anon, authenticated;

grant select, insert, update, delete on public.ca_horse_fleet_policy    to service_role;
grant select, insert, update, delete on public.ca_horse_fleet_state     to service_role;
grant select, insert, update, delete on public.ca_horse_fleet_heartbeat to service_role;
grant select, insert, update, delete on public.ca_horse_fleet_register  to service_role;
grant usage, select on sequence public.ca_horse_fleet_heartbeat_id_seq to service_role;

-- ---------------------------------------------------------------------
-- 4. Seed: the ONE global row, carrying today's behaviour
-- ---------------------------------------------------------------------
-- Every value below is the value the engine already uses. Reading this
-- row changes nothing, which is the whole of contract section 0. The
-- assertion block at the bottom refuses to let the migration finish if
-- any of them drifts.
insert into public.ca_horse_fleet_policy (
  scope, scope_id, enabled, pause_new_seatings, max_horses, max_per_table,
  occupancy_bias, min_humans_to_seat, stake_bands, variants, schedule, notes, updated_by
) values (
  'global', null, true, false, null, null,
  1.0, 0, null, null, null,
  'Seeded by 20260903222000 with today behaviour. Enabled, nothing paused, no caps, bias 1.0, no minimum humans, no band, variant or schedule restriction. Changing any value here changes the live fleet.',
  null
)
on conflict (scope, scope_key) do nothing;

-- ---------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------
-- All SECURITY DEFINER with a pinned search_path, all revoked from
-- public, anon and authenticated and granted only to service_role, so
-- this file is ACL self contained and a branch merge cannot leave a
-- function reachable from a browser.
--
-- The four READS carry no actor and file no audit row (see the header).
-- fn_ca_fleet_state_upsert is machine telemetry and files none either.
-- The two operator writes, fn_ca_fleet_set_policy and
-- fn_ca_fleet_register_sync, each file one through fn_log_admin_action
-- inside its own exception block: a failed audit must never turn a
-- completed change into an error.
--
-- Validation failures RETURN {ok:false, error:'...'} rather than
-- raising. A raise inside a caller's transaction aborts everything the
-- caller had already done, and the console's job here is to show an
-- operator what it refused and why, not to lose the request.

-- 5.1 The effective policy. THIS IS WHAT THE ENGINE CALLS. -------------
--
-- global, then union if a union row exists for the club, then club.
-- Later wins field by field where not null. Contract section 1 defines
-- the merge as global plus club; the union layer is a strict superset
-- that is INERT unless somebody has actually written a union scope row,
-- and the fast path below skips the club-to-union lookup entirely when
-- no union row exists, so with none the behaviour is exactly the
-- contract's two level merge.
--
-- IT FAILS OPEN. With no rows at all, every field comes back as the
-- hardcoded default and `source` says 'default'. An empty table and
-- today's behaviour are the same thing, which is what lets the engine
-- treat a policy read failure and a permissive policy identically.
create or replace function public.fn_ca_fleet_policy_effective(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_global   public.ca_horse_fleet_policy%rowtype;
  v_union    public.ca_horse_fleet_policy%rowtype;
  v_club     public.ca_horse_fleet_policy%rowtype;
  v_union_id uuid;
  v_has_union_rows boolean := false;

  v_enabled  boolean;
  v_pause    boolean;
  v_max_h    int;
  v_max_pt   int;
  v_bias     numeric;
  v_min_hum  int;
  v_bands    text[];
  v_variants text[];
  v_schedule jsonb;
begin
  select * into v_global
  from public.ca_horse_fleet_policy
  where scope = 'global'
  limit 1;

  if p_club_id is not null then
    select * into v_club
    from public.ca_horse_fleet_policy
    where scope = 'club' and scope_id = p_club_id
    limit 1;

    -- Fast path: no union scope row anywhere means the club to union
    -- lookup cannot change the answer, so it is not issued.
    select exists (select 1 from public.ca_horse_fleet_policy where scope = 'union')
      into v_has_union_rows;

    if v_has_union_rows then
      -- union_clubs is the mapping settlement reads; clubs.union_id is
      -- the mirror rake routing reads. Either answers this question, and
      -- both are guarded because neither is created by this file.
      if to_regclass('public.union_clubs') is not null then
        begin
          execute 'select uc.union_id from public.union_clubs uc where uc.club_id = $1 limit 1'
            into v_union_id using p_club_id;
        exception when others then
          v_union_id := null;
        end;
      end if;
      if v_union_id is null and to_regclass('public.clubs') is not null then
        begin
          execute 'select c.union_id from public.clubs c where c.id = $1 limit 1'
            into v_union_id using p_club_id;
        exception when others then
          v_union_id := null;
        end;
      end if;
      if v_union_id is not null then
        select * into v_union
        from public.ca_horse_fleet_policy
        where scope = 'union' and scope_id = v_union_id
        limit 1;
      end if;
    end if;
  end if;

  -- THE MERGE. Narrowest scope that expressed an opinion wins. The
  -- final coalesce argument is the hardcoded default, which is today's
  -- behaviour, which is why an empty table is safe.
  v_enabled  := coalesce(v_club.enabled,            v_union.enabled,            v_global.enabled,            true);
  v_pause    := coalesce(v_club.pause_new_seatings, v_union.pause_new_seatings, v_global.pause_new_seatings, false);
  v_max_h    := coalesce(v_club.max_horses,         v_union.max_horses,         v_global.max_horses);
  v_max_pt   := coalesce(v_club.max_per_table,      v_union.max_per_table,      v_global.max_per_table);
  v_bias     := coalesce(v_club.occupancy_bias,     v_union.occupancy_bias,     v_global.occupancy_bias,     1.0);
  v_min_hum  := coalesce(v_club.min_humans_to_seat, v_union.min_humans_to_seat, v_global.min_humans_to_seat, 0);
  v_bands    := coalesce(v_club.stake_bands,        v_union.stake_bands,        v_global.stake_bands);
  v_variants := coalesce(v_club.variants,           v_union.variants,           v_global.variants);
  v_schedule := coalesce(v_club.schedule,           v_union.schedule,           v_global.schedule);

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'union_id', v_union_id,
    'enabled', v_enabled,
    'pause_new_seatings', v_pause,
    'max_horses', v_max_h,
    'max_per_table', v_max_pt,
    'occupancy_bias', v_bias,
    'min_humans_to_seat', v_min_hum,
    'stake_bands', case when v_bands is null then null else to_jsonb(v_bands) end,
    'variants', case when v_variants is null then null else to_jsonb(v_variants) end,
    'schedule', v_schedule,
    'notes', coalesce(v_club.notes, v_union.notes, v_global.notes),
    -- Which row supplied each value. The Policy tab renders this so an
    -- operator can see that a club is capped by ITS row and enabled by
    -- the global one, rather than guessing.
    'source', jsonb_build_object(
      'enabled', case when v_club.enabled is not null then 'club'
                      when v_union.enabled is not null then 'union'
                      when v_global.enabled is not null then 'global'
                      else 'default' end,
      'pause_new_seatings', case when v_club.pause_new_seatings is not null then 'club'
                                 when v_union.pause_new_seatings is not null then 'union'
                                 when v_global.pause_new_seatings is not null then 'global'
                                 else 'default' end,
      'max_horses', case when v_club.max_horses is not null then 'club'
                         when v_union.max_horses is not null then 'union'
                         when v_global.max_horses is not null then 'global'
                         else 'default' end,
      'max_per_table', case when v_club.max_per_table is not null then 'club'
                            when v_union.max_per_table is not null then 'union'
                            when v_global.max_per_table is not null then 'global'
                            else 'default' end,
      'occupancy_bias', case when v_club.occupancy_bias is not null then 'club'
                             when v_union.occupancy_bias is not null then 'union'
                             when v_global.occupancy_bias is not null then 'global'
                             else 'default' end,
      'min_humans_to_seat', case when v_club.min_humans_to_seat is not null then 'club'
                                 when v_union.min_humans_to_seat is not null then 'union'
                                 when v_global.min_humans_to_seat is not null then 'global'
                                 else 'default' end,
      'stake_bands', case when v_club.stake_bands is not null then 'club'
                          when v_union.stake_bands is not null then 'union'
                          when v_global.stake_bands is not null then 'global'
                          else 'default' end,
      'variants', case when v_club.variants is not null then 'club'
                       when v_union.variants is not null then 'union'
                       when v_global.variants is not null then 'global'
                       else 'default' end,
      'schedule', case when v_club.schedule is not null then 'club'
                       when v_union.schedule is not null then 'union'
                       when v_global.schedule is not null then 'global'
                       else 'default' end
    ),
    'rows', jsonb_build_object(
      'global', v_global.scope is not null,
      'union', v_union.scope is not null,
      'club', v_club.scope is not null
    ),
    -- The engine stamps this on its heartbeat, so the console can say
    -- which version of the policy a cycle actually ran under.
    -- Null, not -infinity, when no row exists at all: the heartbeat
    -- stores this verbatim and a sentinel date on the Health tab would
    -- read as a policy written in the far past rather than as none.
    'policy_version', nullif(greatest(
      coalesce(v_club.updated_at,  '-infinity'::timestamptz),
      coalesce(v_union.updated_at, '-infinity'::timestamptz),
      coalesce(v_global.updated_at,'-infinity'::timestamptz)
    ), '-infinity'::timestamptz),
    'defaults_used', (v_global.scope is null and v_union.scope is null and v_club.scope is null)
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_policy_effective(uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_policy_effective(uuid) to service_role;

-- 5.2 Write a policy row ----------------------------------------------
--
-- Validates EVERY field before it writes anything, upserts the named
-- scope, and files one audit row carrying before and after.
--
-- `material` is REPORTED, not enforced. Contract section 0 defines a
-- material change as enabling or disabling the fleet globally or for a
-- club, moving a per club quota by more than 25 percent, or changing a
-- bankroll or buy-in value (this table carries no bankroll or buy-in
-- column, so that limb cannot arise here). The Phase 2 approvals queue
-- is what HOLDS such a change, through requireApproval with kind
-- fleet_policy at the route, exactly as the Mint does. This function
-- computes the same verdict from the rows themselves so the route and
-- the database cannot disagree about what counts as material.
create or replace function public.fn_ca_fleet_set_policy(
  p_scope      text,
  p_scope_id   uuid,
  p_patch      jsonb,
  p_updated_by uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_fields constant text[] := array[
    'enabled','pause_new_seatings','max_horses','max_per_table','occupancy_bias',
    'min_humans_to_seat','stake_bands','variants','schedule','notes'
  ];
  v_key      text;
  v_type     text;
  v_num      numeric;
  v_elem     jsonb;
  v_before   public.ca_horse_fleet_policy%rowtype;
  v_after    public.ca_horse_fleet_policy%rowtype;
  v_created  boolean := false;
  v_material boolean := false;
  v_reasons  jsonb := '[]'::jsonb;
  v_old_cap  numeric;
  v_new_cap  numeric;
  v_old_bias numeric;
  v_new_bias numeric;
  v_had_list boolean;
  v_old_len  int;
  v_new_len  int;
begin
  -- Scope, first, because everything else depends on which row this is.
  if p_scope is null or p_scope not in ('global','club','union') then
    return jsonb_build_object('ok', false, 'error', 'unknown_scope',
      'message', 'scope must be one of global, club, union',
      'scope', p_scope);
  end if;
  if p_scope = 'global' and p_scope_id is not null then
    return jsonb_build_object('ok', false, 'error', 'scope_id_not_allowed',
      'message', 'the global row has no scope_id');
  end if;
  if p_scope <> 'global' and p_scope_id is null then
    return jsonb_build_object('ok', false, 'error', 'scope_id_required',
      'message', 'a club or union row needs a scope_id');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_patch',
      'message', 'p_patch must be a json object');
  end if;
  -- An unattributable policy change is not written down as somebody
  -- else's, and fn_log_admin_action refuses a null actor anyway.
  if p_updated_by is null then
    return jsonb_build_object('ok', false, 'error', 'actor_required',
      'message', 'p_updated_by is required so the change can be audited');
  end if;

  -- Every key must be one this table carries. A typo that silently did
  -- nothing would read on the Policy tab as a change that was applied.
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (c_fields)) then
      return jsonb_build_object('ok', false, 'error', 'unknown_field',
        'message', 'not a policy field', 'field', v_key,
        'known', to_jsonb(c_fields));
    end if;
  end loop;

  -- Type and range, field by field. A json null CLEARS an override and
  -- hands the field back to the wider scope, so null is legal everywhere.
  foreach v_key in array array['enabled','pause_new_seatings'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('boolean','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'boolean', 'got', v_type);
      end if;
    end if;
  end loop;

  foreach v_key in array array['max_horses','max_per_table','min_humans_to_seat'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('number','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'integer', 'got', v_type);
      end if;
      if v_type = 'number' then
        v_num := (p_patch ->> v_key)::numeric;
        if v_num <> trunc(v_num) then
          return jsonb_build_object('ok', false, 'error', 'not_an_integer',
            'field', v_key, 'value', v_num);
        end if;
        if v_num < 0 then
          return jsonb_build_object('ok', false, 'error', 'negative_cap',
            'message', 'a cap is a count of seats and cannot be negative',
            'field', v_key, 'value', v_num);
        end if;
        if v_key = 'min_humans_to_seat' and v_num > 10 then
          return jsonb_build_object('ok', false, 'error', 'min_humans_out_of_range',
            'message', 'no table seats more than ten players, so this rule could never be met',
            'field', v_key, 'value', v_num);
        end if;
      end if;
    end if;
  end loop;

  if p_patch ? 'occupancy_bias' then
    v_type := jsonb_typeof(p_patch -> 'occupancy_bias');
    if v_type not in ('number','null') then
      return jsonb_build_object('ok', false, 'error', 'invalid_type',
        'field', 'occupancy_bias', 'expected', 'number', 'got', v_type);
    end if;
    if v_type = 'number' then
      v_num := (p_patch ->> 'occupancy_bias')::numeric;
      -- Zero or negative is an eviction dressed as arithmetic: it would
      -- take every table target to zero. Above ten is a fat finger.
      if v_num <= 0 or v_num > 10 then
        return jsonb_build_object('ok', false, 'error', 'bias_out_of_range',
          'message', 'occupancy_bias must be greater than 0 and at most 10',
          'field', 'occupancy_bias', 'value', v_num);
      end if;
    end if;
  end if;

  foreach v_key in array array['stake_bands','variants'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('array','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'array of strings', 'got', v_type);
      end if;
      if v_type = 'array' then
        for v_elem in select value from jsonb_array_elements(p_patch -> v_key) loop
          if jsonb_typeof(v_elem) <> 'string' then
            return jsonb_build_object('ok', false, 'error', 'invalid_array',
              'field', v_key, 'message', 'every element must be a string',
              'element', v_elem);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if p_patch ? 'schedule' then
    v_type := jsonb_typeof(p_patch -> 'schedule');
    if v_type not in ('array','null') then
      return jsonb_build_object('ok', false, 'error', 'invalid_type',
        'field', 'schedule', 'expected', 'array of hour ranges', 'got', v_type);
    end if;
    if v_type = 'array' then
      for v_elem in select value from jsonb_array_elements(p_patch -> 'schedule') loop
        if jsonb_typeof(v_elem) <> 'object'
           or not (v_elem ? 'start_hour') or not (v_elem ? 'end_hour')
           or jsonb_typeof(v_elem -> 'start_hour') <> 'number'
           or jsonb_typeof(v_elem -> 'end_hour') <> 'number' then
          return jsonb_build_object('ok', false, 'error', 'invalid_schedule',
            'message', 'each entry needs numeric start_hour and end_hour',
            'entry', v_elem);
        end if;
        if (v_elem ->> 'start_hour')::numeric < 0 or (v_elem ->> 'start_hour')::numeric > 23
           or (v_elem ->> 'end_hour')::numeric < 0 or (v_elem ->> 'end_hour')::numeric > 23 then
          return jsonb_build_object('ok', false, 'error', 'invalid_schedule',
            'message', 'hours are UTC and run 0 to 23. start greater than end wraps midnight',
            'entry', v_elem);
        end if;
      end loop;
    end if;
  end if;

  if p_patch ? 'notes' and jsonb_typeof(p_patch -> 'notes') not in ('string','null') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type',
      'field', 'notes', 'expected', 'string', 'got', jsonb_typeof(p_patch -> 'notes'));
  end if;

  -- The row as it stands, for the audit and for the materiality test.
  select * into v_before
  from public.ca_horse_fleet_policy
  where scope = p_scope
    and scope_key = coalesce(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_created := v_before.scope is null;

  -- MATERIALITY, exactly as contract section 0 words it.
  if p_patch ? 'enabled'
     and coalesce((p_patch ->> 'enabled')::boolean, true) is distinct from coalesce(v_before.enabled, true) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('enabled_changed'::text);
  end if;
  -- Pausing new seatings is disabling the fleet for that scope by
  -- another name, so it is held to the same standard.
  if p_patch ? 'pause_new_seatings'
     and coalesce((p_patch ->> 'pause_new_seatings')::boolean, false) is distinct from coalesce(v_before.pause_new_seatings, false) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('pause_changed'::text);
  end if;
  foreach v_key in array array['max_horses','max_per_table'] loop
    if p_patch ? v_key then
      v_old_cap := case v_key when 'max_horses' then v_before.max_horses else v_before.max_per_table end;
      v_new_cap := case when jsonb_typeof(p_patch -> v_key) = 'null' then null
                        else (p_patch ->> v_key)::numeric end;
      -- Setting or clearing a cap that did not exist is a change from
      -- unlimited, which has no percentage. It is material.
      if (v_old_cap is null) <> (v_new_cap is null) then
        v_material := true;
        v_reasons := v_reasons || to_jsonb((v_key || '_set_or_cleared')::text);
      elsif v_old_cap is not null and v_new_cap is not null then
        if v_old_cap = 0 then
          if v_new_cap <> 0 then
            v_material := true;
            v_reasons := v_reasons || to_jsonb((v_key || '_changed_from_zero')::text);
          end if;
        -- AN ABSOLUTE FLOOR UNDER THE PERCENTAGE (review M-7). Each patch is
        -- compared against the row as it stands, so a run of sub-25-percent
        -- cuts is a run of non-material changes and takes a club from 100
        -- horses to 3 with no approval. A cap this low is a stand-down
        -- whatever the step size that reached it. The complete fix also
        -- measures the WALK - the greatest cap this scope carried inside the
        -- approval TTL, from admin_audit_log's before_state - and that half is
        -- deliberately not in this phase; the floor closes the proved case.
        elsif v_new_cap <= 5 and v_new_cap < v_old_cap then
          v_material := true;
          v_reasons := v_reasons || to_jsonb((v_key || '_cut_to_a_floor')::text);
        elsif abs(v_new_cap - v_old_cap) / v_old_cap > 0.25 then
          v_material := true;
          v_reasons := v_reasons || to_jsonb((v_key || '_moved_more_than_25_percent')::text);
        end if;
      end if;
    end if;
  end loop;

  -- FIVE MORE FIELDS THAT CAN STOP THE FLEET SEATING (review H-1), in the
  -- same order and under the same reason strings as fleetPolicyMateriality in
  -- src/lib/horses/fleetPolicy.js. Each of these was below the line while
  -- being able to stop every table on the platform taking a horse: a global
  -- bias of 0.1 scales every seat target to a tenth, a min_humans_to_seat of
  -- 10 can never be met because ten seats is the widest table, and a band,
  -- variant or schedule restriction narrows eligibility to nothing. That is
  -- disabling the fleet for that scope by another name, so it is held to the
  -- same standard.
  if p_patch ? 'occupancy_bias' then
    v_old_bias := coalesce(v_before.occupancy_bias, 1.0);
    v_new_bias := coalesce(case when jsonb_typeof(p_patch -> 'occupancy_bias') = 'null' then null
                                else (p_patch ->> 'occupancy_bias')::numeric end, 1.0);
    if v_new_bias <= 0.5 and v_new_bias < v_old_bias then
      v_material := true;
      v_reasons := v_reasons || to_jsonb('occupancy_bias_cut_below_half'::text);
    elsif v_old_bias > 0 and abs(v_new_bias - v_old_bias) / v_old_bias > 0.25 then
      v_material := true;
      v_reasons := v_reasons || to_jsonb('occupancy_bias_moved_more_than_25_percent'::text);
    end if;
  end if;

  -- Raising the human minimum withholds seating from tables that qualified a
  -- moment ago. Lowering it gives seats back, which needs no second operator.
  if p_patch ? 'min_humans_to_seat'
     and coalesce(case when jsonb_typeof(p_patch -> 'min_humans_to_seat') = 'null' then null
                       else (p_patch ->> 'min_humans_to_seat')::numeric end, 0)
         > coalesce(v_before.min_humans_to_seat, 0) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('min_humans_to_seat_raised'::text);
  end if;

  -- A restriction is measured against NO restriction: null is "this scope
  -- withholds nothing", so adding a list where there was none is a narrowing
  -- however long the list is, and a shorter list is a narrowing too. Widening
  -- or clearing gives the fleet back seats it could not take.
  foreach v_key in array array['stake_bands','variants','schedule'] loop
    if p_patch ? v_key then
      v_had_list := case v_key
                      when 'stake_bands' then v_before.stake_bands is not null
                      when 'variants'    then v_before.variants is not null
                      else v_before.schedule is not null
                           and jsonb_typeof(v_before.schedule) = 'array'
                    end;
      v_old_len := case when not v_had_list then null
                        when v_key = 'stake_bands' then coalesce(array_length(v_before.stake_bands, 1), 0)
                        when v_key = 'variants'    then coalesce(array_length(v_before.variants, 1), 0)
                        else jsonb_array_length(v_before.schedule) end;
      v_new_len := case when jsonb_typeof(p_patch -> v_key) <> 'array' then null
                        else jsonb_array_length(p_patch -> v_key) end;
      if v_new_len is not null and (v_old_len is null or v_new_len < v_old_len) then
        v_material := true;
        v_reasons := v_reasons || to_jsonb((v_key || '_narrowed')::text);
      end if;
    end if;
  end loop;

  -- The upsert. Every column is named, so a NEW club row leaves the
  -- fields the patch did not mention as NULL and inherits them from the
  -- wider scope. On an existing row only the named keys move.
  insert into public.ca_horse_fleet_policy as t (
    scope, scope_id, enabled, pause_new_seatings, max_horses, max_per_table,
    occupancy_bias, min_humans_to_seat, stake_bands, variants, schedule,
    notes, updated_by, updated_at
  ) values (
    p_scope,
    p_scope_id,
    case when p_patch ? 'enabled' then (p_patch ->> 'enabled')::boolean else null end,
    case when p_patch ? 'pause_new_seatings' then (p_patch ->> 'pause_new_seatings')::boolean else null end,
    case when p_patch ? 'max_horses' then (p_patch ->> 'max_horses')::int else null end,
    case when p_patch ? 'max_per_table' then (p_patch ->> 'max_per_table')::int else null end,
    case when p_patch ? 'occupancy_bias' then (p_patch ->> 'occupancy_bias')::numeric else null end,
    case when p_patch ? 'min_humans_to_seat' then (p_patch ->> 'min_humans_to_seat')::int else null end,
    case when p_patch ? 'stake_bands' and jsonb_typeof(p_patch -> 'stake_bands') = 'array'
         then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'stake_bands'))
         else null end,
    case when p_patch ? 'variants' and jsonb_typeof(p_patch -> 'variants') = 'array'
         then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'variants'))
         else null end,
    case when p_patch ? 'schedule' and jsonb_typeof(p_patch -> 'schedule') = 'array'
         then p_patch -> 'schedule' else null end,
    case when p_patch ? 'notes' then p_patch ->> 'notes' else null end,
    p_updated_by,
    now()
  )
  on conflict (scope, scope_key) do update set
    enabled            = case when p_patch ? 'enabled' then (p_patch ->> 'enabled')::boolean else t.enabled end,
    pause_new_seatings = case when p_patch ? 'pause_new_seatings' then (p_patch ->> 'pause_new_seatings')::boolean else t.pause_new_seatings end,
    max_horses         = case when p_patch ? 'max_horses' then (p_patch ->> 'max_horses')::int else t.max_horses end,
    max_per_table      = case when p_patch ? 'max_per_table' then (p_patch ->> 'max_per_table')::int else t.max_per_table end,
    occupancy_bias     = case when p_patch ? 'occupancy_bias' then (p_patch ->> 'occupancy_bias')::numeric else t.occupancy_bias end,
    min_humans_to_seat = case when p_patch ? 'min_humans_to_seat' then (p_patch ->> 'min_humans_to_seat')::int else t.min_humans_to_seat end,
    stake_bands        = case when p_patch ? 'stake_bands'
                              then case when jsonb_typeof(p_patch -> 'stake_bands') = 'array'
                                        then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'stake_bands'))
                                        else null end
                              else t.stake_bands end,
    variants           = case when p_patch ? 'variants'
                              then case when jsonb_typeof(p_patch -> 'variants') = 'array'
                                        then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'variants'))
                                        else null end
                              else t.variants end,
    schedule           = case when p_patch ? 'schedule'
                              then case when jsonb_typeof(p_patch -> 'schedule') = 'array'
                                        then p_patch -> 'schedule' else null end
                              else t.schedule end,
    notes              = case when p_patch ? 'notes' then p_patch ->> 'notes' else t.notes end,
    updated_by         = p_updated_by,
    updated_at         = now()
  returning * into v_after;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_updated_by,
      p_action        := 'fleet.set_policy',
      p_target_type   := 'fleet_policy',
      -- THE SAME TARGET ID THE ROUTE USES (review M-2). fleet-admin.js files
      -- its own fleet.set_policy row under policyTargetId(), which is 'global'
      -- for the global row and '<scope>:<uuid>' otherwise. This function used
      -- to write 'global:global' for the global row, so a trail lookup on
      -- fn_ca_operator_audit_trail - which filters on an exact target_id -
      -- found one of the two rows and silently omitted the other, and the one
      -- it omitted carried the before and after snapshots.
      p_target_id     := case when p_scope = 'global' then 'global'
                              else p_scope || ':' || p_scope_id::text end,
      p_details       := jsonb_build_object(
                           'patch', p_patch,
                           'reason', p_reason,
                           'created', v_created,
                           'material', v_material,
                           'material_reasons', v_reasons
                         ),
      p_before_state  := case when v_created then null else to_jsonb(v_before) end,
      p_after_state   := to_jsonb(v_after),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_fleet_set_policy audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'scope_id', p_scope_id,
    'created', v_created,
    'material', v_material,
    'material_reasons', v_reasons,
    'before', case when v_created then null else to_jsonb(v_before) end,
    'after', to_jsonb(v_after),
    -- What the ENGINE will now read. fn_ca_fleet_policy_effective is
    -- keyed by club, so a club write echoes that club's merged policy
    -- and a global or union write echoes the global view. effective_for
    -- says which, so the console never renders a global answer under a
    -- union heading.
    'effective_for', case when p_scope = 'club' then 'club:' || p_scope_id::text else 'global' end,
    'effective', case when p_scope = 'club' then public.fn_ca_fleet_policy_effective(p_scope_id)
                      else public.fn_ca_fleet_policy_effective(null) end
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_set_policy(text, uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_set_policy(text, uuid, jsonb, uuid, text) to service_role;

-- 5.3 The engine's one write per cycle ---------------------------------
--
-- Replaces the state rows it NAMES and appends one heartbeat. Rows it
-- does not name are left alone, so a partial cycle never blanks the
-- fleet. NO AUDIT ROW: this is machine telemetry running once per cycle
-- forever, and contract section 1 says so. Auditing it would bury the
-- operator actions the trail exists to make findable.
create or replace function public.fn_ca_fleet_state_upsert(p_rows jsonb, p_beat jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_written int := 0;
  v_skipped int := 0;
  v_beat_id bigint;
  v_beat_at timestamptz;
begin
  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    with incoming as (
      select
        nullif(r ->> 'horse_id', '')::uuid as horse_id,
        case when coalesce(r ->> 'state', 'unknown') in
               ('idle','seated','playing','sitting_out','busted','suspended','retired','unknown')
             then r ->> 'state' else 'unknown' end as state,
        nullif(r ->> 'club_id', '')::uuid       as club_id,
        nullif(r ->> 'table_id', '')::uuid      as table_id,
        nullif(r ->> 'seat_index', '')::int     as seat_index,
        nullif(r ->> 'stack', '')::numeric      as stack,
        nullif(r ->> 'last_action_at', '')::timestamptz     as last_action_at,
        coalesce(nullif(r ->> 'last_seen_at', '')::timestamptz, now()) as last_seen_at,
        nullif(r ->> 'session_started_at', '')::timestamptz as session_started_at,
        coalesce(nullif(r ->> 'hands_this_session', '')::int, 0) as hands_this_session,
        nullif(r ->> 'lane', '')                as lane,
        nullif(r ->> 'stake_band', '')          as stake_band,
        nullif(r ->> 'bankroll', '')::numeric   as bankroll,
        nullif(r ->> 'note', '')                as note
      from jsonb_array_elements(p_rows) as r
      where jsonb_typeof(r) = 'object'
    ),
    valid as (
      select * from incoming where horse_id is not null
    ),
    -- One row per horse per call. A cycle that named the same horse
    -- twice must not trip the primary key: the last mention wins.
    deduped as (
      select distinct on (horse_id) * from valid order by horse_id, last_seen_at desc
    ),
    upserted as (
      insert into public.ca_horse_fleet_state as s (
        horse_id, state, club_id, table_id, seat_index, stack, last_action_at,
        last_seen_at, session_started_at, hands_this_session, lane, stake_band,
        bankroll, note, updated_at
      )
      select horse_id, state, club_id, table_id, seat_index, stack, last_action_at,
             last_seen_at, session_started_at, hands_this_session, lane, stake_band,
             bankroll, note, now()
      from deduped
      on conflict (horse_id) do update set
        state              = excluded.state,
        club_id            = excluded.club_id,
        table_id           = excluded.table_id,
        seat_index         = excluded.seat_index,
        stack              = excluded.stack,
        last_action_at     = excluded.last_action_at,
        last_seen_at       = excluded.last_seen_at,
        session_started_at = excluded.session_started_at,
        hands_this_session = excluded.hands_this_session,
        lane               = excluded.lane,
        stake_band         = excluded.stake_band,
        bankroll           = excluded.bankroll,
        note               = excluded.note,
        updated_at         = now()
      returning 1
    )
    select
      (select count(*) from upserted),
      (select count(*) from incoming) - (select count(*) from deduped)
    into v_written, v_skipped;
  end if;

  if p_beat is not null and jsonb_typeof(p_beat) = 'object' then
    insert into public.ca_horse_fleet_heartbeat (
      beat_at, cycle_ms, horses_total, horses_seated, horses_idle, horses_stuck,
      tables_seen, tables_seeded, seats_filled, seats_released, policy_version,
      degraded, detail
    ) values (
      coalesce(nullif(p_beat ->> 'beat_at', '')::timestamptz, now()),
      nullif(p_beat ->> 'cycle_ms', '')::int,
      nullif(p_beat ->> 'horses_total', '')::int,
      nullif(p_beat ->> 'horses_seated', '')::int,
      nullif(p_beat ->> 'horses_idle', '')::int,
      nullif(p_beat ->> 'horses_stuck', '')::int,
      nullif(p_beat ->> 'tables_seen', '')::int,
      nullif(p_beat ->> 'tables_seeded', '')::int,
      nullif(p_beat ->> 'seats_filled', '')::int,
      nullif(p_beat ->> 'seats_released', '')::int,
      nullif(p_beat ->> 'policy_version', '')::timestamptz,
      coalesce((p_beat ->> 'degraded')::boolean, false),
      case when jsonb_typeof(p_beat -> 'detail') = 'object' then p_beat -> 'detail' else null end
    )
    returning id, beat_at into v_beat_id, v_beat_at;
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows_written', coalesce(v_written, 0),
    'rows_skipped', coalesce(v_skipped, 0),
    'heartbeat_id', v_beat_id,
    'beat_at', v_beat_at,
    'audited', false,
    'audit_note', 'machine telemetry, one call per engine cycle, deliberately not audited'
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_state_upsert(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_state_upsert(jsonb, jsonb) to service_role;

-- 5.4 The Health tab ---------------------------------------------------
--
-- Counts by state, the stuck count, heartbeat freshness, capacity
-- headroom and per club allocation actual against quota. A pure read: no
-- actor, no audit row. The capacity section reads `tables` and
-- `table_seats`, which this file does not create, so both reads are
-- guarded and their absence produces nulls plus a named source rather
-- than an error.
create or replace function public.fn_ca_fleet_overview(p_window_minutes int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_window int := greatest(coalesce(p_window_minutes, 15), 1);
  v_states jsonb;
  v_total  int;
  v_stuck  int;
  v_stuck_ids jsonb;
  v_beat   public.ca_horse_fleet_heartbeat%rowtype;
  v_beat_json jsonb;
  v_tables_live int;
  v_seats_total int;
  v_seats_filled int;
  v_have_tables boolean := to_regclass('public.tables') is not null;
  v_have_seats  boolean := to_regclass('public.table_seats') is not null;
  v_capacity jsonb;
  v_clubs jsonb;
  v_notes jsonb := '[]'::jsonb;
begin
  -- Counts by state, every state present even at zero. A tab that hides
  -- 'busted' because it happens to be zero teaches the operator that
  -- busted is not a thing.
  select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb), coalesce(sum(s.n), 0)
    into v_states, v_total
  from (
    select k.state, coalesce(c.n, 0) as n
    from unnest(array['idle','seated','playing','sitting_out','busted','suspended','retired','unknown']) as k(state)
    left join (
      select state, count(*)::int as n from public.ca_horse_fleet_state group by state
    ) c on c.state = k.state
  ) s;

  -- Stuck: holding a seat and quiet for longer than the window.
  --
  -- MEASURED FROM THE BEST TIMESTAMP AVAILABLE (review M-9). A horse that
  -- has never acted since it sat down IS the case this number exists to
  -- surface - but only once the window has passed. A null last_action_at
  -- used to count as stuck on its own, so the cycle that seats forty
  -- horses published forty state rows with no action to report yet and the
  -- next Health load called a healthy fleet forty stuck seats. The row
  -- carries session_started_at and last_seen_at, so how long the horse has
  -- actually been sitting there is knowable and is what is measured.
  select count(*)::int into v_stuck
  from public.ca_horse_fleet_state
  where state in ('seated','playing')
    and coalesce(last_action_at, session_started_at, last_seen_at)
        < now() - make_interval(mins => v_window);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_stuck_ids
  from (
    select jsonb_build_object(
             'horse_id', horse_id, 'club_id', club_id, 'table_id', table_id,
             'state', state, 'last_action_at', last_action_at,
             -- Which timestamp the count actually used, so a row with no
             -- last_action_at does not read as an unexplained finding.
             'stuck_since', coalesce(last_action_at, session_started_at, last_seen_at)
           ) as x
    from public.ca_horse_fleet_state
    where state in ('seated','playing')
      and coalesce(last_action_at, session_started_at, last_seen_at)
          < now() - make_interval(mins => v_window)
    order by coalesce(last_action_at, session_started_at, last_seen_at) asc
    limit 50
  ) t;

  select * into v_beat
  from public.ca_horse_fleet_heartbeat
  order by beat_at desc
  limit 1;

  if v_beat.id is null then
    v_beat_json := null;
    v_notes := v_notes || to_jsonb('no heartbeat has ever been recorded'::text);
  else
    v_beat_json := jsonb_build_object(
      'id', v_beat.id,
      'beat_at', v_beat.beat_at,
      'age_seconds', floor(extract(epoch from (now() - v_beat.beat_at)))::bigint,
      -- Stale once the last beat is older than the window the caller is
      -- asking about. The console states a stale heartbeat loudly.
      'stale', (now() - v_beat.beat_at) > make_interval(mins => v_window),
      'cycle_ms', v_beat.cycle_ms,
      'degraded', v_beat.degraded,
      'horses_total', v_beat.horses_total,
      'horses_seated', v_beat.horses_seated,
      'horses_idle', v_beat.horses_idle,
      'horses_stuck', v_beat.horses_stuck,
      'tables_seen', v_beat.tables_seen,
      'tables_seeded', v_beat.tables_seeded,
      'seats_filled', v_beat.seats_filled,
      'seats_released', v_beat.seats_released,
      'policy_version', v_beat.policy_version,
      'detail', v_beat.detail
    );
  end if;

  -- Capacity. Live tables and their seat count against seats actually
  -- occupied by anybody, horse or human. Contract section 0: a horse
  -- counts everywhere a human counts, so this is a total, not a fleet
  -- total.
  if v_have_tables then
    begin
      execute 'select count(*)::int, coalesce(sum(coalesce(t.max_players, 0)), 0)::int '
           || 'from public.tables t where coalesce(t.status, '''') in (''running'', ''active'', ''waiting'')'
        into v_tables_live, v_seats_total;
    exception when others then
      v_have_tables := false;
      v_notes := v_notes || to_jsonb(('tables could not be read: ' || sqlerrm)::text);
    end;
  else
    v_notes := v_notes || to_jsonb('public.tables is not present, so capacity is unavailable'::text);
  end if;

  if v_have_seats then
    begin
      execute 'select count(*)::int from public.table_seats where left_at is null'
        into v_seats_filled;
    exception when others then
      v_have_seats := false;
      v_notes := v_notes || to_jsonb(('table_seats could not be read: ' || sqlerrm)::text);
    end;
  else
    v_notes := v_notes || to_jsonb('public.table_seats is not present, so occupancy is unavailable'::text);
  end if;

  v_capacity := jsonb_build_object(
    'tables_live', case when v_have_tables then v_tables_live else null end,
    'seats_total', case when v_have_tables then v_seats_total else null end,
    'seats_filled', case when v_have_seats then v_seats_filled else null end,
    'seats_free', case when v_have_tables and v_have_seats
                       then greatest(coalesce(v_seats_total, 0) - coalesce(v_seats_filled, 0), 0)
                       else null end,
    'sources', jsonb_build_object('tables', v_have_tables, 'table_seats', v_have_seats)
  );

  -- Per club allocation: how many horses this club is actually carrying
  -- against the cap its effective policy sets. quota null means no cap,
  -- which is today's answer for every club.
  -- One policy resolution per club, through a LATERAL, rather than one
  -- per field. The Health tab renders every club at once and the engine
  -- is already asking this question on its own cycle.
  select coalesce(jsonb_agg(x order by x ->> 'club_id'), '[]'::jsonb) into v_clubs
  from (
    select jsonb_build_object(
             'club_id', a.club_id,
             'actual', a.n,
             'seated', a.seated,
             'quota', (pol.p ->> 'max_horses')::int,
             'enabled', (pol.p ->> 'enabled')::boolean,
             'paused', (pol.p ->> 'pause_new_seatings')::boolean,
             'headroom', case when pol.p ->> 'max_horses' is null then null
                              else (pol.p ->> 'max_horses')::int - a.n end
           ) as x
    from (
      select club_id,
             count(*)::int as n,
             count(*) filter (where state in ('seated','playing'))::int as seated
      from public.ca_horse_fleet_state
      where club_id is not null
      group by club_id
    ) a
    cross join lateral (select public.fn_ca_fleet_policy_effective(a.club_id) as p) pol
  ) t;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'window_minutes', v_window,
    'states', v_states,
    'total', coalesce(v_total, 0),
    'stuck', coalesce(v_stuck, 0),
    'stuck_sample', v_stuck_ids,
    'heartbeat', v_beat_json,
    'capacity', v_capacity,
    'clubs', v_clubs,
    'notes', v_notes
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_overview(int) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_overview(int) to service_role;

-- 5.5 The isolation report --------------------------------------------
--
-- Dan's DSS ruling: a horse plays inside its own club or union only.
-- EMPTY IS THE CORRECT ANSWER, and the console says so in as many words.
--
-- A scope is the club's union where the club belongs to one, and the
-- club itself where it does not, so two clubs of the same union are ONE
-- scope and a horse sitting in both is not a finding.
--
-- Everything it reads - table_seats, tables, union_clubs, profiles -
-- belongs to another migration, so the whole query is assembled and
-- issued as dynamic SQL behind to_regclass guards. A missing source
-- returns an empty report naming what was missing. It never raises.
-- A pure read: no actor, no audit row.
create or replace function public.fn_ca_fleet_isolation_report(p_limit int, p_offset int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_have_seats  boolean := to_regclass('public.table_seats') is not null;
  v_have_tables boolean := to_regclass('public.tables') is not null;
  v_have_uc     boolean := to_regclass('public.union_clubs') is not null;
  v_have_is_horse boolean := false;
  v_fleet_filter text;
  v_union_join   text;
  v_union_expr   text;
  v_sql   text;
  v_rows  jsonb := '[]'::jsonb;
  v_total int := 0;
  v_notes jsonb := '[]'::jsonb;
begin
  if to_regclass('public.profiles') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_horse'
    ) into v_have_is_horse;
  end if;

  if not v_have_seats or not v_have_tables then
    -- Empty rather than failing, and the envelope says which source was
    -- missing so a zero is never mistaken for a clean bill of health.
    if not v_have_seats then
      v_notes := v_notes || to_jsonb('public.table_seats is not present'::text);
    end if;
    if not v_have_tables then
      v_notes := v_notes || to_jsonb('public.tables is not present'::text);
    end if;
    return jsonb_build_object(
      'ok', true, 'generated_at', now(), 'total', 0, 'limit', v_limit, 'offset', v_offset,
      'rows', '[]'::jsonb, 'complete', false,
      'sources', jsonb_build_object('table_seats', v_have_seats, 'tables', v_have_tables,
                                    'union_clubs', v_have_uc, 'profiles_is_horse', v_have_is_horse),
      'notes', v_notes
    );
  end if;

  -- WHO IS A HORSE. profiles.is_horse is authoritative. Where it cannot
  -- be read, the register this migration creates is the fallback, and a
  -- register that has never been synced yields an empty report with a
  -- note rather than a report full of humans.
  if v_have_is_horse then
    v_fleet_filter := 'exists (select 1 from public.profiles p where p.id = ts.user_id and coalesce(p.is_horse, false))';
  else
    v_fleet_filter := 'exists (select 1 from public.ca_horse_fleet_register r where r.horse_id = ts.user_id and r.retired_at is null)';
    v_notes := v_notes || to_jsonb('profiles.is_horse is unavailable, so the fleet was taken from ca_horse_fleet_register'::text);
  end if;

  if v_have_uc then
    v_union_join := 'left join public.union_clubs uc on uc.club_id = t.club_id ';
    v_union_expr := 'uc.union_id';
  else
    v_union_join := '';
    v_union_expr := 'null::uuid';
    v_notes := v_notes || to_jsonb('public.union_clubs is not present, so every club is its own scope'::text);
  end if;

  v_sql :=
    'with seats as ( '
    || '  select ts.user_id as horse_id, t.club_id, ' || v_union_expr || ' as union_id, ts.table_id '
    || '  from public.table_seats ts '
    || '  join public.tables t on t.id = ts.table_id '
    || v_union_join
    || '  where ts.left_at is null and t.club_id is not null and ts.user_id is not null and ' || v_fleet_filter
    || '), scoped as ( '
    || '  select horse_id, '
    || '         coalesce(union_id, club_id) as scope_id, '
    || '         case when union_id is not null then ''union'' else ''club'' end as scope_kind, '
    || '         club_id, table_id '
    || '  from seats '
    || '), per_scope as ( '
    || '  select horse_id, scope_id, min(scope_kind) as scope_kind, '
    || '         count(*)::int as seats, '
    || '         jsonb_agg(distinct club_id) as club_ids, '
    || '         jsonb_agg(distinct table_id) as table_ids '
    || '  from scoped group by horse_id, scope_id '
    || '), offenders as ( '
    || '  select horse_id, count(*)::int as scope_count '
    || '  from per_scope group by horse_id having count(*) > 1 '
    || ') '
    || 'select (select count(*)::int from offenders), '
    || '       coalesce((select jsonb_agg(r order by r ->> ''horse_id'') from ( '
    || '         select jsonb_build_object( '
    || '           ''horse_id'', o.horse_id, '
    || '           ''scope_count'', o.scope_count, '
    || '           ''scopes'', (select jsonb_agg(jsonb_build_object( '
    || '                          ''scope_kind'', ps.scope_kind, ''scope_id'', ps.scope_id, '
    || '                          ''seats'', ps.seats, ''club_ids'', ps.club_ids, ''table_ids'', ps.table_ids) '
    || '                        order by ps.scope_id) '
    || '                       from per_scope ps where ps.horse_id = o.horse_id) '
    || '         ) as r '
    || '         from offenders o order by o.horse_id limit $1 offset $2 '
    || '       ) x), ''[]''::jsonb)';

  begin
    execute v_sql into v_total, v_rows using v_limit, v_offset;
  exception when others then
    v_notes := v_notes || to_jsonb(('the isolation query could not run: ' || sqlerrm)::text);
    return jsonb_build_object(
      'ok', true, 'generated_at', now(), 'total', 0, 'limit', v_limit, 'offset', v_offset,
      'rows', '[]'::jsonb, 'complete', false,
      'sources', jsonb_build_object('table_seats', v_have_seats, 'tables', v_have_tables,
                                    'union_clubs', v_have_uc, 'profiles_is_horse', v_have_is_horse),
      'notes', v_notes
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'complete', true,
    'sources', jsonb_build_object('table_seats', v_have_seats, 'tables', v_have_tables,
                                  'union_clubs', v_have_uc, 'profiles_is_horse', v_have_is_horse),
    'ruling', 'A horse plays inside its own club or union only. An empty report is the correct answer.',
    'notes', v_notes
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_isolation_report(int, int) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_isolation_report(int, int) to service_role;

-- 5.6 Fleet P and L ----------------------------------------------------
--
-- READ ONLY, AND IT NEVER RECOMPUTES MONEY. Every figure is a SUM of a
-- column the platform already keeps: horse_daily_nets for fleet chips,
-- club_rake_daily_user for rake, ca_club_player_daily as the fallback
-- for chips and the second rake source. Rake is reported in its OWN
-- column and is never folded into the chip total, because rake is the
-- platform's revenue and chips are the fleet's swing, and adding them
-- produces a number that means nothing.
--
-- None of those three tables is created here and their column names are
-- not knowable from this repository, so the function resolves them at
-- run time out of information_schema.columns from a candidate list and
-- reports in `sources` exactly which table and which columns it used. A
-- missing table, or a table whose columns match nothing in the list,
-- contributes zero and says so. It returns an empty P and L rather than
-- failing, and it never invents a total: a zero always travels with the
-- note that says the source was absent.
--
-- A pure read: no actor, no audit row.
create or replace function public.fn_ca_fleet_pnl(p_from date, p_to date, p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from date := coalesce(p_from, current_date - 29);
  v_to   date := coalesce(p_to, current_date);
  v_cols text[];

  -- horse_daily_nets
  v_hdn boolean := to_regclass('public.horse_daily_nets') is not null;
  v_hdn_day text; v_hdn_horse text; v_hdn_club text; v_hdn_net text;
  v_hdn_won text; v_hdn_lost text; v_hdn_hands text; v_hdn_stake text;
  v_hdn_expr text;
  v_hdn_used boolean := false;

  -- club_rake_daily_user
  v_crd boolean := to_regclass('public.club_rake_daily_user') is not null;
  v_crd_day text; v_crd_user text; v_crd_club text; v_crd_rake text;
  v_crd_used boolean := false;

  -- ca_club_player_daily
  v_cpd boolean := to_regclass('public.ca_club_player_daily') is not null;
  v_cpd_day text; v_cpd_user text; v_cpd_club text; v_cpd_net text; v_cpd_rake text; v_cpd_hands text;
  v_cpd_used boolean := false;

  v_have_is_horse boolean := false;
  v_fleet_filter text := 'true';

  v_sql text;
  v_by_club jsonb := '[]'::jsonb;
  v_by_stake jsonb := '[]'::jsonb;
  v_by_day jsonb := '[]'::jsonb;
  v_net numeric := 0;
  v_hands numeric := 0;
  v_rake numeric := 0;
  v_notes jsonb := '[]'::jsonb;
begin
  if v_to < v_from then
    return jsonb_build_object('ok', false, 'error', 'range_inverted',
      'message', 'p_to is earlier than p_from', 'from', v_from, 'to', v_to);
  end if;

  if to_regclass('public.profiles') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_horse'
    ) into v_have_is_horse;
  end if;

  -- ---- horse_daily_nets: the fleet's own chip ledger ----------------
  if v_hdn then
    select coalesce(array_agg(column_name::text), '{}') into v_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = 'horse_daily_nets';

    v_hdn_day   := (select x from unnest(array['day','net_date','stat_date','date','as_of_date','as_of','play_date']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_horse := (select x from unnest(array['horse_id','user_id','profile_id','player_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_club  := (select x from unnest(array['club_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_net   := (select x from unnest(array['net','net_chips','net_amount','chips_net','net_result','profit','result']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_won   := (select x from unnest(array['won','chips_won','total_winnings','winnings']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_lost  := (select x from unnest(array['lost','chips_lost','total_losses','losses']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_hands := (select x from unnest(array['hands','hands_played','hand_count']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_hdn_stake := (select x from unnest(array['stake_band','stakes','big_blind','bb','stake']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);

    -- The ONE derivation this function is allowed: where the table
    -- keeps won and lost but no net, net is won minus lost. Both halves
    -- are still READ, never recomputed from hands.
    if v_hdn_net is not null then
      v_hdn_expr := 'coalesce(h.' || quote_ident(v_hdn_net) || ', 0)';
    elsif v_hdn_won is not null and v_hdn_lost is not null then
      v_hdn_expr := 'coalesce(h.' || quote_ident(v_hdn_won) || ', 0) - coalesce(h.' || quote_ident(v_hdn_lost) || ', 0)';
    else
      v_hdn_expr := null;
    end if;

    if v_hdn_day is null or v_hdn_expr is null then
      v_notes := v_notes || to_jsonb('horse_daily_nets exists but carries no recognised day or net column, so it was not read'::text);
    else
      v_hdn_used := true;
    end if;
  else
    v_notes := v_notes || to_jsonb('public.horse_daily_nets is not present'::text);
  end if;

  if v_hdn_used then
    v_sql :=
      'with src as (select '
      || 'h.' || quote_ident(v_hdn_day) || '::date as d, '
      || coalesce('h.' || quote_ident(v_hdn_club), 'null::uuid') || ' as club_id, '
      || coalesce('h.' || quote_ident(v_hdn_stake) || '::text', 'null::text') || ' as stake_band, '
      || v_hdn_expr || '::numeric as net, '
      || coalesce('coalesce(h.' || quote_ident(v_hdn_hands) || ', 0)', '0') || '::numeric as hands '
      || 'from public.horse_daily_nets h '
      || 'where h.' || quote_ident(v_hdn_day) || '::date between $1 and $2 '
      || case when v_hdn_club is not null
              then 'and ($3::uuid is null or h.' || quote_ident(v_hdn_club) || ' = $3::uuid) '
              else 'and $3::uuid is null ' end
      || ') '
      || 'select coalesce(sum(net), 0), coalesce(sum(hands), 0), '
      || '  coalesce((select jsonb_agg(jsonb_build_object(''club_id'', club_id, ''net'', net, ''hands'', hands) order by club_id) '
      || '            from (select club_id, sum(net) as net, sum(hands) as hands from src group by club_id) a), ''[]''::jsonb), '
      || '  coalesce((select jsonb_agg(jsonb_build_object(''stake_band'', stake_band, ''net'', net, ''hands'', hands) order by stake_band) '
      || '            from (select stake_band, sum(net) as net, sum(hands) as hands from src group by stake_band) b), ''[]''::jsonb), '
      || '  coalesce((select jsonb_agg(jsonb_build_object(''day'', d, ''net'', net, ''hands'', hands) order by d) '
      || '            from (select d, sum(net) as net, sum(hands) as hands from src group by d) c), ''[]''::jsonb) '
      || 'from src';
    begin
      execute v_sql into v_net, v_hands, v_by_club, v_by_stake, v_by_day using v_from, v_to, p_club_id;
      if v_hdn_stake is null then
        v_notes := v_notes || to_jsonb('horse_daily_nets carries no stake column, so the by stake breakdown is a single null band'::text);
      end if;
      if v_hdn_club is null and p_club_id is not null then
        v_notes := v_notes || to_jsonb('horse_daily_nets carries no club_id, so a club filter returns nothing from it'::text);
      end if;
    exception when others then
      v_hdn_used := false;
      v_net := 0; v_hands := 0;
      v_by_club := '[]'::jsonb; v_by_stake := '[]'::jsonb; v_by_day := '[]'::jsonb;
      v_notes := v_notes || to_jsonb(('horse_daily_nets could not be read: ' || sqlerrm)::text);
    end;
  end if;

  -- ---- ca_club_player_daily: the fallback chip source and a rake ----
  if v_cpd then
    select coalesce(array_agg(column_name::text), '{}') into v_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ca_club_player_daily';

    v_cpd_day   := (select x from unnest(array['day','stat_date','date','as_of_date','play_date']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_cpd_user  := (select x from unnest(array['user_id','player_id','profile_id','horse_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_cpd_club  := (select x from unnest(array['club_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_cpd_net   := (select x from unnest(array['net','net_chips','net_amount','profit','result']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_cpd_rake  := (select x from unnest(array['rake','rake_amount','total_rake','rake_paid','rake_contributed']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_cpd_hands := (select x from unnest(array['hands','hands_played','hand_count']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);

    if v_cpd_day is null or v_cpd_user is null then
      v_notes := v_notes || to_jsonb('ca_club_player_daily exists but carries no recognised day or user column, so it was not read'::text);
    else
      v_cpd_used := true;
    end if;
  else
    v_notes := v_notes || to_jsonb('public.ca_club_player_daily is not present'::text);
  end if;

  -- ---- club_rake_daily_user: rake, kept separate --------------------
  if v_crd then
    select coalesce(array_agg(column_name::text), '{}') into v_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = 'club_rake_daily_user';

    v_crd_day  := (select x from unnest(array['day','stat_date','date','as_of_date','play_date']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_crd_user := (select x from unnest(array['user_id','player_id','profile_id','horse_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_crd_club := (select x from unnest(array['club_id']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);
    v_crd_rake := (select x from unnest(array['rake','rake_amount','total_rake','rake_paid','rake_contributed']) with ordinality t(x, o) where x = any (v_cols) order by o limit 1);

    if v_crd_day is null or v_crd_user is null or v_crd_rake is null then
      v_notes := v_notes || to_jsonb('club_rake_daily_user exists but carries no recognised day, user or rake column, so it was not read'::text);
    else
      v_crd_used := true;
    end if;
  else
    v_notes := v_notes || to_jsonb('public.club_rake_daily_user is not present'::text);
  end if;

  -- Both per user tables carry HUMANS as well, so the fleet filter is
  -- not optional. Without it these are club totals, not fleet totals,
  -- and a P and L that quietly counts human money is worse than none.
  -- %s, not %I: the caller substitutes an ALREADY qualified and quoted
  -- column reference such as c."user_id", and %I would quote the whole
  -- thing again into a single identifier that does not exist.
  if v_have_is_horse then
    v_fleet_filter := 'exists (select 1 from public.profiles p where p.id = %s and coalesce(p.is_horse, false))';
  else
    v_fleet_filter := 'exists (select 1 from public.ca_horse_fleet_register r where r.horse_id = %s and r.retired_at is null)';
    v_notes := v_notes || to_jsonb('profiles.is_horse is unavailable, so the fleet was taken from ca_horse_fleet_register'::text);
  end if;

  if v_crd_used then
    begin
      execute
        'select coalesce(sum(coalesce(c.' || quote_ident(v_crd_rake) || ', 0)), 0) '
        || 'from public.club_rake_daily_user c '
        || 'where c.' || quote_ident(v_crd_day) || '::date between $1 and $2 '
        || case when v_crd_club is not null
                then 'and ($3::uuid is null or c.' || quote_ident(v_crd_club) || ' = $3::uuid) '
                else 'and $3::uuid is null ' end
        || 'and ' || format(v_fleet_filter, 'c.' || quote_ident(v_crd_user))
        into v_rake using v_from, v_to, p_club_id;
    exception when others then
      v_crd_used := false;
      v_rake := 0;
      v_notes := v_notes || to_jsonb(('club_rake_daily_user could not be read: ' || sqlerrm)::text);
    end;
  end if;

  -- ca_club_player_daily only fills the CHIP columns when
  -- horse_daily_nets could not be read. Two sources summed into one
  -- total would double count the same hands.
  if v_cpd_used and not v_hdn_used and v_cpd_net is not null then
    begin
      execute
        'with src as (select d.' || quote_ident(v_cpd_day) || '::date as d, '
        || coalesce('d.' || quote_ident(v_cpd_club), 'null::uuid') || ' as club_id, '
        || 'coalesce(d.' || quote_ident(v_cpd_net) || ', 0)::numeric as net, '
        || coalesce('coalesce(d.' || quote_ident(v_cpd_hands) || ', 0)', '0') || '::numeric as hands '
        || 'from public.ca_club_player_daily d '
        || 'where d.' || quote_ident(v_cpd_day) || '::date between $1 and $2 '
        || case when v_cpd_club is not null
                then 'and ($3::uuid is null or d.' || quote_ident(v_cpd_club) || ' = $3::uuid) '
                else 'and $3::uuid is null ' end
        || 'and ' || format(v_fleet_filter, 'd.' || quote_ident(v_cpd_user)) || ') '
        || 'select coalesce(sum(net), 0), coalesce(sum(hands), 0), '
        || '  coalesce((select jsonb_agg(jsonb_build_object(''club_id'', club_id, ''net'', net, ''hands'', hands) order by club_id) '
        || '            from (select club_id, sum(net) as net, sum(hands) as hands from src group by club_id) a), ''[]''::jsonb), '
        || '  coalesce((select jsonb_agg(jsonb_build_object(''day'', d, ''net'', net, ''hands'', hands) order by d) '
        || '            from (select d, sum(net) as net, sum(hands) as hands from src group by d) c), ''[]''::jsonb) '
        || 'from src'
        into v_net, v_hands, v_by_club, v_by_day using v_from, v_to, p_club_id;
      v_notes := v_notes || to_jsonb('chips came from ca_club_player_daily because horse_daily_nets could not be read'::text);
    exception when others then
      v_net := 0; v_hands := 0;
      v_by_club := '[]'::jsonb; v_by_day := '[]'::jsonb;
      v_notes := v_notes || to_jsonb(('ca_club_player_daily could not be read: ' || sqlerrm)::text);
    end;
  end if;

  -- Rake from ca_club_player_daily only where the dedicated rake table
  -- gave nothing, for the same double counting reason.
  if not v_crd_used and v_cpd_used and v_cpd_rake is not null then
    begin
      execute
        'select coalesce(sum(coalesce(d.' || quote_ident(v_cpd_rake) || ', 0)), 0) '
        || 'from public.ca_club_player_daily d '
        || 'where d.' || quote_ident(v_cpd_day) || '::date between $1 and $2 '
        || case when v_cpd_club is not null
                then 'and ($3::uuid is null or d.' || quote_ident(v_cpd_club) || ' = $3::uuid) '
                else 'and $3::uuid is null ' end
        || 'and ' || format(v_fleet_filter, 'd.' || quote_ident(v_cpd_user))
        into v_rake using v_from, v_to, p_club_id;
      v_notes := v_notes || to_jsonb('rake came from ca_club_player_daily because club_rake_daily_user could not be read'::text);
    exception when others then
      v_rake := 0;
      v_notes := v_notes || to_jsonb(('ca_club_player_daily rake could not be read: ' || sqlerrm)::text);
    end;
  end if;

  if not v_hdn_used and not v_cpd_used then
    v_notes := v_notes || to_jsonb('no chip source could be read, so every chip figure is a reported zero and not a measurement'::text);
  end if;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'from', v_from,
    'to', v_to,
    'club_id', p_club_id,
    'read_only', true,
    'totals', jsonb_build_object(
      'net', v_net,
      'hands', v_hands,
      -- Rake is the platform's revenue, not the fleet's swing. It is
      -- reported beside the chips and never added to them.
      'rake', v_rake
    ),
    'by_club', v_by_club,
    'by_stake', v_by_stake,
    'by_day', v_by_day,
    'sources', jsonb_build_object(
      'horse_daily_nets', jsonb_build_object('present', v_hdn, 'used', v_hdn_used,
        'columns', jsonb_build_object('day', v_hdn_day, 'club', v_hdn_club, 'net', v_hdn_net,
                                      'won', v_hdn_won, 'lost', v_hdn_lost,
                                      'hands', v_hdn_hands, 'stake', v_hdn_stake)),
      'club_rake_daily_user', jsonb_build_object('present', v_crd, 'used', v_crd_used,
        'columns', jsonb_build_object('day', v_crd_day, 'club', v_crd_club, 'user', v_crd_user, 'rake', v_crd_rake)),
      'ca_club_player_daily', jsonb_build_object('present', v_cpd, 'used', v_cpd_used,
        'columns', jsonb_build_object('day', v_cpd_day, 'club', v_cpd_club, 'user', v_cpd_user,
                                      'net', v_cpd_net, 'rake', v_cpd_rake, 'hands', v_cpd_hands)),
      'profiles_is_horse', v_have_is_horse
    ),
    'note', 'Every figure is a sum of rows the platform already keeps. Nothing here recomputes money and nothing here moves a chip.',
    'notes', v_notes
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_pnl(date, date, uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_pnl(date, date, uuid) to service_role;

-- 5.7 Register sync ----------------------------------------------------
--
-- Inserts a register row for every is_horse profile that lacks one, and
-- stamps retired_at on rows whose profile no longer exists. NEVER
-- DELETES: the register is the GLI-19 answer to "which simulated
-- accounts were live in March", and a deleted row cannot answer it.
-- A horse that comes back is un-retired rather than re-created, so the
-- registered_at date stays true.
--
-- THE ACTOR. Contract section 1 writes this function with no arguments.
-- It is a write and it must be audited, but fn_log_admin_action refuses
-- a null actor, so a zero argument signature could only ever attempt an
-- audit write that fails - the exact dead-audit defect Phase 2 shipped
-- and had to correct in 20260903121500. The parameter is therefore
-- OPTIONAL: fn_ca_fleet_register_sync() still resolves for the
-- contract's callers and for the backfill below, and in that case the
-- function SKIPS the audit call and returns audited:false with the
-- reason. An unattributable action is never filed under somebody else's
-- name.
create or replace function public.fn_ca_fleet_register_sync(p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_have_profiles boolean := to_regclass('public.profiles') is not null;
  v_have_is_horse boolean := false;
  v_have_created  boolean := false;
  v_inserted int := 0;
  v_retired  int := 0;
  v_unretired int := 0;
  v_unflagged int := 0;
  v_total    int := 0;
  v_active   int := 0;
  v_audited  boolean := false;
  v_notes    jsonb := '[]'::jsonb;
begin
  if v_have_profiles then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_horse'
    ) into v_have_is_horse;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at'
    ) into v_have_created;
  end if;

  if not v_have_profiles or not v_have_is_horse then
    -- Empty rather than failing. Nothing is inserted and nothing is
    -- retired, because with no way to ask who is a horse, retiring the
    -- whole register is the one outcome that must not happen.
    v_notes := v_notes || to_jsonb('profiles.is_horse is unavailable, so nothing was inserted and nothing was retired'::text);
    select count(*)::int, count(*) filter (where retired_at is null)::int
      into v_total, v_active from public.ca_horse_fleet_register;
    return jsonb_build_object(
      'ok', true, 'inserted', 0, 'retired', 0, 'unretired', 0, 'unflagged', 0,
      'total', v_total, 'active', v_active, 'audited', false,
      'sources', jsonb_build_object('profiles', v_have_profiles, 'profiles_is_horse', v_have_is_horse),
      'notes', v_notes
    );
  end if;

  -- INSERT the missing ones. Dynamic because profiles is not this
  -- file's table and created_at may or may not be there.
  execute
    'insert into public.ca_horse_fleet_register (horse_id, disclosed, owner_entity, funding_source, created_at, note) '
    || 'select p.id, true, ''Smarter Poker'', ''club treasury'', '
    || case when v_have_created then 'p.created_at' else 'null::timestamptz' end || ', '
    || '''backfilled from profiles.is_horse'' '
    || 'from public.profiles p '
    || 'where coalesce(p.is_horse, false) '
    || 'on conflict (horse_id) do nothing';
  get diagnostics v_inserted = row_count;

  -- RETIRE the rows whose profile is gone. "No longer exists" is
  -- literal: the profiles row is absent. A profile that merely lost its
  -- is_horse flag is counted and reported, not retired, because that
  -- flag is data an operator can flip by hand and the register is a
  -- legal record.
  update public.ca_horse_fleet_register r
     set retired_at = now(),
         note = coalesce(r.note, '') || ' | retired: profile no longer exists'
   where r.retired_at is null
     and not exists (select 1 from public.profiles p where p.id = r.horse_id);
  get diagnostics v_retired = row_count;

  -- UN-RETIRE anyone who is a horse again. An update, never a delete,
  -- so registered_at keeps saying when the account was first disclosed.
  update public.ca_horse_fleet_register r
     set retired_at = null,
         note = coalesce(r.note, '') || ' | un-retired: profile is is_horse again'
   where r.retired_at is not null
     and exists (select 1 from public.profiles p where p.id = r.horse_id and coalesce(p.is_horse, false));
  get diagnostics v_unretired = row_count;

  select count(*)::int into v_unflagged
  from public.ca_horse_fleet_register r
  join public.profiles p on p.id = r.horse_id
  where r.retired_at is null and not coalesce(p.is_horse, false);

  select count(*)::int, count(*) filter (where retired_at is null)::int
    into v_total, v_active from public.ca_horse_fleet_register;

  if p_actor is not null then
    begin
      perform public.fn_log_admin_action(
        p_admin_user_id := p_actor,
        p_action        := 'fleet.register_sync',
        p_target_type   := 'fleet_register',
        p_target_id     := 'all',
        p_details       := jsonb_build_object(
                             'inserted', v_inserted, 'retired', v_retired,
                             'unretired', v_unretired, 'unflagged', v_unflagged,
                             'total', v_total, 'active', v_active
                           ),
        p_before_state  := null,
        p_after_state   := jsonb_build_object('total', v_total, 'active', v_active),
        p_ip_address    := null,
        p_user_agent    := null,
        p_request_id    := null
      );
      v_audited := true;
    exception when others then
      raise notice 'fn_ca_fleet_register_sync audit failed: %', sqlerrm;
    end;
  else
    v_notes := v_notes || to_jsonb('no actor was supplied, so no audit row was written. fn_log_admin_action refuses a null actor.'::text);
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'retired', v_retired,
    'unretired', v_unretired,
    'unflagged', v_unflagged,
    'total', v_total,
    'active', v_active,
    'audited', v_audited,
    'sources', jsonb_build_object('profiles', v_have_profiles, 'profiles_is_horse', v_have_is_horse),
    'disclosure', 'Every row here is a simulated account operated by the platform and disclosed under GLI-19.',
    'notes', v_notes
  );
end
$fn$;

revoke all on function public.fn_ca_fleet_register_sync(uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_fleet_register_sync(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Backfill the register
-- ---------------------------------------------------------------------
-- The disclosure record has to be complete from the moment it exists.
-- Called with no actor, so it files no audit row: a migration is not an
-- operator, and the migration itself is the record of this run.
do $backfill$
declare
  v_res jsonb;
begin
  v_res := public.fn_ca_fleet_register_sync();
  raise notice 'register backfill: inserted %, total %, active %',
    v_res ->> 'inserted', v_res ->> 'total', v_res ->> 'active';
end
$backfill$;

-- ---------------------------------------------------------------------
-- 7. Assertions
-- ---------------------------------------------------------------------
-- The migration aborts on its own assumption violations rather than
-- leaving a fleet steered by a policy row nobody meant to write.
--
-- The probes that need rows of their own run inside a SAVEPOINT that is
-- ROLLED BACK. In plpgsql a BEGIN ... EXCEPTION block IS a savepoint, so
-- raising a private sqlstate at the end of the block undoes every write
-- inside it while the plain variables assigned in there survive, because
-- variable assignment is memory and not a transactional write. No probe
-- row reaches production.

do $assert$
declare
  c_probe_club constant uuid := '00000000-0000-4000-8000-0000000000f1';
  c_probe_horse constant uuid := '00000000-0000-4000-8000-0000000000f2';
  -- A second probe horse, seated seconds ago with nothing to report yet.
  -- It is the M-9 case: fresh, not stuck.
  c_probe_fresh constant uuid := '00000000-0000-4000-8000-0000000000f3';
  v_count   int;
  v_row     public.ca_horse_fleet_policy%rowtype;
  v_eff     jsonb;
  v_iso     jsonb;
  v_sync_a  jsonb;
  v_sync_b  jsonb;
  v_over    jsonb;
  v_up      jsonb;
  -- Probe results, captured inside the savepoint and read after it.
  v_p_bias        numeric;
  v_p_bias_src    text;
  v_p_enabled     boolean;
  v_p_enabled_src text;
  v_p_cap         int;
  v_p_cap_src     text;
  v_p_state_rows  int;
  v_p_states      jsonb;
  -- The probe's OWN heartbeat ids, so the residue check can be scoped to
  -- them rather than asserting the whole table is empty (review M-6).
  v_p_beat_a      bigint;
  v_p_beat_b      bigint;
  v_p_stuck_before int;
  v_p_stuck_after  int;
begin
  -- 1. EXACTLY ONE GLOBAL ROW, AND IT IS PERMISSIVE.
  --    This is contract section 0 in assertion form: if any of these
  --    values is not today's behaviour, applying this migration would
  --    CHANGE the fleet, and it must not.
  select count(*) into v_count from public.ca_horse_fleet_policy where scope = 'global';
  if v_count <> 1 then
    raise exception 'ASSERT FAILED: expected exactly one global policy row, found %', v_count;
  end if;

  select * into v_row from public.ca_horse_fleet_policy where scope = 'global';
  if v_row.enabled is distinct from true then
    raise exception 'ASSERT FAILED: the global row must be enabled, found %', v_row.enabled;
  end if;
  if v_row.pause_new_seatings is distinct from false then
    raise exception 'ASSERT FAILED: the global row must not pause seatings, found %', v_row.pause_new_seatings;
  end if;
  if v_row.max_horses is not null or v_row.max_per_table is not null then
    raise exception 'ASSERT FAILED: the global row must carry no caps, found max_horses % and max_per_table %',
      v_row.max_horses, v_row.max_per_table;
  end if;
  if v_row.occupancy_bias is distinct from 1.0 then
    raise exception 'ASSERT FAILED: the global occupancy_bias must be 1.0, found %', v_row.occupancy_bias;
  end if;
  if coalesce(v_row.min_humans_to_seat, -1) <> 0 then
    raise exception 'ASSERT FAILED: the global min_humans_to_seat must be 0, found %', v_row.min_humans_to_seat;
  end if;
  if v_row.stake_bands is not null or v_row.variants is not null or v_row.schedule is not null then
    raise exception 'ASSERT FAILED: the global row must carry no band, variant or schedule restriction';
  end if;
  raise notice 'ASSERT OK: exactly one global policy row and it is permissive.';

  -- 2. fn_ca_fleet_policy_effective(null) RETURNS THOSE DEFAULTS.
  v_eff := public.fn_ca_fleet_policy_effective(null);
  if (v_eff ->> 'enabled')::boolean is distinct from true
     or (v_eff ->> 'pause_new_seatings')::boolean is distinct from false
     or v_eff ->> 'max_horses' is not null
     or v_eff ->> 'max_per_table' is not null
     or (v_eff ->> 'occupancy_bias')::numeric is distinct from 1.0
     or (v_eff ->> 'min_humans_to_seat')::int is distinct from 0
     or v_eff ->> 'stake_bands' is not null
     or v_eff ->> 'variants' is not null
     or v_eff ->> 'schedule' is not null then
    raise exception 'ASSERT FAILED: the effective global policy is not today behaviour: %', v_eff;
  end if;
  raise notice 'ASSERT OK: fn_ca_fleet_policy_effective(null) returns today behaviour, sourced %',
    v_eff -> 'source' ->> 'enabled';

  -- 3, 5 and 6 inside ONE savepoint, rolled back.
  begin
    -- 3. A CLUB ROW OVERRIDES FIELD BY FIELD AND LEAVES NULLS TO THE
    --    GLOBAL ROW. The probe row names occupancy_bias and max_horses
    --    and says nothing about enabled.
    insert into public.ca_horse_fleet_policy (scope, scope_id, enabled, pause_new_seatings,
      max_horses, max_per_table, occupancy_bias, min_humans_to_seat, notes)
    values ('club', c_probe_club, null, null, 12, null, 0.5, null, 'assertion probe');

    v_eff := public.fn_ca_fleet_policy_effective(c_probe_club);
    v_p_bias        := (v_eff ->> 'occupancy_bias')::numeric;
    v_p_bias_src    := v_eff -> 'source' ->> 'occupancy_bias';
    v_p_cap         := (v_eff ->> 'max_horses')::int;
    v_p_cap_src     := v_eff -> 'source' ->> 'max_horses';
    v_p_enabled     := (v_eff ->> 'enabled')::boolean;
    v_p_enabled_src := v_eff -> 'source' ->> 'enabled';

    -- 5b. The engine's write path works, so the console has something
    --     to render before the engine ships.
    v_up := public.fn_ca_fleet_state_upsert(
      jsonb_build_array(jsonb_build_object(
        'horse_id', c_probe_horse, 'state', 'seated', 'club_id', c_probe_club,
        'last_action_at', (now() - interval '90 minutes')::text)),
      jsonb_build_object('cycle_ms', 1000, 'horses_total', 1, 'degraded', false,
                         'detail', jsonb_build_object('reason', 'assertion probe'))
    );
    v_p_state_rows := (v_up ->> 'rows_written')::int;
    v_p_beat_a := (v_up ->> 'heartbeat_id')::bigint;

    v_over := public.fn_ca_fleet_overview(15);
    v_p_states := v_over -> 'states';
    v_p_stuck_before := (v_over ->> 'stuck')::int;
    if v_p_stuck_before < 1 then
      raise exception 'ASSERT FAILED: a horse seated with no action for 90 minutes is not counted as stuck: %', v_over;
    end if;

    -- 5c. AND A HORSE SEATED SECONDS AGO IS NOT STUCK (review M-9). It has
    --     no last_action_at because it has not acted yet; the cycle that
    --     seats forty horses publishes forty such rows, and counting them
    --     all as stuck makes the Health tab's loudest number cry wolf on
    --     every busy cycle. Measured as a DELTA, because the stuck count is
    --     over the whole table and this database may already hold rows.
    v_up := public.fn_ca_fleet_state_upsert(
      jsonb_build_array(jsonb_build_object(
        'horse_id', c_probe_fresh, 'state', 'seated', 'club_id', c_probe_club,
        'session_started_at', (now() - interval '10 seconds')::text)),
      jsonb_build_object('cycle_ms', 1000, 'horses_total', 1, 'degraded', false,
                         'detail', jsonb_build_object('reason', 'assertion probe'))
    );
    v_p_beat_b := (v_up ->> 'heartbeat_id')::bigint;

    v_over := public.fn_ca_fleet_overview(15);
    v_p_stuck_after := (v_over ->> 'stuck')::int;
    if v_p_stuck_after <> v_p_stuck_before then
      raise exception 'ASSERT FAILED: a horse seated 10 seconds ago with no action is counted stuck (% before, % after)',
        v_p_stuck_before, v_p_stuck_after;
    end if;

    -- Undo everything this block wrote. A private sqlstate, so a real
    -- error inside the block cannot be mistaken for the rollback signal.
    raise exception using errcode = 'XXPRB', message = 'assertion probe rollback';
  exception
    when sqlstate 'XXPRB' then
      raise notice 'ASSERT OK: probe rows rolled back at the savepoint.';
  end;

  if v_p_bias is distinct from 0.5 or v_p_bias_src <> 'club' then
    raise exception 'ASSERT FAILED: the club row did not override occupancy_bias (got %, source %)',
      v_p_bias, v_p_bias_src;
  end if;
  if v_p_cap is distinct from 12 or v_p_cap_src <> 'club' then
    raise exception 'ASSERT FAILED: the club row did not override max_horses (got %, source %)',
      v_p_cap, v_p_cap_src;
  end if;
  if v_p_enabled is distinct from true or v_p_enabled_src <> 'global' then
    raise exception 'ASSERT FAILED: a field the club row left null did not fall through to the global row (enabled %, source %)',
      v_p_enabled, v_p_enabled_src;
  end if;
  raise notice 'ASSERT OK: a club row overrides field by field (bias 0.5 from club, cap 12 from club) and leaves enabled to the global row.';

  if coalesce(v_p_state_rows, 0) <> 1 then
    raise exception 'ASSERT FAILED: the state upsert wrote % rows, expected 1', v_p_state_rows;
  end if;
  raise notice 'ASSERT OK: the state upsert wrote 1 row and the overview counted it (%).', v_p_states;
  raise notice 'ASSERT OK: a horse seated 90 minutes ago is stuck and one seated 10 seconds ago is not (% both times).',
    v_p_stuck_after;

  select count(*) into v_count from public.ca_horse_fleet_policy where scope = 'club' and scope_id = c_probe_club;
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: the probe policy row survived the savepoint';
  end if;
  select count(*) into v_count from public.ca_horse_fleet_state
   where horse_id in (c_probe_horse, c_probe_fresh);
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: the probe state row survived the savepoint';
  end if;
  -- SCOPED TO THE PROBE'S OWN BEATS (review M-6). This used to assert the
  -- whole heartbeat table was empty, which is true only on a database where
  -- the engine has never run. Re-running the file once the engine has shipped
  -- would abort with a false ASSERT FAILED reading like schema corruption, on
  -- the exact path somebody takes when they are already worried - and the
  -- header promises a second apply is safe.
  select count(*) into v_count from public.ca_horse_fleet_heartbeat
   where id in (v_p_beat_a, v_p_beat_b);
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: a probe heartbeat survived the savepoint (ids %, %), found % of them',
      v_p_beat_a, v_p_beat_b, v_count;
  end if;
  raise notice 'ASSERT OK: no probe row persists.';

  -- 3b. THE POLICY AUDIT ROW IS FILED UNDER THE ID THE ROUTE USES (M-2).
  --     fleet-admin.js audits a global change under 'global' and a club
  --     change under 'club:<uuid>'. This function used to write
  --     'global:global' for the global row, so fn_ca_operator_audit_trail -
  --     which filters on an exact target_id - returned one of the two rows
  --     and silently omitted the other.
  if position('case when p_scope = ''global'' then ''global''' in
              pg_get_functiondef(
                'public.fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure)) = 0 then
    raise exception 'ASSERT FAILED: fn_ca_fleet_set_policy does not file its audit row under the target id the route uses';
  end if;
  raise notice 'ASSERT OK: a global policy change audits under global, a club change under club:<uuid>.';

  -- 4. THE ISOLATION REPORT RUNS AND RETURNS A JSONB ENVELOPE.
  v_iso := public.fn_ca_fleet_isolation_report(25, 0);
  if v_iso is null or jsonb_typeof(v_iso) <> 'object'
     or not (v_iso ? 'ok') or not (v_iso ? 'rows') or not (v_iso ? 'total') or not (v_iso ? 'sources') then
    raise exception 'ASSERT FAILED: the isolation report did not return a jsonb envelope: %', v_iso;
  end if;
  if jsonb_typeof(v_iso -> 'rows') <> 'array' then
    raise exception 'ASSERT FAILED: the isolation report rows are not an array: %', v_iso -> 'rows';
  end if;
  raise notice 'ASSERT OK: the isolation report runs. % horses hold seats in more than one club scope (empty is the correct answer).',
    v_iso ->> 'total';

  -- 5. THE REGISTER SYNC IS IDEMPOTENT. The first run is the backfill in
  --    section 6; this is the second and the third. A run that inserts
  --    anything after the backfill is not idempotent, and the total must
  --    not move.
  v_sync_a := public.fn_ca_fleet_register_sync();
  v_sync_b := public.fn_ca_fleet_register_sync();
  if (v_sync_a ->> 'inserted')::int <> 0 or (v_sync_b ->> 'inserted')::int <> 0 then
    raise exception 'ASSERT FAILED: register sync is not idempotent, a repeat run inserted % then %',
      v_sync_a ->> 'inserted', v_sync_b ->> 'inserted';
  end if;
  if (v_sync_a ->> 'total') is distinct from (v_sync_b ->> 'total') then
    raise exception 'ASSERT FAILED: register sync moved the total from % to %',
      v_sync_a ->> 'total', v_sync_b ->> 'total';
  end if;
  select count(*) into v_count from public.ca_horse_fleet_register;
  if v_count <> (v_sync_b ->> 'total')::int then
    raise exception 'ASSERT FAILED: the register holds % rows but the sync reported %',
      v_count, v_sync_b ->> 'total';
  end if;
  raise notice 'ASSERT OK: register sync is idempotent. % rows, % active, second and third runs inserted nothing.',
    v_sync_b ->> 'total', v_sync_b ->> 'active';

  raise notice 'ASSERT OK: Phase 3 fleet command installed. The fleet keeps running exactly as it does today.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Paste and run as one transaction to undo this migration completely.
-- Dependency order: functions first (fn_ca_fleet_set_policy and
-- fn_ca_fleet_overview both call fn_ca_fleet_policy_effective, and
-- fn_ca_fleet_isolation_report and fn_ca_fleet_pnl both read
-- ca_horse_fleet_register), then the tables. There are no foreign keys
-- between the four tables, so their order is free; they are listed
-- policy last because it is the one a reader is most likely to want to
-- keep. Dropping a table drops its indexes with it. Nothing else in the
-- database is touched, because nothing else was created: no existing
-- table was altered and no existing function was replaced.
--
-- begin;
--   set local lock_timeout = '5s';
--
--   drop function if exists public.fn_ca_fleet_register_sync(uuid);
--   drop function if exists public.fn_ca_fleet_pnl(date, date, uuid);
--   drop function if exists public.fn_ca_fleet_isolation_report(int, int);
--   drop function if exists public.fn_ca_fleet_overview(int);
--   drop function if exists public.fn_ca_fleet_state_upsert(jsonb, jsonb);
--   drop function if exists public.fn_ca_fleet_set_policy(text, uuid, jsonb, uuid, text);
--   drop function if exists public.fn_ca_fleet_policy_effective(uuid);
--
--   drop table if exists public.ca_horse_fleet_heartbeat;
--   drop table if exists public.ca_horse_fleet_state;
--   drop table if exists public.ca_horse_fleet_register;
--   drop table if exists public.ca_horse_fleet_policy;
-- commit;
-- =====================================================================
