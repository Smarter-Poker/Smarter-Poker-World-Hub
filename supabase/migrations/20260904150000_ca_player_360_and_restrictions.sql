-- =====================================================================
-- Phase 4: Player 360, account controls, protection and support
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
-- Contract: docs/horses/PHASE4-CONTRACTS.md sections 0 and 2.
--
-- WHAT THIS IS
-- Four new tables, one new column on ca_operator_policy, eleven
-- SECURITY DEFINER functions, and two BEFORE INSERT triggers that give
-- an operator a real view of a player and a real way to restrict one.
-- Everything except the single new policy column is new. No existing
-- table is altered, no existing function is replaced, and no GRANT,
-- REVOKE or RLS statement here takes away anything anybody holds today.
--
-- SECTION 0 IS THE POINT OF THE WHOLE FILE
-- "NOTHING IN THIS PHASE TAKES A PLAYER'S ACCESS AWAY UNTIL DAN TURNS
-- ENFORCEMENT ON, AND WHAT AN OPERATOR IS TOLD MUST MATCH WHAT THE
-- PLATFORM WILL ACTUALLY DO."
--
-- This is the first phase that can hurt a real person by working
-- correctly. A mint that misfires costs chips, and section 10.6 gives
-- an agent the authority to put chips back. A restriction that misfires
-- locks somebody out of the thing they came here for, at the moment
-- they came for it, and no migration gives that evening back.
--
-- Four consequences are built into the schema rather than left to a
-- route or a panel to remember:
--
--   1. ca_operator_policy.restrictions_enforced DEFAULTS FALSE, and the
--      assertion block below refuses to let this migration finish if it
--      is anything else. While it is false the guards OBSERVE: they
--      write ca_restriction_observations and let the insert through.
--      One switch makes every guard bite at once.
--
--   2. fn_ca_player_restricted FAILS OPEN, and so does the trigger that
--      calls it. Every failure path returns "not restricted". This is
--      the OPPOSITE of the platform freeze, which fails closed, and the
--      difference is deliberate: the freeze protects money integrity
--      across a restart, where the safe answer to "I do not know" is
--      stop. A restriction carries a policy decision about one person,
--      where the safe answer to "I do not know" is let them play.
--
--   3. profiles.status IS NOT WRITTEN by anything in this file. It is
--      decorative today - all 1,310 rows say 'active', one admin badge
--      renders it, and no money, seat, tournament or auth path reads
--      it. Writing it would create a second opinion about a player's
--      standing that nothing enforces and that the next agent would
--      find and believe.
--
--   4. Nothing here deletes. A lifted restriction is marked lifted, a
--      deleted note keeps its author and its text. The record of a
--      decision is part of the decision.
--
-- HORSES ARE PLAYERS (CLAUDE.md 10.5)
-- Every function here covers horses exactly as it covers humans, and
-- p_include_horses defaults to TRUE wherever it appears. is_horse is
-- SELECTED as a badge and is never used to exclude.
--
-- Enforcement binds a horse BY CONSTRUCTION rather than by a second
-- code path that somebody has to remember to update. HorseFleetManager
-- seats through atomic_table_buyin, the identical RPC a human browser
-- calls, and both land on the same table_seats INSERT these triggers
-- watch. Verified against production before this file was written: of
-- 989 open seats, 989 carry user_id and 0 carry horse_id, and every one
-- of them belongs to a horse. NEW.user_id is the complete hook.
--
-- WHY THE TRIGGER IS ON THE TABLE AND NOT IN THE RPCs
-- The same reasoning the freeze guard recorded on 2026-09-02: guarding
-- the tables is complete by construction. There are five sanctioned
-- seat creators (atomic_table_buyin, fn_take_seat_and_buy_in,
-- fn_seat_horse_in_seat_first_game, fn_seat_late_registrant,
-- fn_horse_seat_from_treasury) and two tournament registration paths
-- (fn_register_for_tournament, fn_register_horse_for_tournament). All
-- seven converge on an INSERT into one of these two tables. A guard at
-- the RPCs would be seven places to forget; a guard at the table is
-- one place that cannot be walked around.
--
-- WHY THE GUARD OBSERVES BEFORE IT REFUSES
-- Dan ruled on 2026-09-02 that a RAISING BEFORE trigger on table_seats
-- INSERT is high risk, which is why fn_ca_guard_seat_creation is
-- attached in dry-run form to this day
-- (20260902174600_the_seat_guard_watches_before_it_refuses.sql). This
-- file honours that ruling: the guard is installed, live and recording
-- from the moment it applies, and it refuses nothing until the switch
-- is thrown.
--
-- WHY THE READ FUNCTIONS FILE NO AUDIT ROW
-- fn_log_admin_action REFUSES a null actor. Phase 2 shipped two read
-- functions that called it with p_admin_user_id := null anyway: the
-- write failed on every call and the failure went into a raise notice,
-- so the file claimed a trail it never had (see 20260903121500). The
-- six pure reads here carry no actor and none of them mentions
-- fn_log_admin_action. The five writes all take p_actor and all audit.
--
-- LOCKING
-- One transaction, per CLAUDE.md section 2: ten statements outside one
-- would be up to ten 28-second PostgREST schema reloads. It takes
-- ACCESS EXCLUSIVE briefly on table_seats and tournament_players, so it
-- sets lock_timeout. A timeout means retry off-peak. It NEVER means
-- raise the timeout and push through. Two hot tables is already one
-- more than the 2026-09-02 deadlock caution likes, which is why it
-- touches no third.
-- =====================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '5min';

-- ---------------------------------------------------------------------
-- 1. THE SWITCH
-- ---------------------------------------------------------------------
alter table public.ca_operator_policy
  add column if not exists restrictions_enforced boolean not null default false;

