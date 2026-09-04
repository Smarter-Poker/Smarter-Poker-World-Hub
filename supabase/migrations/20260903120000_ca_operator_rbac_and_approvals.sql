-- =====================================================================
-- Phase 2: operator RBAC, maker-checker approvals and the audit trail
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
-- Contract: docs/horses/PHASE2-CONTRACTS.md sections 0 and 1.
--
-- WHAT THIS IS
-- Five new tables and ten SECURITY DEFINER functions that give the
-- /horses operator console named roles, per role permission sets,
-- revocable grants, a single policy row, and a maker-checker queue.
-- Contract section 1 names eight of the ten. The two extras are
-- fn_ca_operator_set_policy, which the console's `set_policy` action
-- needs and section 1 forgot to list, and
-- fn_ca_operator_has_second_approver, the single copy of the alone rule
-- that the request and decide functions both call.
-- Nothing existing is altered. Every object here is new, so no GRANT,
-- REVOKE or RLS statement in this file can take away access anybody
-- holds today. That is contract section 0, which outranks the rest.
--
-- WHY APPROVALS DEFAULT TO OFF
-- Production has exactly three operator accounts: one `god` and two
-- `admin`. Four eyes needs two pairs. Ship maker-checker switched on
-- and the very first mint above the threshold parks itself in a queue
-- that the only operator on duty is forbidden to clear, which stops
-- chips moving on a live platform to enforce a control nobody asked
-- for yet. So `ca_operator_policy.approvals_enabled` is false and
-- `enforce_named_roles` is false: today a request records an
-- `auto_approved` row and proceeds exactly as it does now, and the
-- three legacy roles keep every permission. Dan flips the flags when
-- there are enough operators for them to mean something.
--
-- THE ALONE RULE, EXACTLY
-- `allow_self_approve_when_alone` defaults to true. It only ever
-- matters when `approvals_enabled` is true. An eligible approver is a
-- distinct user OTHER than the requester who resolves the permission
-- the request's kind needs (money.write for mint, burn and fund_club;
-- cashier.write for cashout; fleet.write for fleet_policy;
-- moderation.write for sanction). While `enforce_named_roles` is
-- false, legacy role holders count as eligible approvers, so in
-- production today there are three of them and the alone rule never
-- fires. Once `enforce_named_roles` is true, only holders of an active
-- named grant count, because under enforcement a nominated approver is
-- what four eyes means. When no eligible approver exists:
--   * the approval row always records blocked_reason
--     'no_second_approver', whichever way the rule falls, so the trail
--     shows the platform was short handed;
--   * with allow_self_approve_when_alone true the request is written
--     `auto_approved`, `required` comes back false and the caller
--     proceeds. The audit row carries alone_rule_applied true;
--   * with it false the request stays `pending` and `required` is
--     true. That is a deliberate stop, and it is the one setting in
--     this file that can hold a money move, which is why it is opt in.
-- The same test governs a decision: `fn_ca_operator_decide_approval`
-- refuses a self decision unless the requester is genuinely alone and
-- the rule allows it.
--
-- WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF
-- POST-BUILD CORRECTION, 2026-09-03. Every other function in this file
-- files an admin_audit_log row, and fn_ca_operator_permissions used to as
-- well. It is the one that must not. It is a READ, not a change, and it
-- runs on EVERY console request behind a 30 second per-lambda cache: at
-- three operators working a console that polls, that is thousands of
-- `operator.permissions.resolve` rows a day in a table that held nine
-- rows in its first five months. The trail would not be enriched by
-- that, it would be buried by it, and the Audit tab's whole job is to
-- make a real action findable. The route that called it already writes
-- one row for the request, naming the operator, the action and the
-- request id, so nothing about who resolved what is lost. Contract
-- section 1 said "every RPC writes its own admin_audit_log row"; the
-- contract file has been edited to record this exception.
--
-- ROW LEVEL SECURITY
-- RLS is ENABLED on all five tables and NO policy is created for anon
-- or authenticated. service_role bypasses RLS, so the console's
-- service role client is the only reader and writer. A browser holding
-- a user JWT sees zero rows, which is the point: these tables say who
-- can move money and which moves are waiting.
--
-- LOCKING
-- Every DDL statement here creates a new object, so nothing contends
-- with live traffic. The one exception is the optional index on
-- admin_audit_log, which is a hot table: it is wrapped in a DO block
-- with its own exception handler so a lock timeout downgrades to a
-- notice instead of aborting a migration that is otherwise harmless.
--
-- VERIFIED BEFORE APPLYING
-- Applied to a throwaway PostgreSQL cluster against a stub of the four
-- objects it reads (profiles, admin_audit_log, auth.users,
-- fn_log_admin_action) seeded with production's shape of one god and two
-- admins. Confirmed there: the file applies clean, both assertion blocks
-- pass, applying it twice changes no row, the pasted ROLLBACK below
-- executes in the order it is written, anon and authenticated hold no
-- privilege on any of the five tables or ten functions, and
-- docs/horses/PHASE2-SIM.sql passes every step. Also confirmed the
-- section 0 guarantee directly: with fn_log_admin_action DROPPED,
-- fn_ca_operator_permissions still returns all 21 permissions and a
-- grant still succeeds. A broken audit trail raises a notice. It can
-- never lock an operator out.
-- =====================================================================

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- The role vocabulary. `rank` is a sort order for the console, widest
-- first (highest number first), matching ROLE_META in
-- src/lib/horses/permissions.js so the Staff tab sorts the same whether
-- it renders from the module or from this table. It is NOT a privilege
-- ladder: permission checks never compare ranks, they ask
-- ca_operator_role_permissions.
create table if not exists public.ca_operator_roles (
  key         text primary key,
  label       text not null,
  description text,
  rank        int not null default 100,
  is_legacy   boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.ca_operator_roles is
  'Named operator roles plus the three legacy profile roles. Additive: a role here never removes access.';

-- Role to permission. Strings come from src/lib/horses/permissions.js so
-- a route can keep asking for a permission and never for a role.
create table if not exists public.ca_operator_role_permissions (
  role_key   text not null references public.ca_operator_roles (key) on delete cascade,
  permission text not null,
  primary key (role_key, permission)
);

comment on table public.ca_operator_role_permissions is
  'The permission vocabulary, mirrored from src/lib/horses/permissions.js plus admin.manage.';

-- A revoked grant is kept forever: the question the console has to be
-- able to answer is "who could do this in March", and a deleted row
-- cannot answer it.
create table if not exists public.ca_operator_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  role_key   text not null references public.ca_operator_roles (key),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  reason     text,
  note       text,
  -- A revoker without a revocation time is a half written revoke, and a
  -- half written revoke reads as an active grant.
  constraint ca_operator_grants_revocation_complete
    check (revoked_by is null or revoked_at is not null)
);

