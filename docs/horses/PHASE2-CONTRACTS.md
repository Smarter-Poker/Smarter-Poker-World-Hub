# Phase 2 contracts - Access control, maker-checker and audit

Binding for every agent building Phase 2. Phase 1 contracts (PHASE1-CONTRACTS.md, including the review addendum items 10-20) still apply in full.

## 0. The safety rule that outranks everything here

NOTHING IN PHASE 2 MAY LOCK AN OPERATOR OUT OR BLOCK A MOVE THAT WORKS TODAY, UNTIL DAN TURNS IT ON.

Production has exactly three operator accounts: 1 `god` and 2 `admin`. So:
- Every legacy role (`god`, `superadmin`, `admin`) keeps EVERY permission by default. Named operator roles are ADDITIVE: a grant can only widen, never narrow, until the enforcement flag is on.
- Maker-checker is DISABLED by default (`ca_operator_policy.approvals_enabled = false`). With it off, a money move above the threshold records a `ca_operator_approvals` row marked `auto_approved` and proceeds exactly as it does today. With it on, the same move returns 202 and waits for a second operator.
- A single operator platform cannot four-eyes anything, so with approvals ON and only one eligible approver the request records `blocked_reason: 'no_second_approver'` and, if `allow_self_approve_when_alone` is true (default true), proceeds and says so in the audit row. Dan turns that off when there are two operators.
- No RLS policy, GRANT or REVOKE in this phase may remove access anyone has today.

## 1. Database (World Hub supabase/migrations, applied via Supabase MCP apply_migration)

Additive only. No table is altered, no function is replaced except by CREATE OR REPLACE of new Phase 2 functions.

`ca_operator_roles(key text pk, label text, description text, rank int, is_legacy bool, created_at)` - seeded: owner, operations, finance, compliance, support, read_only, plus the three legacy keys.

`ca_operator_role_permissions(role_key text, permission text, primary key (role_key, permission))` - seeded from src/lib/horses/permissions.js. The three legacy roles get every permission.

`ca_operator_grants(id uuid pk, user_id uuid not null, role_key text not null references ca_operator_roles, granted_by uuid, granted_at timestamptz default now(), revoked_by uuid, revoked_at timestamptz, reason text, note text)` - a revoked grant is kept, never deleted. Unique partial index on (user_id, role_key) where revoked_at is null.

`ca_operator_policy(id bool pk default true check (id), approvals_enabled bool default false, allow_self_approve_when_alone bool default true, enforce_named_roles bool default false, mint_threshold numeric default 0, fund_threshold numeric default 0, cashout_threshold numeric default 0, approval_ttl_minutes int default 1440, updated_by uuid, updated_at timestamptz default now())` - one row.

`ca_operator_approvals(id uuid pk, kind text check (kind in ('mint','burn','fund_club','cashout','fleet_policy','sanction')), status text check (status in ('pending','approved','rejected','executed','expired','auto_approved','failed')), requested_by uuid, requested_at timestamptz default now(), decided_by uuid, decided_at timestamptz, executed_at timestamptz, expires_at timestamptz, amount numeric, asset text, target_type text, target_id text, reason text, payload jsonb not null, op_id text, result jsonb, blocked_reason text, request_id text)` - `op_id` unique where not null so an approved request executes exactly once.

RPCs (SECURITY DEFINER, service_role only, each with in-file REVOKE/GRANT so the branch is ACL self-contained):
- `fn_ca_operator_permissions(p_user_id uuid) returns jsonb` - `{ role, roles: [], permissions: [], source: 'legacy'|'granted'|'both' }`. Legacy role from `profiles.role` always contributes its full set while `enforce_named_roles` is false.
- `fn_ca_operator_grant(p_user_id uuid, p_role_key text, p_granted_by uuid, p_reason text) returns jsonb` and `fn_ca_operator_revoke(p_grant_id uuid, p_revoked_by uuid, p_reason text) returns jsonb`.
- `fn_ca_operator_request_approval(p_kind text, p_payload jsonb, p_requested_by uuid, p_amount numeric, p_asset text, p_target_type text, p_target_id text, p_reason text, p_op_id text, p_request_id text) returns jsonb` - returns `{ required: bool, approval_id, status, blocked_reason }`. `required` is false when approvals are off or the amount is under the threshold; the row is still written with status `auto_approved` so the trail is complete.
- `fn_ca_operator_decide_approval(p_approval_id uuid, p_decision text, p_decided_by uuid, p_note text) returns jsonb` - refuses when `p_decided_by = requested_by` unless the alone-rule applies; refuses a decided or expired row.
- `fn_ca_operator_mark_executed(p_approval_id uuid, p_result jsonb, p_status text) returns jsonb`.
- `fn_ca_operator_audit_trail(p_target_type text, p_target_id text, p_limit int, p_offset int) returns jsonb` - one record's full history from admin_audit_log, newest first, with total.
- `fn_ca_operator_staff() returns jsonb` - operator accounts with profile role, granted roles, last sign-in (auth.users.last_sign_in_at), MFA state where available, and their grant history count. **Post-build correction, 2026-09-03:** it also returns `grants: [{ id, role_key, granted_at, granted_by, reason }]` per operator, alongside the `granted_roles` string array, which is unchanged. `fn_ca_operator_revoke` takes a grant id, so without the ids the Staff tab could grant a role and never take one back - it could only ever widen.