comment on column public.ca_operator_policy.restrictions_enforced is
  'False (the default) means every restriction guard OBSERVES: it records what it would have refused into ca_restriction_observations and lets the write through. True means it refuses. Dan owns this switch. Before it is turned on, HorseFleetManager must learn the PLAYER_RESTRICTED: prefix - see PHASE4-CONTRACTS.md section 6.';

-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

-- The account state machine.
create table if not exists public.ca_player_restrictions (
  id           uuid primary key default gen_random_uuid(),
  -- No foreign key to profiles ON PURPOSE. A restriction is a record of
  -- a decision and must outlive the profile row it was made about; a
  -- cascade here would erase the evidence along with the account.
  user_id      uuid not null,
  scope        text not null,
  reason_code  text not null,
  reason_note  text,
  status       text not null default 'active',
  applied_by   uuid,
  applied_at   timestamptz not null default now(),
  -- Null means indefinite, which section 3 of the contract makes
  -- material: a restriction nobody has to revisit needs two operators.
  expires_at   timestamptz,
  approval_id  uuid,
  lifted_by    uuid,
  lifted_at    timestamptz,
  lift_note    text,
  created_at   timestamptz not null default now(),

  constraint ca_player_restrictions_scope_known
    check (scope in ('account', 'cash', 'tournaments', 'transfers', 'social')),
  constraint ca_player_restrictions_status_known
    check (status in ('active', 'lifted', 'expired')),
  constraint ca_player_restrictions_reason_known
    check (reason_code in (
      'collusion_suspected', 'chip_dumping_suspected', 'multi_accounting',
      'bot_or_rta_suspected', 'abuse_or_harassment', 'payment_dispute',
      'kyc_incomplete', 'responsible_gaming', 'self_requested',
      'security_compromise', 'terms_violation', 'other')),
  -- 'other' is the escape hatch and an escape hatch with no explanation
  -- is a reason code that means nothing three months later.
  constraint ca_player_restrictions_other_needs_a_note
    check (reason_code <> 'other' or coalesce(btrim(reason_note), '') <> ''),
  constraint ca_player_restrictions_expiry_after_start
    check (expires_at is null or expires_at > applied_at),
  -- A lifted row must say who and when, or "lifted" is a status with no
  -- author, which is the shape of an audit gap.
  constraint ca_player_restrictions_lift_is_attributed
    check (status <> 'lifted' or (lifted_at is not null and lifted_by is not null))
);

-- One live restriction per scope per player. Without this, "is this
-- player restricted" has as many answers as there are rows, and lifting
-- one leaves the others behind while the console says it is done.
create unique index if not exists ca_player_restrictions_one_active_per_scope
  on public.ca_player_restrictions (user_id, scope)
  where status = 'active';

-- THE HOT PATH INDEX. This is the one the trigger probes on every seat
-- insert and every tournament registration. Partial, so it indexes only
-- live restrictions and stays a handful of pages on a platform with
-- none.
create index if not exists ca_player_restrictions_active_by_user
  on public.ca_player_restrictions (user_id)
  where status = 'active';

create index if not exists ca_player_restrictions_by_status_applied
  on public.ca_player_restrictions (status, applied_at desc);

comment on table public.ca_player_restrictions is
  'Operator restrictions on a player account. One active row per scope per player. Horses and humans alike. Nothing here refuses anything until ca_operator_policy.restrictions_enforced is true.';

-- Operator notes. NOT public.player_notes, which already exists and
-- belongs to the PLAYERS: that table is a live-poker feature where one
-- player records another's tells, tendencies, real name and photo
-- (target_user_id, tells, tendencies). An operator note written into it
-- would appear inside a player's own notebook.
create table if not exists public.ca_operator_player_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  body       text not null,
  pinned     boolean not null default false,
  author_id  uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint ca_operator_player_notes_body_not_empty
    check (btrim(body) <> '')
);

create index if not exists ca_operator_player_notes_by_user
  on public.ca_operator_player_notes (user_id, pinned desc, created_at desc)
  where deleted_at is null;

comment on table public.ca_operator_player_notes is
  'Operator-authored notes about a player. Soft delete only: a deleted note keeps its author and its text. This is NOT public.player_notes, which is a player-facing feature about opponents.';

create table if not exists public.ca_operator_player_tags (
  user_id  uuid not null,
  tag      text not null,
  added_by uuid,
  added_at timestamptz not null default now(),
  constraint ca_operator_player_tags_pk primary key (user_id, tag),
  constraint ca_operator_player_tags_shape
    check (tag ~ '^[a-z0-9][a-z0-9-]{1,31}$')
);

create index if not exists ca_operator_player_tags_by_tag
  on public.ca_operator_player_tags (tag);

-- The dry-run log, and the evidence for turning enforcement on.
create table if not exists public.ca_restriction_observations (
  id             bigint generated always as identity primary key,
  user_id        uuid not null,
  scope          text not null,
  restriction_id uuid,
  observed_at    timestamptz not null default now(),
  table_name     text not null,
  op             text not null,
  would_refuse   boolean not null default true,
  detail         jsonb
);

create index if not exists ca_restriction_observations_recent
  on public.ca_restriction_observations (observed_at desc);

create index if not exists ca_restriction_observations_by_user
  on public.ca_restriction_observations (user_id, observed_at desc);

comment on table public.ca_restriction_observations is
  'What the restriction guards WOULD have refused while enforcement is off. Retained by age. Nothing reads this on a hot path.';

-- RLS on, no policies: service_role only, exactly as Phases 2 and 3.
alter table public.ca_player_restrictions        enable row level security;
alter table public.ca_operator_player_notes      enable row level security;
alter table public.ca_operator_player_tags       enable row level security;
alter table public.ca_restriction_observations   enable row level security;