comment on table public.ca_operator_grants is
  'Named role grants. Never deleted: a revoke stamps revoked_at and keeps the history.';
comment on column public.ca_operator_grants.reason is 'Why the grant was made.';
comment on column public.ca_operator_grants.note is 'Why the grant was revoked.';

-- Exactly one row, forced by the boolean primary key with a check that
-- it is true. Two policy rows is the failure mode where half the code
-- reads approvals on and half reads it off.
create table if not exists public.ca_operator_policy (
  id                             boolean primary key default true check (id),
  approvals_enabled              boolean not null default false,
  allow_self_approve_when_alone  boolean not null default true,
  enforce_named_roles            boolean not null default false,
  mint_threshold                 numeric not null default 0,
  fund_threshold                 numeric not null default 0,
  cashout_threshold              numeric not null default 0,
  approval_ttl_minutes           int not null default 1440 check (approval_ttl_minutes > 0),
  updated_by                     uuid,
  updated_at                     timestamptz not null default now()
);

comment on table public.ca_operator_policy is
  'Single row. Safe defaults: approvals off, enforcement off, alone rule on, thresholds 0, TTL 1440 minutes.';

create table if not exists public.ca_operator_approvals (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('mint','burn','fund_club','cashout','fleet_policy','sanction')),
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected','executed','expired','auto_approved','failed')),
  requested_by   uuid,
  requested_at   timestamptz not null default now(),
  decided_by     uuid,
  decided_at     timestamptz,
  executed_at    timestamptz,
  expires_at     timestamptz,
  amount         numeric,
  asset          text,
  target_type    text,
  target_id      text,
  reason         text,
  payload        jsonb not null default '{}'::jsonb,
  op_id          text,
  result         jsonb,
  blocked_reason text,
  request_id     text
);

comment on table public.ca_operator_approvals is
  'Maker-checker queue. A row is written even when approvals are off (status auto_approved) so the trail is complete.';
comment on column public.ca_operator_approvals.op_id is
  'Caller supplied idempotency key. Unique where not null so an approved request executes exactly once.';

-- ---------------------------------------------------------------------
-- 2. Indexes for the queries the console actually runs
-- ---------------------------------------------------------------------

