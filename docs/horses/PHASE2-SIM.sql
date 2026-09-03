-- =====================================================================
-- PHASE 2 SIMULATION. RUN INSIDE A TRANSACTION THAT IS ROLLED BACK.
-- =====================================================================
-- THIS SCRIPT MUTATES THE REAL ca_operator_policy ROW. The BEGIN and the
-- ROLLBACK at the bottom of this file are not decoration: run the body
-- without them and you leave production with approvals_enabled true,
-- enforce_named_roles true and a mint threshold of 100, which is exactly
-- the state contract section 0 forbids. Run the WHOLE file, top to
-- bottom, in one session. If anything raises, the transaction is already
-- aborted and the ROLLBACK still lands.
--
-- What it proves, with a RAISE NOTICE at every step:
--   1. a legacy god resolves EVERY permission while enforce_named_roles
--      is false
--   2. granting `finance` to a fresh uuid gives exactly the finance set
--   3. revoking that grant takes it away again
--   4. with approvals_enabled false a mint request returns required
--      false and still writes an auto_approved row, so the trail is
--      complete and the money move proceeds as it does today
--   5. with approvals_enabled true and mint_threshold 100, a 500 chip
--      mint returns required true and leaves a pending row
--   6. the requester cannot decide their own row, unless the alone rule
--      applies
--   7. a second operator can decide it
--   8. an approved row marks executed once; a second mark_executed is a
--      no-op that still reports success
--   9. an expired row cannot be decided
--  10. the two read RPCs the console renders from (the audit trail and
--      the staff list) answer in the shape the console expects
--
-- Every synthetic actor is a version 4 uuid in a block that no real
-- Supabase user can occupy:
--   00000000-0000-4000-8000-0000000000xx
-- There is no foreign key from ca_operator_grants.user_id or
-- ca_operator_approvals.requested_by to auth.users, so these ids need no
-- profiles row and cannot collide with one.
--
-- Prerequisite: the database has at least one legacy operator
-- (profiles.role in god, superadmin, admin). Production has three. The
-- script asserts this rather than quietly changing what it proves.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $sim$
declare
  -- Synthetic actors.
  c_maker    constant uuid := '00000000-0000-4000-8000-000000000001';
  c_checker  constant uuid := '00000000-0000-4000-8000-000000000002';
  c_fresh    constant uuid := '00000000-0000-4000-8000-000000000003';

  v_god        uuid;
  v_legacy_ops int;
  v_total      int;
  v_res        jsonb;
  v_grant_id   uuid;
  v_expected   text[];
  v_actual     text[];
  v_approval   uuid;
  v_status     text;
  v_blocked    text;
  v_count      int;
  v_executed   timestamptz;