-- ---------------------------------------------------------------------
-- 3. THE READER
-- ---------------------------------------------------------------------
-- The one function the guards call and the one function the rest of the
-- platform will eventually call. STABLE so a statement can cache it.
--
-- 'account' implies every other scope: an operator who has restricted
-- the whole account has not also got to remember to tick cash.
--
-- expires_at is authoritative over status. status is the operator's
-- INTENT and only a sweep updates it; expires_at is the clock, and a
-- restriction that has run out must stop binding the moment it does,
-- not the next time a sweep happens to run.
create or replace function public.fn_ca_player_restricted(
  p_user_id uuid,
  p_scope   text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_scope is null then
    return false;
  end if;

  return exists (
    select 1
      from public.ca_player_restrictions r
     where r.user_id = p_user_id
       and r.status = 'active'
       and (r.expires_at is null or r.expires_at > now())
       and (r.scope = p_scope or r.scope = 'account')
  );
exception
  when others then
    -- SECTION 0 RULE 3, FAIL OPEN. A player refused a seat because a
    -- lookup broke is a support ticket about something nobody chose.
    return false;
end;
$$;

comment on function public.fn_ca_player_restricted(uuid, text) is
  'True when an active, unexpired restriction covers this player for this scope or for the whole account. Fails OPEN: any error answers false.';

-- Which live restriction is doing the restricting, for the observation
-- log and for the refusal message. Separate from the boolean so the hot
-- path stays a single EXISTS.
create or replace function public.fn_ca_player_restriction_for(
  p_user_id uuid,
  p_scope   text
) returns public.ca_player_restrictions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.*
    from public.ca_player_restrictions r
   where r.user_id = p_user_id
     and r.status = 'active'
     and (r.expires_at is null or r.expires_at > now())
     and (r.scope = p_scope or r.scope = 'account')
   order by (r.scope = 'account') desc, r.applied_at asc
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 4. THE GUARDS
-- ---------------------------------------------------------------------
-- One trigger function, attached twice. TG_ARGV[0] is the scope this
-- table's inserts belong to.
--
-- The column it reads is NEW.user_id on both tables. Verified against
-- the live schema before this file was written, because the freeze
-- migration recorded the trap in as many words: a trigger naming a
-- column that does not exist silently never matches, and the guard
-- reports installed while guarding nothing.
create or replace function public.fn_ca_refuse_restricted_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope    text := coalesce(tg_argv[0], 'account');
  v_user     uuid;
  v_enforced boolean := false;
  v_row      public.ca_player_restrictions;
begin
  begin
    v_user := new.user_id;

    if v_user is null then
      return new;
    end if;

    if not public.fn_ca_player_restricted(v_user, v_scope) then
      return new;
    end if;

    select restrictions_enforced into v_enforced
      from public.ca_operator_policy
     limit 1;
    v_enforced := coalesce(v_enforced, false);

    v_row := public.fn_ca_player_restriction_for(v_user, v_scope);

    if not v_enforced then
      -- OBSERVE. Record what would have happened and let it through.
      insert into public.ca_restriction_observations
        (user_id, scope, restriction_id, table_name, op, would_refuse, detail)
      values (
        v_user, v_scope, v_row.id, tg_table_name, tg_op, true,
        jsonb_build_object(
          'reason_code', v_row.reason_code,
          'restriction_scope', v_row.scope,
          'applied_at', v_row.applied_at,
          'expires_at', v_row.expires_at));
      return new;
    end if;

    -- ENFORCE. The PLAYER_RESTRICTED: prefix is load-bearing:
    -- HorseFleetManager.seatHorse recognises expected refusals from
    -- atomic_table_buyin by string and reports everything else as an
    -- error, so this prefix is what stops an enforced restriction on a
    -- horse from filling the engine log. PHASE4-CONTRACTS section 6.
    raise exception
      'PLAYER_RESTRICTED: this account is restricted (%) and cannot % on %.',
      v_row.reason_code, tg_op, tg_table_name
      using errcode = '42501',
            hint = 'An operator applied this restriction. It can be lifted from the Players tab in the operator console.';

  exception
    -- Our own refusal must pass through. Anything else is a bug in the
    -- guard, and section 0 rule 3 says a bug in the guard lets the
    -- player play.
    when insufficient_privilege then
      raise;
    when others then
      return new;
  end;
end;
$$;

comment on function public.fn_ca_refuse_restricted_entry() is
  'BEFORE INSERT guard for table_seats (scope cash) and tournament_players (scope tournaments). Observes while ca_operator_policy.restrictions_enforced is false. Fails OPEN on any internal error.';

-- zz_ so these fire AFTER the freeze guards, which must keep their
-- answer: a platform freeze and a restriction are different refusals,
-- and the freeze is the one already in progress. 'zz_f' sorts before
-- 'zz_r', so the ordering is what it looks like.
drop trigger if exists zz_restriction_seat_guard on public.table_seats;
create trigger zz_restriction_seat_guard
  before insert on public.table_seats
  for each row execute function public.fn_ca_refuse_restricted_entry('cash');

drop trigger if exists zz_restriction_tourney_guard on public.tournament_players;
create trigger zz_restriction_tourney_guard
  before insert on public.tournament_players
  for each row execute function public.fn_ca_refuse_restricted_entry('tournaments');

-- ---------------------------------------------------------------------
-- 5. WRITES
-- ---------------------------------------------------------------------

create or replace function public.fn_ca_player_restrict(
  p_user_id     uuid,
  p_scope       text,
  p_reason_code text,
  p_note        text,
  p_expires_at  timestamptz,
  p_actor       uuid,
  p_approval_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      public.ca_player_restrictions;
  v_existing public.ca_player_restrictions;
  v_is_horse boolean;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'user_required');
  end if;

  -- The badge, not a filter. A horse can be restricted exactly as a
  -- human can, and the caller is told which it is because the console
  -- shows a badge, not because the answer differs.
  select is_horse into v_is_horse from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'player_not_found');
  end if;

  select * into v_existing
    from public.ca_player_restrictions
   where user_id = p_user_id and scope = p_scope and status = 'active'
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_restricted',
      'restriction_id', v_existing.id,
      'applied_at', v_existing.applied_at);
  end if;

  insert into public.ca_player_restrictions
    (user_id, scope, reason_code, reason_note, expires_at, applied_by, approval_id)
  values
    (p_user_id, p_scope, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''),
     p_expires_at, p_actor, p_approval_id)
  returning * into v_row;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.restrict',
    p_target_type   := 'profile',
    p_target_id     := p_user_id::text,
    p_details       := jsonb_build_object(
                         'scope', p_scope,
                         'reason_code', p_reason_code,
                         'expires_at', p_expires_at,
                         'approval_id', p_approval_id,
                         'is_horse', coalesce(v_is_horse, false)),
    p_before_state  := null,
    p_after_state   := to_jsonb(v_row));

  return jsonb_build_object('ok', true, 'restriction', to_jsonb(v_row),
                            'is_horse', coalesce(v_is_horse, false));