-- One active grant per (user, role). A revoked row does not block a
-- fresh grant of the same role later.
create unique index if not exists ca_operator_grants_active_uq
  on public.ca_operator_grants (user_id, role_key)
  where revoked_at is null;

-- Resolving a caller's permissions reads this on every console request.
create index if not exists ca_operator_grants_user_active_idx
  on public.ca_operator_grants (user_id)
  where revoked_at is null;

-- "Who holds finance" and the grant history count on the Staff tab.
create index if not exists ca_operator_grants_role_idx
  on public.ca_operator_grants (role_key, granted_at desc);

-- The permission matrix is read column first as often as row first.
create index if not exists ca_operator_role_permissions_permission_idx
  on public.ca_operator_role_permissions (permission);

-- Exactly once execution. Partial so the many null op_ids do not collide.
create unique index if not exists ca_operator_approvals_op_id_uq
  on public.ca_operator_approvals (op_id)
  where op_id is not null;

-- The Approvals tab's pending queue, oldest first, is the hot read.
create index if not exists ca_operator_approvals_pending_idx
  on public.ca_operator_approvals (requested_at)
  where status = 'pending';

-- History with the kind and status filters the tab offers.
create index if not exists ca_operator_approvals_kind_status_idx
  on public.ca_operator_approvals (kind, status, requested_at desc);

-- "What is waiting on this club" and the per record trail.
create index if not exists ca_operator_approvals_target_idx
  on public.ca_operator_approvals (target_type, target_id, requested_at desc);

-- "Requests I raised", which is what greys the buttons out for a maker.
create index if not exists ca_operator_approvals_requested_by_idx
  on public.ca_operator_approvals (requested_by, requested_at desc);

-- The audit trail lookup is (target_type, target_id) newest first, and
-- admin_audit_log has no such index today. It is a hot table, so a lock
-- timeout here must not abort the whole migration: the trail still
-- works without the index, it is only slower.
do $idx$
begin
  -- A bounded wait, so a busy writer costs this migration four seconds and a
  -- notice rather than blocking behind a lock for as long as the writer runs.
  set local lock_timeout = '4s';
  execute 'create index if not exists admin_audit_log_target_idx '
       || 'on public.admin_audit_log (target_type, target_id, created_at desc)';
exception when others then
  raise notice 'admin_audit_log_target_idx not created (%). The audit trail RPC still works, unindexed.', sqlerrm;
end
$idx$;

-- ---------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------
-- Enabled with NO policy for anon or authenticated on purpose. Nobody
-- reaches these tables through a user JWT; service_role bypasses RLS
-- and the console's server side client is the only caller. Removing
-- privileges from tables created moments ago in this same file takes
-- nothing away from anyone, which keeps contract section 0 intact.

alter table public.ca_operator_roles            enable row level security;
alter table public.ca_operator_role_permissions enable row level security;
alter table public.ca_operator_grants           enable row level security;
alter table public.ca_operator_policy           enable row level security;
alter table public.ca_operator_approvals        enable row level security;

revoke all on public.ca_operator_roles            from public, anon, authenticated;
revoke all on public.ca_operator_role_permissions from public, anon, authenticated;
revoke all on public.ca_operator_grants           from public, anon, authenticated;
revoke all on public.ca_operator_policy           from public, anon, authenticated;
revoke all on public.ca_operator_approvals        from public, anon, authenticated;

grant select, insert, update, delete on public.ca_operator_roles            to service_role;
grant select, insert, update, delete on public.ca_operator_role_permissions to service_role;
grant select, insert, update, delete on public.ca_operator_grants           to service_role;
grant select, insert, update, delete on public.ca_operator_policy           to service_role;
grant select, insert, update, delete on public.ca_operator_approvals        to service_role;

-- ---------------------------------------------------------------------
-- 4. Seeds
-- ---------------------------------------------------------------------

-- Labels, descriptions and ranks are the same strings ROLE_META carries
-- in src/lib/horses/permissions.js. The console renders the permission
-- matrix from the module before this migration is applied and from this
-- table afterwards, and two spellings of the same role is how a reader
-- ends up believing the matrix changed when only the source did.
insert into public.ca_operator_roles (key, label, description, rank, is_legacy) values
  ('god',        'God',         'Legacy Platform Owner. Every Permission.',                                 100, true),
  ('superadmin', 'Super Admin', 'Legacy Platform Admin. Every Permission.',                                 90,  true),
  ('admin',      'Admin',       'Legacy Console Admin. Every Permission.',                                  80,  true),
  ('owner',      'Owner',       'Named Equivalent Of The Legacy Roles. Manages Operators And Policy.',      70,  false),
  ('operations', 'Operations',  'Fleet, Clubs, Content And Settings. No Money Writes.',                     60,  false),
  ('finance',    'Finance',     'The Mint, The Cashier And Club Treasuries.',                               50,  false),
  ('compliance', 'Compliance',  'Reads Everything, Sanctions Players, Handles Erasure Requests.',           40,  false),
  ('support',    'Support',     'Tickets And Player Records.',                                              30,  false),
  ('read_only',  'Read Only',   'Sees The Console, Changes Nothing.',                                       10,  false)