Every RPC writes its own admin_audit_log row through fn_log_admin_action, **with three exceptions, from two post-build corrections made on 2026-09-03: `fn_ca_operator_permissions`, `fn_ca_operator_staff` and `fn_ca_operator_audit_trail` write NO audit row.** All three are reads, not changes.

`fn_ca_operator_permissions` (first correction, migration `20260903120000`) runs on every console request behind a 30 second cache: at three operators that is thousands of `operator.permissions.resolve` rows a day in a table that held nine rows in its first five months. A trail nobody can find a real action in is not a trail. The route that calls it already audits the request, so nothing about who resolved what is lost.

`fn_ca_operator_staff` and `fn_ca_operator_audit_trail` (second correction, migration `20260903121500_ca_operator_read_fns_do_not_audit.sql`, found by a rolled-back production simulation) shipped with an audit write that could never succeed. Neither read signature carries an actor, so both called `fn_log_admin_action(p_admin_user_id := null, ...)` and production's `fn_log_admin_action` refuses a null actor with "admin_user_id required". The failure was swallowed by the block's own `exception when others then raise notice`, so every call since the migration was applied has attempted the write and every call has failed: the trail has never held one `operator.staff.read` or `operator.audit_trail.read` row and never could. A write that can never succeed is worse than no write, because it teaches a reader the trail covers something it does not, so the dead block was deleted rather than repaired. Giving each function a `p_actor_id` parameter is a signature change, therefore an RPC overload change, therefore its own Tier 3 migration for a later phase, and it is not obviously the right answer either: whether console reads belong in admin_audit_log at all is the question the first correction answered "no" for the highest-volume read. The route's four write actions (`grant_role`, `revoke_role`, `set_policy`, `decide_approval`) still audit with the real actor, ip, user agent and request id through `src/lib/horses/operatorAudit.js`; the GET sections of `/api/horses/operator-admin` file no audit row at all, so nothing left the trail with this change.

## 2. Server (src/lib/horses)

- `permissions.js` gains the named roles and their permission sets. `permissionsForRole` stays pure and synchronous for the legacy roles; a new async `resolveOperatorPermissions(db, userId, profileRole)` merges legacy plus granted, cached 30s per user, and is what `requireOperator` uses.
- `requireOperator` returns `op.roles` (array), `op.grantedRoles`, `op.permissions`, `op.policy` (the ca_operator_policy row, cached 30s).
- New `src/lib/horses/approvals.js`: `requireApproval(op, req, { kind, amount, asset, targetType, targetId, reason, opId, payload })` -> `{ required, approvalId, status }`. A route calls it BEFORE the money RPC; when `required` is true it returns 202 `{ success: true, pending: true, approvalId, message }` and does not touch money. After a successful execution the route calls `markApprovalExecuted(op, approvalId, result)`.
- Routes wired to approvals in this phase: `/api/horses/mint` (issue and retire), club funding wherever the console can call it, `/api/club-arena/approve-cashout`. Fleet policy and sanctions are wired in their own phases but the `kind` values exist now.
- New route `/api/horses/operator-admin` (GET sections `staff`, `roles`, `policy`, `approvals`, `audit_trail`; POST actions `grant_role`, `revoke_role`, `set_policy`, `decide_approval`). Permissions: staff/roles/policy reads `console.read`; `grant_role`/`revoke_role`/`set_policy` require a new `admin.manage` permission held only by owner and the legacy roles; `decide_approval` requires the permission the underlying kind needs (money.write for mint/burn/fund, cashier.write for cashout).
- `stable-admin` `audit_log` gains `targetType` + `targetId` exact filters and returns `ip_address`, `user_agent`, `request_id` on every row.

## 3. Client (pages/horses/index.js + src/components/horses)

- New tab `staff` (Staff And Roles): operator table (name, email, profile role, granted roles, last sign-in, MFA, grants), grant/revoke with a reason, the permission matrix (role x permission) read from the route, and the policy panel (approvals on/off, thresholds, TTL, alone-rule) behind `admin.manage`.
- New tab `approvals` (Approvals): pending queue with kind, amount, target, requester, age and TTL; approve/reject with a note; history with filters. A request the current operator raised shows "Waiting For Another Operator" and its buttons are disabled unless the alone-rule applies.
- Mint panel: when a composed operation exceeds the threshold and approvals are on, the confirm dialog says it will be sent for approval, and a 202 response renders the approval id and a link to the Approvals tab.
- Audit tab: target type + target id filters, a "Trail" action on any row that opens that record's full history, and ip/user-agent/request-id columns in the table and in the CSV.
- Tabs appear only when the operator holds the permission (the tab registry filters on `op.permissions`, which the client already receives).

## 4. Tests

Behaviour tests, not string checks: permission resolution (legacy superset, granted union, enforce flag), approval threshold maths, self-approval refusal and the alone-rule, exactly-once execution via op_id, the 202 shape, audit trail paging, staff shaping, and client-side pure helpers (threshold copy, tab filtering by permission). Plus contract tests that every money route calls requireApproval before its RPC and markApprovalExecuted after.

## 5. Verification before Phase 3

Migration applied to production and listed by `list_migrations`; a rolled-back SQL sim proving: a grant widens, a revoke narrows only when the enforce flag is on, an approval blocks a mint when enabled, the same op_id executes once, and the legacy operator can still mint with approvals off. Then lint, Title Case, full test suite, `npm run build`, push, all CI checks green, and an adversarial review pass like Phase 1.