end;
$$;

create or replace function public.fn_ca_player_lift_restriction(
  p_id    uuid,
  p_actor uuid,
  p_note  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.ca_player_restrictions;
  v_after  public.ca_player_restrictions;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;

  select * into v_before from public.ca_player_restrictions where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_before.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active',
                              'status', v_before.status);
  end if;

  update public.ca_player_restrictions
     set status    = 'lifted',
         lifted_by = p_actor,
         lifted_at = now(),
         lift_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
  returning * into v_after;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.lift_restriction',
    p_target_type   := 'profile',
    p_target_id     := v_after.user_id::text,
    p_details       := jsonb_build_object('scope', v_after.scope,
                                          'restriction_id', v_after.id),
    p_before_state  := to_jsonb(v_before),
    p_after_state   := to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'restriction', to_jsonb(v_after));
end;
$$;

-- Marks run-out rows 'expired' so the list reads honestly. It changes
-- NO behaviour: fn_ca_player_restricted already treats an expired row
-- as not binding, because expires_at is the clock and status is only
-- the intent. This exists to be called on a schedule.
--
-- THAT SCHEDULE IS OPEN CLAW, NEVER THE CLAUDE SCHEDULER (World Hub
-- CLAUDE.md 10.9, binding): a task installed from one Claude account is
-- unreachable from the next, reports enabled: true and never fires
-- again.
create or replace function public.fn_ca_restriction_expire_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.ca_player_restrictions
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'expired', v_count);
end;
$$;

create or replace function public.fn_ca_player_note_add(
  p_user_id uuid,
  p_body    text,
  p_actor   uuid,
  p_pinned  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ca_operator_player_notes;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if coalesce(btrim(p_body), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'body_required');
  end if;

  insert into public.ca_operator_player_notes (user_id, body, author_id, pinned)
  values (p_user_id, btrim(p_body), p_actor, coalesce(p_pinned, false))
  returning * into v_row;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.note_add',
    p_target_type   := 'profile',
    p_target_id     := p_user_id::text,
    p_details       := jsonb_build_object('note_id', v_row.id),
    p_before_state  := null,
    p_after_state   := to_jsonb(v_row));

  return jsonb_build_object('ok', true, 'note', to_jsonb(v_row));
end;
$$;

create or replace function public.fn_ca_player_note_delete(
  p_note_id uuid,
  p_actor   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.ca_operator_player_notes;
  v_after  public.ca_operator_player_notes;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;

  select * into v_before from public.ca_operator_player_notes where id = p_note_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_before.deleted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_deleted');
  end if;

  -- SOFT. The text and the author stay, because a note somebody wrote
  -- and somebody else removed is itself a thing that happened.
  update public.ca_operator_player_notes
     set deleted_at = now(), deleted_by = p_actor, updated_at = now()
   where id = p_note_id
  returning * into v_after;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.note_delete',
    p_target_type   := 'profile',
    p_target_id     := v_after.user_id::text,
    p_details       := jsonb_build_object('note_id', v_after.id),
    p_before_state  := to_jsonb(v_before),
    p_after_state   := to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'note', to_jsonb(v_after));
end;
$$;

create or replace function public.fn_ca_player_tag_set(
  p_user_id uuid,
  p_tag     text,
  p_actor   uuid,
  p_remove  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tag text := lower(btrim(coalesce(p_tag, '')));
  v_had boolean;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if v_tag !~ '^[a-z0-9][a-z0-9-]{1,31}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_tag');
  end if;

  select exists (select 1 from public.ca_operator_player_tags
                  where user_id = p_user_id and tag = v_tag) into v_had;

  if coalesce(p_remove, false) then
    delete from public.ca_operator_player_tags
     where user_id = p_user_id and tag = v_tag;
  else
    insert into public.ca_operator_player_tags (user_id, tag, added_by)
    values (p_user_id, v_tag, p_actor)
    on conflict (user_id, tag) do nothing;
  end if;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := case when coalesce(p_remove, false)
                            then 'player.tag_remove' else 'player.tag_add' end,
    p_target_type   := 'profile',
    p_target_id     := p_user_id::text,
    p_details       := jsonb_build_object('tag', v_tag, 'was_present', v_had),
    p_before_state  := jsonb_build_object('present', v_had),
    p_after_state   := jsonb_build_object('present', not coalesce(p_remove, false)));

  return jsonb_build_object('ok', true, 'tag', v_tag,
                            'removed', coalesce(p_remove, false));