on conflict (key) do nothing;

-- owner and the three legacy roles hold EVERY permission. The legacy
-- three must, or Phase 2 narrows the only accounts production has.
insert into public.ca_operator_role_permissions (role_key, permission)
select r.role_key, p.permission
from (values ('owner'), ('god'), ('superadmin'), ('admin')) as r (role_key)
cross join (values
  ('console.read'),
  ('audit.read'),
  ('fleet.read'),
  ('fleet.write'),
  ('players.read'),
  ('players.write'),
  ('support.write'),
  ('moderation.write'),
  ('clubs.read'),
  ('clubs.write'),
  ('money.read'),
  ('money.write'),
  ('cashier.write'),
  ('promo.write'),
  ('catalog.write'),
  ('content.write'),
  ('settings.write'),
  ('avatars.generate'),
  ('gdpr.erase'),
  ('sql.execute'),
  -- New in Phase 2. Gates grant_role, revoke_role and set_policy, so it
  -- is held by owner and the legacy three and by nobody else.
  ('admin.manage')
) as p (permission)
on conflict (role_key, permission) do nothing;

-- The five narrower roles.
--
-- THESE SETS ARE COPIED FROM ROLE_PERMISSIONS IN
-- src/lib/horses/permissions.js AND MUST MATCH IT EXACTLY, ROLE FOR ROLE
-- AND PERMISSION FOR PERMISSION. That module is the single source of
-- truth: routes ask it what a role carries, the resolver merges from it
-- before this table exists, and the Staff tab renders the permission
-- matrix from it. A seed that disagrees does not make the console
-- safer, it makes the matrix a lie - the screen that tells an operator
-- what `finance` can do would be describing a different `finance` from
-- the one the server enforces.
--
-- An earlier draft of this file seeded each role a little narrower than
-- the module on the theory that narrow is the safe direction. It is not
-- safe here, for two reasons. While enforce_named_roles is false a grant
-- is purely additive, so a wider seed still cannot take anything away
-- from anybody; and once enforcement is on, a narrow seed is the thing
-- that WOULD narrow somebody - an operator granted `operations` would
-- silently lose the six permissions the matrix had promised them.
-- __tests__/horses-phase2-migration.test.mjs parses ROLE_PERMISSIONS out
-- of the module and asserts this block equals it, so the two cannot
-- drift again.
--
-- Every named role starts from the module's READ_FLOOR (console.read,
-- audit.read, fleet.read, players.read, clubs.read): seeing the console
-- is not itself a privileged act, and a role that cannot read the tab it
-- works in is a role nobody can use.
insert into public.ca_operator_role_permissions (role_key, permission) values
  -- operations: runs the platform day to day. No money write, no sql.execute.
  ('operations', 'console.read'),
  ('operations', 'audit.read'),
  ('operations', 'fleet.read'),
  ('operations', 'players.read'),
  ('operations', 'clubs.read'),
  ('operations', 'fleet.write'),
  ('operations', 'players.write'),
  ('operations', 'clubs.write'),
  ('operations', 'support.write'),
  ('operations', 'moderation.write'),
  ('operations', 'content.write'),
  ('operations', 'settings.write'),
  ('operations', 'catalog.write'),
  ('operations', 'promo.write'),
  ('operations', 'avatars.generate'),
  ('operations', 'money.read'),

  -- finance: the Mint, the cashier and the club treasuries.
  ('finance', 'console.read'),
  ('finance', 'audit.read'),
  ('finance', 'fleet.read'),
  ('finance', 'players.read'),
  ('finance', 'clubs.read'),
  ('finance', 'money.read'),
  ('finance', 'money.write'),
  ('finance', 'cashier.write'),
  ('finance', 'clubs.write'),
  ('finance', 'promo.write'),

  -- compliance: reads everything, sanctions players, erases on request.
  ('compliance', 'console.read'),
  ('compliance', 'audit.read'),
  ('compliance', 'fleet.read'),
  ('compliance', 'players.read'),
  ('compliance', 'clubs.read'),
  ('compliance', 'money.read'),
  ('compliance', 'moderation.write'),
  ('compliance', 'players.write'),
  ('compliance', 'gdpr.erase'),

  -- support: the help desk.
  ('support', 'console.read'),
  ('support', 'audit.read'),
  ('support', 'fleet.read'),
  ('support', 'players.read'),
  ('support', 'clubs.read'),
  ('support', 'support.write'),
  ('support', 'players.write'),

  -- read_only: sees the console, changes nothing.
  ('read_only', 'console.read'),
  ('read_only', 'audit.read'),
  ('read_only', 'fleet.read'),
  ('read_only', 'players.read'),
  ('read_only', 'clubs.read'),
  ('read_only', 'money.read')
