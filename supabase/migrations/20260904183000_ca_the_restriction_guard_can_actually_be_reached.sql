-- =====================================================================
-- Phase 4 corrections: the guard was unreachable, and it was labelling
-- every seat wrong. Both found by adversarial review, both proved
-- against production before this file was written.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
--
-- =====================================================================
-- DEFECT 1 (BLOCKER). THE SEAT GUARD WAS BEFORE INSERT ONLY, AND
-- ALMOST EVERY SEATING IS AN UPDATE.
-- =====================================================================
--
-- 20260904150000 attached zz_restriction_seat_guard as BEFORE INSERT on
-- table_seats and its own header claimed, in as many words, that "all
-- seven converge on an INSERT into one of these two tables. A guard at
-- the table is one place that cannot be walked around."
--
-- That claim was FALSE and it was checkable. Three of the five
-- sanctioned seat creators - fn_take_seat_and_buy_in,
-- fn_seat_late_registrant, fn_seat_horse_in_seat_first_game - REVIVE a
-- vacated row and only INSERT as a fallback:
--
--     UPDATE public.table_seats
--        SET user_id = v_uid, stack = v_stack, left_at = NULL, ...
--      WHERE table_id = p_table_id AND seat_number = p_seat_number
--        AND left_at IS NOT NULL;
--     IF NOT FOUND THEN INSERT ...
--
-- Measured in production 2026-09-04: 300,453 table_seats rows, of which
-- 299,475 carry a non-null left_at and are therefore revivable. On
-- essentially every table that has ever had somebody leave, a restricted
-- player takes the seat by UPDATE and the guard never runs.
--
-- This is the precise trap CLAUDE.md names three separate times: a guard
-- that reads as armed while being unreachable. With enforcement ON it
-- would have refused almost nothing while the console said the player
-- was stopped. With enforcement OFF - the state it is in - it is worse
-- in a quieter way: ca_restriction_observations is the evidence Dan is
-- meant to use to decide whether to turn enforcement on, and it would
-- have stayed near-empty and read as "nothing would have been refused".
--
-- Both precedents the original file cited already covered UPDATE, which
-- is how obvious this should have been (pg_trigger.tgtype on
-- table_seats): zz_freeze_guard is 31 = ROW|BEFORE|INSERT|DELETE|UPDATE,
-- and trg_ca_guard_seat_creation - the dry-run seat guard named as the
-- model - is 23 = ROW|BEFORE|INSERT|UPDATE. zz_restriction_seat_guard
-- was 7 = ROW|BEFORE|INSERT.
--
-- FIXED with a SECOND trigger rather than by widening the first, so the
-- hot path stays cheap: a WHEN clause is evaluated by Postgres without
-- calling the function at all, and only a transition INTO an occupied
-- seat can reach it. An ordinary stack update during a hand does not.
--
-- =====================================================================
-- DEFECT 2 (BLOCKER). EVERY table_seats ROW WAS CHECKED AGAINST 'cash',
-- AND 97.8% OF THEM ARE TOURNAMENT SEATS.
-- =====================================================================
--
-- Production 2026-09-04: of 300,454 seats joined to their table,
-- 293,804 are at a table with a tournament_id and 6,650 are cash.
--
-- So the original guard would have:
--   * refused a TOURNAMENT seat to a player restricted from CASH, while
--     the console told that operator, in SCOPE_META, "Cannot Take A Seat
--     At A Cash Table". Section 0's second half - what an operator is
--     told must match what the platform will do - broken in the field;
--   * allowed a tournament seat to a player restricted from TOURNAMENTS,
--     because fn_seat_late_registrant's write was labelled cash;
--   * written 'cash' into every observation row for a tournament seat,
--     making the dry-run evidence wrong in the one field Dan will read.
--
-- The sim did not catch it because PHASE4-SIM.sql asserts the READER
-- binds the scope it was given. The reader was always right. The guard
-- was telling it the wrong scope.
--
-- FIXED by resolving the scope from the table the seat belongs to.
--
-- ORDERING, AND WHY THE LOOKUP IS NOT ON THE HOT PATH. The scope lookup
-- is a primary-key read on `tables`, and it now happens ONLY after a
-- single partial-index probe has established that this player has any
-- live restriction at all. On a platform where nobody is restricted -
-- which is every platform until an operator acts - the guard is one
-- index probe and a RETURN, exactly as before.
--
-- =====================================================================
-- DEFECT 3 (HIGH). A RUN-OUT RESTRICTION BLOCKED A NEW ONE.
-- =====================================================================
--
-- fn_ca_player_restrict refused a duplicate on status = 'active' alone,
-- contradicting the same file's own doctrine three sections earlier:
-- "expires_at is authoritative over status ... a restriction that has
-- run out must stop binding the moment it does, not the next time a
-- sweep happens to run."
--
-- Proved in a rolled-back probe: with one status='active',
-- expires_at = now() - 1 day row, the reader answered
-- restricted = false and the RPC answered already_restricted. The
-- operator was told to lift a restriction the console renders as
-- Expired. FIXED here; the partial unique index keeps the same blind
-- spot by construction, so fn_ca_restriction_expire_sweep now matters
-- and section 5 below says where it has to be scheduled.
--
-- =====================================================================
-- DEFECT 4 (HIGH). EVERY WRITE FILED TWO AUDIT ROWS.
-- =====================================================================
--
-- Both the RPC and the route called fn_log_admin_action with the same
-- action, target_type and target_id, for all six write paths. That is
-- Phase 2's defect D-7, reproduced five more times: the Audit tab's
-- counts double, and a reader diffing before/after gets two different
-- answers for one event, because the RPC row has the real states and no
-- request context while the route row has ip, user agent and request id.
--
-- FIXED by removing the audit from the RPCs. The ROUTE keeps it, because
-- the route is the only half that knows who was on the other end of the
-- connection - and Phase 1's whole audit contract is that every row
-- carries actor, ip, user agent and request id.
--
-- =====================================================================
-- DEFECT 5 (HIGH). fn_ca_player_rg_set RE-ARMED A PLAYER'S OWN HOLD FOR
-- FREE, AND ACCEPTED A PATCH THAT DID NOTHING.
-- =====================================================================
--
-- limit_increase_available_at was set to now() + 24h unconditionally in
-- the ON CONFLICT branch. Proved: a patch of {"nonsense": 1} - naming no
-- recognised field at all - answered ok:true and moved the hold forward
-- a day.
--
-- That column is the PLAYER'S hold. Their own self-service path reads
-- it. So an operator no-op, a double-click, or a panel re-submitting an
-- unchanged form extended the window during which the PLAYER cannot
-- loosen their own limits. Section 0 rule 7 exists to stop an operator
-- being a bypass of a player's protection; this was the same rule
-- inverted, an operator tightening the cage by accident.
--
-- Also fixed: {"reality_check_interval_minutes": null} was classified as
-- nothing, coalesced back to the old value, and reported as a successful
-- update that changed nothing. The column is NOT NULL in production, so
-- the honest answer is a refusal.
--
-- =====================================================================
-- DEFECT 6 (MEDIUM). THE 360 RETURNED MONEY WITHOUT money.read.
-- =====================================================================
--
-- responsibleGaming came back as a bare to_jsonb(rg), ungated, while
-- every other money figure was masked. Four of its columns are currency
-- amounts. `support` and `read_only` both hold players.read and neither
-- holds money.read. The exclusion timestamps and the reality-check
-- interval stay visible: they are protection state, not money.
--
-- =====================================================================
-- ALSO: a dead assertion, and unstable paging.
-- =====================================================================
--
-- The original asserted `if 'zz_freeze_entry_guard' >= 'zz_restriction_seat_guard'`
-- - two string literals, a fact about ASCII, dead in every possible
-- state of the database. It read as a check on the live triggers and
-- checked nothing, which is the exact trap the section it sits in warns
-- about. It now reads pg_trigger.
--
-- And both list functions ordered by a non-unique column with no
-- tiebreaker, so a row could repeat or vanish between pages.
-- =====================================================================