begin
  raise notice '=====================================================';
  raise notice 'PHASE 2 SIMULATION (transaction will be rolled back)';
  raise notice '=====================================================';

  select count(*) into v_legacy_ops
  from public.profiles p
  join public.ca_operator_roles r on r.key = p.role and r.is_legacy;

  if v_legacy_ops = 0 then
    raise exception 'SIM PRECONDITION FAILED: no legacy operator accounts, steps 5 to 7 would prove nothing';
  end if;

  select count(distinct permission) into v_total from public.ca_operator_role_permissions;
  raise notice 'Preconditions: % legacy operator accounts, % permissions in the vocabulary',
    v_legacy_ops, v_total;

  -- Known starting state. This is what the migration installs.
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object(
      'approvals_enabled', false,
      'enforce_named_roles', false,
      'allow_self_approve_when_alone', true,
      'mint_threshold', 0,
      'approval_ttl_minutes', 1440
    ),
    c_maker
  );

  -- ------------------------------------------------------------------
  -- STEP 1. A legacy god resolves every permission.
  -- ------------------------------------------------------------------
  select id into v_god from public.profiles where role = 'god' limit 1;
  if v_god is null then
    select p.id into v_god
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy
    limit 1;
    raise notice 'STEP 1: no god account, using legacy operator % instead', v_god;
  end if;

  v_res := public.fn_ca_operator_permissions(v_god);
  if jsonb_array_length(v_res -> 'permissions') <> v_total then
    raise exception 'STEP 1 FAILED: legacy operator resolved % of % permissions',
      jsonb_array_length(v_res -> 'permissions'), v_total;
  end if;
  if (v_res ->> 'source') <> 'legacy' then
    raise exception 'STEP 1 FAILED: expected source legacy, got %', v_res ->> 'source';
  end if;
  raise notice 'STEP 1 OK: legacy operator % resolves all % permissions, source=%',
    v_god, v_total, v_res ->> 'source';

  -- ------------------------------------------------------------------
  -- STEP 2. Granting finance gives exactly the finance set.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_grant(c_maker, 'finance', v_god, 'Phase 2 simulation');
  v_grant_id := (v_res ->> 'grant_id')::uuid;

  select array_agg(permission order by permission) into v_expected
  from public.ca_operator_role_permissions where role_key = 'finance';

  v_res := public.fn_ca_operator_permissions(c_maker);
  select array_agg(x order by x) into v_actual
  from jsonb_array_elements_text(v_res -> 'permissions') x;

  if v_actual is distinct from v_expected then
    raise exception 'STEP 2 FAILED: expected %, got %', v_expected, v_actual;
  end if;
  if (v_res ->> 'source') <> 'granted' then
    raise exception 'STEP 2 FAILED: expected source granted, got %', v_res ->> 'source';
  end if;
  raise notice 'STEP 2 OK: grant % gives exactly the finance set: %', v_grant_id, v_actual;

  -- ------------------------------------------------------------------
  -- STEP 3. Revoking takes it away. The row survives the revoke.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_revoke(v_grant_id, v_god, 'Phase 2 simulation');
  v_res := public.fn_ca_operator_permissions(c_maker);
  if jsonb_array_length(v_res -> 'permissions') <> 0 then
    raise exception 'STEP 3 FAILED: revoked operator still holds %', v_res -> 'permissions';
  end if;

  select count(*) into v_count from public.ca_operator_grants where id = v_grant_id;
  if v_count <> 1 then
    raise exception 'STEP 3 FAILED: the revoked grant row was deleted, history is gone';
  end if;
  raise notice 'STEP 3 OK: permissions now empty, and the revoked grant row is still on file';

  -- ------------------------------------------------------------------
  -- STEP 4. Approvals OFF: a mint proceeds and still leaves a row.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint',
    jsonb_build_object('amount', 500, 'note', 'sim step 4'),
    c_maker, 500, 'chips', 'club', 'sim-club', 'Phase 2 simulation', 'sim-op-step4', 'sim-req-4'
  );
  if (v_res ->> 'required')::boolean then
    raise exception 'STEP 4 FAILED: approvals are off, required must be false';
  end if;
  if (v_res ->> 'status') <> 'auto_approved' then
    raise exception 'STEP 4 FAILED: expected auto_approved, got %', v_res ->> 'status';
  end if;
  raise notice 'STEP 4 OK: required=false, row % written as auto_approved with approvals off',
    v_res ->> 'approval_id';

  -- The same op_id twice must not make a second row.
  v_res := public.fn_ca_operator_request_approval(
    'mint',
    jsonb_build_object('amount', 500, 'note', 'sim step 4 retry'),
    c_maker, 500, 'chips', 'club', 'sim-club', 'Phase 2 simulation', 'sim-op-step4', 'sim-req-4b'
  );
  select count(*) into v_count from public.ca_operator_approvals where op_id = 'sim-op-step4';
  if v_count <> 1 then
    raise exception 'STEP 4 FAILED: op_id sim-op-step4 produced % rows, expected 1', v_count;
  end if;
  raise notice 'STEP 4 OK: the same op_id returned the same row (idempotent=%), still 1 row',
    v_res ->> 'idempotent';

  -- ------------------------------------------------------------------
  -- STEP 5. Approvals ON with a threshold of 100: 500 needs a checker.
  -- ------------------------------------------------------------------
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('approvals_enabled', true, 'mint_threshold', 100),
    v_god
  );

  -- Under the threshold still proceeds. The control is a threshold, not
  -- a blanket stop, and proving that matters as much as proving the stop.
  v_res := public.fn_ca_operator_request_approval(
    'mint', '{}'::jsonb, c_maker, 50, 'chips', 'club', 'sim-club', 'under threshold', 'sim-op-step5-small', 'sim-req-5a'
  );
  if (v_res ->> 'required')::boolean then
    raise exception 'STEP 5 FAILED: 50 is under the threshold of 100, required must be false';
  end if;
  raise notice 'STEP 5 OK: 50 chips under a threshold of 100 returns required=false (%)',
    v_res ->> 'status';

  v_res := public.fn_ca_operator_request_approval(
    'mint',
    jsonb_build_object('amount', 500, 'note', 'sim step 5'),
    c_maker, 500, 'chips', 'club', 'sim-club', 'Phase 2 simulation', 'sim-op-step5', 'sim-req-5'
  );
  v_approval := (v_res ->> 'approval_id')::uuid;
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 5 FAILED: 500 over a threshold of 100 with approvals on must require approval, got %', v_res;
  end if;
  if (v_res ->> 'status') <> 'pending' then
    raise exception 'STEP 5 FAILED: expected pending, got %', v_res ->> 'status';
  end if;

  select status, blocked_reason into v_status, v_blocked
  from public.ca_operator_approvals where id = v_approval;
  raise notice 'STEP 5 OK: 500 chips returns required=true, row % is % (blocked_reason=%)',
    v_approval, v_status, coalesce(v_blocked, 'none');

  -- ------------------------------------------------------------------
  -- STEP 6. The maker cannot check their own work.
  -- Legacy operators still count as approvers here (enforce is off), so
  -- the requester is genuinely not alone and the refusal is real.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_decide_approval(v_approval, 'approve', c_maker, 'trying to approve my own request');
  if (v_res ->> 'ok')::boolean then
    raise exception 'STEP 6 FAILED: the requester approved their own request';
  end if;
  if (v_res ->> 'error') <> 'self_approval_refused' then
    raise exception 'STEP 6 FAILED: expected self_approval_refused, got %', v_res ->> 'error';
  end if;
  raise notice 'STEP 6 OK: self approval refused (%), % other eligible approvers exist',
    v_res ->> 'error', v_legacy_ops;

  -- ------------------------------------------------------------------
  -- STEP 7. A second operator can.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_decide_approval(v_approval, 'approve', c_checker, 'checked, looks right');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 7 FAILED: second operator could not decide: %', v_res;
  end if;
  if (v_res ->> 'status') <> 'approved' then
    raise exception 'STEP 7 FAILED: expected approved, got %', v_res ->> 'status';
  end if;
  raise notice 'STEP 7 OK: second operator % approved row %', c_checker, v_approval;

  -- ------------------------------------------------------------------
  -- STEP 8. Exactly once. A retried mark_executed is a no-op.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_mark_executed(v_approval, jsonb_build_object('minted', 500), 'executed');
  if not (v_res ->> 'ok')::boolean or (v_res ->> 'already')::boolean then
    raise exception 'STEP 8 FAILED: first mark_executed should execute, got %', v_res;
  end if;
  select executed_at into v_executed from public.ca_operator_approvals where id = v_approval;

  v_res := public.fn_ca_operator_mark_executed(v_approval, jsonb_build_object('minted', 500), 'executed');
  if not (v_res ->> 'ok')::boolean or not (v_res ->> 'already')::boolean then
    raise exception 'STEP 8 FAILED: second mark_executed must be a no-op reporting success, got %', v_res;
  end if;

  select count(*) into v_count
  from public.ca_operator_approvals
  where id = v_approval and executed_at = v_executed and status = 'executed';
  if v_count <> 1 then
    raise exception 'STEP 8 FAILED: executed_at moved on the second call, that is not exactly once';
  end if;
  raise notice 'STEP 8 OK: executed once at %, the retry returned already=true and changed nothing', v_executed;

  -- ------------------------------------------------------------------
  -- STEP 6b. The alone rule, at request time and at decision time.
  -- With enforce_named_roles on, only a holder of an active named grant
  -- is a nominated approver. Only c_fresh holds one, so c_fresh is alone.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_grant(c_fresh, 'finance', v_god, 'sim alone rule');
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('enforce_named_roles', true, 'allow_self_approve_when_alone', true),
    v_god
  );

  if public.fn_ca_operator_has_second_approver(c_fresh, 'money.write') then
    raise exception 'STEP 6b FAILED: c_fresh should be the only nominated approver under enforcement';
  end if;

  v_res := public.fn_ca_operator_request_approval(
    'mint',
    jsonb_build_object('amount', 500),
    c_fresh, 500, 'chips', 'club', 'sim-club', 'alone rule', 'sim-op-alone', 'sim-req-alone'
  );
  if (v_res ->> 'required')::boolean then
    raise exception 'STEP 6b FAILED: with the alone rule on, a lone operator must not be blocked';
  end if;
  if (v_res ->> 'blocked_reason') <> 'no_second_approver' then
    raise exception 'STEP 6b FAILED: expected blocked_reason no_second_approver, got %', v_res ->> 'blocked_reason';
  end if;
  raise notice 'STEP 6b OK: lone operator proceeds (status=%) and the row says why: %',
    v_res ->> 'status', v_res ->> 'blocked_reason';

  -- And with the alone rule OFF the same request stops. This is the one
  -- setting in Phase 2 that can hold a money move, which is why it is
  -- opt in and why the sim shows both sides of it.
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('allow_self_approve_when_alone', false), v_god
  );
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_fresh, 500, 'chips',
    'club', 'sim-club', 'alone rule off', 'sim-op-alone-off', 'sim-req-alone-off'
  );
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 6b FAILED: with the alone rule off a lone operator must be held';
  end if;
  raise notice 'STEP 6b OK: alone rule off holds the same request (status=%, blocked_reason=%)',
    v_res ->> 'status', v_res ->> 'blocked_reason';

  -- Decision time: that held row is now decidable by its own requester
  -- once the alone rule comes back on, and by nobody else who exists.
  v_approval := (v_res ->> 'approval_id')::uuid;
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('allow_self_approve_when_alone', true), v_god
  );
  v_res := public.fn_ca_operator_decide_approval(v_approval, 'approve', c_fresh, 'alone, rule allows it');
  if not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 6b FAILED: the alone rule should permit this self decision, got %', v_res;
  end if;
  if not (v_res ->> 'self_approved_alone')::boolean then
    raise exception 'STEP 6b FAILED: the audit must record that this was a lone self approval';
  end if;
  raise notice 'STEP 6b OK: self decision allowed under the alone rule, self_approved_alone=%',
    v_res ->> 'self_approved_alone';

  -- Back to the state the rest of the sim expects.
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('enforce_named_roles', false), v_god
  );

  -- ------------------------------------------------------------------
  -- STEP 9. An expired row cannot be decided.
  -- The TTL is pushed into the past rather than waiting 1440 minutes.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 900), c_maker, 900, 'chips',
    'club', 'sim-club', 'ttl test', 'sim-op-expired', 'sim-req-expired'
  );
  v_approval := (v_res ->> 'approval_id')::uuid;
  if (v_res ->> 'status') <> 'pending' then
    raise exception 'STEP 9 FAILED: expected a pending row to age out, got %', v_res ->> 'status';
  end if;

  update public.ca_operator_approvals
    set expires_at = now() - interval '1 minute'
  where id = v_approval;

  v_res := public.fn_ca_operator_decide_approval(v_approval, 'approve', c_checker, 'too late');
  if (v_res ->> 'ok')::boolean then
    raise exception 'STEP 9 FAILED: an expired request was approved';
  end if;
  if (v_res ->> 'error') <> 'expired' then
    raise exception 'STEP 9 FAILED: expected error expired, got %', v_res ->> 'error';
  end if;

  select status into v_status from public.ca_operator_approvals where id = v_approval;
  if v_status <> 'expired' then
    raise exception 'STEP 9 FAILED: the refused row should be marked expired, it is %', v_status;
  end if;
  raise notice 'STEP 9 OK: expired request refused (%) and the row is now %', v_res ->> 'error', v_status;

  -- ------------------------------------------------------------------
  -- STEP 10. The two read RPCs the console renders from.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_audit_trail('club', 'sim-club', 50, 0);
  if v_res -> 'rows' is null or v_res -> 'total' is null then
    raise exception 'STEP 10 FAILED: audit trail returned %', v_res;
  end if;
  if (v_res ->> 'total')::int = 0 then
    -- Not fatal here. Every audit write in the migration is wrapped in
    -- its own exception block precisely so a missing or renamed
    -- fn_log_admin_action can never fail an operator action, and an
    -- empty trail is the visible symptom of that. Check the function
    -- exists before believing the console's Audit tab is broken.
    raise notice 'STEP 10 WARNING: the trail for club/sim-club is empty. Does fn_log_admin_action exist?';
  end if;
  raise notice 'STEP 10 OK: audit trail for club/sim-club returned % of % rows',
    jsonb_array_length(v_res -> 'rows'), v_res ->> 'total';

  v_res := public.fn_ca_operator_staff();
  if (v_res ->> 'total')::int < v_legacy_ops then
    raise exception 'STEP 10 FAILED: staff listed % accounts, fewer than the % legacy operators',
      v_res ->> 'total', v_legacy_ops;
  end if;
  raise notice 'STEP 10 OK: staff lists % operator accounts (the synthetic grantees have no profiles row, so they do not appear)',
    v_res ->> 'total';

  -- ------------------------------------------------------------------
  -- Closing count, so the reader can see the trail this produced.
  -- ------------------------------------------------------------------
  select count(*) into v_count
  from public.ca_operator_approvals
  where op_id like 'sim-op-%';
  raise notice '=====================================================';
  raise notice 'ALL STEPS PASSED. % approval rows and % grant rows were created and are about to be rolled back.',
    v_count,
    (select count(*) from public.ca_operator_grants
      where user_id in (c_maker, c_checker, c_fresh));
  raise notice '=====================================================';
end
$sim$;

-- NOT commit. Everything above, including the policy changes, is undone.
rollback;