on conflict (role_key, permission) do nothing;

-- The single policy row. Every column takes its default, which is the
-- safe state described in the header.
insert into public.ca_operator_policy (id) values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------
-- All SECURITY DEFINER with a pinned search_path, all revoked from
-- public, anon and authenticated and granted only to service_role, so
-- this file is ACL self contained and a branch merge cannot leave a
-- function reachable from a browser.
--
-- Every function files its own admin_audit_log row through
-- fn_log_admin_action, and every one of those calls sits inside its own
-- exception block. An audit write must never turn a completed change
-- into an error, and it must never be able to lock an operator out of
-- permission resolution. That is the same rule
-- src/lib/horses/operatorAudit.js follows on the server.

-- 5.1 Resolve a caller's permissions ----------------------------------
--
-- The union rule: while enforce_named_roles is false the legacy profile
-- role always contributes its full set, so a grant can only widen.
-- With enforcement on, an operator who holds at least one active named
-- grant is described by those grants alone, which is how a revoke
-- finally narrows. An operator with NO grants at all keeps the legacy
-- set even under enforcement: flipping the flag must not be able to
-- orphan the platform, and Dan grants before he enforces.
create or replace function public.fn_ca_operator_permissions(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_profile_role  text;
  v_enforce       boolean := false;
  v_legacy        text[]  := '{}';
  v_granted       text[]  := '{}';
  v_granted_roles text[]  := '{}';
  v_permissions   text[]  := '{}';
  v_roles         text[]  := '{}';
  v_source        text;
begin
  if p_user_id is null then
    return jsonb_build_object('role', null, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb, 'source', 'none');
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

  -- NO AUDIT ROW IS WRITTEN HERE, DELIBERATELY. This is a READ, it runs
  -- on every console request behind a 30 second cache, and the route that
  -- called it already files one audit row for the request itself. See
  -- WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF in the header.
  return jsonb_build_object(
    'role', v_profile_role,
    'roles', to_jsonb(coalesce(v_roles, '{}'::text[])),
    'permissions', to_jsonb(coalesce(v_permissions, '{}'::text[])),
    'source', v_source
  );
end
$fn$;

revoke all on function public.fn_ca_operator_permissions(uuid) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_permissions(uuid) to service_role;

-- 5.2 Grant a named role ----------------------------------------------
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

  -- Idempotent. Re-granting an active role returns the existing row
  -- rather than tripping the partial unique index, because the console
  -- retries and a retry must not read as a failure.
  select id into v_grant_id
  from public.ca_operator_grants
  where user_id = p_user_id
    and role_key = p_role_key
    and revoked_at is null
  limit 1;

  if v_grant_id is not null then
    v_already := true;
  else
    insert into public.ca_operator_grants (user_id, role_key, granted_by, reason)
    values (p_user_id, p_role_key, p_granted_by, p_reason)
    returning id into v_grant_id;
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

-- 5.3 Revoke a named role ---------------------------------------------
-- The row is kept. Revoking stamps revoked_at and files the reason in
-- `note`, so the history still answers who could do what and when.
create or replace function public.fn_ca_operator_revoke(
  p_grant_id   uuid,
  p_revoked_by uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row       public.ca_operator_grants%rowtype;
  v_already   boolean := false;
begin
  select * into v_row from public.ca_operator_grants where id = p_grant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'grant_not_found', 'reason', 'grant_not_found', 'grant_id', p_grant_id);
  end if;

  if v_row.revoked_at is not null then
    v_already := true;
  else
    update public.ca_operator_grants
      set revoked_at = now(),
          revoked_by = p_revoked_by,
          note = p_reason
    where id = p_grant_id
    returning * into v_row;
  end if;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_revoked_by,
      p_action        := 'operator.revoke_role',
      p_target_type   := 'operator',
      p_target_id     := v_row.user_id::text,
      p_details       := jsonb_build_object(
                           'grant_id', p_grant_id,
                           'role_key', v_row.role_key,
                           'reason', p_reason,
                           'already_revoked', v_already
                         ),
      p_before_state  := jsonb_build_object('role_key', v_row.role_key, 'revoked_at', null),
      p_after_state   := jsonb_build_object('role_key', v_row.role_key, 'revoked_at', v_row.revoked_at),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_operator_revoke audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'grant_id', p_grant_id,
    'user_id', v_row.user_id,
    'role_key', v_row.role_key,
    'already_revoked', v_already,
    'permissions', (select public.fn_ca_operator_permissions(v_row.user_id) -> 'permissions')
  );