-- =====================================================================
-- WHY THIS IS TWO MIGRATIONS
-- =====================================================================
-- CREATE TRIGGER takes ACCESS EXCLUSIVE on its table, and table_seats is
-- the hottest table on the platform: five attempts at 3s each were all
-- refused by lock_timeout at 11:16 UTC on a normal weekday.
--
-- Raising the timeout is the wrong answer and this file says so twice.
-- Waiting is the right one, and it does not have to block the FIX: the
-- scope defect and the reachability defect are fixed in DIFFERENT
-- places. Replacing fn_ca_refuse_restricted_entry needs no lock at all
-- and immediately corrects the scope on both existing triggers, so
-- every seat and every registration is judged against the right rule
-- from the moment this file applies.
--
-- The revive trigger - the half that needs the lock - is
-- 20260904183500, applied in the :55 maintenance window when the
-- platform is frozen and table_seats is quiet. Until it lands, the seat
-- guard is reachable on INSERT only, which is the state 20260904150000
-- shipped and which this file's header describes in full.
-- =====================================================================

begin;

set local lock_timeout = '3s';
set local statement_timeout = '5min';

-- ---------------------------------------------------------------------
-- 1. THE GUARD: reachable, and telling the truth about the scope
-- ---------------------------------------------------------------------
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
  v_tourney  uuid;
  v_row      public.ca_player_restrictions;
