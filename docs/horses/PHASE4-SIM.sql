-- =====================================================================
-- PHASE 4 SIMULATION - runs against PRODUCTION and ROLLS BACK.
--
-- CLAUDE.md 11.5 is the rule this file exists to obey: a function that
-- moves or gates anything real is probed inside a transaction you ROLL
-- BACK, and what you want from the probe is the ERROR MESSAGE - did the
-- guard fire, and for the right reason. GET STACKED DIAGNOSTICS
-- survives a rollback; side effects are the part nobody wants.
--
-- WHAT THIS FILE MAY NOT DO, learned from Phase 3's review (B-1, H-3):
--   * It renames, alters or drops NOTHING. The Phase 3 sim held ACCESS
--     EXCLUSIVE on two production aggregate tables for the rest of its
--     run because it renamed them "temporarily".
--   * It creates no seat at a real table. Phase 3's sim opened probe
--     seats at a hard-coded seat index on two REAL live tables.
--   * It spends no chips, deletes no table_seats row, and creates no
--     function outside pg_temp.
--
-- HOW THE GUARD IS PROBED WITHOUT TOUCHING A REAL TABLE
-- BEFORE ROW triggers fire before foreign-key constraints are checked.
-- So an INSERT into table_seats naming a table_id that does not exist
-- reaches this phase's guard and then fails on the FK. Either way the
-- statement errors and nothing is written; the two cases are told apart
-- by SQLSTATE and message. That is the whole probe: no real table, no
-- real seat, no cleanup to get wrong.
--
-- Run:
--   psql "$CONN" -v ON_ERROR_STOP=1 -f docs/horses/PHASE4-SIM.sql
-- Expect: a wall of ASSERT OK notices and ROLLBACK at the end.
-- =====================================================================

begin;

set local lock_timeout = '5s';

do $sim$
declare
  v_human    uuid;
  v_horse    uuid;
  v_actor    uuid;
  v_res      jsonb;
  v_res2     jsonb;
  v_rid      uuid;
  v_state    text;
  v_msg      text;
  v_obs      int;
  v_obs_before int;
  v_pn_before  int;
  v_seat_id    uuid;
  v_n        int;