end
$fn$;

revoke all on function public.fn_ca_operator_revoke(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_revoke(uuid, uuid, text) to service_role;

-- 5.4 Set the policy row ----------------------------------------------
-- A jsonb patch rather than nine scalar parameters: adding a knob later
-- would otherwise change the function signature, and an RPC overload
-- change is a Tier 3 migration of its own. Absent keys are left alone.
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
  v_before public.ca_operator_policy%rowtype;
  v_after  public.ca_operator_policy%rowtype;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'fn_ca_operator_set_policy: p_patch must be a json object';
  end if;

  select * into v_before from public.ca_operator_policy where id for update;
  if not found then
    insert into public.ca_operator_policy (id) values (true) returning * into v_before;
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
      p_details       := jsonb_build_object('patch', p_patch),
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

-- 5.5 Request an approval ---------------------------------------------
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
      return jsonb_build_object(
        'required', v_existing.status = 'pending',
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true
      );
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
    v_required := p_amount > v_threshold;
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
    -- had one would put a self approval in the trail that never happened.
    case when v_status = 'auto_approved' and v_alone then p_requested_by end,
    case when v_status = 'auto_approved' then now() end
  )
  returning id into v_id;

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
    'required', v_required,
    'approval_id', v_id,
    'status', v_status,
    'blocked_reason', v_blocked
  );
end
$fn$;

revoke all on function public.fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text, text, text, text, text, text)
  to service_role;

-- 5.6 Decide an approval ----------------------------------------------
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

  select * into v_policy from public.ca_operator_policy where id limit 1;

  v_permission := case v_row.kind
                    when 'cashout' then 'cashier.write'
                    when 'fleet_policy' then 'fleet.write'
                    when 'sanction' then 'moderation.write'
                    else 'money.write'
                  end;

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

-- 5.7 Mark an approval executed ---------------------------------------
-- Exactly once. A second call on an already executed row is a no-op
-- that reports success, because the caller retrying after a dropped
-- response must not be told the money move failed.
create or replace function public.fn_ca_operator_mark_executed(
  p_approval_id uuid,
  p_result      jsonb,
  p_status      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row    public.ca_operator_approvals%rowtype;
  v_status text := coalesce(nullif(lower(p_status), ''), 'executed');
begin
  if v_status not in ('executed', 'failed') then
    raise exception 'fn_ca_operator_mark_executed: status must be executed or failed, got %', p_status;
  end if;

  select * into v_row from public.ca_operator_approvals where id = p_approval_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'approval_not_found', 'reason', 'approval_not_found', 'approval_id', p_approval_id);
  end if;

  if v_row.status = 'executed' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'executed', 'approval_id', p_approval_id);
  end if;

  if v_row.status not in ('approved', 'auto_approved', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'not_approved', 'reason', 'not_approved', 'status', v_row.status, 'approval_id', p_approval_id);
  end if;

  update public.ca_operator_approvals
    set status = v_status,
        executed_at = case when v_status = 'executed' then now() else executed_at end,
        result = coalesce(result, '{}'::jsonb) || coalesce(p_result, '{}'::jsonb)
  where id = p_approval_id
  returning * into v_row;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := coalesce(v_row.decided_by, v_row.requested_by),
      p_action        := 'operator.execute_approval',
      p_target_type   := coalesce(v_row.target_type, 'operator_approval'),
      p_target_id     := coalesce(v_row.target_id, p_approval_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', p_approval_id,
                           'kind', v_row.kind,
                           'status', v_status,
                           'op_id', v_row.op_id
                         ),
      p_before_state  := null,
      p_after_state   := jsonb_build_object('status', v_status, 'executed_at', v_row.executed_at),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := v_row.request_id
    );
  exception when others then
    raise notice 'fn_ca_operator_mark_executed audit failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'already', false, 'status', v_status, 'approval_id', p_approval_id);
