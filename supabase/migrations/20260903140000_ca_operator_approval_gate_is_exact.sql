-- =====================================================================
-- Phase 2 follow-up: the approval gate becomes exact.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 2 migration.
-- Follows 20260903120000_ca_operator_rbac_and_approvals.sql and
-- 20260903121500_ca_operator_read_fns_do_not_audit.sql, both applied and
-- both registered in supabase_migrations.schema_migrations.
-- Contract: docs/horses/PHASE2-CONTRACTS.md sections 0 and 1.
--
-- WHAT THIS IS
-- CREATE OR REPLACE of five functions, no signature changed, no table,
-- index, column, policy, default or ACL changed:
--   fn_ca_operator_permissions(uuid)
--   fn_ca_operator_grant(uuid, text, uuid, text)
--   fn_ca_operator_set_policy(jsonb, uuid)
--   fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text,
--                                   text, text, text, text, text)
--   fn_ca_operator_decide_approval(uuid, text, uuid, text)
-- The REVOKE and GRANT lines for all five are restated below so this file
-- is ACL self-contained the same way both of its predecessors are. A
-- CREATE OR REPLACE keeps the existing ACL; restating it means the file
-- can be read on its own and still say who may execute these functions.
--
-- HOW THESE WERE FOUND
-- An adversarial review of the ALREADY APPLIED migration, 2026-09-03,
-- recorded in review2/server-db.md. The live findings were not read out
-- of the file: they were produced by two probes run against production
-- inside DO blocks that ended in RAISE EXCEPTION, so every write the
-- probe made was rolled back by the abort. The probe output is quoted
-- verbatim under each defect below. Reading the SQL alone would not have
-- found B-2 or B-3: both branches look reasonable until a real row is put
-- in front of them.
--
-- ---------------------------------------------------------------------
-- B-2 (BLOCKER). A REJECTED APPROVAL EXECUTED ON RETRY.
-- ---------------------------------------------------------------------
-- The idempotent branch of fn_ca_operator_request_approval answered
--   'required', v_existing.status = 'pending'
-- so EVERY status that is not 'pending' came back required:false. That
-- includes 'rejected' and 'expired'. src/lib/horses/approvals.js then
-- computes `const required = decision.required && dbRequired`, reads
-- false, and the route walks straight into the money RPC. The money RPC
-- has its own op_id claim, and that key has not been used yet, so the
-- chips move. markApprovalExecuted then refuses with 'not_approved' and
-- only logs (M-8), so the row stays 'rejected' while the chips are gone:
-- the trail does not merely miss the event, it actively contradicts it.
--   Probe: REJECTED={"ok":true,"status":"rejected"} then
--          RETRY_AFTER_REJECT={"status":"rejected","required":false,
--                              "idempotent":true}
--          mark_executed_on_rejected={"ok":false,"error":"not_approved"}
-- CORRECT SEMANTICS, and what this file installs. An existing row for
-- the same op_id answers required:false ONLY when its status means "this
-- request has been cleared to proceed and has not yet executed", which
-- is 'approved' and 'auto_approved' and nothing else:
--   pending       -> required:true, ok:true. Still waiting.
--   approved      -> required:false, ok:true. Cleared, go.
--   auto_approved -> required:false, ok:true. Cleared, go.
--   executed      -> required:false, ok:true, already_executed:true.
--                    Deliberately NOT a refusal. The row has done its
--                    job; the caller's own idempotency (fn_ca_mint's
--                    op_id claim) is what replays here, and it will
--                    return the original result rather than move chips
--                    twice. Refusing would turn a dropped response into
--                    an operator error on a completed mint.
--   rejected      -> ok:false, refused:true, error 'approval_rejected'.
--   expired       -> ok:false, refused:true, error 'approval_expired'.
--   failed        -> a fresh request. The previous attempt moved no
--                    money; the operator is entitled to try again under
--                    the same key. The existing row is re-opened in
--                    place rather than duplicated, because op_id is
--                    unique.
-- Every refusal also carries required:true. That is belt and braces for
-- the JS ceiling: approvals.js ANDs the database answer with its own
-- cached decision, so a refusal that also said required:false would be
-- read as "go" by a caller that has not yet been taught to read `ok`.
-- With required:true the worst a stale caller does is return the 202
-- pending body, which touches no money. Teaching the route to map
-- refused:true onto a 403/409 is the code-side half of this fix and is
-- NOT in this migration; the database is now safe either way.
--
-- ---------------------------------------------------------------------
-- B-3 (BLOCKER). APPROVAL LAUNDERING.
-- ---------------------------------------------------------------------
-- The same branch returned the stored row and never looked at p_kind,
-- p_amount, p_asset, p_target_type or p_target_id. Get 500 chips
-- approved for club A, then POST the same opId with 999999 for club B:
-- required:false comes back, quoting the 500-chip approval id, and the
-- money RPC mints the new amount to the new target because its own claim
-- key is untouched.
--   Probe, retried deliberately with a different amount and target:
--     fn_ca_operator_request_approval(...,999999,'chips','club',
--       'other-club',...,'probe-1',...)
--     -> {"status":"rejected","required":false,"idempotent":true,
--         "approval_id":"ba562f7b-..."}  (the original 500 row)
-- Now: kind, amount, asset, target_type and target_id are compared
-- against the stored row with IS DISTINCT FROM, so null matches null and
-- a numeric 500 matches 500.0. Any difference is a DIFFERENT operation
-- reusing somebody else's key, and it is refused with its own code,
-- 'payload_mismatch', naming the fields that differ. The mismatch check
-- runs BEFORE the status branch, so a laundered replay of an approved
-- row can never reach the required:false answer at all.
--
-- ---------------------------------------------------------------------
-- H-2 (HIGH). THE THRESHOLD BOUNDARY WAS DEFINED TWICE, LOOSER HERE.
-- ---------------------------------------------------------------------
-- SQL said `v_required := p_amount > v_threshold`. src/lib/horses/
-- approvals.js says `if (amt < threshold) return {required:false}`,
-- which gates at >=. requireApproval ANDs the two, so the looser one
-- won and an amount EXACTLY equal to the threshold was not gated. The
-- console copy an operator reads before pressing the button, the module
-- comment and the test (requiresApproval(on,'mint',1000).required ===
-- true) all say >=. A threshold of exactly 1000 let 1000 through
-- unwatched.
--   Probe with mint_threshold=100 and amount 100:
--     BOUNDARY(amount=threshold)={"status":"auto_approved",
--                                 "required":false}
-- Now: p_amount >= v_threshold. The assertion block below proves the
-- boundary is gated against the real function.
--
-- ---------------------------------------------------------------------
-- H-4 (HIGH). ENFORCEMENT COULD LOCK THE PLATFORM OUT OF ITS OWN PANEL.
-- ---------------------------------------------------------------------
-- Under enforce_named_roles, an account holding ANY grant is described
-- by that grant alone. Grant a god `read_only`, flip the flag, and the
-- god drops from 21 permissions to 6 - losing admin.manage, which is the
-- only permission that can flip the flag back. Recovery was direct SQL.
--   Probe: god_before=21 god_after_enforce=6 roles_after=["read_only"]
-- Two changes, deliberately belt and braces:
--   1. THE RECOVERY HATCH. fn_ca_operator_permissions now always adds
--      admin.manage to an account whose profiles.role is a legacy role
--      (is_legacy on ca_operator_roles), whatever the enforcement flag
--      says and whatever grants it holds. A legacy account can therefore
--      always reach the policy panel and turn enforcement back off. This
--      is ADDITIVE - it can only ever widen a permission set, never
--      narrow one - so it cannot breach contract section 0. The granted
--      roles it reports are unchanged, so the Staff tab still shows the
--      truth about what was granted; only the resolved permission set
--      carries the floor.
--   2. THE GUARD. fn_ca_operator_set_policy refuses a patch that sets
--      enforce_named_roles = true when doing so would leave ZERO
--      accounts holding admin.manage, returning
--      {"ok":false,"error":"enforce_named_roles_would_lock_out"} with
--      the count, rather than committing the lockout. The count mirrors
--      the resolver under enforcement: any legacy-role account (which
--      holds the floor above) plus any account with an active grant on a
--      role that carries admin.manage.
--
-- ---------------------------------------------------------------------
-- M-2 (MEDIUM). decide_approval PERFORMED NO PERMISSION CHECK.
-- ---------------------------------------------------------------------
-- It validated the decision word, the row status, expiry and self
-- approval, and never asked whether the decider holds money.write or
-- cashier.write. The only gate was requirePermission in the route, while
-- the route's own comment claims "The RPC enforces both again, because
-- the first check is javascript". It enforced one of the two. Now the
-- RPC resolves the decider's permissions and refuses with
-- 'permission_denied' when the kind's permission is missing. The check
-- sits AFTER the not-found, already-decided and expired branches on
-- purpose, so a decision on a dead row still reports why the row is dead
-- rather than hiding it behind an authorisation error.
-- NOTE FOR ANYONE RUNNING docs/horses/PHASE2-SIM.sql: its synthetic
-- checker now needs a grant before STEP 7, because it holds no profile
-- role and therefore no permission. That file has been updated in the
-- same commit; docs/horses/PHASE2-SIM-2.sql proves the new refusal.
--
-- ---------------------------------------------------------------------
-- M-3 and M-4 (MEDIUM). TWO LOST-UPDATE RACES ON A BARE SELECT.
-- ---------------------------------------------------------------------
-- Both functions checked for an existing row with an unlocked SELECT and
-- then INSERTed. Two concurrent requests with the same op_id both miss,
-- both insert, and the second trips ca_operator_approvals_op_id_uq with
-- a 23505 - which approvals.js reads as "the required approval could not
-- be recorded" and turns into a 503, so a double click yields a 503
-- instead of a 202. The same shape in fn_ca_operator_grant trips
-- ca_operator_grants_active_uq and yields a 409 "That Role Grant Already
-- Exists", directly contradicting the "a retry must not read as a
-- failure" comment above it. Both now INSERT ... ON CONFLICT DO NOTHING
-- against the partial unique index and re-read the winner's row when the
-- insert yields nothing, so the loser of the race returns the same
-- idempotent answer the winner does.
--
-- ---------------------------------------------------------------------
-- M-5 (MEDIUM, HALF FIXED HERE). EXPIRED ROWS WERE NEVER SWEPT.
-- ---------------------------------------------------------------------
-- status only became 'expired' when somebody attempted a decision, so a
-- timed-out request stayed 'pending' forever and a retry under the same
-- op_id returned required:true forever. For cashout, whose opId is the
-- deterministic 'cashout:<id>', that cashout could never complete again.
-- Then the moment anybody clicked Approve on the dead row it flipped to
-- 'expired' and the very next retry returned required:false (B-2) and
-- the money moved with no approval at all.
--   Probe: EXPIRED_ROW={"status":"pending","required":true}, then after
--          forcing expires_at into the past,
--          RETRY_AFTER_EXPIRY={"status":"pending","required":true,
--                              "idempotent":true} - status never moved.
-- FIXED HERE: a replay that finds a 'pending' row whose expires_at has
-- passed marks it 'expired' on the spot and refuses, so the row and the
-- answer can never disagree and the B-2 sequence above is impossible.
-- NOT FIXED HERE: the background sweep. A pending row nobody retries is
-- still only swept when it is next touched. That wants an Open Claw job
-- (CLAUDE.md section 11), which is a code and dispatcher change, not a
-- migration. The dangerous half - a dead row answering "go" - is closed
-- by this file.
--
-- ---------------------------------------------------------------------
-- L-4 (LOW). A DECISION TIMESTAMP WITH NO DECIDER.
-- ---------------------------------------------------------------------
-- Every auto_approved row was written with decided_at = now() and
-- decided_by = null unless the alone rule fired. To anyone querying the
-- table later that reads as a decision that happened and whose decider
-- was lost. decided_at is now set only where decided_by is, which is
-- only when the alone rule stood the requester in for a second operator.
--
-- ---------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT FIX
-- ---------------------------------------------------------------------
-- Everything below is real and none of it lives in SQL, so none of it
-- can be fixed by replacing a function. Listed so the next reader knows
-- they were considered and not missed.
--   B-1  No executor. An approved mint or burn never runs: nothing reads
--        ca_operator_approvals.payload, and the console rotates the
--        idempotency key on every payload change, so the operator cannot
--        resubmit under the approved row's op_id. That is a route and
--        console change (an execute_approval action). It is the reason
--        approvals must stay OFF until it lands, whatever this file
--        fixes.
--   H-1  approve-cashout gates club agents and club owners, who are not
--        operators, behind a queue only console staff can see. Route
--        change.
--   H-3  canDecideApproval grants the alone rule without counting
--        eligible approvers, so the console will enable a button the RPC
--        refuses. Module change, and T-1 asserts the bug as correct.
--   M-1  The set_policy ROUTE bypasses fn_ca_operator_set_policy with a
--        direct update and reports success on zero matched rows. It is
--        why the guard added here is not yet reachable from the console:
--        the guard is correct, the route has to start calling the RPC.
--        Route change, and it is the single highest-value follow-up in
--        this list.
--   M-6  isOperatorRole widened to every named role, so a future
--        profiles.role of 'owner' would silently gain everything.
--        Module change.
--   M-7  Two implementations of the alone rule that already disagree
--        under enforcement. Route change.
--   M-8  markApprovalExecuted swallows an ok:false refusal. Module
--        change; it is the second half of B-2's trail damage.
--   L-1, L-2, L-3, L-5 and every T-row: route, module and test changes.
--
-- ---------------------------------------------------------------------
-- CONTRACT SECTION 0: NOTHING HERE BLOCKS A MOVE THAT WORKS TODAY
-- ---------------------------------------------------------------------
-- Production reads approvals_enabled=false, enforce_named_roles=false,
-- zero grants, zero approval rows, three legacy operators. Against that
-- state:
--   * the >= change is unreachable: with approvals off the function
--     never compares an amount to a threshold at all;
--   * the replay refusals are unreachable: there are no rejected or
--     expired rows, and a payload_mismatch refusal returned while
--     approvals are off is ANDed away by approvals.js's ceiling
--     (decision.required is false), so the route proceeds exactly as it
--     does today;
--   * the admin.manage floor only ever ADDS a permission;
--   * the set_policy guard only refuses a patch that would lock every
--     account out of the policy panel, and the console does not call
--     that RPC yet (M-1);
--   * the decide_approval permission check is unreachable: decisions
--     only exist for pending rows and pending rows only exist with
--     approvals on;
--   * the ON CONFLICT rewrites return what the old code returned, minus
--     the 23505.
-- The assertion block proves the first two of those against the real
-- functions, inside a subtransaction it rolls back, so no row from it
-- survives this migration.
--
-- VERIFIED BEFORE APPLYING
-- Applied to a throwaway PostgreSQL cluster against a stub of the four
-- objects this family reads (profiles, admin_audit_log, auth.users,
-- fn_log_admin_action, the last one refusing a null actor exactly as
-- production's does) seeded with production's shape of one god and two
-- admins, on top of 20260903120000 and 20260903121500 applied in order.
-- Confirmed there: the file applies clean inside one transaction, the
-- assertion block passes and leaves zero rows, applying it twice changes
-- nothing, docs/horses/PHASE2-SIM-2.sql passes every step and rolls
-- back, and docs/horses/PHASE2-SIM.sql still passes every step it did
-- before (with the two-line decider grant its synthetic checker now
-- needs, see M-2 above).
--
-- LOCKING
-- CREATE OR REPLACE FUNCTION locks the function only. No table is
-- touched. Every one of the five is called by one route over PostgREST
-- and by the two sibling functions in this family; a call in flight
-- during the replace either finishes on the old body or runs the new
-- one. Every returned jsonb keeps every key it had, so no caller needs
-- to change on the same deploy.
-- =====================================================================

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1. Resolve a caller's permissions, with the recovery hatch
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.1. Identical except for the admin.manage
-- floor and the additive admin_manage_floor key on the result.
--
-- The union rule is unchanged: while enforce_named_roles is false the
-- legacy profile role always contributes its full set, so a grant can
-- only widen. With enforcement on, an operator who holds at least one
-- active named grant is described by those grants alone, which is how a
-- revoke finally narrows. An operator with NO grants at all keeps the
-- legacy set even under enforcement.
create or replace function public.fn_ca_operator_permissions(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_profile_role  text;
  v_is_legacy     boolean := false;
  v_enforce       boolean := false;
  v_legacy        text[]  := '{}';
  v_granted       text[]  := '{}';
  v_granted_roles text[]  := '{}';
  v_permissions   text[]  := '{}';
  v_roles         text[]  := '{}';
  v_source        text;
  v_floor         boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'role', null, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb,
      'source', 'none', 'admin_manage_floor', false
    );
  end if;

  select coalesce(pol.enforce_named_roles, false)
    into v_enforce
  from public.ca_operator_policy pol
  where pol.id
  limit 1;

  select p.role into v_profile_role
  from public.profiles as p
  where p.id = p_user_id
  limit 1;

  -- Only a role that exists in the table and is flagged legacy gets the
  -- automatic set. An unknown profiles.role contributes nothing.
  if v_profile_role is not null then
    select exists (
      select 1 from public.ca_operator_roles r
      where r.key = v_profile_role and r.is_legacy
    ) into v_is_legacy;

    select coalesce(array_agg(rp.permission order by rp.permission), '{}')
      into v_legacy
    from public.ca_operator_role_permissions rp
    join public.ca_operator_roles r on r.key = rp.role_key
    where r.key = v_profile_role
      and r.is_legacy;
  end if;

  select coalesce(array_agg(distinct rp.permission), '{}'),
         coalesce(array_agg(distinct g.role_key), '{}')
    into v_granted, v_granted_roles
  from public.ca_operator_grants g
  join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
  where g.user_id = p_user_id
    and g.revoked_at is null;

  if v_enforce and array_length(v_granted_roles, 1) is not null then
    v_permissions := v_granted;
    v_roles       := v_granted_roles;
    v_source      := 'granted';
  else
    select coalesce(array_agg(distinct u.perm), '{}'::text[])
      into v_permissions
    from (
      select l.perm from unnest(v_legacy) as l(perm)
      union
      select g.perm from unnest(v_granted) as g(perm)
    ) u
    where u.perm is not null;

    select coalesce(array_agg(distinct y.role_key), '{}'::text[])
      into v_roles
    from (
      select v_profile_role as role_key
      where array_length(v_legacy, 1) is not null
      union
      select g.role_key from unnest(v_granted_roles) as g(role_key)
    ) y
    where y.role_key is not null;

    if array_length(v_legacy, 1) is not null and array_length(v_granted_roles, 1) is not null then
      v_source := 'both';
    elsif array_length(v_legacy, 1) is not null then
      v_source := 'legacy';
    elsif array_length(v_granted_roles, 1) is not null then
      v_source := 'granted';
    else
      v_source := 'none';
    end if;
  end if;

  -- THE RECOVERY HATCH (review finding H-4). An account whose
  -- profiles.role is a LEGACY role ALWAYS keeps admin.manage, whatever
  -- enforce_named_roles says and whatever grants it holds. Without this,
  -- granting a god `read_only` and flipping enforcement drops that god
  -- from 21 permissions to 6, admin.manage among the 15 lost, and
  -- admin.manage is the only permission that can flip enforcement back:
  -- the platform would be locked out of its own policy panel with direct
  -- SQL as the only way back in. This is purely ADDITIVE. It can widen a
  -- permission set and can never narrow one, so it cannot breach
  -- contract section 0, and it leaves `roles` and `source` describing
  -- exactly what was granted so the Staff tab still tells the truth.
  if v_is_legacy and not (coalesce(v_permissions, '{}'::text[]) @> array['admin.manage']) then
    v_permissions := coalesce(v_permissions, '{}'::text[]) || 'admin.manage'::text;
    v_floor := true;
  end if;

  -- NO AUDIT ROW IS WRITTEN HERE, DELIBERATELY. This is a READ, it runs
  -- on every console request behind a 30 second cache, and the route that
  -- called it already files one audit row for the request itself. See
  -- WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF in 20260903120000.
  return jsonb_build_object(
    'role', v_profile_role,
    'roles', to_jsonb(coalesce(v_roles, '{}'::text[])),
    'permissions', to_jsonb(coalesce(v_permissions, '{}'::text[])),
    'source', v_source,
    -- Additive key. True when the line above put admin.manage back for a
    -- legacy account that enforcement would otherwise have stripped it
    -- from, so the console can say why it is there.
    'admin_manage_floor', v_floor
  );
end
$fn$;

revoke all on function public.fn_ca_operator_permissions(uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_permissions(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. Grant a named role, without the race
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.2. Identical except that the check and the
-- insert are one statement (review finding M-4).
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
  v_exists   boolean;
  v_grant_id uuid;
  v_already  boolean := false;
begin
  if p_user_id is null then
    raise exception 'fn_ca_operator_grant: p_user_id is required';
  end if;

  select true into v_exists from public.ca_operator_roles where key = p_role_key;
  if not coalesce(v_exists, false) then
    raise exception 'fn_ca_operator_grant: unknown role_key %', p_role_key;
  end if;

  -- Idempotent, and now atomically so. The previous body read the table
  -- with an unlocked SELECT and then INSERTed, so two console retries
  -- landing together both missed and the second raised 23505 against
  -- ca_operator_grants_active_uq, which the route turned into a 409 "That
  -- Role Grant Already Exists". A retry must not read as a failure, so
  -- the conflict is resolved by the index itself and the loser re-reads
  -- the winner's row.
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
-- 3. Set the policy row, and refuse the lockout
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.4. Identical except for the
-- enforce_named_roles guard (review finding H-4).
create or replace function public.fn_ca_operator_set_policy(
  p_patch      jsonb,
  p_updated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before  public.ca_operator_policy%rowtype;
  v_after   public.ca_operator_policy%rowtype;
  v_holders int := 0;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'fn_ca_operator_set_policy: p_patch must be a json object';
  end if;

  select * into v_before from public.ca_operator_policy where id for update;
  if not found then
    insert into public.ca_operator_policy (id) values (true) returning * into v_before;
  end if;

  -- THE LOCKOUT GUARD (review finding H-4). admin.manage is the only
  -- permission that can set this policy, so turning enforcement on when
  -- nobody would still hold it is a one-way door: the panel that could
  -- turn it back off becomes unreachable and direct SQL is the only
  -- recovery. Refuse with a reason instead, and say how many holders
  -- were counted so the operator can see what to fix first (grant
  -- somebody `owner`, then flip the flag).
  --
  -- The count mirrors what fn_ca_operator_permissions resolves once
  -- enforcement is on: every legacy-role account, which keeps
  -- admin.manage through the recovery hatch in section 1 above, plus
  -- every account holding an active grant on a role that carries
  -- admin.manage.
  if coalesce((p_patch ->> 'enforce_named_roles')::boolean, false) then
    select count(*) into v_holders
    from (
      select p.id as user_id
      from public.profiles p
      join public.ca_operator_roles r on r.key = p.role and r.is_legacy
      union
      select g.user_id
      from public.ca_operator_grants g
      join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
      where g.revoked_at is null
        and rp.permission = 'admin.manage'
    ) holders;

    if v_holders = 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'enforce_named_roles_would_lock_out',
        'reason', 'enforce_named_roles_would_lock_out',
        'admin_manage_holders', v_holders,
        'policy', to_jsonb(v_before)
      );
    end if;
  end if;

  update public.ca_operator_policy
    set approvals_enabled             = coalesce((p_patch ->> 'approvals_enabled')::boolean, v_before.approvals_enabled),
        allow_self_approve_when_alone = coalesce((p_patch ->> 'allow_self_approve_when_alone')::boolean, v_before.allow_self_approve_when_alone),
        enforce_named_roles           = coalesce((p_patch ->> 'enforce_named_roles')::boolean, v_before.enforce_named_roles),
        mint_threshold                = coalesce((p_patch ->> 'mint_threshold')::numeric, v_before.mint_threshold),
        fund_threshold                = coalesce((p_patch ->> 'fund_threshold')::numeric, v_before.fund_threshold),
        cashout_threshold             = coalesce((p_patch ->> 'cashout_threshold')::numeric, v_before.cashout_threshold),
        approval_ttl_minutes          = coalesce((p_patch ->> 'approval_ttl_minutes')::int, v_before.approval_ttl_minutes),
        updated_by                    = p_updated_by,
        updated_at                    = now()
  where id
  returning * into v_after;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_updated_by,
      p_action        := 'operator.set_policy',
      p_target_type   := 'operator_policy',
      p_target_id     := 'singleton',
      p_details       := jsonb_build_object('patch', p_patch, 'admin_manage_holders', v_holders),
      p_before_state  := to_jsonb(v_before),
      p_after_state   := to_jsonb(v_after),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_operator_set_policy audit failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'policy', to_jsonb(v_after));
end
$fn$;

revoke all on function public.fn_ca_operator_set_policy(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_set_policy(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Request an approval, with an exact idempotent branch
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.5. The threshold comparison, the
-- idempotent branch, the insert and the decided_at column are the four
-- changes; findings H-2, B-2, B-3, M-3, M-5 and L-4.
create or replace function public.fn_ca_operator_request_approval(
  p_kind         text,
  p_payload      jsonb,
  p_requested_by uuid,
  p_amount       numeric,
  p_asset        text,
  p_target_type  text,
  p_target_id    text,
  p_reason       text,
  p_op_id        text,
  p_request_id   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_policy         public.ca_operator_policy%rowtype;
  v_threshold      numeric;
  v_permission     text;
  v_required       boolean := false;
  v_alone          boolean := false;
  v_blocked        text;
  v_status         text;
  v_expires        timestamptz;
  v_id             uuid;
  v_existing       public.ca_operator_approvals%rowtype;
  v_replay         boolean := false;
  v_retry_failed   boolean := false;
  v_mismatch       text[]  := '{}';
begin
  if p_kind is null or p_kind not in ('mint','burn','fund_club','cashout','fleet_policy','sanction') then
    raise exception 'fn_ca_operator_request_approval: unknown kind %', p_kind;
  end if;

  -- Exactly once starts here, not at execution: a retried request with
  -- the same op_id must return the row it already made, never a second
  -- queue entry that a second operator could approve independently.
  if p_op_id is not null then
    select * into v_existing from public.ca_operator_approvals where op_id = p_op_id;
    if found then
      v_replay := true;
    end if;
  end if;

  if v_replay then
    -- ---------------------------------------------------------------
    -- IS THIS EVEN THE SAME OPERATION? (review finding B-3)
    -- ---------------------------------------------------------------
    -- The old body returned the stored row without ever looking at the
    -- parameters, so an approved 500-chip request for one club could be
    -- replayed as 999999 to another club and come back required:false.
    -- IS DISTINCT FROM, so a null matches a null and 500 matches 500.0.
    -- This runs BEFORE the status branch: a laundered replay must not be
    -- able to reach the "cleared to proceed" answer at all.
    if v_existing.kind is distinct from p_kind then
      v_mismatch := v_mismatch || 'kind'::text;
    end if;
    if v_existing.amount is distinct from p_amount then
      v_mismatch := v_mismatch || 'amount'::text;
    end if;
    if v_existing.asset is distinct from p_asset then
      v_mismatch := v_mismatch || 'asset'::text;
    end if;
    if v_existing.target_type is distinct from p_target_type then
      v_mismatch := v_mismatch || 'target_type'::text;
    end if;
    if v_existing.target_id is distinct from p_target_id then
      v_mismatch := v_mismatch || 'target_id'::text;
    end if;

    if array_length(v_mismatch, 1) is not null then
      return jsonb_build_object(
        'ok', false,
        'refused', true,
        -- required stays TRUE on every refusal. approvals.js ANDs this
        -- with its own cached decision, so a refusal that said false
        -- would read as "go" to a caller not yet taught to read `ok`.
        'required', true,
        'error', 'payload_mismatch',
        'reason', 'payload_mismatch',
        'mismatch', to_jsonb(v_mismatch),
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true
      );
    end if;

    -- A pending row that has aged out is closed HERE rather than left to
    -- answer required:true forever, and rather than waiting for somebody
    -- to attempt a decision on it (review finding M-5). The row and the
    -- answer can then never disagree.
    if v_existing.status = 'pending'
       and v_existing.expires_at is not null
       and v_existing.expires_at <= now() then
      update public.ca_operator_approvals
        set status = 'expired'
      where id = v_existing.id
      returning * into v_existing;
    end if;

    -- ---------------------------------------------------------------
    -- WHAT EACH STORED STATUS MEANS (review finding B-2)
    -- ---------------------------------------------------------------
    -- The old body answered required := (status = 'pending'), so
    -- 'rejected' and 'expired' both came back required:false and the
    -- caller moved the money against a refused request.
    if v_existing.status in ('approved', 'auto_approved') then
      -- Cleared to proceed and not yet executed. The only two statuses
      -- that may answer false.
      return jsonb_build_object(
        'ok', true,
        'required', false,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', false
      );
    elsif v_existing.status = 'executed' then
      -- Already done. required:false with already_executed:true, on
      -- purpose and not a refusal: the money RPC's own op_id claim is
      -- what replays from here (fn_ca_mint returns the original result
      -- rather than minting again), so the caller's idempotency does the
      -- work. Refusing would turn a dropped response on a completed mint
      -- into an operator error and invite a manual retry.
      return jsonb_build_object(
        'ok', true,
        'required', false,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', true
      );
    elsif v_existing.status = 'pending' then
      return jsonb_build_object(
        'ok', true,
        'required', true,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', false
      );
    elsif v_existing.status in ('rejected', 'expired') then
      -- A human said no, or the request timed out. Either way this
      -- operation does not proceed under this key. The route maps
      -- refused:true onto a 403 or 409; a caller that only reads
      -- `required` sees true and returns the 202 pending body, which
      -- moves no money either.
      return jsonb_build_object(
        'ok', false,
        'refused', true,
        'required', true,
        'error', case when v_existing.status = 'rejected'
                      then 'approval_rejected' else 'approval_expired' end,
        'reason', case when v_existing.status = 'rejected'
                       then 'approval_rejected' else 'approval_expired' end,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true
      );
    else
      -- 'failed'. The previous attempt moved no money, so the operator
      -- is entitled to try again, and this is a FRESH request: the
      -- policy is read again and the threshold applied again. op_id is
      -- unique, so the existing row is re-opened in place below rather
      -- than duplicated.
      v_retry_failed := true;
    end if;
  end if;

  select * into v_policy from public.ca_operator_policy where id limit 1;
  if not found then
    -- No policy row means no configured control, and the safety rule
    -- says an absent control never blocks a move that works today.
    v_policy.approvals_enabled := false;
    v_policy.allow_self_approve_when_alone := true;
    v_policy.approval_ttl_minutes := 1440;
  end if;

  v_permission := case p_kind
                    when 'cashout' then 'cashier.write'
                    when 'fleet_policy' then 'fleet.write'
                    when 'sanction' then 'moderation.write'
                    else 'money.write'
                  end;

  v_threshold := case p_kind
                   when 'cashout' then coalesce(v_policy.cashout_threshold, 0)
                   when 'fund_club' then coalesce(v_policy.fund_threshold, 0)
                   when 'mint' then coalesce(v_policy.mint_threshold, 0)
                   when 'burn' then coalesce(v_policy.mint_threshold, 0)
                   else 0
                 end;

  if not coalesce(v_policy.approvals_enabled, false) then
    v_required := false;
  elsif p_amount is null then
    -- A kind with no amount (fleet_policy, sanction) has nothing to
    -- compare against a threshold, so with approvals on it always asks.
    v_required := true;
  else
    -- >= AND NOT > (review finding H-2). src/lib/horses/approvals.js
    -- gates at `amt < threshold` (so >= asks), the module comment says
    -- so, the console copy an operator reads says so and the test
    -- asserts it. requireApproval ANDs the two answers, so the looser
    -- one won: a threshold of exactly 1000 let 1000 through unwatched.
    v_required := p_amount >= v_threshold;
  end if;

  if v_required then
    v_alone := not public.fn_ca_operator_has_second_approver(p_requested_by, v_permission);
    if v_alone then
      -- Always recorded, whichever way the rule falls, so the trail
      -- shows the platform was short handed at this moment.
      v_blocked := 'no_second_approver';
      if coalesce(v_policy.allow_self_approve_when_alone, true) then
        v_required := false;
      end if;
    end if;
  end if;

  if v_required then
    v_status  := 'pending';
    v_expires := now() + make_interval(mins => coalesce(v_policy.approval_ttl_minutes, 1440));
  else
    v_status  := 'auto_approved';
    v_expires := null;
  end if;

  if v_retry_failed then
    -- Re-open the failed row under its own key rather than insert a
    -- second row the unique index would reject.
    update public.ca_operator_approvals
      set status         = v_status,
          requested_by   = p_requested_by,
          requested_at   = now(),
          amount         = p_amount,
          asset          = p_asset,
          target_type    = p_target_type,
          target_id      = p_target_id,
          reason         = p_reason,
          payload        = coalesce(p_payload, '{}'::jsonb),
          blocked_reason = v_blocked,
          request_id     = p_request_id,
          expires_at     = v_expires,
          executed_at    = null,
          decided_by     = case when v_status = 'auto_approved' and v_alone then p_requested_by end,
          decided_at     = case when v_status = 'auto_approved' and v_alone then now() end
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.ca_operator_approvals (
      kind, status, requested_by, amount, asset, target_type, target_id,
      reason, payload, op_id, blocked_reason, request_id, expires_at,
      decided_by, decided_at
    ) values (
      p_kind, v_status, p_requested_by, p_amount, p_asset, p_target_type, p_target_id,
      p_reason, coalesce(p_payload, '{}'::jsonb), p_op_id, v_blocked, p_request_id, v_expires,
      -- decided_by is the requester ONLY when the alone rule let them
      -- stand in for a second operator. A plain auto_approved row (the
      -- normal case today, approvals off) has no decider, and saying it
      -- had one would put a self approval in the trail that never
      -- happened.
      case when v_status = 'auto_approved' and v_alone then p_requested_by end,
      -- AND NEITHER DOES IT HAVE A DECISION TIME (review finding L-4).
      -- The old body stamped decided_at = now() on every auto_approved
      -- row, decider or not, which reads to anyone querying the table
      -- later as a decision that happened and whose decider was lost.
      case when v_status = 'auto_approved' and v_alone then now() end
    )
    -- The check above and this insert used to be two statements with
    -- nothing between them but hope (review finding M-3): two requests
    -- with the same op_id both missed the SELECT, both inserted, and the
    -- second raised 23505, which approvals.js reads as "the approval
    -- could not be recorded" and turns into a 503 on what should be a
    -- 202. The partial unique index resolves it now, and the loser
    -- re-reads the winner's row below.
    on conflict (op_id) where op_id is not null do nothing
    returning id into v_id;

    if v_id is null then
      select * into v_existing from public.ca_operator_approvals where op_id = p_op_id;
      if not found then
        raise exception 'fn_ca_operator_request_approval: op_id % conflicted but no row can be read', p_op_id;
      end if;
      -- The winner's row, answered by the same rules as any other
      -- replay. Only the two cleared statuses may say required:false.
      return jsonb_build_object(
        'ok', v_existing.status not in ('rejected', 'expired'),
        'refused', v_existing.status in ('rejected', 'expired'),
        'required', v_existing.status not in ('approved', 'auto_approved', 'executed'),
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', v_existing.status = 'executed',
        'raced', true
      );
    end if;
  end if;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_requested_by,
      p_action        := 'operator.request_approval',
      p_target_type   := coalesce(p_target_type, 'operator_approval'),
      p_target_id     := coalesce(p_target_id, v_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', v_id,
                           'kind', p_kind,
                           'amount', p_amount,
                           'asset', p_asset,
                           'threshold', v_threshold,
                           'required', v_required,
                           'status', v_status,
                           'blocked_reason', v_blocked,
                           'alone_rule_applied', v_alone and not v_required,
                           'approvals_enabled', coalesce(v_policy.approvals_enabled, false),
                           'retried_after_failure', v_retry_failed,
                           'op_id', p_op_id
                         ),
      p_before_state  := null,
      p_after_state   := jsonb_build_object('status', v_status, 'expires_at', v_expires),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := p_request_id
    );
  exception when others then
    raise notice 'fn_ca_operator_request_approval audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'required', v_required,
    'approval_id', v_id,
    'status', v_status,
    'blocked_reason', v_blocked,
    'idempotent', false,
    'already_executed', false,
    'retried_after_failure', v_retry_failed
  );
end
$fn$;

revoke all on function public.fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------
-- 5. Decide an approval, and check the decider may
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.6. Identical except for the permission
-- check (review finding M-2).
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

  -- THE PERMISSION CHECK THIS FUNCTION NEVER HAD (review finding M-2).
  -- pages/api/horses/operator-admin.js gates decide_approval with
  -- requirePermission and its comment claims "The RPC enforces both
  -- again, because the first check is javascript". It enforced the
  -- self-approval rule and not the permission, so any future caller, or
  -- one route bug, approved anything. It sits AFTER the not-found,
  -- already-decided and expired branches on purpose: a decision on a
  -- dead row should say the row is dead, not hide that behind an
  -- authorisation error the operator cannot act on.
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
  if v_self then
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
                 || jsonb_build_object('decision_note', p_note, 'self_approved_alone', v_self and v_alone)
  where id = p_approval_id
  returning * into v_row;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_decided_by,
      p_action        := 'operator.decide_approval',
      p_target_type   := coalesce(v_row.target_type, 'operator_approval'),
      p_target_id     := coalesce(v_row.target_id, p_approval_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', p_approval_id,
                           'kind', v_row.kind,
                           'decision', v_decision,
                           'note', p_note,
                           'permission', v_permission,
                           'self_approved_alone', v_self and v_alone,
                           'alone_rule_applied', v_self and v_alone
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
    'self_approved_alone', v_self and v_alone
  );
end
$fn$;

revoke all on function public.fn_ca_operator_decide_approval(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_decide_approval(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 6. Assertions
-- ---------------------------------------------------------------------
-- These do not read the file, they call the functions the database now
-- holds, with synthetic rows, and then throw all of it away.
--
-- HOW THE ROLLBACK WORKS. The probe body is an inner BEGIN ... EXCEPTION
-- block, which is a subtransaction: the sentinel exception raised at the
-- end of it undoes every row the probe wrote, including the policy
-- changes and any admin_audit_log rows, while plpgsql VARIABLES keep
-- their values because they are not transactional. So the checks run
-- against real writes and nothing survives them. The handler re-raises
-- anything that is not the sentinel, so a failed check still aborts this
-- migration. The final block re-reads the policy row and asserts it is
-- byte for byte what it was before the probe.
--
-- Every synthetic actor is a version 4 uuid in a block no real Supabase
-- user can occupy, the same block docs/horses/PHASE2-SIM.sql uses:
-- 00000000-0000-4000-8000-0000000000xx. Nothing here writes to profiles.

do $assert$
declare
  c_maker   constant uuid := '00000000-0000-4000-8000-000000000011';
  c_checker constant uuid := '00000000-0000-4000-8000-000000000012';

  v_before_policy jsonb;
  v_after_policy  jsonb;
  v_res           jsonb;
  v_id            uuid;
  v_legacy        uuid;
  v_grant         uuid;
  v_perms         jsonb;
  v_grant_holders int;
  v_decided_at    timestamptz;
  v_decided_by    uuid;
  v_count         int;
begin
  select to_jsonb(p) into v_before_policy from public.ca_operator_policy p where p.id;

  begin
    -- ---------------------------------------------------------------
    -- A known starting state for the probe. Rolled back with the rest.
    -- ---------------------------------------------------------------
    perform public.fn_ca_operator_set_policy(
      jsonb_build_object(
        'approvals_enabled', true,
        'enforce_named_roles', false,
        'allow_self_approve_when_alone', false,
        'mint_threshold', 100,
        'approval_ttl_minutes', 1440
      ),
      c_maker
    );

    -- ---------------------------------------------------------------
    -- H-2. AN AMOUNT EXACTLY AT THE THRESHOLD IS GATED.
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 100, 'chips', 'club', 'assert-club',
      'boundary', 'assert-op-boundary', 'assert-req-boundary'
    );
    if not (v_res ->> 'required')::boolean or (v_res ->> 'status') <> 'pending' then
      raise exception 'ASSERT FAILED (H-2): amount equal to the threshold was not gated: %', v_res;
    end if;

    -- Under it still proceeds. A threshold is a threshold, not a stop.
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 99, 'chips', 'club', 'assert-club',
      'under', 'assert-op-under', 'assert-req-under'
    );
    if (v_res ->> 'required')::boolean then
      raise exception 'ASSERT FAILED (H-2): 99 under a threshold of 100 was gated: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- L-4. AN auto_approved ROW WITH NO DECIDER HAS NO DECISION TIME.
    -- ---------------------------------------------------------------
    select decided_at, decided_by into v_decided_at, v_decided_by
    from public.ca_operator_approvals where op_id = 'assert-op-under';
    if v_decided_by is null and v_decided_at is not null then
      raise exception 'ASSERT FAILED (L-4): decided_at % with no decider', v_decided_at;
    end if;

    -- ---------------------------------------------------------------
    -- B-2. A PENDING ROW REPLAYS AS required:true.
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 100, 'chips', 'club', 'assert-club',
      'boundary', 'assert-op-boundary', 'assert-req-boundary-2'
    );
    if not (v_res ->> 'required')::boolean or not (v_res ->> 'idempotent')::boolean then
      raise exception 'ASSERT FAILED (B-2): a pending replay did not answer required:true: %', v_res;
    end if;
    select count(*) into v_count from public.ca_operator_approvals where op_id = 'assert-op-boundary';
    if v_count <> 1 then
      raise exception 'ASSERT FAILED (M-3): op_id assert-op-boundary produced % rows', v_count;
    end if;

    -- ---------------------------------------------------------------
    -- B-3. A REPLAY WITH DIFFERENT MATERIAL FIELDS IS REFUSED.
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 999999, 'chips', 'club', 'other-club',
      'laundered', 'assert-op-boundary', 'assert-req-laundered'
    );
    if not coalesce((v_res ->> 'required')::boolean, false)
       or (v_res ->> 'error') <> 'payload_mismatch'
       or (v_res ->> 'ok')::boolean then
      raise exception 'ASSERT FAILED (B-3): a laundered replay was not refused: %', v_res;
    end if;
    if not ((v_res -> 'mismatch') @> '["amount"]'::jsonb)
       or not ((v_res -> 'mismatch') @> '["target_id"]'::jsonb) then
      raise exception 'ASSERT FAILED (B-3): the refusal does not name the fields that differ: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- B-2. A REJECTED ROW REPLAYS AS A REFUSAL, NEVER required:false.
    -- ---------------------------------------------------------------
    select id into v_id from public.ca_operator_approvals where op_id = 'assert-op-boundary';
    update public.ca_operator_approvals set status = 'rejected', decided_by = c_checker, decided_at = now()
    where id = v_id;

    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 100, 'chips', 'club', 'assert-club',
      'boundary', 'assert-op-boundary', 'assert-req-after-reject'
    );
    if (v_res ->> 'ok')::boolean
       or (v_res ->> 'error') <> 'approval_rejected'
       or not (v_res ->> 'required')::boolean then
      raise exception 'ASSERT FAILED (B-2): a rejected row did not refuse on retry: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- B-2. AN EXPIRED ROW REFUSES, AND A TIMED-OUT PENDING ROW IS
    -- CLOSED ON SIGHT RATHER THAN ANSWERING FOREVER (M-5).
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 500, 'chips', 'club', 'assert-club',
      'ttl', 'assert-op-ttl', 'assert-req-ttl'
    );
    v_id := (v_res ->> 'approval_id')::uuid;
    update public.ca_operator_approvals set expires_at = now() - interval '1 minute' where id = v_id;

    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 500, 'chips', 'club', 'assert-club',
      'ttl', 'assert-op-ttl', 'assert-req-ttl-2'
    );
    if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'approval_expired' then
      raise exception 'ASSERT FAILED (B-2/M-5): an aged out row did not refuse on retry: %', v_res;
    end if;
    if (select status from public.ca_operator_approvals where id = v_id) <> 'expired' then
      raise exception 'ASSERT FAILED (M-5): the aged out row was not marked expired';
    end if;

    -- ---------------------------------------------------------------
    -- B-2. AN EXECUTED ROW ANSWERS required:false WITH already_executed.
    -- ---------------------------------------------------------------
    update public.ca_operator_approvals set status = 'executed', executed_at = now()
    where op_id = 'assert-op-under';
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 99, 'chips', 'club', 'assert-club',
      'under', 'assert-op-under', 'assert-req-under-2'
    );
    if (v_res ->> 'required')::boolean or not (v_res ->> 'already_executed')::boolean then
      raise exception 'ASSERT FAILED (B-2): an executed row did not answer already_executed: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- B-2. A failed ROW IS A FRESH REQUEST UNDER THE SAME KEY.
    -- ---------------------------------------------------------------
    update public.ca_operator_approvals set status = 'failed' where op_id = 'assert-op-ttl';
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_maker, 500, 'chips', 'club', 'assert-club',
      'ttl', 'assert-op-ttl', 'assert-req-ttl-3'
    );
    if (v_res ->> 'idempotent')::boolean or not (v_res ->> 'retried_after_failure')::boolean then
      raise exception 'ASSERT FAILED (B-2): a failed row was not treated as a fresh request: %', v_res;
    end if;
    select count(*) into v_count from public.ca_operator_approvals where op_id = 'assert-op-ttl';
    if v_count <> 1 then
      raise exception 'ASSERT FAILED (B-2): re-opening a failed row made % rows', v_count;
    end if;

    -- ---------------------------------------------------------------
    -- M-4. A REPEATED GRANT IS IDEMPOTENT, NOT A UNIQUE VIOLATION.
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_grant(c_checker, 'finance', c_maker, 'assertion probe');
    v_grant := (v_res ->> 'grant_id')::uuid;
    v_res := public.fn_ca_operator_grant(c_checker, 'finance', c_maker, 'assertion probe again');
    if not (v_res ->> 'already')::boolean or (v_res ->> 'grant_id')::uuid <> v_grant then
      raise exception 'ASSERT FAILED (M-4): a repeated grant was not idempotent: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- M-2. A DECIDER WITHOUT THE PERMISSION IS REFUSED.
    -- c_maker holds no grant and no profile role, so it resolves no
    -- permissions at all.
    -- ---------------------------------------------------------------
    v_res := public.fn_ca_operator_request_approval(
      'mint', '{}'::jsonb, c_checker, 500, 'chips', 'club', 'assert-club',
      'permission probe', 'assert-op-perm', 'assert-req-perm'
    );
    v_id := (v_res ->> 'approval_id')::uuid;
    if (v_res ->> 'status') <> 'pending' then
      raise exception 'ASSERT FAILED (M-2): the probe needs a pending row, got %', v_res;
    end if;
    v_res := public.fn_ca_operator_decide_approval(v_id, 'approve', c_maker, 'no permission');
    if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'permission_denied' then
      raise exception 'ASSERT FAILED (M-2): a decider without money.write was allowed: %', v_res;
    end if;

    -- ---------------------------------------------------------------
    -- H-4, PART 1. A LEGACY ACCOUNT KEEPS admin.manage UNDER
    -- ENFORCEMENT EVEN WHEN ITS ONLY GRANT IS read_only.
    -- ---------------------------------------------------------------
    select p.id into v_legacy
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy
    limit 1;

    if v_legacy is null then
      raise notice 'ASSERT SKIPPED (H-4): no legacy operator account on this database';
    else
      perform public.fn_ca_operator_grant(v_legacy, 'read_only', c_maker, 'assertion probe');
      perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', true), c_maker);
      v_perms := public.fn_ca_operator_permissions(v_legacy) -> 'permissions';
      if not (v_perms @> '["admin.manage"]'::jsonb) then
        raise exception 'ASSERT FAILED (H-4): enforcement stripped admin.manage from a legacy account: %', v_perms;
      end if;
      perform public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', false), c_maker);
    end if;

    -- ---------------------------------------------------------------
    -- H-4, PART 2. set_policy REFUSES A LOCKOUT.
    -- The zero-holder world is made by clearing is_legacy inside this
    -- subtransaction, which is rolled back with everything else. It
    -- touches only a Phase 2 table; profiles is never written.
    -- ---------------------------------------------------------------
    select count(*) into v_grant_holders
    from public.ca_operator_grants g
    join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
    where g.revoked_at is null and rp.permission = 'admin.manage';

    if v_grant_holders > 0 then
      raise notice 'ASSERT SKIPPED (H-4 part 2): % active grant(s) carry admin.manage, so the zero-holder world cannot be staged',
        v_grant_holders;
    else
      update public.ca_operator_roles set is_legacy = false where is_legacy;
      v_res := public.fn_ca_operator_set_policy(jsonb_build_object('enforce_named_roles', true), c_maker);
      if (v_res ->> 'ok')::boolean or (v_res ->> 'error') <> 'enforce_named_roles_would_lock_out' then
        raise exception 'ASSERT FAILED (H-4): set_policy committed a lockout: %', v_res;
      end if;
      if (select enforce_named_roles from public.ca_operator_policy where id) then
        raise exception 'ASSERT FAILED (H-4): the refused patch was written anyway';
      end if;
    end if;

    raise exception 'ROLLBACK_PROBE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_PROBE' then
      raise;
    end if;
  end;

  -- Nothing the probe wrote survived, including the policy edits.
  select to_jsonb(p) into v_after_policy from public.ca_operator_policy p where p.id;
  if v_after_policy is distinct from v_before_policy then
    raise exception 'ASSERT FAILED: the probe changed the policy row and it was not rolled back: % -> %',
      v_before_policy, v_after_policy;
  end if;

  select count(*) into v_count from public.ca_operator_approvals where op_id like 'assert-op-%';
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: % probe approval row(s) survived the rollback', v_count;
  end if;

  select count(*) into v_count
  from public.ca_operator_grants
  where user_id in ('00000000-0000-4000-8000-000000000011'::uuid, '00000000-0000-4000-8000-000000000012'::uuid);
  if v_count <> 0 then
    raise exception 'ASSERT FAILED: % probe grant row(s) survived the rollback', v_count;
  end if;

  select count(*) into v_count from public.ca_operator_roles where is_legacy;
  if v_count = 0 then
    raise exception 'ASSERT FAILED: the probe cleared is_legacy and it was not rolled back';
  end if;

  raise notice 'ASSERT OK: the approval gate is exact, the recovery hatch holds, and no probe row survived.';