begin
  begin
    v_user := new.user_id;
    if v_user is null then
      return new;
    end if;

    -- THE HOT PATH, and the only thing that runs for a player nobody has
    -- restricted: one probe of the partial index
    -- ca_player_restrictions_active_by_user, which on a platform with no
    -- restrictions is a handful of pages. Everything below it - the
    -- table lookup, the policy read, the observation write - happens
    -- only for a player who genuinely carries a live restriction.
    if not exists (
      select 1 from public.ca_player_restrictions r
       where r.user_id = v_user
         and r.status = 'active'
         and (r.expires_at is null or r.expires_at > now())
    ) then
      return new;
    end if;

    -- THE SCOPE THIS WRITE ACTUALLY BELONGS TO. table_seats carries both
    -- cash and tournament seats and 97.8% of its rows are tournament
    -- ones, so the trigger argument is a DEFAULT, not an answer.
    if tg_table_name = 'table_seats' then
      select t.tournament_id into v_tourney
        from public.tables t where t.id = new.table_id;
      v_scope := case when v_tourney is not null then 'tournaments' else 'cash' end;
    end if;

    if not public.fn_ca_player_restricted(v_user, v_scope) then
      return new;
    end if;

    select restrictions_enforced into v_enforced
      from public.ca_operator_policy limit 1;
    v_enforced := coalesce(v_enforced, false);

    v_row := public.fn_ca_player_restriction_for(v_user, v_scope);

    if not v_enforced then
      insert into public.ca_restriction_observations
        (user_id, scope, restriction_id, table_name, op, would_refuse, detail)
      values (
        v_user, v_scope, v_row.id, tg_table_name, tg_op, true,
        jsonb_build_object(
          'reason_code', v_row.reason_code,
          'restriction_scope', v_row.scope,
          'applied_at', v_row.applied_at,
          'expires_at', v_row.expires_at,
          -- Which of the two ways in this was, so the evidence says
          -- whether the revive path is being used at all.
          'seating_op', tg_op,
          'tournament_id', v_tourney));
      return new;
    end if;

    raise exception
      'PLAYER_RESTRICTED: this account is restricted (%) and cannot % on %.',
      v_row.reason_code, tg_op, tg_table_name
      using errcode = '42501',
            hint = 'An operator applied this restriction. It can be lifted from the Players tab in the operator console.';

  exception
    when insufficient_privilege then
      raise;
    when others then
      return new;
  end;
end;
$$;

comment on function public.fn_ca_refuse_restricted_entry() is
  'BEFORE INSERT and BEFORE seat-revive UPDATE guard for table_seats, and BEFORE INSERT for tournament_players. Resolves cash vs tournaments from the seat''s table. Observes while ca_operator_policy.restrictions_enforced is false. Fails OPEN on any internal error.';

