-- =====================================================================
-- PHASE 2 SIMULATION 2: THE APPROVAL GATE IS EXACT.
-- RUN INSIDE A TRANSACTION THAT IS ROLLED BACK.
-- =====================================================================
-- NOTE (re-verification, 2026-09-03): this record was run and rolled back BEFORE
-- migration 20260903202500_ca_operator_reverify_fixes.sql. Since that migration
-- fn_ca_operator_grant raises operator_not_found for a user id with no profiles
-- row, so re-running this file needs a rolled-back profiles row for each
-- synthetic operator it grants to. The record itself stands as run.
-- Companion to docs/horses/PHASE2-SIM.sql, which proves what
-- 20260903120000 claims. This file proves the eight defects that an
-- adversarial review found INSIDE that applied migration are fixed by
-- 20260903140000_ca_operator_approval_gate_is_exact.sql, against the
-- real database rather than against the text of a file.
--
-- THIS SCRIPT MUTATES THE REAL ca_operator_policy ROW AND, FOR ONE
-- STEP, THE is_legacy FLAG ON ca_operator_roles. The BEGIN and the
-- ROLLBACK at the bottom are not decoration. Run the body without them
-- and you leave production with approvals_enabled true, a mint threshold
-- of 100 and no role marked legacy, which is exactly the state contract
-- section 0 forbids. Run the WHOLE file, top to bottom, in one session.
-- If anything raises, the transaction is already aborted and the
-- ROLLBACK still lands.
--
-- What it proves, with a RAISE NOTICE at every step:
--   1. H-2  an amount EXACTLY equal to the threshold is gated, and one
--           chip under it is not
--   2. B-2  a pending row replays as required:true
--   3. B-2  a REJECTED row refuses on retry and never answers
--           required:false, which is the defect that let a refused mint
--           execute anyway
--   4. B-2/M-5 a pending row past its TTL is marked expired on sight and
--           refuses, instead of answering required:true forever and then
--           required:false the moment somebody clicks Approve on it
--   5. B-2  an EXECUTED row answers required:false with
--           already_executed:true, so the money RPC's own op_id claim is
--           what replays, not a second approval
--   6. B-2  a FAILED row is a fresh request under the same key, and does
--           not become a second row
--   7. B-3  a replay whose kind, amount, asset, target_type or target_id
--           differs is refused as payload_mismatch, naming the fields,
--           and the stored row is left exactly as it was
--   8. M-3  the same op_id twice is one row
--   9. M-4  the same grant twice is one grant and no unique violation
--  10. M-2  a decider who does not hold the kind's permission is refused
--  11. H-4  a legacy account keeps admin.manage under enforcement even
--           when its only grant is read_only (the recovery hatch)
--  12. H-4  set_policy REFUSES enforce_named_roles = true when it would
--           leave zero accounts holding admin.manage, and the flag stays
--           false
--  13. L-4  an auto_approved row with no decider carries no decision time
--  14. section 0: with approvals OFF, every one of the above leaves a
--           mint proceeding exactly as it does today
--
-- Every synthetic actor is a version 4 uuid in a block that no real
-- Supabase user can occupy, the same block PHASE2-SIM.sql uses:
--   00000000-0000-4000-8000-0000000000xx
-- There is no foreign key from ca_operator_grants.user_id or
-- ca_operator_approvals.requested_by to auth.users, so these ids need no
-- profiles row and cannot collide with one. NOTHING HERE WRITES TO
-- profiles.
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
  -- Synthetic actors. c_maker raises, c_checker decides, c_nobody holds
  -- nothing at all and is the one the permission check must refuse.
  c_maker   constant uuid := '00000000-0000-4000-8000-000000000021';
  c_checker constant uuid := '00000000-0000-4000-8000-000000000022';
  c_nobody  constant uuid := '00000000-0000-4000-8000-000000000023';

  v_legacy_ops  int;
  v_legacy      uuid;
  v_res         jsonb;
  v_row         public.ca_operator_approvals%rowtype;
  v_id          uuid;
  v_grant       uuid;
  v_grant_2     uuid;
  v_perms       jsonb;
  v_count       int;
  v_holders     int;
  v_status      text;
  v_flag        boolean;
  v_decided_at  timestamptz;
