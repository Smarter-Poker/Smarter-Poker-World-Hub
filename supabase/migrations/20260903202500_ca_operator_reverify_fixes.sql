-- =====================================================================
-- Phase 2 follow-up: re-verification fixes.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 2 migration.
-- Follows 20260903120000_ca_operator_rbac_and_approvals.sql,
-- 20260903121500_ca_operator_read_fns_do_not_audit.sql and
-- 20260903140000_ca_operator_approval_gate_is_exact.sql, all applied and
-- all registered in supabase_migrations.schema_migrations.
-- Contract: docs/horses/PHASE2-CONTRACTS.md sections 0 and 1.
--
-- WHAT THIS IS
-- CREATE OR REPLACE of four functions, no signature changed, no table,
-- index, column, policy, default or ACL changed:
--   fn_ca_operator_has_second_approver(uuid, text)
--   fn_ca_operator_grant(uuid, text, uuid, text)
--   fn_ca_operator_decide_approval(uuid, text, uuid, text)
--   fn_ca_operator_staff()
-- The REVOKE and GRANT lines for all four are restated below so this file
-- is ACL self-contained the same way its three predecessors are. A
-- CREATE OR REPLACE keeps the existing ACL; restating it means the file
-- can be read on its own and still say who may execute these functions.
--
-- HOW THESE WERE FOUND
-- A second adversarial review of the ALREADY APPLIED migration family,
-- 2026-09-03, recorded in docs/horses/reverify-2026-09-03/server-db.md.
-- Each finding below was verified by reading the exact code path, and
-- where it could be executed without a database it was proved with a
-- scratch test against the real modules. The probes in this file's
-- assertion block run against the functions the database holds after
-- this file is applied, inside a subtransaction that ends in RAISE
-- EXCEPTION, so every row they write is rolled back by the abort.
--
-- ---------------------------------------------------------------------
-- M-2 (MEDIUM). THE ALONE RULE AND THE PERMISSION MODEL DISAGREED.
-- ---------------------------------------------------------------------
-- fn_ca_operator_permissions (140000) says: under enforce_named_roles an
-- account holding at least one active grant is described by its grants
-- alone, and an account holding NO grant keeps the legacy set. So a god
-- with no grants resolves every permission under enforcement and can
-- DECIDE any request. fn_ca_operator_has_second_approver (120000) said:
-- under enforcement only a grant holder counts. So that same god was not
-- COUNTED as a second approver, and a granted finance operator's own
-- mint request was `no_second_approver` -> auto_approved under the alone
-- rule while a fully entitled god was on shift. The four-eyes control was
-- weaker than the permission model said it was. Now the predicate applies
-- the exact rule the resolver applies: a legacy-profile account counts
-- while enforcement is off; under enforcement it counts when it holds NO
-- active grant; and it always counts for admin.manage, which is the
-- recovery floor 140000 gave every legacy account whatever else is true.
--
-- ---------------------------------------------------------------------
-- L-3 (LOW). A GRANT TO NOBODY, AND A GRANT OF THE LEGACY KEYS.
-- ---------------------------------------------------------------------
-- fn_ca_operator_grant accepted any uuid. A grant to a typo'd id was
-- stored, and because fn_ca_operator_staff is driven by profiles it never
-- appeared on the Staff tab and could not be revoked from the console. It
-- also accepted god, superadmin and admin as role keys, which produces an
-- account that counts as an operator with every permission - an owner by
-- another name - and muddies the rule that the legacy roles live on
-- profiles.role. Now: a p_user_id with no profiles row raises
-- operator_not_found (SQLSTATE 23503, a reference to a row that does not
-- exist, which the route maps to a 400), and an is_legacy role key raises
-- legacy_role_not_grantable (SQLSTATE 23514, a value that breaks a rule,
-- also a 400). The route refuses the legacy keys before the RPC is
-- reached; this is the wall behind that wall.
--
-- ---------------------------------------------------------------------
-- L-12 (LOW). A REQUESTER COULD NOT WITHDRAW THEIR OWN REQUEST.
-- ---------------------------------------------------------------------
-- fn_ca_operator_decide_approval applied the self rule to reject as well
-- as approve, so a mistaken request sat in the queue until its TTL. The
-- four-eyes rule guards approvals, not cancellations. Now p_decided_by =
-- requested_by may REJECT a pending row; that is a withdrawal, it is
-- filed as operator.withdraw_approval, the answer carries withdrawn:true,
-- and the row ends `rejected` exactly as a second operator's refusal
-- would. Approving your own row is refused as before unless the alone
-- rule applies.
--
-- ---------------------------------------------------------------------
-- N-4 (NOTE). NOBODY HAS MFA IS NOT THE SAME AS UNKNOWN.
-- ---------------------------------------------------------------------
-- fn_ca_operator_staff answered mfa_enabled = null for everyone whenever
-- the verified-factor aggregate was empty, so the Staff tab could not say
-- "No" until at least one operator enrolled. An empty aggregate from a
-- read that succeeded is "nobody has a verified factor": false for every
-- row. null is kept for the case it was meant for, the table being absent
-- or unreadable by the definer, and true is answered only for a VERIFIED
-- factor, as before.
--
-- ---------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT FIX
-- ---------------------------------------------------------------------
-- H-1, H-2, M-1, L-1, L-4, L-7, L-10 and the route half of L-3 and L-12
-- are JavaScript: src/lib/horses/operatorAuth.js, approvals.js and
-- pages/api/horses/operator-admin.js, fixed in the same commit as this
-- file. M-3, M-4, M-5, M-6, L-2, L-5, L-6, L-8, L-9 and L-11 live in
-- routes outside this file's scope and are recorded in the review.
--
-- ---------------------------------------------------------------------
-- CONTRACT SECTION 0: NOTHING HERE BLOCKS A MOVE THAT WORKS TODAY
-- ---------------------------------------------------------------------
-- Production reads approvals_enabled=false, enforce_named_roles=false,
-- zero grants, three legacy operators. Against that state:
--   * the has_second_approver change is unreachable: the legacy branch
--     already counted every legacy account while enforcement is off, and
--     with approvals off the predicate is never consulted;
--   * the grant refusals refuse only what should never have been
--     accepted: a uuid with no profile, and a key the console never
--     offered as a grant. Every existing grant is untouched;
--   * the withdrawal only WIDENS what a requester may do, and only on a
--     pending row, which only exists with approvals on;
--   * mfa_enabled moving from null to false changes a display value on
--     a read that gates nothing.
-- The assertion block proves each against the real functions, inside a
-- subtransaction it rolls back, so no row from it survives this file.
--
-- VERIFIED BEFORE APPLYING
-- Applied to a throwaway PostgreSQL cluster against a stub of the four
-- objects this family reads (profiles, admin_audit_log, auth.users,
-- fn_log_admin_action, the last one refusing a null actor exactly as
-- production's does) seeded with production's shape of one god and two
-- admins, on top of 20260903120000, 20260903121500 and 20260903140000
-- applied in order. Confirmed there: the file applies clean inside one
-- transaction, the assertion block passes and leaves zero rows, and
-- applying it twice changes nothing.
--
-- NOTE FOR ANYONE RUNNING docs/horses/PHASE2-SIM.sql or PHASE2-SIM-2.sql:
-- both grant a named role to a synthetic uuid that has no profiles row.
-- After this file that call raises operator_not_found, which is the point
-- of L-3. Those sims need a profiles row for their synthetic operators
-- inside their own rolled-back transaction, or a direct insert into
-- ca_operator_grants the way the assertion block below does it.
--
-- LOCKING
-- CREATE OR REPLACE FUNCTION locks the function only. No table is
-- touched. Every returned jsonb keeps every key it had, so no caller
-- needs to change on the same deploy. The whole file runs in one
-- transaction (begin/commit), which also makes the two `set local` lines
-- effective under psql -f and not only under the Supabase MCP runner.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1. Is there anybody else who could approve this - the exact rule
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.10. Identical except that the legacy
-- branch applies fn_ca_operator_permissions' rule under enforcement
-- (review finding M-2): a legacy account counts when it holds no active
-- grant, and always for admin.manage, the recovery floor.
create or replace function public.fn_ca_operator_has_second_approver(
  p_requested_by uuid,
  p_permission   text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_enforce boolean := false;
  v_count   int := 0;
begin
  select coalesce(enforce_named_roles, false) into v_enforce
  from public.ca_operator_policy where id limit 1;

  -- A named grant always makes somebody a nominated approver. A legacy
  -- role holder counts while enforcement is off, which is why the alone
  -- rule never fires in production today: there are three legacy
  -- operators and any two of them are four eyes. Under enforcement a
  -- legacy account is described by its grants when it has any, and keeps
  -- the legacy set when it has none - the exact rule
  -- fn_ca_operator_permissions applies (review finding M-2) - and it
  -- always holds admin.manage, the recovery floor 20260903140000 gave it.
  select count(*) into v_count
  from (
    select g.user_id
    from public.ca_operator_grants g
    join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
    where g.revoked_at is null
      and rp.permission = p_permission
      and (p_requested_by is null or g.user_id <> p_requested_by)
    union
    select p.id
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy
    join public.ca_operator_role_permissions rp on rp.role_key = r.key
    where rp.permission = p_permission
      and (p_requested_by is null or p.id <> p_requested_by)
      and (
        not v_enforce
        or p_permission = 'admin.manage'
        or not exists (
          select 1
          from public.ca_operator_grants g
          where g.user_id = p.id
            and g.revoked_at is null
        )
      )
  ) candidates;

  return v_count > 0;
end
$fn$;

revoke all on function public.fn_ca_operator_has_second_approver(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_has_second_approver(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 2. Grant a named role, to an operator who exists
-- ---------------------------------------------------------------------
-- Was 20260903140000 section 2. Identical except for the profiles
-- existence check and the is_legacy refusal (review finding L-3).
create or replace function public.fn_ca_operator_grant(
  p_user_id    uuid,
  p_role_key   text,
  p_granted_by uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_exists      boolean;
  v_has_profile boolean;
  v_is_legacy   boolean;
  v_grant_id    uuid;
  v_already     boolean := false;
begin
  if p_user_id is null then
    raise exception 'fn_ca_operator_grant: p_user_id is required';
  end if;

  -- THE OPERATOR MUST EXIST (review finding L-3). fn_ca_operator_staff is
  -- driven by profiles, so a grant to a uuid with no profiles row was
  -- stored, never shown, and could not be revoked from the console.
  -- SQLSTATE 23503 is a reference to a row that does not exist, which the
  -- route's mapDbError reads as bad input (400) rather than an outage.
  select true into v_has_profile from public.profiles where id = p_user_id limit 1;
  if not coalesce(v_has_profile, false) then
    raise exception 'fn_ca_operator_grant: operator_not_found, no profiles row for %', p_user_id
      using errcode = '23503';
  end if;

  select true, r.is_legacy into v_exists, v_is_legacy
  from public.ca_operator_roles r
  where r.key = p_role_key;
  if not coalesce(v_exists, false) then
    raise exception 'fn_ca_operator_grant: unknown role_key %', p_role_key;
  end if;

  -- THE LEGACY KEYS ARE NOT GRANTS (review finding L-3). god, superadmin
  -- and admin are what profiles.role says; a grant of one produces an
  -- account that counts as an operator with every permission and that the
  -- Staff tab cannot explain. SQLSTATE 23514, a value that breaks a rule.
  if coalesce(v_is_legacy, false) then
    raise exception 'fn_ca_operator_grant: legacy_role_not_grantable, % lives on profiles.role', p_role_key
      using errcode = '23514';
  end if;

  -- Idempotent, and atomically so (20260903140000, review finding M-4):
  -- the conflict is resolved by the partial unique index itself and the
  -- loser of a race re-reads the winner's row.
  insert into public.ca_operator_grants (user_id, role_key, granted_by, reason)
  values (p_user_id, p_role_key, p_granted_by, p_reason)
  on conflict (user_id, role_key) where revoked_at is null do nothing
  returning id into v_grant_id;

  if v_grant_id is null then
    v_already := true;
    select id into v_grant_id
    from public.ca_operator_grants
    where user_id = p_user_id
      and role_key = p_role_key
      and revoked_at is null
    limit 1;
  end if;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_granted_by,
      p_action        := 'operator.grant_role',
      p_target_type   := 'operator',
      p_target_id     := p_user_id::text,
      p_details       := jsonb_build_object(
                           'grant_id', v_grant_id,
                           'role_key', p_role_key,
                           'reason', p_reason,
                           'already_held', v_already
                         ),
      p_before_state  := null,
      p_after_state   := jsonb_build_object('role_key', p_role_key, 'revoked_at', null),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_operator_grant audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'grant_id', v_grant_id,
    'user_id', p_user_id,
    'role_key', p_role_key,
    'already', v_already,
    'permissions', (select public.fn_ca_operator_permissions(p_user_id) -> 'permissions')
  );
end
$fn$;

revoke all on function public.fn_ca_operator_grant(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_grant(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 3. Decide an approval, and let the requester take theirs back
-- ---------------------------------------------------------------------
-- Was 20260903140000 section 5. Identical except that a rejection by
-- the requester of their own pending row is a withdrawal (review finding
-- L-12): allowed, filed as operator.withdraw_approval, answered with
-- withdrawn:true. Approving your own row is refused as before unless the
-- alone rule applies.
create or replace function public.fn_ca_operator_decide_approval(
  p_approval_id uuid,
  p_decision    text,
  p_decided_by  uuid,
  p_note        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row        public.ca_operator_approvals%rowtype;
  v_policy     public.ca_operator_policy%rowtype;
  v_permission text;
  v_decision   text;
  v_alone      boolean := false;
  v_self       boolean := false;
  v_withdraw   boolean := false;
  v_holds      boolean := false;
begin
  v_decision := lower(coalesce(p_decision, ''));
  if v_decision in ('approve', 'approved') then
    v_decision := 'approved';
  elsif v_decision in ('reject', 'rejected') then
    v_decision := 'rejected';
  else
    raise exception 'fn_ca_operator_decide_approval: decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_row from public.ca_operator_approvals where id = p_approval_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'approval_not_found', 'reason', 'approval_not_found', 'approval_id', p_approval_id);
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_decided', 'reason', 'already_decided', 'status', v_row.status, 'approval_id', p_approval_id);
  end if;

  -- An expired request is closed here rather than left to a sweeper, so
  -- the refusal and the state change cannot disagree.
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    update public.ca_operator_approvals set status = 'expired' where id = p_approval_id;
    return jsonb_build_object('ok', false, 'error', 'expired', 'reason', 'expired', 'status', 'expired', 'approval_id', p_approval_id);
  end if;

  v_permission := case v_row.kind
                    when 'cashout' then 'cashier.write'
                    when 'fleet_policy' then 'fleet.write'
                    when 'sanction' then 'moderation.write'
                    else 'money.write'
                  end;

  -- THE PERMISSION CHECK (20260903140000, review finding M-2). It sits
  -- AFTER the not-found, already-decided and expired branches on purpose:
  -- a decision on a dead row should say the row is dead, not hide that
  -- behind an authorisation error the operator cannot act on. A
  -- withdrawal needs it too: the requester held it to raise the row.
  v_holds := coalesce(public.fn_ca_operator_permissions(p_decided_by) -> 'permissions', '[]'::jsonb)
             ? v_permission;

  if not coalesce(v_holds, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'permission_denied',
      'reason', 'permission_denied',
      'required_permission', v_permission,
      'status', v_row.status,
      'approval_id', p_approval_id
    );
  end if;

  select * into v_policy from public.ca_operator_policy where id limit 1;

  v_self := p_decided_by is not null and v_row.requested_by is not null and p_decided_by = v_row.requested_by;

  -- A WITHDRAWAL IS NOT A SELF APPROVAL (review finding L-12). The four
  -- eyes rule exists so nobody approves their own money move; it has
  -- nothing to say about the requester cancelling one. A reject by the
  -- requester of their own pending row goes through, ends `rejected`
  -- exactly as a second operator's refusal would, and is filed under its
  -- own action name so the trail can tell the two apart.
  v_withdraw := v_self and v_decision = 'rejected';

  if v_self and not v_withdraw then
    v_alone := not public.fn_ca_operator_has_second_approver(v_row.requested_by, v_permission);
    if not (v_alone and coalesce(v_policy.allow_self_approve_when_alone, true)) then
      return jsonb_build_object(
        'ok', false,
        'error', 'self_approval_refused',
        'reason', 'self_approval_refused',
        'status', v_row.status,
        'approval_id', p_approval_id
      );
    end if;
  end if;

  update public.ca_operator_approvals
    set status = v_decision,
        decided_by = p_decided_by,
        decided_at = now(),
        blocked_reason = case when v_self and v_alone then 'no_second_approver' else blocked_reason end,
        result = coalesce(result, '{}'::jsonb)
                 || jsonb_build_object(
                      'decision_note', p_note,
                      'self_approved_alone', v_self and v_alone,
                      'withdrawn', v_withdraw
                    )
  where id = p_approval_id
  returning * into v_row;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_decided_by,
      p_action        := case when v_withdraw then 'operator.withdraw_approval' else 'operator.decide_approval' end,
      p_target_type   := coalesce(v_row.target_type, 'operator_approval'),
      p_target_id     := coalesce(v_row.target_id, p_approval_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', p_approval_id,
                           'kind', v_row.kind,
                           'decision', v_decision,
                           'note', p_note,
                           'permission', v_permission,
                           'self_approved_alone', v_self and v_alone,
                           'alone_rule_applied', v_self and v_alone,
                           'withdrawn', v_withdraw
                         ),
      p_before_state  := jsonb_build_object('status', 'pending'),
      p_after_state   := jsonb_build_object('status', v_decision, 'decided_by', p_decided_by),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := v_row.request_id
    );
  exception when others then
    raise notice 'fn_ca_operator_decide_approval audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'approval_id', p_approval_id,
    'status', v_decision,
    'self_approved_alone', v_self and v_alone,
    'withdrawn', v_withdraw
  );
end
$fn$;

revoke all on function public.fn_ca_operator_decide_approval(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_decide_approval(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. The staff list, with an honest MFA column
-- ---------------------------------------------------------------------
-- Was 20260903121500 section 2. Identical except that a successful read
-- of an empty verified-factor aggregate answers false rather than null
-- (review finding N-4). It still files NO audit row.
create or replace function public.fn_ca_operator_staff()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_mfa       jsonb   := '{}'::jsonb;
  v_mfa_known boolean := false;
  v_rows      jsonb   := '[]'::jsonb;
begin
  -- auth.mfa_factors is not present on every project and the definer may
  -- not be able to read it. UNREADABLE MFA state is reported as null,
  -- never as "no MFA", and never as a failed staff page. A read that
  -- SUCCEEDED and found nobody is "no MFA" (review finding N-4): before
  -- this the Staff tab could not say "No" until one operator enrolled.
  begin
    if to_regclass('auth.mfa_factors') is not null then
      execute $q$
        select coalesce(jsonb_object_agg(user_id::text, cnt), '{}'::jsonb)
        from (
          select user_id, count(*) as cnt
          from auth.mfa_factors
          where status = 'verified'
          group by user_id
        ) m
      $q$ into v_mfa;
      v_mfa_known := true;
    end if;
  exception when others then
    raise notice 'fn_ca_operator_staff mfa read failed: %', sqlerrm;
    v_mfa := '{}'::jsonb;
    v_mfa_known := false;
  end;

  -- Widest role first, which is rank descending: ROLE_META gives god 100
  -- and read_only 10.
  select coalesce(jsonb_agg(to_jsonb(s) order by s.rank desc, s.email), '[]'::jsonb)
    into v_rows
  from (
    select
      p.id                                   as user_id,
      p.email,
      p.username,
      p.display_name,
      p.role                                 as profile_role,
      coalesce(r.rank, 0)                    as rank,
      coalesce(
        (select jsonb_agg(g.role_key order by g.role_key)
         from public.ca_operator_grants g
         where g.user_id = p.id and g.revoked_at is null),
        '[]'::jsonb
      )                                      as granted_roles,
      -- The same active grants again, WITH THEIR IDS. granted_roles is
      -- kept beside this and unchanged, because it is what the first
      -- build of the console reads; this array is additive.
      -- fn_ca_operator_revoke takes a grant id and a revoked grant is
      -- kept rather than deleted, so the id IS the record: without it
      -- the Staff tab can list the roles an operator holds and offer no
      -- way to take one back, which is a console that can only ever
      -- widen. granted_by and reason travel with it so the row can say
      -- who gave it and why without a second request.
      coalesce(
        (select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id,
                    'role_key', g.role_key,
                    'granted_at', g.granted_at,
                    'granted_by', g.granted_by,
                    'reason', g.reason
                  ) order by g.granted_at desc
                )
         from public.ca_operator_grants g
         where g.user_id = p.id and g.revoked_at is null),
        '[]'::jsonb
      )                                      as grants,
      (select count(*) from public.ca_operator_grants g where g.user_id = p.id) as grant_history_count,
      u.last_sign_in_at,
      case
        when not v_mfa_known then null
        else coalesce((v_mfa ->> p.id::text)::int, 0) > 0
      end                                    as mfa_enabled
    from public.profiles p
    left join public.ca_operator_roles r on r.key = p.role
    left join auth.users u on u.id = p.id
    where exists (
            select 1 from public.ca_operator_roles lr
            where lr.key = p.role and lr.is_legacy
          )
       or exists (
            select 1 from public.ca_operator_grants g where g.user_id = p.id
          )
  ) s;

  -- This function files NO audit row. Same reason as
  -- fn_ca_operator_audit_trail: a read with no actor in its signature
  -- cannot write a row the audit helper will accept.

  return jsonb_build_object('staff', v_rows, 'total', jsonb_array_length(v_rows));
end
$fn$;

revoke all on function public.fn_ca_operator_staff() from public, anon, authenticated;
grant execute on function public.fn_ca_operator_staff() to service_role;

-- ---------------------------------------------------------------------
-- 5. Assertions
-- ---------------------------------------------------------------------
-- These do not read the file, they call the functions the database now
-- holds, with synthetic rows, and then throw all of it away.
--
-- HOW THE ROLLBACK WORKS. The probe body is an inner BEGIN ... EXCEPTION
-- block, which is a subtransaction: the sentinel exception raised at the
-- end of it undoes every row the probe wrote, including the policy
-- changes, the grant revocations and any admin_audit_log rows, while
-- plpgsql VARIABLES keep their values because they are not transactional.
-- So the checks run against real writes and nothing survives them. The
-- handler re-raises anything that is not the sentinel, so a failed check
-- still aborts this migration. The final block re-reads the policy row
-- and the grant table and asserts both are what they were before.
--
-- Every synthetic actor is a version 4 uuid in a block no real Supabase
-- user can occupy, the same block docs/horses/PHASE2-SIM.sql uses:
-- 00000000-0000-4000-8000-0000000000xx. Nothing here writes to profiles.
-- The synthetic checker gets its finance grant by a direct insert into
-- ca_operator_grants, because fn_ca_operator_grant now refuses a uuid
-- with no profiles row, which is the first thing this block proves.

do $assert$
declare
  c_maker   constant uuid := '00000000-0000-4000-8000-000000000021';
  c_checker constant uuid := '00000000-0000-4000-8000-000000000022';

  v_before_policy jsonb;
  v_after_policy  jsonb;
  v_before_grants bigint;
  v_after_grants  bigint;
  v_res           jsonb;
  v_id            uuid;
  v_legacy        uuid;
  v_legacy_count  int;
  v_raised        text;
  v_count         int;
  v_mfa_readable  boolean := false;
  v_staff         jsonb;
  v_row           jsonb;
begin
  select to_jsonb(p) into v_before_policy from public.ca_operator_policy p where p.id;
  select count(*) into v_before_grants from public.ca_operator_grants where revoked_at is null;

  begin
    -- ---------------------------------------------------------------
    -- L-3. A GRANT TO A UUID WITH NO PROFILE IS REFUSED, BY NAME.
    -- ---------------------------------------------------------------
    v_raised := null;
    begin
      perform public.fn_ca_operator_grant(c_maker, 'finance', c_checker, 'assertion probe');
    exception when others then
      v_raised := sqlerrm;
    end;
    if v_raised is null or v_raised not like '%operator_not_found%' then
      raise exception 'ASSERT FAILED (L-3): a grant to a uuid with no profiles row was accepted: %', coalesce(v_raised, 'no error');
    end if;
    select count(*) into v_count from public.ca_operator_grants where user_id = c_maker;
    if v_count <> 0 then
      raise exception 'ASSERT FAILED (L-3): the refused grant was stored anyway';
    end if;

    -- ---------------------------------------------------------------
    -- L-3. A LEGACY KEY IS NOT GRANTABLE, EVEN TO A REAL OPERATOR.
    -- ---------------------------------------------------------------
    select p.id into v_legacy
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy
    order by p.id
    limit 1;

    if v_legacy is null then
      raise notice 'ASSERT SKIPPED (L-3 legacy key): no legacy operator account on this database';
    else
      v_raised := null;
      begin
        perform public.fn_ca_operator_grant(v_legacy, 'god', c_checker, 'assertion probe');
      exception when others then
        v_raised := sqlerrm;
      end;
      if v_raised is null or v_raised not like '%legacy_role_not_grantable%' then
        raise exception 'ASSERT FAILED (L-3): a grant of god was accepted: %', coalesce(v_raised, 'no error');
      end if;
      select count(*) into v_count
      from public.ca_operator_grants where user_id = v_legacy and role_key = 'god';
      if v_count <> 0 then
        raise exception 'ASSERT FAILED (L-3): the refused legacy grant was stored anyway';
      end if;
    end if;

    -- ---------------------------------------------------------------
    -- A known starting state for the rest. Every active grant is
    -- revoked INSIDE THIS SUBTRANSACTION so the roster below is exactly
    -- the legacy accounts and nothing else; the rollback puts them back.
    -- ---------------------------------------------------------------
    update public.ca_operator_grants
      set revoked_at = now(), revoked_by = c_checker
    where revoked_at is null;

    perform public.fn_ca_operator_set_policy(
      jsonb_build_object(
        'approvals_enabled', true,
        'enforce_named_roles', false,
        'allow_self_approve_when_alone', false,
        'mint_threshold', 100,
        'approval_ttl_minutes', 1440
      ),
      c_checker
    );

    select count(*) into v_legacy_count
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy;

    -- ---------------------------------------------------------------
    -- M-2. UNDER ENFORCEMENT A LEGACY ACCOUNT WITH NO GRANT COUNTS.
    -- ---------------------------------------------------------------
    if v_legacy_count = 0 then
      raise notice 'ASSERT SKIPPED (M-2): no legacy operator account on this database';
    else
      if not public.fn_ca_operator_has_second_approver(c_checker, 'money.write') then
        raise exception 'ASSERT FAILED (M-2): with enforcement off, % legacy account(s) were not counted', v_legacy_count;
      end if;

      perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', true), c_checker);

      if not public.fn_ca_operator_has_second_approver(c_checker, 'money.write') then
        raise exception 'ASSERT FAILED (M-2): under enforcement, a legacy account holding no grant was not counted as a second approver';
      end if;
      -- The same account, by the resolver: it holds money.write, so the
      -- two functions now agree.
      if not (coalesce(public.fn_ca_operator_permissions(v_legacy) -> 'permissions', '[]'::jsonb) ? 'money.write') then
        raise exception 'ASSERT FAILED (M-2): the resolver does not give a grantless legacy account money.write under enforcement';
      end if;

      -- Give EVERY legacy account a read_only grant: each is now described
      -- by that grant alone, none holds money.write, and nobody counts.
      insert into public.ca_operator_grants (user_id, role_key, granted_by, reason)
      select p.id, 'read_only', c_checker, 'assertion probe'
      from public.profiles p
      join public.ca_operator_roles r on r.key = p.role and r.is_legacy;

      if public.fn_ca_operator_has_second_approver(c_checker, 'money.write') then
        raise exception 'ASSERT FAILED (M-2): under enforcement, a legacy account narrowed to read_only was still counted for money.write';
      end if;
      -- But every one of them still counts for admin.manage: the floor.
      if not public.fn_ca_operator_has_second_approver(c_checker, 'admin.manage') then
        raise exception 'ASSERT FAILED (M-2): the admin.manage recovery floor is not reflected by has_second_approver';
      end if;

      -- Back to the grantless world for the next probes.
      delete from public.ca_operator_grants
      where granted_by = c_checker and reason = 'assertion probe' and role_key = 'read_only';
      perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', false), c_checker);
    end if;

    -- ---------------------------------------------------------------
    -- L-12. THE REQUESTER MAY WITHDRAW, AND STILL MAY NOT SELF APPROVE.
    -- The checker holds finance by a direct insert (no profiles row).
    -- ---------------------------------------------------------------
    insert into public.ca_operator_grants (user_id, role_key, granted_by, reason)
    values (c_checker, 'finance', c_checker, 'assertion probe');

    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_checker, 500, 'chips', 'club', 'assert-club',
      'withdraw probe', 'assert-op-withdraw', 'assert-req-withdraw'
    );
    v_id := (v_res ->> 'approval_id')::uuid;
    if (v_res ->> 'status') <> 'pending' then
      raise exception 'ASSERT FAILED (L-12): the probe needs a pending row, got %', v_res;
    end if;

    v_res := public.fn_ca_operator_decide_approval(v_id, 'reject', c_checker, 'raised against the wrong club');
    if not (v_res ->> 'ok')::boolean
       or (v_res ->> 'status') <> 'rejected'
       or not (v_res ->> 'withdrawn')::boolean then
      raise exception 'ASSERT FAILED (L-12): the requester could not withdraw their own pending row: %', v_res;
    end if;
    if (select status from public.ca_operator_approvals where id = v_id) <> 'rejected' then
      raise exception 'ASSERT FAILED (L-12): the withdrawn row is not rejected';
    end if;
    if not coalesce((select (result ->> 'withdrawn')::boolean from public.ca_operator_approvals where id = v_id), false) then
      raise exception 'ASSERT FAILED (L-12): the withdrawn row does not say so in result';
    end if;

    -- A second withdrawal is already_decided, like any other decision.
    v_res := public.fn_ca_operator_decide_approval(v_id, 'reject', c_checker, 'again');
    if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'already_decided' then
      raise exception 'ASSERT FAILED (L-12): a withdrawn row was decided twice: %', v_res;
    end if;

    -- Approving your own row is refused as before while somebody else
    -- could approve it (the legacy accounts, enforcement off).
    if v_legacy_count = 0 then
      raise notice 'ASSERT SKIPPED (L-12 self approval): no legacy operator account, so the requester is alone';
    else
      v_res := public.fn_ca_operator_request_approval(
        'mint', '{}'::jsonb, c_checker, 500, 'chips', 'club', 'assert-club',
        'self probe', 'assert-op-self', 'assert-req-self'
      );
      v_id := (v_res ->> 'approval_id')::uuid;
      v_res := public.fn_ca_operator_decide_approval(v_id, 'approve', c_checker, 'approving my own');
      if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'self_approval_refused' then
        raise exception 'ASSERT FAILED (L-12): the requester approved their own row: %', v_res;
      end if;
      if (select status from public.ca_operator_approvals where id = v_id) <> 'pending' then
        raise exception 'ASSERT FAILED (L-12): a refused self approval moved the row';
      end if;
    end if;

    -- ---------------------------------------------------------------
    -- N-4. mfa_enabled IS A BOOLEAN WHENEVER THE FACTOR TABLE IS READABLE.
    -- ---------------------------------------------------------------
    begin
      if to_regclass('auth.mfa_factors') is not null then
        execute 'select 1 from auth.mfa_factors limit 1';
        v_mfa_readable := true;
      end if;
    exception when others then
      v_mfa_readable := false;
    end;

    v_staff := public.fn_ca_operator_staff();
    if v_mfa_readable then
      for v_row in select * from jsonb_array_elements(v_staff -> 'staff') loop
        if jsonb_typeof(v_row -> 'mfa_enabled') <> 'boolean' then
          raise exception 'ASSERT FAILED (N-4): mfa_enabled is % for % with auth.mfa_factors readable',
            v_row -> 'mfa_enabled', v_row ->> 'user_id';
        end if;
      end loop;
    else
      raise notice 'ASSERT SKIPPED (N-4): auth.mfa_factors is absent or unreadable, so null is the honest answer';
    end if;

    raise exception 'ROLLBACK_PROBE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_PROBE' then
      raise;
    end if;
  end;

  -- Nothing the probe wrote survived, including the policy edits and the
  -- grant revocations.
  select to_jsonb(p) into v_after_policy from public.ca_operator_policy p where p.id;
  if v_after_policy is distinct from v_before_policy then
    raise exception 'ASSERT FAILED: the probe changed the policy row and it was not rolled back: % -> %',
      v_before_policy, v_after_policy;
  end if;

  select count(*) into v_after_grants from public.ca_operator_grants where revoked_at is null;
  if v_after_grants <> v_before_grants then
    raise exception 'ASSERT FAILED: the probe changed the active grant count and it was not rolled back: % -> %',
      v_before_grants, v_after_grants;
  end if;

  select count(*) into v_count from public.ca_operator_approvals where op_id like 'assert-op-%';
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: % probe approval row(s) survived the rollback', v_count;
  end if;

  select count(*) into v_count
  from public.ca_operator_grants
  where user_id in ('00000000-0000-4000-8000-000000000021'::uuid, '00000000-0000-4000-8000-000000000022'::uuid)
     or reason = 'assertion probe';
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: % probe grant row(s) survived the rollback', v_count;
  end if;

  raise notice 'ASSERT OK: the alone rule and the permission model agree, grants name real operators, a requester may withdraw, and no probe row survived.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- There is nothing to drop: this file creates no object. Every statement
-- in it is a CREATE OR REPLACE of a function that already existed, with
-- the same signature and the same ACL, so undoing it means putting the
-- PREVIOUS DEFINITION of each one back.
--
-- THE PREVIOUS DEFINITIONS, ALL FOUR, ARE IN THE REPOSITORY, UNMODIFIED:
--
--   fn_ca_operator_has_second_approver(uuid, text)
--     supabase/migrations/20260903120000_ca_operator_rbac_and_approvals.sql
--     section 5.10
--   fn_ca_operator_grant(uuid, text, uuid, text)
--     supabase/migrations/20260903140000_ca_operator_approval_gate_is_exact.sql
--     section 2
--   fn_ca_operator_decide_approval(uuid, text, uuid, text)
--     supabase/migrations/20260903140000_ca_operator_approval_gate_is_exact.sql
--     section 5
--   fn_ca_operator_staff()
--     supabase/migrations/20260903121500_ca_operator_read_fns_do_not_audit.sql
--     section 2
--
-- To roll back: copy those four CREATE OR REPLACE blocks out of those
-- files VERBATIM, together with their REVOKE and GRANT lines, and run
-- them in one transaction. Do not reconstruct them from memory or from
-- this file: this file's bodies differ from them on purpose.
--
-- READ THIS BEFORE YOU DO. Rolling back restores, in order: an alone
-- rule that auto-approves a granted operator's own request while a
-- fully entitled legacy account is on shift (M-2), a grant function that
-- stores grants for uuids no Staff tab can show or revoke and that
-- accepts god as a grant (L-3), a queue a requester cannot take their
-- own mistake out of (L-12), and a Staff tab that cannot say "No" under
-- MFA (N-4). None of those can hurt production while
-- ca_operator_policy.approvals_enabled is false and no grant exists,
-- which is the only reason this is a rollback anyone could survive. If
-- the reason for rolling back is that something in this file misbehaves
-- under approvals, turn approvals_enabled OFF first: that is faster, it
-- is one row, and it stops the gate without restoring the holes.
-- =====================================================================