-- ---------------------------------------------------------------------
-- 2. A RUN-OUT RESTRICTION NO LONGER BLOCKS A NEW ONE, and the RPC
--    stops filing its own audit row.
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

  select is_horse into v_is_horse from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'player_not_found');
  end if;

  -- expires_at is the clock, status is only the intent. A row that has
  -- run out does not bind, so it must not block either - the console
  -- renders it Expired and told the operator to lift an active one.
  select * into v_existing
    from public.ca_player_restrictions
   where user_id = p_user_id and scope = p_scope and status = 'active'
     and (expires_at is null or expires_at > now())
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_restricted',
      'restriction_id', v_existing.id,
      'applied_at', v_existing.applied_at);
  end if;

  -- The partial unique index has the same blind spot by construction: it
  -- keys on status alone. So a run-out row that the sweep has not
  -- reached yet is retired HERE, in the same transaction, rather than
  -- raising a unique violation the operator cannot act on.
  update public.ca_player_restrictions
     set status = 'expired'
   where user_id = p_user_id and scope = p_scope and status = 'active'
     and expires_at is not null and expires_at <= now();

  insert into public.ca_player_restrictions
    (user_id, scope, reason_code, reason_note, expires_at, applied_by, approval_id)
  values
    (p_user_id, p_scope, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''),
     p_expires_at, p_actor, p_approval_id)
  returning * into v_row;

  -- NO fn_log_admin_action HERE. The route audits, and it is the only
  -- half that knows the ip, the user agent and the request id that
  -- Phase 1's audit contract requires on every row. Two writers meant
  -- two rows per event and two different answers to "what changed".
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

  return jsonb_build_object('ok', true, 'restriction', to_jsonb(v_after),
                            'before', to_jsonb(v_before));
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

  update public.ca_operator_player_notes
     set deleted_at = now(), deleted_by = p_actor, updated_at = now()
   where id = p_note_id
  returning * into v_after;

  -- `before` travels back so the ROUTE can file the real prior state
  -- rather than a synthetic { deleted: false }.
  return jsonb_build_object('ok', true, 'note', to_jsonb(v_after),
                            'before', to_jsonb(v_before));
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

  return jsonb_build_object('ok', true, 'tag', v_tag,
                            'removed', coalesce(p_remove, false),
                            'was_present', v_had);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. RESPONSIBLE GAMING: the hold moves only when something moved