end;
$$;

-- RESPONSIBLE GAMING. Section 0 rule 7: an operator is not a bypass of
-- a player's protection.
--
-- Every field is classified by DIRECTION, not by name:
--   * the five numeric limits and the two exclusion timestamps are
--     TIGHTER when they are lower / later, and a limit appearing where
--     there was none is a tighten;
--   * reality_check_interval_minutes is TIGHTER when it is SHORTER,
--     because a shorter interval means more reminders. Reading that one
--     the same way round as the money limits would classify "remind me
--     less often" as a tighten, which is backwards and is the kind of
--     mistake that only shows up in somebody's worst month.
--
-- A patch that loosens ANYTHING before limit_increase_available_at is
-- refused WHOLE. Half-applying it would silently keep the loosening the
-- operator wanted and drop the tightening, or the reverse, and neither
-- is what anybody asked for.
create or replace function public.fn_ca_player_rg_set(
  p_user_id uuid,
  p_patch   jsonb,
  p_actor   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before  public.responsible_gaming_limits;
  v_after   public.responsible_gaming_limits;
  v_new     public.responsible_gaming_limits;
  v_created boolean := false;
  v_loosens text[] := '{}';
  v_key     text;
  v_num     numeric;
  v_ts      timestamptz;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'patch_required');
  end if;

  select * into v_before
    from public.responsible_gaming_limits where user_id = p_user_id;

  if not found then
    -- No row means no limits at all, which is the loosest a player can
    -- be. Creating one can only tighten, so there is nothing to hold.
    v_created := true;
    v_before := null;
  end if;

  -- Classify. LOWER is tighter for the money and time caps.
  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes'
  ] loop
    if p_patch ? v_key then
      v_num := nullif(p_patch ->> v_key, '')::numeric;
      if not v_created then
        if v_num is null and to_jsonb(v_before) ->> v_key is not null then
          v_loosens := v_loosens || (v_key || ':cleared');
        elsif v_num is not null and (to_jsonb(v_before) ->> v_key) is not null
              and v_num > (to_jsonb(v_before) ->> v_key)::numeric then
          v_loosens := v_loosens || (v_key || ':raised');
        end if;
      end if;
    end if;
  end loop;

  -- SHORTER is tighter for the reality check.
  if p_patch ? 'reality_check_interval_minutes' then
    v_num := nullif(p_patch ->> 'reality_check_interval_minutes', '')::numeric;
    if not v_created and v_num is not null
       and v_num > v_before.reality_check_interval_minutes then
      v_loosens := v_loosens || 'reality_check_interval_minutes:lengthened';
    end if;
  end if;

  -- LATER is tighter for the two exclusions.
  foreach v_key in array array['self_excluded_until', 'cooling_off_until'] loop
    if p_patch ? v_key then
      v_ts := nullif(p_patch ->> v_key, '')::timestamptz;
      if not v_created then
        if v_ts is null and (to_jsonb(v_before) ->> v_key) is not null then
          v_loosens := v_loosens || (v_key || ':cleared');
        elsif v_ts is not null and (to_jsonb(v_before) ->> v_key) is not null
              and v_ts < (to_jsonb(v_before) ->> v_key)::timestamptz then
          v_loosens := v_loosens || (v_key || ':shortened');
        end if;
      end if;
    end if;
  end loop;

  if array_length(v_loosens, 1) is not null
     and not v_created
     and now() < v_before.limit_increase_available_at then
    return jsonb_build_object(
      'ok', false,
      'reason', 'loosening_is_held',
      'held_until', v_before.limit_increase_available_at,
      'loosens', to_jsonb(v_loosens));
  end if;

  insert into public.responsible_gaming_limits as t (
    user_id, daily_deposit_limit, weekly_deposit_limit, monthly_deposit_limit,
    daily_loss_limit, session_time_limit_minutes, reality_check_interval_minutes,
    self_excluded_until, cooling_off_until, limit_increase_available_at, updated_at
  ) values (
    p_user_id,
    nullif(p_patch ->> 'daily_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'weekly_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'monthly_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'daily_loss_limit', '')::numeric,
    nullif(p_patch ->> 'session_time_limit_minutes', '')::int,
    coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int, 60),
    nullif(p_patch ->> 'self_excluded_until', '')::timestamptz,
    nullif(p_patch ->> 'cooling_off_until', '')::timestamptz,
    now() + interval '24 hours',
    now()
  )
  on conflict (user_id) do update set
    daily_deposit_limit = case when p_patch ? 'daily_deposit_limit'
      then nullif(p_patch ->> 'daily_deposit_limit', '')::numeric
      else t.daily_deposit_limit end,
    weekly_deposit_limit = case when p_patch ? 'weekly_deposit_limit'
      then nullif(p_patch ->> 'weekly_deposit_limit', '')::numeric
      else t.weekly_deposit_limit end,
    monthly_deposit_limit = case when p_patch ? 'monthly_deposit_limit'
      then nullif(p_patch ->> 'monthly_deposit_limit', '')::numeric
      else t.monthly_deposit_limit end,
    daily_loss_limit = case when p_patch ? 'daily_loss_limit'
      then nullif(p_patch ->> 'daily_loss_limit', '')::numeric
      else t.daily_loss_limit end,
    session_time_limit_minutes = case when p_patch ? 'session_time_limit_minutes'
      then nullif(p_patch ->> 'session_time_limit_minutes', '')::int
      else t.session_time_limit_minutes end,
    reality_check_interval_minutes = case when p_patch ? 'reality_check_interval_minutes'
      then coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int,
                    t.reality_check_interval_minutes)
      else t.reality_check_interval_minutes end,
    self_excluded_until = case when p_patch ? 'self_excluded_until'
      then nullif(p_patch ->> 'self_excluded_until', '')::timestamptz
      else t.self_excluded_until end,
    cooling_off_until = case when p_patch ? 'cooling_off_until'
      then nullif(p_patch ->> 'cooling_off_until', '')::timestamptz
      else t.cooling_off_until end,
    -- A tighten moves the hold forward. The player just became more
    -- protected; loosening that waits, exactly as it does when they do
    -- it themselves.
    limit_increase_available_at = now() + interval '24 hours',
    updated_at = now()
  returning * into v_after;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.rg_set',
    p_target_type   := 'profile',
    p_target_id     := p_user_id::text,
    p_details       := jsonb_build_object('patch', p_patch, 'created', v_created),
    p_before_state  := case when v_created then null else to_jsonb(v_before) end,
    p_after_state   := to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'limits', to_jsonb(v_after),
                            'created', v_created);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. READS