begin
  -- ── FIXTURES. Read only. Real accounts, chosen not created. ────────
  select id into v_actor from public.profiles where role = 'god' limit 1;
  select id into v_human from public.profiles
   where coalesce(is_horse, false) = false and role = 'user' limit 1;
  -- A horse that is NOT already at the four-game cap. Without this the
  -- tournament probe is a coin flip: trg_enforce_booking_game_cap sorts
  -- before zz_restriction_tourney_guard, so a horse already committed to
  -- four games is refused by THAT trigger and this phase's guard never
  -- speaks. The first run of this file hit exactly that and reported a
  -- SIM NOTE instead of a proof, which is the honest outcome and also a
  -- useless one.
  select p.id into v_horse
    from public.profiles p
   where coalesce(p.is_horse, false) = true
     and (select count(*) from public.tournament_players tp
           where tp.user_id = p.id
             and coalesce(tp.status, '') not in ('eliminated', 'cancelled')) < 2
   limit 1;
  if v_horse is null then
    -- Every horse is busy. Say so rather than picking one anyway and
    -- reporting whatever the wrong trigger says.
    raise exception 'SIM ABORT: no horse is below the game cap right now. Re-run off-peak; do not weaken the probe.';
  end if;

  if v_actor is null or v_human is null or v_horse is null then
    raise exception 'SIM ABORT: could not find an actor, a human and a horse';
  end if;
  raise notice 'SIM fixtures: actor %, human %, horse %', v_actor, v_human, v_horse;

  -- Baseline for the player_notes check in section 9. Read before this
  -- file writes anything at all.
  select count(*) into v_pn_before from public.player_notes;

  -- ══ 1. THE READER ═════════════════════════════════════════════════
  if public.fn_ca_player_restricted(v_human, 'cash') then
    raise exception 'ASSERT FAILED: a fresh human already reads as restricted';
  end if;

  v_res := public.fn_ca_player_restrict(
    v_human, 'cash', 'collusion_suspected', 'sim probe',
    now() + interval '1 day', v_actor, null);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: restrict refused: %', v_res;
  end if;
  v_rid := (v_res -> 'restriction' ->> 'id')::uuid;

  if not public.fn_ca_player_restricted(v_human, 'cash') then
    raise exception 'ASSERT FAILED: reader says false right after a cash restriction';
  end if;
  if public.fn_ca_player_restricted(v_human, 'tournaments') then
    raise exception 'ASSERT FAILED: a CASH restriction leaked into tournaments';
  end if;
  raise notice 'ASSERT OK: the reader binds the scope it was given and no other.';

  -- ══ 2. ACCOUNT IMPLIES EVERY SCOPE ════════════════════════════════
  v_res := public.fn_ca_player_restrict(
    v_horse, 'account', 'terms_violation', 'sim probe',
    now() + interval '1 day', v_actor, null);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: account restriction refused: %', v_res;
  end if;
  -- HORSES ARE PLAYERS: the restrict RPC accepted a horse with no
  -- special casing, and reports the badge rather than a different answer.
  if (v_res ->> 'is_horse') <> 'true' then
    raise exception 'ASSERT FAILED: the horse badge did not come back on a horse';
  end if;
  foreach v_state in array array['account','cash','tournaments','transfers','social'] loop
    if not public.fn_ca_player_restricted(v_horse, v_state) then
      raise exception 'ASSERT FAILED: an account restriction does not cover scope %', v_state;
    end if;
  end loop;
  raise notice 'ASSERT OK: an account restriction covers all five scopes, on a horse.';

  -- ══ 3. ONE ACTIVE PER SCOPE ═══════════════════════════════════════
  v_res2 := public.fn_ca_player_restrict(
    v_human, 'cash', 'multi_accounting', 'second attempt',
    now() + interval '1 day', v_actor, null);
  if (v_res2 ->> 'ok') <> 'false' or (v_res2 ->> 'reason') <> 'already_restricted' then
    raise exception 'ASSERT FAILED: a second active cash restriction was accepted: %', v_res2;
  end if;
  raise notice 'ASSERT OK: the RPC refuses a second active restriction on one scope.';

  -- And the index refuses it even if the RPC is bypassed. A VALID
  -- reason code, so the only thing that can stop this insert is the
  -- index under test. (An earlier draft used 'other' here, the check
  -- constraint fired first, and the retry inside the handler escaped
  -- it: a probe that proves the wrong constraint is a probe that has
  -- not proved anything.)
  begin
    insert into public.ca_player_restrictions (user_id, scope, reason_code, applied_by)
    values (v_human, 'cash', 'terms_violation', v_actor);
    raise exception 'ASSERT FAILED: the unique index allowed a second active row';
  exception
    when unique_violation then
      raise notice 'ASSERT OK: the partial unique index refuses a second active row too.';
  end;

  -- ...and it refuses it ONLY while the first is active. A lifted row
  -- must not block the next decision, or an operator can never restrict
  -- the same player twice.
  begin
    insert into public.ca_player_restrictions
      (user_id, scope, reason_code, applied_by, status, lifted_by, lifted_at)
    values (v_human, 'cash', 'terms_violation', v_actor, 'lifted', v_actor, now());
    raise notice 'ASSERT OK: a LIFTED row on the same scope is allowed alongside an active one.';
  exception
    when unique_violation then
      raise exception 'ASSERT FAILED: the index is not partial. A lifted row blocks a new one.';
  end;

  -- ══ 4. 'other' NEEDS A NOTE ═══════════════════════════════════════
  begin
    insert into public.ca_player_restrictions (user_id, scope, reason_code, applied_by)
    values (v_human, 'social', 'other', v_actor);
    raise exception 'ASSERT FAILED: reason_code other was accepted with no note';
  exception
    when check_violation then
      raise notice 'ASSERT OK: reason_code other is refused without a note.';
  end;

  -- ══ 4b. A LIFT MUST NAME ITS AUTHOR ═══════════════════════════════
  begin
    insert into public.ca_player_restrictions
      (user_id, scope, reason_code, applied_by, status)
    values (v_human, 'social', 'terms_violation', v_actor, 'lifted');
    raise exception 'ASSERT FAILED: a lifted row was accepted with no lifter';
  exception
    when check_violation then
      raise notice 'ASSERT OK: a lifted row must say who lifted it and when.';
  end;

  -- ══ 5. THE GUARD OBSERVES WHILE ENFORCEMENT IS OFF ════════════════
  select restrictions_enforced into v_state from public.ca_operator_policy limit 1;
  -- coalesce, because NULL <> 'false' is NULL and an abort that cannot
  -- fire is an abort that is not there. There is one policy row today
  -- (the table is a true singleton, PK id boolean with CHECK (id)), but
  -- a guard whose whole job is to stop the sim running against live
  -- enforcement does not get to depend on that.
  if coalesce(v_state, '?') <> 'false' then
    raise exception 'SIM ABORT: enforcement is already on in production. Stop and read why.';
  end if;

  select count(*) into v_obs_before from public.ca_restriction_observations;

  begin
    -- Bogus table_id on purpose: the BEFORE trigger fires first, the FK
    -- fails after. Nothing is ever written either way.
    insert into public.table_seats (table_id, seat_number, user_id, stack)
    values ('00000000-0000-0000-0000-0000000000ff', 1, v_human, 1);
    raise exception 'ASSERT FAILED: the probe insert unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'PLAYER_RESTRICTED:%' then
        raise exception 'ASSERT FAILED: the guard REFUSED while enforcement is off: %', v_msg;
      end if;
      raise notice 'SIM: with enforcement off the insert was stopped by something else, as designed: %',
        left(v_msg, 120);
  end;

  select count(*) into v_obs from public.ca_restriction_observations;
  if v_obs <= v_obs_before then
    -- EXPECTED, and worth being precise about rather than reading as a
    -- failure. The guard DID run: it saw the restriction, wrote its
    -- observation row and returned NEW. The foreign key then rejected
    -- the same statement, and a failed statement takes its own writes
    -- down with it - including the observation.
    --
    -- So this probe cannot count observation rows, and it does not need
    -- to. What it proves is the thing that matters: with enforcement
    -- OFF the guard did not raise, and the ONLY difference between this
    -- run and the one below - which does raise - is the switch.
    --
    -- The real-world behaviour is the case this probe cannot reach: the
    -- insert succeeds, so the observation commits with it. The converse
    -- is also correct by construction: an attempt that some later
    -- constraint rejects never happened, and leaves no observation
    -- claiming it did.
    raise notice 'ASSERT OK: with enforcement off the guard did NOT refuse. Its observation row rolled back with the failing statement, which is correct and is why this probe does not count rows.';
  else
    raise notice 'ASSERT OK: the guard OBSERVED and let the statement past itself. % new observation row(s).',
      v_obs - v_obs_before;
  end if;

  -- ══ 6. THE GUARD REFUSES WHEN ENFORCEMENT IS ON ═══════════════════
  update public.ca_operator_policy set restrictions_enforced = true;

  begin
    insert into public.table_seats (table_id, seat_number, user_id, stack)
    values ('00000000-0000-0000-0000-0000000000ff', 1, v_human, 1);
    raise exception 'ASSERT FAILED: the probe insert unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'PLAYER_RESTRICTED:%' then
        raise notice 'ASSERT OK: with enforcement ON the guard REFUSED: %', left(v_msg, 90);
      else
        raise notice 'SIM NOTE: with enforcement on the insert was stopped earlier by: %. This phase''s guard is UNPROVEN by this probe.',
          left(v_msg, 120);
      end if;
  end;

  -- Tournament side, same shape.
  begin
    insert into public.tournament_players (tournament_id, user_id, chips)
    values ('00000000-0000-0000-0000-0000000000ff', v_horse, 0);
    raise exception 'ASSERT FAILED: the tournament probe unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'PLAYER_RESTRICTED:%' then
        raise notice 'ASSERT OK: the tournament guard REFUSED a restricted HORSE: %', left(v_msg, 90);
      else
        raise notice 'SIM NOTE: the tournament probe was stopped earlier by: %', left(v_msg, 120);
      end if;
  end;

  -- THE REVIVE PATH. This is the probe the first version of this file did
  -- not have, and its absence is why a BEFORE INSERT guard shipped while
  -- being unreachable for 99.7% of seats: three of the five seat
  -- creators UPDATE a vacated row rather than inserting one.
  --
  -- Probed the same way as the insert: a real vacated seat row, revived
  -- by setting left_at back to null, inside a transaction that rolls
  -- back. No chips move, no seat is created, and the row is put back by
  -- the rollback rather than by any cleanup this file has to get right.
  select ts.id into v_seat_id
    from public.table_seats ts
    join public.tables t on t.id = ts.table_id
   where ts.left_at is not null and t.tournament_id is null
   limit 1;

  if v_seat_id is null then
    raise notice 'SIM NOTE: no vacated CASH seat to revive, so the revive path is UNPROVEN in this run.';
  else
    begin
      update public.table_seats
         set user_id = v_human, left_at = null
       where id = v_seat_id;
      raise exception 'ASSERT FAILED: a restricted player was REVIVED into a seat with enforcement on';
    exception
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        if v_msg like 'PLAYER_RESTRICTED:%' then
          raise notice 'ASSERT OK: the revive guard REFUSED an UPDATE-seating: %', left(v_msg, 80);
        else
          raise exception 'ASSERT FAILED: refused, but not by this phase: %', v_msg;
        end if;
    end;
  end if;

  -- THE SCOPE IS RESOLVED FROM THE TABLE, not from the trigger argument.
  -- table_seats carries both kinds and 97.8% of its rows are tournament
  -- seats, so a guard hardcoded to 'cash' judged almost every seat
  -- against the wrong rule.
  select ts.id into v_seat_id
    from public.table_seats ts
    join public.tables t on t.id = ts.table_id
   where ts.left_at is not null and t.tournament_id is not null
   limit 1;

  if v_seat_id is not null then
    -- v_human is restricted for CASH only. A TOURNAMENT seat must not be
    -- refused by that restriction.
    begin
      update public.table_seats
         set user_id = v_human, left_at = null
       where id = v_seat_id;
      raise notice 'ASSERT OK: a CASH restriction did not refuse a TOURNAMENT seat.';
    exception
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        if v_msg like 'PLAYER_RESTRICTED:%' then
          raise exception 'ASSERT FAILED: a CASH restriction refused a TOURNAMENT seat. The guard is not resolving the scope from the table.';
        end if;
        raise notice 'ASSERT OK: a CASH restriction did not refuse a TOURNAMENT seat (stopped by %).', left(v_msg, 60);
      when others then
        raise notice 'ASSERT OK: a CASH restriction did not refuse a TOURNAMENT seat.';
    end;
  end if;

  -- An UNRESTRICTED player must not be refused by this phase at all.
  begin
    insert into public.tournament_players (tournament_id, user_id, chips)
    values ('00000000-0000-0000-0000-0000000000ff',
            (select id from public.profiles
              where coalesce(is_horse,false) = false and id <> v_human
                and role = 'user' limit 1), 0);
    raise exception 'ASSERT FAILED: the control probe unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'PLAYER_RESTRICTED:%' then
        raise exception 'ASSERT FAILED: an UNRESTRICTED player was refused by the guard: %', v_msg;
      end if;
      raise notice 'ASSERT OK: an unrestricted player is not touched by the guard.';
  end;

  update public.ca_operator_policy set restrictions_enforced = false;

  -- ══ 7. LIFTING, AND EXPIRY ════════════════════════════════════════
  v_res := public.fn_ca_player_lift_restriction(v_rid, v_actor, 'sim lift');
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: lift refused: %', v_res;
  end if;
  if public.fn_ca_player_restricted(v_human, 'cash') then
    raise exception 'ASSERT FAILED: the player is still restricted after a lift';
  end if;
  select count(*) into v_n from public.ca_player_restrictions where id = v_rid;
  if v_n <> 1 then
    raise exception 'ASSERT FAILED: lifting DELETED the row. It must mark it lifted.';
  end if;
  raise notice 'ASSERT OK: a lift stops the restriction and keeps the record.';

  -- expires_at is the clock, status is only the intent.
  insert into public.ca_player_restrictions
    (user_id, scope, reason_code, applied_by, applied_at, expires_at, status)
  values (v_human, 'transfers', 'payment_dispute', v_actor,
          now() - interval '2 days', now() - interval '1 day', 'active');
  if public.fn_ca_player_restricted(v_human, 'transfers') then
    raise exception 'ASSERT FAILED: a run-out restriction still binds while status says active';
  end if;
  v_res := public.fn_ca_restriction_expire_sweep();
  if (v_res ->> 'expired')::int < 1 then
    raise exception 'ASSERT FAILED: the sweep marked nothing expired: %', v_res;
  end if;
  raise notice 'ASSERT OK: expires_at stops binding immediately, and the sweep tidies the status after.';

  -- ══ 8. RESPONSIBLE GAMING: TIGHTEN NOW, LOOSEN HELD ═══════════════
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('daily_loss_limit', 100,
                                'reality_check_interval_minutes', 30), v_actor);
  if (v_res ->> 'ok') <> 'true' or (v_res ->> 'created') <> 'true' then
    raise exception 'ASSERT FAILED: first RG set refused: %', v_res;
  end if;

  -- Tightening again is allowed even inside the hold.
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('daily_loss_limit', 50), v_actor);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: TIGHTENING was held. Only loosening is held: %', v_res;
  end if;
  raise notice 'ASSERT OK: an operator may tighten a limit immediately.';

  -- Raising it is loosening, and the hold refuses it.
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('daily_loss_limit', 5000), v_actor);
  if (v_res ->> 'ok') <> 'false' or (v_res ->> 'reason') <> 'loosening_is_held' then
    raise exception 'ASSERT FAILED: RAISING a loss limit was allowed inside the hold: %', v_res;
  end if;
  raise notice 'ASSERT OK: raising a limit inside the hold is refused. An operator is not a bypass.';

  -- Lengthening the reality check is loosening too, which is the one
  -- that reads backwards if you classify it like the money limits.
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('reality_check_interval_minutes', 240), v_actor);
  if (v_res ->> 'ok') <> 'false' then
    raise exception 'ASSERT FAILED: LENGTHENING the reality check was treated as a tighten: %', v_res;
  end if;
  raise notice 'ASSERT OK: a longer reality-check interval is correctly read as loosening.';

  -- Clearing a limit is loosening.
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('daily_loss_limit', null), v_actor);
  if (v_res ->> 'ok') <> 'false' then
    raise exception 'ASSERT FAILED: CLEARING a limit was treated as a tighten: %', v_res;
  end if;
  raise notice 'ASSERT OK: clearing a limit is loosening and is held.';

  -- Once the hold has passed, the same loosening is allowed.
  update public.responsible_gaming_limits
     set limit_increase_available_at = now() - interval '1 minute'
   where user_id = v_human;
  v_res := public.fn_ca_player_rg_set(
    v_human, jsonb_build_object('daily_loss_limit', 5000), v_actor);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: loosening after the hold expired was still refused: %', v_res;
  end if;
  raise notice 'ASSERT OK: after the hold, the same loosening is allowed.';

  -- ══ 9. NOTES AND TAGS ═════════════════════════════════════════════
  v_res := public.fn_ca_player_note_add(v_human, 'sim note', v_actor, true);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: note_add refused: %', v_res;
  end if;
  v_res2 := public.fn_ca_player_note_delete((v_res -> 'note' ->> 'id')::uuid, v_actor);
  if (v_res2 ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: note_delete refused: %', v_res2;
  end if;
  select count(*) into v_n from public.ca_operator_player_notes
   where id = (v_res -> 'note' ->> 'id')::uuid;
  if v_n <> 1 then
    raise exception 'ASSERT FAILED: note_delete HARD deleted. It must soft delete.';
  end if;
  raise notice 'ASSERT OK: a deleted note keeps its text and its author.';

  -- The operator's notes must never land in the players' own table.
  --
  -- Compared as a COUNT BEFORE AND AFTER, not as "is it empty". An
  -- earlier draft asserted this account owned no player_notes rows at
  -- all and went red on two rows that were legitimately there: it is a
  -- player-facing feature and the god account is also a player. A probe
  -- that fails on the platform's normal state is a probe nobody will
  -- believe the third time it speaks.
  select count(*) into v_n from public.player_notes;
  if v_n <> v_pn_before then
    raise exception 'ASSERT FAILED: this phase wrote public.player_notes, which belongs to the players. % -> %',
      v_pn_before, v_n;
  end if;
  raise notice 'ASSERT OK: public.player_notes is untouched, still % row(s). Operator notes went to ca_operator_player_notes.', v_n;

  v_res := public.fn_ca_player_tag_set(v_human, 'Watch-List', v_actor, false);
  if (v_res ->> 'ok') <> 'true' or (v_res ->> 'tag') <> 'watch-list' then
    raise exception 'ASSERT FAILED: tag was not normalised: %', v_res;
  end if;
  v_res := public.fn_ca_player_tag_set(v_human, 'bad tag!', v_actor, false);
  if (v_res ->> 'ok') <> 'false' then
    raise exception 'ASSERT FAILED: a malformed tag was accepted';
  end if;
  raise notice 'ASSERT OK: tags are normalised and validated.';

  -- ══ 10. HORSES ARE PLAYERS, IN THE READS ══════════════════════════
  v_res := public.fn_ca_player_search('', true, null, 5, 0, false);
  v_res2 := public.fn_ca_player_search('', false, null, 5, 0, false);
  if (v_res ->> 'total')::bigint <= (v_res2 ->> 'total')::bigint then
    raise exception 'ASSERT FAILED: including horses did not widen the search. % vs %',
      v_res ->> 'total', v_res2 ->> 'total';
  end if;
  if (v_res ->> 'includeHorses') <> 'true' then
    raise exception 'ASSERT FAILED: search does not report includeHorses true';
  end if;
  -- The DEFAULT must be true, not merely available.
  if (public.fn_ca_player_search('') ->> 'total')::bigint
     <> (v_res ->> 'total')::bigint then
    raise exception 'ASSERT FAILED: the search DEFAULT excludes horses';
  end if;
  raise notice 'ASSERT OK: search includes horses by default. % with, % without.',
    v_res ->> 'total', v_res2 ->> 'total';

  if (public.fn_ca_restriction_list() ->> 'includeHorses') <> 'true' then
    raise exception 'ASSERT FAILED: the restriction list DEFAULT excludes horses';
  end if;
  raise notice 'ASSERT OK: the restriction list includes horses by default.';

  -- ══ 11. THE 360, FOR A HORSE AND FOR A HUMAN ══════════════════════
  v_res := public.fn_ca_player_360(v_horse, true, true);
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'ASSERT FAILED: the 360 refused a horse: %', v_res;
  end if;
  if (v_res -> 'profile' ->> 'isHorse') <> 'true' then
    raise exception 'ASSERT FAILED: the horse badge is missing from a horse 360';
  end if;
  if jsonb_array_length(v_res -> 'restrictions') < 1 then
    raise exception 'ASSERT FAILED: the horse 360 does not show its own restriction';
  end if;

  v_res2 := public.fn_ca_player_360(v_human, false, false);
  if (v_res2 ->> 'moneyVisible') <> 'false' then
    raise exception 'ASSERT FAILED: moneyVisible was not reported false';
  end if;
  if (v_res2 -> 'profile') ? 'email' then
    raise exception 'ASSERT FAILED: the 360 leaked an email with reveal off';
  end if;
  if (v_res2 -> 'profile') ? 'diamonds' then
    raise exception 'ASSERT FAILED: the 360 leaked a balance with money off';
  end if;
  raise notice 'ASSERT OK: the 360 works for a horse and a human, and withholds money and email when told to.';

  -- ══ 12. THE 360 NEVER CLAIMS A MISSING PLAYER ═════════════════════
  if (public.fn_ca_player_360(gen_random_uuid()) ->> 'ok') <> 'false' then
    raise exception 'ASSERT FAILED: the 360 answered ok for a player that does not exist';
  end if;
  raise notice 'ASSERT OK: an unknown player is player_not_found, not an empty 360.';

  raise notice '=========================================================';
  raise notice 'SIM COMPLETE. Everything above is about to be rolled back.';
  raise notice '=========================================================';
end
$sim$;

rollback;