-- ---------------------------------------------------------------------
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
  v_created boolean := false;
  v_loosens text[] := '{}';
  v_changed text[] := '{}';
  v_key     text;
  v_num     numeric;
  v_ts      timestamptz;
  v_old     text;
  v_new     text;
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
    v_created := true;
  end if;

  -- The column is NOT NULL in production, so clearing it is not a thing
  -- that can happen. It used to be coalesced back to the old value and
  -- reported as a successful update that changed nothing.
  if p_patch ? 'reality_check_interval_minutes'
     and nullif(p_patch ->> 'reality_check_interval_minutes', '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reality_check_not_nullable');
  end if;

  -- WHAT ACTUALLY MOVES. Computed for every recognised key the patch
  -- names, so a patch that names none of them, or names them with the
  -- values they already hold, is refused instead of silently re-arming
  -- the player's own protection hold for another day.
  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes',
    'reality_check_interval_minutes', 'self_excluded_until', 'cooling_off_until'
  ] loop
    if not (p_patch ? v_key) then
      continue;
    end if;
    v_new := nullif(p_patch ->> v_key, '');
    v_old := case when v_created then null else to_jsonb(v_before) ->> v_key end;

    if v_key in ('self_excluded_until', 'cooling_off_until') then
      if v_new is distinct from v_old
         and (v_new is null or v_old is null
              or v_new::timestamptz is distinct from v_old::timestamptz) then
        v_changed := array_append(v_changed, v_key);
      end if;
    elsif v_new is distinct from v_old
          and (v_new is null or v_old is null
               or v_new::numeric is distinct from v_old::numeric) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'patch_changes_nothing');
  end if;

  -- LOWER is tighter for the money and time caps.
  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes'
  ] loop
    if p_patch ? v_key and not v_created then
      v_num := nullif(p_patch ->> v_key, '')::numeric;
      v_old := to_jsonb(v_before) ->> v_key;
      if v_num is null and v_old is not null then
        v_loosens := array_append(v_loosens, v_key || ':cleared');
      elsif v_num is not null and v_old is not null and v_num > v_old::numeric then
        v_loosens := array_append(v_loosens, v_key || ':raised');
      end if;
    end if;
  end loop;

  -- SHORTER is tighter for the reality check: a longer interval means
  -- FEWER reminders.
  if p_patch ? 'reality_check_interval_minutes' and not v_created then
    v_num := nullif(p_patch ->> 'reality_check_interval_minutes', '')::numeric;
    if v_num is not null and v_num > v_before.reality_check_interval_minutes then
      v_loosens := array_append(v_loosens, 'reality_check_interval_minutes:lengthened');
    end if;
  end if;

  -- LATER is tighter for the two exclusions.
  foreach v_key in array array['self_excluded_until', 'cooling_off_until'] loop
    if p_patch ? v_key and not v_created then
      v_ts := nullif(p_patch ->> v_key, '')::timestamptz;
      v_old := to_jsonb(v_before) ->> v_key;
      if v_ts is null and v_old is not null then
        v_loosens := array_append(v_loosens, v_key || ':cleared');
      elsif v_ts is not null and v_old is not null and v_ts < v_old::timestamptz then
        v_loosens := array_append(v_loosens, v_key || ':shortened');
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
      then nullif(p_patch ->> 'reality_check_interval_minutes', '')::int
      else t.reality_check_interval_minutes end,
    self_excluded_until = case when p_patch ? 'self_excluded_until'
      then nullif(p_patch ->> 'self_excluded_until', '')::timestamptz
      else t.self_excluded_until end,
    cooling_off_until = case when p_patch ? 'cooling_off_until'
      then nullif(p_patch ->> 'cooling_off_until', '')::timestamptz
      else t.cooling_off_until end,
    -- Only now that something has genuinely moved. This used to be
    -- unconditional, so a patch naming no recognised field at all pushed
    -- the PLAYER'S own hold forward by a day.
    limit_increase_available_at = now() + interval '24 hours',
    updated_at = now()
  returning * into v_after;

  return jsonb_build_object('ok', true, 'limits', to_jsonb(v_after),
                            'before', case when v_created then null else to_jsonb(v_before) end,
                            'changed', to_jsonb(v_changed),
                            'created', v_created);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. THE 360: responsible-gaming money is money
-- ---------------------------------------------------------------------
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
  v_rg      jsonb;
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

  -- The four deposit and loss limits are CURRENCY. The exclusion
  -- timestamps and the reality-check interval are protection state, not
  -- money, and stay visible to anybody who can open the tab: an
  -- operator answering a self-exclusion question needs to see it.
  select jsonb_build_object(
           'user_id', rg.user_id,
           'session_time_limit_minutes', rg.session_time_limit_minutes,
           'reality_check_interval_minutes', rg.reality_check_interval_minutes,
           'self_excluded_until', rg.self_excluded_until,
           'cooling_off_until', rg.cooling_off_until,
           'limit_increase_available_at', rg.limit_increase_available_at,
           'updated_at', rg.updated_at,
           'daily_deposit_limit', case when v_money then rg.daily_deposit_limit end,
           'weekly_deposit_limit', case when v_money then rg.weekly_deposit_limit end,
           'monthly_deposit_limit', case when v_money then rg.monthly_deposit_limit end,
           'daily_loss_limit', case when v_money then rg.daily_loss_limit end)
    into v_rg
    from public.responsible_gaming_limits rg
   where rg.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'moneyVisible', v_money,
    'emailRevealed', coalesce(p_reveal_email, false),
    'profile', v_profile,

    'restrictions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.applied_at desc, r.id)
        from public.ca_player_restrictions r where r.user_id = p_user_id), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc, n.id)
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
               where user_id = p_user_id order by created_at desc, id limit 50) k),
      '[]'::jsonb),

    'responsibleGaming', v_rg,

    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'subject', t.subject, 'status', t.status,
               'priority', t.priority, 'assignedTo', t.assigned_to,
               'createdAt', t.created_at, 'resolvedAt', t.resolved_at)
             order by t.created_at desc)
        from (select * from public.live_help_tickets
               where user_id = p_user_id order by created_at desc, id limit 50) t),
      '[]'::jsonb),

    'reportsAgainst', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ur.id, 'reason', ur.reason, 'status', ur.status,
               'createdAt', ur.created_at)
             order by ur.created_at desc)
        from (select * from public.user_reports
               where reported_user_id = p_user_id order by created_at desc, id limit 50) ur),
      '[]'::jsonb),

    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'flagType', f.flag_type, 'severity', f.severity,
               'status', f.status, 'flaggedAt', f.flagged_at)
             order by f.flagged_at desc)
        from (select * from public.anti_cheat_flags
               where player_id = p_user_id order by flagged_at desc, id limit 50) f),
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