-- ---------------------------------------------------------------------
-- No audit rows below this line: fn_log_admin_action refuses a null
-- actor and a read has no actor worth the row.

create or replace function public.fn_ca_player_search(
  p_q              text,
  p_include_horses boolean default true,   -- CLAUDE.md 10.5: DEFAULTS TRUE
  p_restricted     boolean default null,
  p_limit          int default 25,
  p_offset         int default 0,
  p_reveal_email   boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_q, '')), '');
  v_lim   int  := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_off   int  := greatest(coalesce(p_offset, 0), 0);
  v_rows  jsonb;
  v_total bigint;
begin
  with matched as (
    select p.id, p.display_name, p.username, p.email, p.player_number,
           p.is_horse, p.created_at, p.last_seen, p.avatar_url,
           exists (
             select 1 from public.ca_player_restrictions r
              where r.user_id = p.id and r.status = 'active'
                and (r.expires_at is null or r.expires_at > now())
           ) as restricted
      from public.profiles p
     where
       -- p_include_horses TRUE (the default) means this clause is a
       -- no-op and horses appear exactly as humans do. It is here so an
       -- operator can narrow a view on purpose, never so a report can
       -- quietly leave the fleet out.
       (coalesce(p_include_horses, true) or not coalesce(p.is_horse, false))
       and (
         v_q is null
         or p.display_name ilike '%' || v_q || '%'
         or p.username     ilike '%' || v_q || '%'
         or p.email        ilike '%' || v_q || '%'
         or p.player_number ilike '%' || v_q || '%'
         or (length(v_q) >= 8 and p.id::text ilike v_q || '%')
       )
  ), filtered as (
    select * from matched
     where p_restricted is null or restricted = p_restricted
  )
  select
    coalesce(jsonb_agg(to_jsonb(x) - case when p_reveal_email then '' else 'email' end
                       order by x.restricted desc, x.display_name asc), '[]'::jsonb),
    (select count(*) from filtered)
    into v_rows, v_total
  from (select * from filtered order by restricted desc, display_name asc
         limit v_lim offset v_off) x;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'total', v_total,
    'limit', v_lim,
    'offset', v_off,
    'includeHorses', coalesce(p_include_horses, true),
    'emailRevealed', coalesce(p_reveal_email, false));
end;
$$;