begin
  raise notice '=====================================================';
  raise notice 'PHASE 2 SIMULATION 2 (transaction will be rolled back)';
  raise notice '=====================================================';

  select count(*) into v_legacy_ops
  from public.profiles p
  join public.ca_operator_roles r on r.key = p.role and r.is_legacy;

  if v_legacy_ops = 0 then
    raise exception 'SIM PRECONDITION FAILED: no legacy operator accounts, steps 10 to 12 would prove nothing';
  end if;

  select p.id into v_legacy
  from public.profiles p
  join public.ca_operator_roles r on r.key = p.role and r.is_legacy
  order by r.rank desc
  limit 1;

  raise notice 'Preconditions: % legacy operator accounts, widest is %', v_legacy_ops, v_legacy;

  -- The decider needs the kind's permission of its own now (M-2), and
  -- these synthetic actors have no profiles row and so no legacy role.
  v_res   := public.fn_ca_operator_grant(c_checker, 'finance', v_legacy, 'sim 2 decider');
  v_grant := (v_res ->> 'grant_id')::uuid;

  -- Approvals ON with a threshold of 100, and the alone rule OFF so that
  -- nothing in this file is cleared by it by accident.
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object(
      'approvals_enabled', true,
      'enforce_named_roles', false,
      'allow_self_approve_when_alone', false,
      'mint_threshold', 100,
      'cashout_threshold', 0,
      'approval_ttl_minutes', 1440
    ),
    v_legacy
  );

  -- ------------------------------------------------------------------
  -- STEP 1. H-2. The boundary is gated. `>` let it through, `>=` holds
  -- it, which is what approvals.js, the console copy and the test say.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 100), c_maker, 100, 'chips',
    'club', 'sim2-club', 'exactly at the threshold', 'sim2-op-boundary', 'sim2-req-boundary'
  );
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 1 FAILED (H-2): an amount equal to the threshold was not gated: %', v_res;
  end if;
  if (v_res ->> 'status') <> 'pending' then
    raise exception 'STEP 1 FAILED (H-2): expected pending, got %', v_res ->> 'status';
  end if;
  raise notice 'STEP 1 OK: amount 100 against a threshold of 100 returns required=true, row % is pending',
    v_res ->> 'approval_id';

  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 99), c_maker, 99, 'chips',
    'club', 'sim2-club', 'one under the threshold', 'sim2-op-under', 'sim2-req-under'
  );
  if (v_res ->> 'required')::boolean then
    raise exception 'STEP 1 FAILED (H-2): 99 under a threshold of 100 was gated: %', v_res;
  end if;
  raise notice 'STEP 1 OK: 99 against a threshold of 100 still proceeds (status=%). A threshold is a threshold, not a stop.',
    v_res ->> 'status';

  -- ------------------------------------------------------------------
  -- STEP 2. B-2. A pending row replays as required:true.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 100), c_maker, 100, 'chips',
    'club', 'sim2-club', 'retry while pending', 'sim2-op-boundary', 'sim2-req-boundary-2'
  );
  if not (v_res ->> 'required')::boolean or not (v_res ->> 'idempotent')::boolean then
    raise exception 'STEP 2 FAILED (B-2): a pending replay did not answer required:true: %', v_res;
  end if;
  select count(*) into v_count from public.ca_operator_approvals where op_id = 'sim2-op-boundary';
  if v_count <> 1 then
    raise exception 'STEP 2 FAILED (M-3): op_id sim2-op-boundary produced % rows, expected 1', v_count;
  end if;
  raise notice 'STEP 2 OK: a pending replay answers required=true, idempotent=true, and there is still 1 row';

  -- ------------------------------------------------------------------
  -- STEP 3. B-3. A replay of the SAME key with DIFFERENT material
  -- fields is a different operation, and is refused.
  --
  -- This is the laundering probe from the review, verbatim: get 100
  -- approved for one club, retry the same opId as 999999 to another. The
  -- old body returned the original row with required:false and the money
  -- RPC minted the new amount to the new target.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 999999), c_maker, 999999, 'chips',
    'club', 'sim2-other-club', 'laundered', 'sim2-op-boundary', 'sim2-req-laundered'
  );
  if (v_res ->> 'ok')::boolean then
    raise exception 'STEP 3 FAILED (B-3): a laundered replay was accepted: %', v_res;
  end if;
  if (v_res ->> 'error') <> 'payload_mismatch' then
    raise exception 'STEP 3 FAILED (B-3): expected payload_mismatch, got %', v_res ->> 'error';
  end if;
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 3 FAILED (B-3): a refusal must never answer required:false: %', v_res;
  end if;
  if not ((v_res -> 'mismatch') @> '["amount"]'::jsonb)
     or not ((v_res -> 'mismatch') @> '["target_id"]'::jsonb) then
    raise exception 'STEP 3 FAILED (B-3): the refusal does not name the fields that differ: %', v_res;
  end if;

  -- And the stored row is untouched: no second row, same amount, same
  -- target, same status.
  select * into v_row from public.ca_operator_approvals where op_id = 'sim2-op-boundary';
  if v_row.amount <> 100 or v_row.target_id <> 'sim2-club' or v_row.status <> 'pending' then
    raise exception 'STEP 3 FAILED (B-3): the laundered replay changed the stored row: %', to_jsonb(v_row);
  end if;
  raise notice 'STEP 3 OK: laundered replay refused (%), fields %, and the stored row is still 100 to sim2-club',
    v_res ->> 'error', v_res -> 'mismatch';

  -- ------------------------------------------------------------------
  -- STEP 4. B-2. A REJECTED row refuses on retry.
  -- THIS IS THE BLOCKER. The old body answered required:false here, the
  -- javascript ceiling agreed, and the route minted against a request a
  -- human had explicitly refused.
  -- ------------------------------------------------------------------
  v_id := v_row.id;
  v_res := public.fn_ca_operator_decide_approval(v_id, 'reject', c_checker, 'no');
  if not (v_res ->> 'ok')::boolean or (v_res ->> 'status') <> 'rejected' then
    raise exception 'STEP 4 FAILED: the checker could not reject the row: %', v_res;
  end if;

  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 100), c_maker, 100, 'chips',
    'club', 'sim2-club', 'retry after reject', 'sim2-op-boundary', 'sim2-req-after-reject'
  );
  if (v_res ->> 'ok')::boolean then
    raise exception 'STEP 4 FAILED (B-2): a rejected row answered ok:true on retry: %', v_res;
  end if;
  if (v_res ->> 'error') <> 'approval_rejected' then
    raise exception 'STEP 4 FAILED (B-2): expected approval_rejected, got %', v_res ->> 'error';
  end if;
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 4 FAILED (B-2): a rejected row answered required:false, which is the defect: %', v_res;
  end if;
  raise notice 'STEP 4 OK: a rejected request refuses on retry (error=%, required=%, refused=%)',
    v_res ->> 'error', v_res ->> 'required', v_res ->> 'refused';

  -- ------------------------------------------------------------------
  -- STEP 5. B-2 and M-5. A pending row past its TTL is closed on sight.
  -- The TTL is pushed into the past rather than waiting 1440 minutes.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'ttl', 'sim2-op-ttl', 'sim2-req-ttl'
  );
  v_id := (v_res ->> 'approval_id')::uuid;
  if (v_res ->> 'status') <> 'pending' then
    raise exception 'STEP 5 FAILED: expected a pending row to age out, got %', v_res ->> 'status';
  end if;

  update public.ca_operator_approvals
    set expires_at = now() - interval '1 minute'
  where id = v_id;

  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'ttl retry', 'sim2-op-ttl', 'sim2-req-ttl-2'
  );
  if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'approval_expired' then
    raise exception 'STEP 5 FAILED (B-2/M-5): an aged out row did not refuse on retry: %', v_res;
  end if;
  select status into v_status from public.ca_operator_approvals where id = v_id;
  if v_status <> 'expired' then
    raise exception 'STEP 5 FAILED (M-5): the aged out row is still %, so the row and the answer disagree', v_status;
  end if;
  raise notice 'STEP 5 OK: the aged out row was marked % on sight and the retry refuses (%)',
    v_status, v_res ->> 'error';

  -- ------------------------------------------------------------------
  -- STEP 6. B-2. An APPROVED row proceeds, and an EXECUTED one says so.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'approved path', 'sim2-op-approved', 'sim2-req-approved'
  );
  v_id := (v_res ->> 'approval_id')::uuid;
  perform public.fn_ca_operator_decide_approval(v_id, 'approve', c_checker, 'checked');

  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'approved path retry', 'sim2-op-approved', 'sim2-req-approved-2'
  );
  if (v_res ->> 'required')::boolean or not (v_res ->> 'ok')::boolean then
    raise exception 'STEP 6 FAILED (B-2): an approved row must clear the caller to proceed: %', v_res;
  end if;
  if (v_res ->> 'already_executed')::boolean then
    raise exception 'STEP 6 FAILED (B-2): an approved but unexecuted row claimed already_executed: %', v_res;
  end if;
  raise notice 'STEP 6 OK: an approved row answers required=false, already_executed=false';

  perform public.fn_ca_operator_mark_executed(v_id, jsonb_build_object('minted', 500), 'executed');
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'executed path retry', 'sim2-op-approved', 'sim2-req-approved-3'
  );
  if (v_res ->> 'required')::boolean or not (v_res ->> 'already_executed')::boolean then
    raise exception 'STEP 6 FAILED (B-2): an executed row must answer already_executed:true: %', v_res;
  end if;
  raise notice 'STEP 6 OK: an executed row answers required=false with already_executed=true, so the money RPC''s own op_id claim is what replays';

  -- ------------------------------------------------------------------
  -- STEP 7. B-2. A FAILED row is a fresh request under the same key.
  -- ------------------------------------------------------------------
  update public.ca_operator_approvals set status = 'failed' where op_id = 'sim2-op-ttl';
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'after a failure', 'sim2-op-ttl', 'sim2-req-ttl-3'
  );
  if (v_res ->> 'idempotent')::boolean then
    raise exception 'STEP 7 FAILED (B-2): a failed row replayed instead of asking again: %', v_res;
  end if;
  if not (v_res ->> 'retried_after_failure')::boolean then
    raise exception 'STEP 7 FAILED (B-2): the fresh request does not record that it followed a failure: %', v_res;
  end if;
  if not (v_res ->> 'required')::boolean then
    raise exception 'STEP 7 FAILED (B-2): 500 over a threshold of 100 must be gated again: %', v_res;
  end if;
  select count(*) into v_count from public.ca_operator_approvals where op_id = 'sim2-op-ttl';
  if v_count <> 1 then
    raise exception 'STEP 7 FAILED: re-opening a failed row made % rows under one op_id', v_count;
  end if;
  raise notice 'STEP 7 OK: a failed row asks again under the same key (status=%), still 1 row',
    v_res ->> 'status';

  -- ------------------------------------------------------------------
  -- STEP 8. M-4. The same grant twice is one grant, not a 23505.
  -- ------------------------------------------------------------------
  v_res     := public.fn_ca_operator_grant(c_checker, 'finance', v_legacy, 'sim 2 duplicate');
  v_grant_2 := (v_res ->> 'grant_id')::uuid;
  if not (v_res ->> 'already')::boolean or v_grant_2 <> v_grant then
    raise exception 'STEP 8 FAILED (M-4): a repeated grant was not idempotent: %', v_res;
  end if;
  select count(*) into v_count
  from public.ca_operator_grants
  where user_id = c_checker and role_key = 'finance' and revoked_at is null;
  if v_count <> 1 then
    raise exception 'STEP 8 FAILED (M-4): % active grants of finance to one user', v_count;
  end if;
  raise notice 'STEP 8 OK: re-granting an active role returns the same grant % with already=true', v_grant;

  -- ------------------------------------------------------------------
  -- STEP 9. M-2. A decider without the permission is refused, and the
  -- refusal names what was needed.
  -- ------------------------------------------------------------------
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 500), c_maker, 500, 'chips',
    'club', 'sim2-club', 'permission probe', 'sim2-op-perm', 'sim2-req-perm'
  );
  v_id := (v_res ->> 'approval_id')::uuid;
  if (v_res ->> 'status') <> 'pending' then
    raise exception 'STEP 9 FAILED: the probe needs a pending row, got %', v_res ->> 'status';
  end if;

  v_res := public.fn_ca_operator_decide_approval(v_id, 'approve', c_nobody, 'I hold nothing');
  if (v_res ->> 'ok')::boolean then
    raise exception 'STEP 9 FAILED (M-2): an operator with no permissions decided a mint: %', v_res;
  end if;
  if (v_res ->> 'error') <> 'permission_denied' then
    raise exception 'STEP 9 FAILED (M-2): expected permission_denied, got %', v_res ->> 'error';
  end if;
  if (v_res ->> 'required_permission') <> 'money.write' then
    raise exception 'STEP 9 FAILED (M-2): the refusal does not name money.write: %', v_res;
  end if;

  -- The same row, decided by somebody who does hold it.
  v_res := public.fn_ca_operator_decide_approval(v_id, 'approve', c_checker, 'I hold finance');
  if not (v_res ->> 'ok')::boolean or (v_res ->> 'status') <> 'approved' then
    raise exception 'STEP 9 FAILED (M-2): the permission check refused a legitimate decider: %', v_res;
  end if;
  raise notice 'STEP 9 OK: a decider without money.write is refused (permission_denied), one with it approves';

  -- ------------------------------------------------------------------
  -- STEP 10. H-4. The recovery hatch. A legacy account keeps
  -- admin.manage under enforcement even when its only grant is
  -- read_only. Without this, granting a god read_only and flipping the
  -- flag drops it to six permissions and the platform can never turn
  -- enforcement off again from the console.
  -- ------------------------------------------------------------------
  v_perms := public.fn_ca_operator_permissions(v_legacy) -> 'permissions';
  raise notice 'STEP 10: legacy account % holds % permissions before enforcement',
    v_legacy, jsonb_array_length(v_perms);

  perform public.fn_ca_operator_grant(v_legacy, 'read_only', v_legacy, 'sim 2 narrow grant');
  perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', true), v_legacy);

  v_res   := public.fn_ca_operator_permissions(v_legacy);
  v_perms := v_res -> 'permissions';
  if not (v_perms @> '["admin.manage"]'::jsonb) then
    raise exception 'STEP 10 FAILED (H-4): enforcement stripped admin.manage from a legacy account: %', v_perms;
  end if;
  if not (v_res ->> 'admin_manage_floor')::boolean then
    raise exception 'STEP 10 FAILED (H-4): the floor was not reported, so the console cannot say why admin.manage is there: %', v_res;
  end if;
  raise notice 'STEP 10 OK: under enforcement the legacy account resolves % permission(s) plus the admin.manage floor (source=%)',
    jsonb_array_length(v_perms), v_res ->> 'source';

  perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', false), v_legacy);

  -- ------------------------------------------------------------------
  -- STEP 11. H-4. set_policy refuses the lockout.
  --
  -- The zero-holder world is staged by clearing is_legacy, which is
  -- rolled back with everything else in this transaction and touches
  -- only a Phase 2 table. profiles is never written. The step is skipped
  -- rather than faked if some active grant already carries admin.manage,
  -- because then the world cannot be made empty without revoking a real
  -- grant.
  -- ------------------------------------------------------------------
  select count(*) into v_holders
  from public.ca_operator_grants g
  join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
  where g.revoked_at is null and rp.permission = 'admin.manage';

  if v_holders > 0 then
    raise notice 'STEP 11 SKIPPED: % active grant(s) already carry admin.manage, so a zero-holder world cannot be staged here',
      v_holders;
  else
    update public.ca_operator_roles set is_legacy = false where is_legacy;

    v_res := public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', true), v_legacy);
    if (v_res ->> 'ok')::boolean then
      raise exception 'STEP 11 FAILED (H-4): set_policy committed a lockout: %', v_res;
    end if;
    if (v_res ->> 'error') <> 'enforce_named_roles_would_lock_out' then
      raise exception 'STEP 11 FAILED (H-4): expected enforce_named_roles_would_lock_out, got %', v_res ->> 'error';
    end if;
    select enforce_named_roles into v_flag from public.ca_operator_policy where id;
    if v_flag then
      raise exception 'STEP 11 FAILED (H-4): the refused patch was written anyway';
    end if;
    raise notice 'STEP 11 OK: set_policy refused the lockout (%), holders=%, and enforce_named_roles is still %',
      v_res ->> 'error', v_res ->> 'admin_manage_holders', v_flag;

    -- Put the vocabulary back for the last step, so the rest of this
    -- file runs against the world it expects. The ROLLBACK would do it
    -- anyway; doing it here means STEP 12 proves something real.
    update public.ca_operator_roles set is_legacy = true
    where key in ('god', 'superadmin', 'admin');
  end if;

  -- ------------------------------------------------------------------
  -- STEP 12. L-4, and contract section 0.
  --
  -- Approvals OFF, which is production today. A mint proceeds, the row
  -- is still written for the trail, and it carries NO decision time
  -- because it had no decider.
  -- ------------------------------------------------------------------
  perform public.fn_ca_operator_set_policy(
    jsonb_build_object('approvals_enabled', false, 'mint_threshold', 0),
    v_legacy
  );

  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 1000000), c_maker, 1000000, 'chips',
    'club', 'sim2-club', 'approvals off', 'sim2-op-off', 'sim2-req-off'
  );
  if (v_res ->> 'required')::boolean then
    raise exception 'STEP 12 FAILED: approvals are off, a mint of any size must proceed: %', v_res;
  end if;
  if (v_res ->> 'status') <> 'auto_approved' then
    raise exception 'STEP 12 FAILED: expected auto_approved, got %', v_res ->> 'status';
  end if;

  select decided_at into v_decided_at
  from public.ca_operator_approvals where op_id = 'sim2-op-off';
  if v_decided_at is not null then
    raise exception 'STEP 12 FAILED (L-4): an auto_approved row with no decider carries decided_at %', v_decided_at;
  end if;
  raise notice 'STEP 12 OK: with approvals off a 1000000 chip mint still proceeds (status=%), and the row has no decider and no decision time',
    v_res ->> 'status';

  -- And a mismatched replay while approvals are off is refused by the
  -- DATABASE, which is the strict answer, while approvals.js's ceiling
  -- (required = decision.required AND dbRequired, and decision.required
  -- is false with approvals off) still lets today's route proceed. That
  -- is the section 0 guarantee: the gate tightened and nothing that
  -- works today stopped working.
  v_res := public.fn_ca_operator_request_approval(
    'mint', jsonb_build_object('amount', 7), c_maker, 7, 'chips',
    'club', 'sim2-club', 'approvals off, different amount', 'sim2-op-off', 'sim2-req-off-2'
  );
  if (v_res ->> 'error') <> 'payload_mismatch' then
    raise exception 'STEP 12 FAILED (B-3): the mismatch check must apply whether approvals are on or off: %', v_res;
  end if;
  raise notice 'STEP 12 OK: the database refuses a mismatched replay even with approvals off (%), and the javascript ceiling means the route still proceeds today',
    v_res ->> 'error';

  -- ------------------------------------------------------------------
  -- Closing count, so the reader can see what this produced.
  -- ------------------------------------------------------------------
  select count(*) into v_count
  from public.ca_operator_approvals
  where op_id like 'sim2-op-%';
  raise notice '=====================================================';
  raise notice 'ALL STEPS PASSED. % approval rows and % grant rows were created and are about to be rolled back.',
    v_count,
    (select count(*) from public.ca_operator_grants
      where user_id in (c_maker, c_checker, c_nobody) or reason like 'sim 2%');
  raise notice '=====================================================';
end
$sim$;

-- NOT commit. Everything above, including the policy changes and the
-- is_legacy flags STEP 11 cleared, is undone.
rollback;