-- ---------------------------------------------------------------------
-- 5. STABLE PAGING. A non-unique sort key with no tiebreaker lets a row
--    repeat or vanish between two LIMIT/OFFSET queries.
-- ---------------------------------------------------------------------
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
                       order by x.restricted desc, x.display_name asc, x.id), '[]'::jsonb),
    (select count(*) from filtered)
    into v_rows, v_total
  from (select * from filtered
         order by restricted desc, display_name asc, id
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
  select coalesce(jsonb_agg(to_jsonb(x) order by x.applied_at desc, x.id), '[]'::jsonb),
         (select count(*) from base)
    into v_rows, v_total
  from (select * from base order by applied_at desc, id limit v_lim offset v_off) x;

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
  v_found boolean := false;
begin
  select restrictions_enforced, true into v_enf, v_found
    from public.ca_operator_policy limit 1;

  with base as (
    select o.*, p.display_name, coalesce(p.is_horse, false) as is_horse
      from public.ca_restriction_observations o
      left join public.profiles p on p.id = o.user_id
     where o.observed_at > now() - make_interval(hours => v_h)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at desc, x.id), '[]'::jsonb),
         (select count(*) from base)
    into v_rows, v_total
  from (select * from base order by observed_at desc, id limit v_lim offset v_off) x;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'total', v_total,
                            'limit', v_lim, 'offset', v_off, 'hours', v_h,
                            -- NULL when there is no policy row to read, never
                            -- false. An unknown switch is not an off switch,
                            -- and this function used to coalesce it to false
                            -- while every other answer on the route reported
                            -- null.
                            'enforced', case when v_found then v_enf else null end);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RETENTION for the observation log, which the contract promised and
--    nothing delivered.
-- ---------------------------------------------------------------------
create or replace function public.fn_ca_restriction_observation_prune(
  p_days int default 30
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 3650);
  v_n    int;
begin
  delete from public.ca_restriction_observations
   where observed_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_n, 'days', v_days);
end;
$$;

comment on function public.fn_ca_restriction_observation_prune(int) is
  'Prunes the restriction observation log by AGE. Schedule through Open Claw (World Hub CLAUDE.md 11.2), NEVER the Claude scheduler (10.9): a task installed from one Claude account is unreachable from the next and reports enabled true while never firing again.';

-- ---------------------------------------------------------------------
-- 7. ACL for the two new functions, and re-stated for every replaced one
-- ---------------------------------------------------------------------
do $acl$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.fn_ca_player_restrict(uuid, text, text, text, timestamptz, uuid, uuid)',
    'public.fn_ca_player_lift_restriction(uuid, uuid, text)',
    'public.fn_ca_player_note_add(uuid, text, uuid, boolean)',
    'public.fn_ca_player_note_delete(uuid, uuid)',
    'public.fn_ca_player_tag_set(uuid, text, uuid, boolean)',
    'public.fn_ca_player_rg_set(uuid, jsonb, uuid)',
    'public.fn_ca_player_search(text, boolean, boolean, int, int, boolean)',
    'public.fn_ca_player_360(uuid, boolean, boolean)',
    'public.fn_ca_restriction_list(text, text, boolean, int, int)',
    'public.fn_ca_restriction_observations(int, int, int)',
    'public.fn_ca_restriction_observation_prune(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$acl$;