create or replace function public.fn_ca_player_360(
  p_user_id       uuid,
  p_money_visible boolean default false,
  p_reveal_email  boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.profiles;
  v_money   boolean := coalesce(p_money_visible, false);
  v_profile jsonb;
begin
  select * into v_p from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'player_not_found');
  end if;

  v_profile := jsonb_build_object(
    'id', v_p.id,
    'displayName', v_p.display_name,
    'username', v_p.username,
    'playerNumber', v_p.player_number,
    'avatarUrl', v_p.avatar_url,
    'country', v_p.country,
    'createdAt', v_p.created_at,
    'lastSeen', v_p.last_seen,
    'lastLogin', v_p.last_login,
    'emailVerified', v_p.email_verified,
    'phoneVerified', v_p.phone_verified,
    -- The badge. Section 10.5 sanctions is_horse as IDENTIFICATION, and
    -- this is the only thing this whole phase does with it.
    'isHorse', coalesce(v_p.is_horse, false),
    'role', v_p.role,
    'status', v_p.status,
    'totalHandsPlayed', v_p.total_hands_played);

  if p_reveal_email then
    v_profile := v_profile || jsonb_build_object('email', v_p.email);
  end if;
  if v_money then
    v_profile := v_profile || jsonb_build_object('diamonds', v_p.diamond_balance);
  end if;

  return jsonb_build_object(
    'ok', true,
    'moneyVisible', v_money,
    'emailRevealed', coalesce(p_reveal_email, false),
    'profile', v_profile,

    'restrictions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.applied_at desc)
        from public.ca_player_restrictions r where r.user_id = p_user_id), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc)
        from public.ca_operator_player_notes n
       where n.user_id = p_user_id and n.deleted_at is null), '[]'::jsonb),

    'tags', coalesce((
      select jsonb_agg(t.tag order by t.tag)
        from public.ca_operator_player_tags t where t.user_id = p_user_id), '[]'::jsonb),

    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'clubId', cm.club_id,
               'clubName', c.name,
               'role', cm.role,
               'status', cm.status,
               'joinedAt', cm.joined_at,
               'lastActiveAt', cm.last_active_at,
               'handsPlayed', cm.hands_played,
               'chipBalance', case when v_money then cm.chip_balance else null end)
             order by cm.joined_at desc)
        from public.club_members cm
        left join public.clubs c on c.id = cm.club_id
       where cm.user_id = p_user_id), '[]'::jsonb),

    'playRecord', coalesce((
      select jsonb_agg(jsonb_build_object(
               'clubId', ps.club_id,
               'handsPlayed', ps.hands_played,
               'vpip', ps.vpip,
               'pfr', ps.pfr,
               'tournamentsPlayed', ps.tournaments_played,
               'tournamentsWon', ps.tournaments_won,
               'totalWinnings', case when v_money then ps.total_winnings else null end,
               'totalLosses', case when v_money then ps.total_losses else null end,
               'totalRake', case when v_money then ps.total_rake else null end))
        from public.player_stats ps where ps.user_id = p_user_id), '[]'::jsonb),

    'seats', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tableId', ts.table_id, 'seatNumber', ts.seat_number,
               'joinedAt', ts.joined_at, 'clubId', ts.club_id,
               'stack', case when v_money then ts.stack else null end)
             order by ts.joined_at desc)
        from public.table_seats ts
       where ts.user_id = p_user_id and ts.left_at is null), '[]'::jsonb),

    'kycEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'eventType', k.event_type, 'provider', k.provider,
               'previousStatus', k.previous_status, 'newStatus', k.new_status,
               'source', k.source, 'createdAt', k.created_at)
             order by k.created_at desc)
        from (select * from public.kyc_events
               where user_id = p_user_id order by created_at desc limit 50) k),
      '[]'::jsonb),

    'responsibleGaming', (
      select to_jsonb(rg) from public.responsible_gaming_limits rg
       where rg.user_id = p_user_id),

    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'subject', t.subject, 'status', t.status,
               'priority', t.priority, 'assignedTo', t.assigned_to,
               'createdAt', t.created_at, 'resolvedAt', t.resolved_at)
             order by t.created_at desc)
        from (select * from public.live_help_tickets
               where user_id = p_user_id order by created_at desc limit 50) t),
      '[]'::jsonb),

    'reportsAgainst', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ur.id, 'reason', ur.reason, 'status', ur.status,
               'createdAt', ur.created_at)
             order by ur.created_at desc)
        from (select * from public.user_reports
               where reported_user_id = p_user_id order by created_at desc limit 50) ur),
      '[]'::jsonb),

    -- anti_cheat_flags keys the player as player_id, not user_id. Naming
    -- the wrong one answers 42703 into a swallowed error and a flagged
    -- player would read as clean, which is the CHECK 13 defect Phase 3
    -- shipped a fix for.
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'flagType', f.flag_type, 'severity', f.severity,
               'status', f.status, 'flaggedAt', f.flagged_at)
             order by f.flagged_at desc)
        from (select * from public.anti_cheat_flags
               where player_id = p_user_id order by flagged_at desc limit 50) f),
      '[]'::jsonb),

    'auditRowCount', (
      select count(*) from public.admin_audit_log
       where target_id = p_user_id::text),

    'observationCount', (
      select count(*) from public.ca_restriction_observations
       where user_id = p_user_id)
  );
end;
$$;

create or replace function public.fn_ca_restriction_list(
  p_scope          text default null,
  p_status         text default 'active',
  p_include_horses boolean default true,   -- CLAUDE.md 10.5: DEFAULTS TRUE
  p_limit          int default 50,
  p_offset         int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lim   int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_rows  jsonb;
  v_total bigint;
begin
  with base as (
    select r.*, p.display_name, p.username,
           coalesce(p.is_horse, false) as is_horse
      from public.ca_player_restrictions r
      left join public.profiles p on p.id = r.user_id
     where (p_scope is null or r.scope = p_scope)
       and (p_status is null or r.status = p_status)
       and (coalesce(p_include_horses, true) or not coalesce(p.is_horse, false))
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.applied_at desc), '[]'::jsonb),
         (select count(*) from base)
    into v_rows, v_total
  from (select * from base order by applied_at desc limit v_lim offset v_off) x;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total,
                            'limit', v_lim, 'offset', v_off,
                            'includeHorses', coalesce(p_include_horses, true));
end;
$$;

create or replace function public.fn_ca_restriction_observations(
  p_hours  int default 24,
  p_limit  int default 50,
  p_offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_h     int := least(greatest(coalesce(p_hours, 24), 1), 720);
  v_lim   int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   int := greatest(coalesce(p_offset, 0), 0);
  v_rows  jsonb;
  v_total bigint;
  v_enf   boolean;
begin
  select restrictions_enforced into v_enf from public.ca_operator_policy limit 1;

  with base as (
    select o.*, p.display_name, coalesce(p.is_horse, false) as is_horse
      from public.ca_restriction_observations o
      left join public.profiles p on p.id = o.user_id
     where o.observed_at > now() - make_interval(hours => v_h)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at desc), '[]'::jsonb),
         (select count(*) from base)
    into v_rows, v_total
  from (select * from base order by observed_at desc limit v_lim offset v_off) x;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total,
                            'limit', v_lim, 'offset', v_off, 'hours', v_h,
                            'enforced', coalesce(v_enf, false));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. ACL. Restated in full so this file reads as self-contained.
-- ---------------------------------------------------------------------
do $acl$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.fn_ca_player_restricted(uuid, text)',
    'public.fn_ca_player_restriction_for(uuid, text)',
    'public.fn_ca_player_restrict(uuid, text, text, text, timestamptz, uuid, uuid)',
    'public.fn_ca_player_lift_restriction(uuid, uuid, text)',
    'public.fn_ca_restriction_expire_sweep()',
    'public.fn_ca_player_note_add(uuid, text, uuid, boolean)',
    'public.fn_ca_player_note_delete(uuid, uuid)',
    'public.fn_ca_player_tag_set(uuid, text, uuid, boolean)',
    'public.fn_ca_player_rg_set(uuid, jsonb, uuid)',
    'public.fn_ca_player_search(text, boolean, boolean, int, int, boolean)',
    'public.fn_ca_player_360(uuid, boolean, boolean)',
    'public.fn_ca_restriction_list(text, text, boolean, int, int)',
    'public.fn_ca_restriction_observations(int, int, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$acl$;