end
$assert$;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- There is nothing to drop: this file creates no object. Every statement
-- in it is a CREATE OR REPLACE of a function that already existed, with
-- the same signature and the same ACL, so undoing it means putting the
-- PREVIOUS DEFINITION of each one back.
--
-- THE PREVIOUS DEFINITIONS, ALL FIVE, ARE IN THE REPOSITORY, UNMODIFIED,
-- in supabase/migrations/20260903120000_ca_operator_rbac_and_approvals.sql:
--
--   fn_ca_operator_permissions(uuid)               section 5.1
--   fn_ca_operator_grant(uuid, text, uuid, text)   section 5.2
--   fn_ca_operator_set_policy(jsonb, uuid)         section 5.4
--   fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text,
--     text, text, text, text, text)                section 5.5
--   fn_ca_operator_decide_approval(uuid, text, uuid, text)  section 5.6
--
-- To roll back: copy those five CREATE OR REPLACE blocks out of that
-- file VERBATIM, together with their REVOKE and GRANT lines, and run
-- them in one transaction. Do not reconstruct them from memory or from
-- this file: this file's bodies differ from them on purpose.
--
-- READ THIS BEFORE YOU DO. Rolling back restores, in order: an approval
-- gate that answers required:false for a REJECTED request (B-2), one
-- that never compares a replay's amount or target against the row it is
-- replaying (B-3), a threshold that lets an amount exactly equal to it
-- through unwatched (H-2), and an enforcement flag that can strip
-- admin.manage from the last account able to turn it off (H-4). None of
-- those can hurt production while ca_operator_policy.approvals_enabled
-- is false, which is the only reason this is a rollback anyone could
-- survive. If the reason for rolling back is that something in this file
-- misbehaves under approvals, turn approvals_enabled OFF first: that is
-- faster, it is one row, and it stops the gate without restoring the
-- holes.
-- =====================================================================