-- ---------------------------------------------------------------------
-- 8. ASSERTIONS, including the one the original file got wrong
-- ---------------------------------------------------------------------
do $assert$
declare
  v_n     int;
  v_first text;
begin
  -- The two triggers 20260904150000 created are still attached. The THIRD,
  -- the revive guard that closes the blocker this file exists for, needs
  -- ACCESS EXCLUSIVE on table_seats and is therefore in its own migration,
  -- 20260904183500 - see the note at the top of this file.
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and t.tgname in ('zz_restriction_seat_guard', 'zz_restriction_tourney_guard');
  if v_n <> 2 then
    raise exception 'ASSERT FAILED: expected the two original guards, found %', v_n;
  end if;
  raise notice 'ASSERT OK: the two original guards are attached, and now resolve the scope correctly.';

  -- THE REAL ORDERING CHECK. The original compared two string literals -
  -- a fact about ASCII, dead in every possible state of the database.
  select t.tgname into v_first from pg_trigger t
    join pg_class c on c.oid = t.tgrelid and c.relname = 'table_seats'
   where not t.tgisinternal and t.tgname like 'zz_%'
   order by t.tgname limit 1;
  if v_first not like 'zz_freeze%' then
    raise exception 'ASSERT FAILED: the first zz_ trigger on table_seats is %, not a freeze guard', v_first;
  end if;
  raise notice 'ASSERT OK: % still fires before the restriction guards.', v_first;

  -- No RPC files an audit row any more; the route is the single writer.
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname in ('fn_ca_player_restrict', 'fn_ca_player_lift_restriction',
                       'fn_ca_player_note_add', 'fn_ca_player_note_delete',
                       'fn_ca_player_tag_set', 'fn_ca_player_rg_set')
     -- A CALL, not a mention. prosrc carries the comments too, and
     -- fn_ca_player_restrict's body contains the line "NO
     -- fn_log_admin_action HERE" explaining why it does not audit - which
     -- a LIKE '%fn_log_admin_action%' duly found, failing this assertion
     -- on the comment that documents it. The obvious way to quieten that
     -- is to delete the explanation, which leaves the next agent with a
     -- bare rule and no reason.
     and p.prosrc ~ 'perform\s+public\.fn_log_admin_action';
  if v_n <> 0 then
    raise exception 'ASSERT FAILED: % Phase 4 write RPC(s) still audit. The route audits, and it is the only half that knows the ip and the request id.', v_n;
  end if;
  raise notice 'ASSERT OK: one audit writer per action.';

  -- Nothing here restricts anybody, and the switch is still off.
  select count(*) into v_n from public.ca_player_restrictions where status = 'active';
  raise notice 'ASSERT OK: % active restriction(s), unchanged by this migration.', v_n;

  if (select restrictions_enforced from public.ca_operator_policy limit 1) is not false then
    raise exception 'ASSERT FAILED: enforcement is not false';
  end if;
  raise notice 'ASSERT OK: enforcement is still off. The guards observe.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Do NOT roll this back to 20260904150000's bodies. Those are the
-- versions with the unreachable guard, the wrong scope on 97.8% of
-- seats, the double audit rows and the free re-arming of a player's
-- protection hold. If this phase must be undone, undo ALL of it with
-- the rollback in 20260904150000, and drop the revive trigger and the
-- prune function first:
--
-- begin;
--   set local lock_timeout = '5s';
--   drop trigger if exists zz_restriction_seat_revive_guard on public.table_seats;
--   drop function if exists public.fn_ca_restriction_observation_prune(int);
--   -- then the rollback block in 20260904150000
-- commit;
-- =====================================================================