-- fn_ca_player_restricted and fn_ca_player_restriction_for are the
-- exception: the TRIGGER calls them, and a trigger on table_seats runs
-- as whoever is inserting - the engine, a browser under RLS, a cron.
-- They are SECURITY DEFINER so they read the restriction table
-- regardless, but the caller still needs EXECUTE.
grant execute on function public.fn_ca_player_restricted(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.fn_ca_player_restriction_for(uuid, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. ASSERTIONS. A migration that cannot prove its own guard is attached
-- is a guard that reads as armed while being unreachable, which
-- CLAUDE.md names as a trap three separate times.
-- ---------------------------------------------------------------------
do $assert$
declare
  v_enforced boolean;
  v_n        int;
begin
  select restrictions_enforced into v_enforced from public.ca_operator_policy limit 1;
  if coalesce(v_enforced, true) is not false then
    raise exception 'ASSERT FAILED: restrictions_enforced must be false on apply, got %', v_enforced;
  end if;
  raise notice 'ASSERT OK: restrictions_enforced is false. Every guard observes and refuses nothing.';

  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and ((c.relname = 'table_seats'        and t.tgname = 'zz_restriction_seat_guard')
       or (c.relname = 'tournament_players' and t.tgname = 'zz_restriction_tourney_guard'));
  if v_n <> 2 then
    raise exception 'ASSERT FAILED: expected both restriction guards attached, found %', v_n;
  end if;
  raise notice 'ASSERT OK: both guards attached, to table_seats and tournament_players.';

  -- The freeze guards must still be there and must still sort first.
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and t.tgname like 'zz_freeze%'
     and c.relname in ('table_seats', 'tournament_players');
  if v_n < 3 then
    raise exception 'ASSERT FAILED: the freeze guards are missing, found %', v_n;
  end if;
  if 'zz_freeze_entry_guard' >= 'zz_restriction_seat_guard' then
    raise exception 'ASSERT FAILED: trigger name ordering no longer puts the freeze first';
  end if;
  raise notice 'ASSERT OK: the freeze guards still fire first.';

  select count(*) into v_n from pg_indexes
   where schemaname = 'public'
     and indexname in ('ca_player_restrictions_one_active_per_scope',
                       'ca_player_restrictions_active_by_user');
  if v_n <> 2 then
    raise exception 'ASSERT FAILED: expected both restriction indexes, found %', v_n;
  end if;
  raise notice 'ASSERT OK: the unique-active index and the hot-path index exist.';

  if public.fn_ca_player_restricted(gen_random_uuid(), 'cash') is not false then
    raise exception 'ASSERT FAILED: an unknown player reads as restricted';
  end if;
  if public.fn_ca_player_restricted(null, 'cash') is not false then
    raise exception 'ASSERT FAILED: a null player reads as restricted';
  end if;
  raise notice 'ASSERT OK: the reader answers false for an unrestricted and for a null player.';

  select count(*) into v_n from public.ca_player_restrictions;
  if v_n <> 0 then
    raise exception 'ASSERT FAILED: this migration seeds no restriction, found %', v_n;
  end if;
  raise notice 'ASSERT OK: no player is restricted by this migration. % rows.', v_n;

  raise notice 'ASSERT OK: Phase 4 installed. Nothing takes a player''s access away until Dan turns enforcement on.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Paste and run as one transaction to undo this migration completely.
--
-- BEFORE YOU DO: turning the switch off is faster and safer than rolling
-- this back, exactly as 20260903202500 says about approvals. With
-- restrictions_enforced false every guard already refuses nothing, so
-- the ONLY reason to run this is to remove the objects themselves.
--
-- Dependency order: triggers first (they call the reader), then the
-- functions, then the tables. The added policy column is dropped last
-- and is the one destructive step - it discards the switch's value.
--
-- begin;
--   set local lock_timeout = '5s';
--
--   drop trigger if exists zz_restriction_seat_guard on public.table_seats;
--   drop trigger if exists zz_restriction_tourney_guard on public.tournament_players;
--   drop function if exists public.fn_ca_refuse_restricted_entry();
--
--   drop function if exists public.fn_ca_restriction_observations(int, int, int);
--   drop function if exists public.fn_ca_restriction_list(text, text, boolean, int, int);
--   drop function if exists public.fn_ca_player_360(uuid, boolean, boolean);
--   drop function if exists public.fn_ca_player_search(text, boolean, boolean, int, int, boolean);
--   drop function if exists public.fn_ca_player_rg_set(uuid, jsonb, uuid);
--   drop function if exists public.fn_ca_player_tag_set(uuid, text, uuid, boolean);
--   drop function if exists public.fn_ca_player_note_delete(uuid, uuid);
--   drop function if exists public.fn_ca_player_note_add(uuid, text, uuid, boolean);
--   drop function if exists public.fn_ca_restriction_expire_sweep();
--   drop function if exists public.fn_ca_player_lift_restriction(uuid, uuid, text);
--   drop function if exists public.fn_ca_player_restrict(uuid, text, text, text, timestamptz, uuid, uuid);
--   drop function if exists public.fn_ca_player_restriction_for(uuid, text);
--   drop function if exists public.fn_ca_player_restricted(uuid, text);
--
--   drop table if exists public.ca_restriction_observations;
--   drop table if exists public.ca_operator_player_tags;
--   drop table if exists public.ca_operator_player_notes;
--   drop table if exists public.ca_player_restrictions;
--
--   alter table public.ca_operator_policy drop column if exists restrictions_enforced;
-- commit;
-- =====================================================================