end
$fn$;

revoke all on function public.fn_ca_operator_mark_executed(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_mark_executed(uuid, jsonb, text) to service_role;

-- 5.8 One record's full audit history ---------------------------------
create or replace function public.fn_ca_operator_audit_trail(
  p_target_type text,
  p_target_id   text,
  p_limit       int,
  p_offset      int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint := 0;
  v_rows   jsonb := '[]'::jsonb;
begin
  select count(*) into v_total
  from public.admin_audit_log a
  where a.target_type = p_target_type
    and a.target_id = p_target_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select a.id, a.admin_user_id, a.actor_role, a.action, a.target_type, a.target_id,
           a.details, a.before_state, a.after_state, a.ip_address, a.user_agent,
           a.request_id, a.created_at
    from public.admin_audit_log a
    where a.target_type = p_target_type
      and a.target_id = p_target_id
    order by a.created_at desc
    limit v_limit offset v_offset
  ) t;

  -- The actor is the calling route's operator, which this signature does
  -- not carry, so the row is filed against the record being inspected.
  -- The route also writes its own audited row with the real actor.
  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := null,
      p_action        := 'operator.audit_trail.read',
      p_target_type   := p_target_type,
      p_target_id     := p_target_id,
      p_details       := jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset),
      p_before_state  := null,
      p_after_state   := null,
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_operator_audit_trail audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end
$fn$;

revoke all on function public.fn_ca_operator_audit_trail(text, text, int, int) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_audit_trail(text, text, int, int) to service_role;

-- 5.9 The staff list --------------------------------------------------
-- Everyone who reaches the console: a legacy profile role, or at least
-- one grant ever (revoked included, so a removed operator does not
-- vanish from the page that records the removal).
--
-- Each row carries its active grants twice: `granted_roles` as bare role
-- keys, and `grants` as objects with the grant id. Both, because the id
-- is what a revoke names and the plain keys are what the first build of
-- the console renders.
create or replace function public.fn_ca_operator_staff()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_mfa  jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  -- auth.mfa_factors is not present on every project and the definer may
  -- not be able to read it. Missing MFA state is reported as null, never
  -- as "no MFA", and never as a failed staff page.
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
    end if;
  exception when others then
    raise notice 'fn_ca_operator_staff mfa read failed: %', sqlerrm;
    v_mfa := '{}'::jsonb;
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
        when v_mfa = '{}'::jsonb then null
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

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := null,
      p_action        := 'operator.staff.read',
      p_target_type   := 'operator',
      p_target_id     := 'staff_list',
      p_details       := jsonb_build_object('count', jsonb_array_length(v_rows)),
      p_before_state  := null,
      p_after_state   := null,
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_operator_staff audit failed: %', sqlerrm;
  end;

  return jsonb_build_object('staff', v_rows, 'total', jsonb_array_length(v_rows));
end
$fn$;

revoke all on function public.fn_ca_operator_staff() from public, anon, authenticated;
grant execute on function public.fn_ca_operator_staff() to service_role;

-- 5.10 Is there anybody else who could approve this ------------------
-- Split out because request (5.5) and decide (5.6) must answer it the
-- same way; two copies of this rule is how a request that says "you are
-- alone" meets a decision that says "you are not". Defined last on
-- purpose: plpgsql resolves a called function at run time, so the
-- callers above are fine, and keeping the rule in one place beats
-- ordering the file to please a compiler that is not reading it.
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

  -- Under enforcement only a named grant makes somebody a nominated
  -- approver. While enforcement is off a legacy role holder counts, which
  -- is why the alone rule never fires in production today: there are
  -- three legacy operators and any two of them are four eyes.
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
    where not v_enforce
      and rp.permission = p_permission
      and (p_requested_by is null or p.id <> p_requested_by)
  ) candidates;

  return v_count > 0;
end
$fn$;

revoke all on function public.fn_ca_operator_has_second_approver(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_has_second_approver(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 6. Assertions
-- ---------------------------------------------------------------------
-- The migration aborts on its own assumption violations rather than
-- leaving a half seeded permission table that silently narrows somebody.

do $assert$
declare
  v_enabled     boolean;
  v_total_perms int;
  v_role        text;
  v_count       int;
  v_god         uuid;
  v_perms       jsonb;
begin
  -- 1. Exactly one policy row, and approvals are OFF.
  select count(*) into v_count from public.ca_operator_policy;
  if v_count <> 1 then
    raise exception 'ASSERT FAILED: ca_operator_policy must hold exactly one row, found %', v_count;
  end if;

  select approvals_enabled into v_enabled from public.ca_operator_policy where id;
  if v_enabled is distinct from false then
    raise exception 'ASSERT FAILED: ca_operator_policy.approvals_enabled must be false on install, found %', v_enabled;
  end if;

  -- 2. Every seeded role carries at least one permission. A role with an
  --    empty set is a console tab that renders for nobody.
  for v_role in select key from public.ca_operator_roles loop
    select count(*) into v_count
    from public.ca_operator_role_permissions where role_key = v_role;
    if v_count = 0 then
      raise exception 'ASSERT FAILED: role % has no permissions', v_role;
    end if;
  end loop;

  -- 3. The three legacy roles and owner hold the FULL vocabulary. This is
  --    contract section 0: Phase 2 must not narrow the only three
  --    operator accounts production has.
  select count(distinct permission) into v_total_perms
  from public.ca_operator_role_permissions;

  if v_total_perms < 21 then
    raise exception 'ASSERT FAILED: expected at least 21 distinct permissions, found %', v_total_perms;
  end if;

  foreach v_role in array array['god', 'superadmin', 'admin', 'owner'] loop
    select count(*) into v_count
    from public.ca_operator_role_permissions where role_key = v_role;
    if v_count <> v_total_perms then
      raise exception 'ASSERT FAILED: role % holds % of % permissions, expected all',
        v_role, v_count, v_total_perms;
    end if;
  end loop;

  -- 4. admin.manage exists and is held by owner plus the legacy three
  --    and by nobody else.
  select count(*) into v_count
  from public.ca_operator_role_permissions where permission = 'admin.manage';
  if v_count <> 4 then
    raise exception 'ASSERT FAILED: admin.manage must be held by exactly 4 roles, found %', v_count;
  end if;

  -- 5. A real legacy god still resolves a non-empty permission set.
  --    Picked by role, never by a hardcoded uuid.
  select id into v_god from public.profiles where role = 'god' limit 1;
  if v_god is null then
    raise notice 'ASSERT SKIPPED: no profiles row with role god on this database';
  else
    v_perms := public.fn_ca_operator_permissions(v_god) -> 'permissions';
    if v_perms is null or jsonb_array_length(v_perms) = 0 then
      raise exception 'ASSERT FAILED: legacy god % resolved an empty permission set', v_god;
    end if;
    if jsonb_array_length(v_perms) <> v_total_perms then
      raise exception 'ASSERT FAILED: legacy god % resolved % permissions, expected %',
        v_god, jsonb_array_length(v_perms), v_total_perms;
    end if;
    raise notice 'ASSERT OK: legacy god resolves % permissions', jsonb_array_length(v_perms);
  end if;

  raise notice 'ASSERT OK: Phase 2 operator RBAC installed with approvals disabled.';
end
$assert$;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Paste and run as one transaction to undo this migration completely.
-- Dependency order: functions first (fn_ca_operator_grant and
-- fn_ca_operator_revoke call fn_ca_operator_permissions;
-- request_approval and decide_approval call
-- fn_ca_operator_has_second_approver), then the tables, children before
-- parents (role_permissions and grants reference ca_operator_roles).
-- The admin_audit_log index is dropped too. Nothing else in the database
-- is touched, because nothing else was created.
--
-- begin;
--   set local lock_timeout = '5s';
--
--   drop function if exists public.fn_ca_operator_staff();
--   drop function if exists public.fn_ca_operator_audit_trail(text, text, int, int);
--   drop function if exists public.fn_ca_operator_mark_executed(uuid, jsonb, text);
--   drop function if exists public.fn_ca_operator_decide_approval(uuid, text, uuid, text);
--   drop function if exists public.fn_ca_operator_request_approval(text, jsonb, uuid, numeric, text, text, text, text, text, text);
--   drop function if exists public.fn_ca_operator_set_policy(jsonb, uuid);
--   drop function if exists public.fn_ca_operator_revoke(uuid, uuid, text);
--   drop function if exists public.fn_ca_operator_grant(uuid, text, uuid, text);
--   drop function if exists public.fn_ca_operator_has_second_approver(uuid, text);
--   drop function if exists public.fn_ca_operator_permissions(uuid);
--
--   drop table if exists public.ca_operator_approvals;
--   drop table if exists public.ca_operator_policy;
--   drop table if exists public.ca_operator_grants;
--   drop table if exists public.ca_operator_role_permissions;
--   drop table if exists public.ca_operator_roles;
--
--   drop index if exists public.admin_audit_log_target_idx;
-- commit;
-- =====================================================================
