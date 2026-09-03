# Phase 1 + Phase 2 server and database re-verification (adversarial, independent)

Scope reviewed line by line: src/lib/horses/*.js (12 files), pages/api/horses/*.js (16 routes), the four club-arena / admin / promo routes named in the brief, the three applied migrations, and the nine __tests__/horses-*.test.mjs files. Baseline: worktree /home/claude/wh-p2 at b5ab39e ("phase2 review fixes"); `node --test __tests__/horses-*.test.mjs` = 479 pass, 0 fail.

Every finding below was verified by reading the exact code path. Where a claim could be executed without a database it was proved with a scratch test against the real modules (/tmp/rev/probe1.test.mjs, /tmp/rev/probe2.test.mjs, all passing = the defect reproduces). Items I could not execute are marked "unverified". Nothing was edited in the worktree.

Severity key: BLOCKER = money moves wrongly or operators are locked out in today's production state; HIGH = a security or money-trail hole reachable once a Phase 2 switch is flipped or a plausible data state occurs; MEDIUM = contract violation, silent write, or gate that does not do what its comment says; LOW = correctness/robustness gaps with a narrow blast radius; NOTE = observations, unverified items, dead code.

---

## BLOCKER

None found. In the production state the migrations declare (approvals off, enforcement off, zero grants, three legacy operators) every money path behaves as it did before Phase 2 and every legacy operator reaches the console. All 479 tests pass. The HIGH items below are latent, not live, but two of them (H-1, H-2) bite the moment Dan flips a Phase 2 switch or a non-legacy string lands in profiles.role.

---

## HIGH

### H-1  JS permission resolver treats ANY string in profiles.role that matches a named role key as a legacy set; SQL does not
- **File:** src/lib/horses/operatorAuth.js:224 (`const legacy = permissionsForRole(profileRole)`) and :258 (`mergePermissions(legacy, granted)`); root cause src/lib/horses/permissions.js:221-225 (`permissionsForRole` returns ROLE_PERMISSIONS[role] for every key, named ones included).
- **What is wrong:** The M-6 fix narrowed `isOperatorRole` (console entry) to the legacy three, but `resolveOperatorPermissions` still seeds `legacy` from `permissionsForRole(profileRole)`, which returns the FULL set for `owner` and the job sets for `operations`/`finance`/`compliance`/`support`/`read_only`. The SQL resolver (`fn_ca_operator_permissions`, migration 140000 lines 347-359) deliberately contributes nothing unless `ca_operator_roles.is_legacy` is true. So JS and SQL disagree for any account whose profiles.role is a named key.
- **Concrete failure (proved, /tmp/rev/probe1.test.mjs F1/F1b):** profiles.role = `'owner'` + an active `read_only` grant -> `requireOperator` admits the account (grant satisfies the gate) with all 21 permissions, `admin.manage` and `sql.execute` included, `permissionSource: 'granted'`. SQL for the same account: read_only's 6. profiles.role = `'finance'` + a `support` grant -> JS grants `money.write` and `cashier.write`. The permissions.js comment itself says `owner` "is a value any future club or venue work is likely to write". The route-level checks (`requirePermission` in operator-admin, stable-admin, `hasPermission` everywhere) all read the JS set, and `execute_approval` calls `fn_ca_mint` under the service role with only the JS check in front of it, so this is a real privilege widening, not a display bug. It also inflates `aloneRuleFor`'s roster count in operator-admin.js:268 (`permissionsForRoles(rolesOfStaffRow(row))`) the same way.
- **Fix:** In `resolveOperatorPermissions` use `const legacy = isLegacyRole(profileRole) ? permissionsForRole(profileRole) : []` (and the same guard in `rolesOfStaffRow` / `permissionsForRoles` callers). Better still, split `permissionsForRole` into `legacyPermissionsForProfileRole` (legacy only) and keep `ROLE_PERMISSIONS` for grants and the matrix. Add a behaviour test: profiles.role in NAMED_OPERATOR_ROLES + a narrow grant resolves to exactly the grant's set.

### H-2  The "ceiling rule" lets a gated move execute while the database has already written a PENDING approval row; the row can then be rejected with the chips already gone (the B-2 shape, through a different door)
- **File:** src/lib/horses/approvals.js:548-549 (`const released = rawStatus === null || RELEASED_STATUSES.has(rawStatus); const required = decision.required && (dbRequired || !released);`), consumed by pages/api/horses/mint.js:406-487 and pages/api/club-arena/approve-cashout.js:267-340. The behaviour is enshrined by __tests__/horses-phase2-server.test.mjs:886 ("the local policy is a ceiling").
- **What is wrong:** `decision.required` comes from `op.policy`, which is the per-lambda 30-second cache (`loadOperatorPolicy`) or the DEFAULT (approvals off) whenever the `ca_operator_policy` read fails/degrades. The RPC reads the live row. When the local copy says "off" and the database says "on", the RPC inserts a `pending` row and answers `required: true, status: 'pending'`, and the JS ANDs that away and moves the money.
- **Concrete failure (proved, /tmp/rev/probe1.test.mjs F2):** Dan turns approvals on from lambda A at T. Lambda B still holds the "off" policy until T+30s. An operator on B mints 50,000 chips at T+10s: RPC writes `pending` (threshold 0), JS returns `required:false`, `fn_ca_mint` runs, `markApprovalExecuted` is refused with `not_approved` (mark_executed only accepts approved/auto_approved/failed) and the row STAYS `pending` in the Approvals queue. A second operator now either rejects it (trail: `rejected`, chips exist) or approves it (executeApproval re-drives `fn_ca_mint` with the same op_id and reports "The Money Has Moved" - true only because of fn_ca_mint's own replay, and only if that replay exists, see N-2). mint.js also discards the `markApprovalExecuted` return value (see M-4), so the refusal reaches nobody but the server log. The same window exists for a platform-override cashout. The "degraded" policy path (table read fails, RPC works) opens the same hole for as long as the read fails.
- **Fix:** A pending row written by the database must hold, whatever the cache says: `const required = dbRequired || (decision.required && !released);` - i.e. drop the ceiling for the case where the RPC actually gated. This cannot block "a move that works today": the RPC only answers `required:true` when `ca_operator_policy.approvals_enabled` is true in the database, which is Dan's switch, not a failure mode. Keep the ceiling only for the RPC-unavailable branch (already handled by rule 1). Change the test at :886 to assert the opposite, and add a test that a `status:'pending'` RPC answer never returns `required:false`.

---

## MEDIUM

### M-1  set_policy silently bypasses the lockout guard through its direct-UPDATE fallback
- **File:** pages/api/horses/operator-admin.js:823-850 (RPC error -> `db.from('ca_operator_policy').update({ ...patch, ... }).eq('id', true)`).
- **What is wrong:** Any error from `fn_ca_operator_set_policy` (a statement timeout, a transient pooler error, a RAISE) falls through to a direct row write that has no `enforce_named_roles_would_lock_out` check. The comment says the fallback exists "for the window where this deploy is live and the follow-up migration is not"; migration 140000 is applied, so the window is closed and only the bypass remains. (H-4 in the migration file called the route bypass "the single highest-value follow-up"; it is fixed on the happy path only.)
- **Concrete failure (proved, /tmp/rev/probe2.test.mjs F4):** RPC answers `{ error: { code: '57014', message: 'canceling statement due to statement timeout' } }`; the route writes `enforce_named_roles = true` directly and returns `policy.enforce_named_roles: true`. In production the legacy floor makes an actual lockout unlikely, but the guard the migration installed is not enforced by the only caller.
- **Fix:** Remove the fallback, or restrict it to `PGRST202` (function not found) AND refuse it outright when the patch contains `enforce_named_roles: true`. Any other RPC error should be `mapDbError(rpc.error, 'The Operator Policy')`.

### M-2  Alone-rule and permission resolution disagree under enforcement: a legacy account with no grants can DECIDE but is not COUNTED as a second approver
- **File:** supabase/migrations/20260903120000 lines 1341-1362 (`fn_ca_operator_has_second_approver`, legacy branch `where not v_enforce`) versus 20260903140000 lines 370-397 (`fn_ca_operator_permissions`: "An operator with NO grants at all keeps the legacy set even under enforcement"). Mirrored in JS: operator-admin.js:221-237 `rolesOfStaffRow` counts legacy accounts, :284 then lets "the database's answer win".
- **What is wrong:** With `enforce_named_roles = true`, production's god (no grants) resolves all 21 permissions and can approve any request, but `has_second_approver` excludes every legacy account. A granted `finance` operator's own mint request is therefore `no_second_approver` -> auto_approved under the alone rule while a fully entitled god is on shift. The header of migration 120000 calls the exclusion intentional ("only holders of an active named grant count"), but the same migration family keeps those accounts entitled to decide, so the four-eyes control is weaker than the permission model says. The JS policy read reports `eligibleApprovers > 0` from the roster while `applies: true` from the RPC, i.e. the panel says "one other operator can approve this" and then tells the requester they may self-approve.
- **Fix (follow-up migration):** in `fn_ca_operator_has_second_approver`, count a legacy account under enforcement when it holds NO active grant (the exact rule `fn_ca_operator_permissions` applies), or make `fn_ca_operator_permissions` drop the legacy set under enforcement for everyone (keeping only the admin.manage floor). Pick one and make both functions and `rolesOfStaffRow` use it.

### M-3  Phase 2 permissions do not reach the routes that actually move a cashout or run SQL; `cashier.write` is never checked where cashouts are approved
- **File:** pages/api/club-arena/approve-cashout.js:146 (`isPlatformAdmin = ['admin','superadmin','god'].includes(callerProfile?.role)`), also pages/api/admin/execute-sql.js:210, pages/api/promo/admin-promo-codes.js:12, pages/api/club-arena/anti-cheat.js:143, pages/api/club-arena/union-application.js:50.
- **What is wrong:** The contract says cashout decisions need `cashier.write` and that `enforce_named_roles` narrows. A granted `finance` operator (profiles.role `user`) can approve a cashout in the Approvals tab (decide_approval, cashier.write) and is then told to "complete it from the cashout screen", where approve-cashout 403s them because their profile role is not legacy. Conversely a legacy admin narrowed to `read_only` under enforcement still approves cashouts, runs execute-sql and edits promo codes, because these routes never consult the resolved permission set. `op.permissions` narrowing is therefore cosmetic for every money/SQL path outside /horses.
- **Fix:** In approve-cashout compute `isPlatformAdmin` from `resolveOperatorPermissions(...)` containing `cashier.write` (fail-open to the legacy list while degraded), and do the same for `sql.execute` and `promo.write` in the other two. Until then, document that named roles cover the /horses console only.

### M-4  markApprovalExecuted's refusal (the M-8 fix) is discarded by both money routes
- **File:** pages/api/horses/mint.js:481-487 (`await markApprovalExecuted(...)` result unused; the audit row at :489 records `approvalStatus: approval.status`, the PRE-execution status), pages/api/club-arena/approve-cashout.js:334-339 (same).
- **What is wrong:** Contract text for M-8: "It is now read, logged at error level, and RETURNED, so the route can put it in the audit row and in front of the operator." operator-admin.executeApproval does that (`trail_closed`, `mark_executed_refused`); the two routes that mint and cash out do not. Combined with H-2 the only evidence that a mint ran against a pending row is a server log line.
- **Fix:** Capture the return value in both routes, add `trail_closed` / `mark_executed_refused` to the audit `details`, and surface `trailClosed` in the JSON response.

### M-5  merch-catalog-admin: an archive/update that succeeds followed by a failing `syncHasVariants` is a silent, un-audited write; four raw Supabase throws
- **File:** pages/api/horses/merch-catalog-admin.js:365 and :387 (`await syncHasVariants(...)` between the write and `auditOperatorAction`), :273, :281, :358, :363 (`throw error` / `throw beforeError` raw).
- **What is wrong:** DELETE variant: `is_active=false` is written, then `syncHasVariants` throws (count read or item update error) -> wrapper 500, `auditOperatorAction` never runs. Same on PATCH. That is exactly the "mutation with no record of itself" Phase 1 set out to remove. The raw throws violate addendum item 17: scrubError only replaces messages that match its regex list, so a Postgres sentence such as `value too long for type character varying(64)` passes to the browser as the 500 message.
- **Fix:** Audit immediately after the primary write, then run `syncHasVariants` and report its failure in the response (`hasVariantsSynced:false`) instead of throwing; wrap the four raw throws in `mapDbError(error, 'That Catalog Record')`.

### M-6  approve-cashout closes the approval and writes the console audit row only AFTER a network notification with no timeout
- **File:** pages/api/club-arena/approve-cashout.js:314 (`fn_approve_cashout_atomic`), :325 (`notifyPlayer`, whose push branch at :489 is a `fetch` with no AbortSignal), :334 (`markApprovalExecuted`), :346 (`auditOperatorAction`).
- **What is wrong:** Chips move at :314. If the notifications endpoint hangs, the function can hit the Vercel timeout before the approval row is marked executed and before the `cashout.approve` audit row exists. The approval row then stays `approved` (re-drivable from the queue), the Approvals tab says nothing moved, and admin_audit_log has no row for a completed cashout. admin-reviews.js:251 already uses `AbortSignal.timeout(5000)` for the same call; this route does not.
- **Fix:** Move `markApprovalExecuted` and `auditOperatorAction` directly after the RPC result check and before `notifyPlayer`; add `signal: AbortSignal.timeout(5000)` to the push fetch.

---

## LOW

### L-1  execute_approval runs an approved row regardless of `expires_at`, and re-drives `failed` rows forever
- **File:** pages/api/horses/operator-admin.js:1056 (only `status` is checked). Proved: /tmp/rev/probe2.test.mjs F5 executes a row that expired in 2020.
- **Why it matters:** The TTL bounds only the DECISION. An approved-but-failed mint (e.g. burn refused for an empty treasury) can be re-driven months later by anyone with money.write, against a club whose state has changed. Fix: refuse execution when `expires_at` (or `decided_at + approval_ttl_minutes`) has passed, marking the row `expired`, and say so.

### L-2  A platform-override cashout that was rejected or expired can never be approved through the platform path again
- **File:** pages/api/club-arena/approve-cashout.js:274 (`opId: \`cashout:${cashoutId}\``) with migration 140000 lines 800-819 (rejected/expired replay is a permanent 409 under the same key).
- **Why it matters:** The op_id is deterministic per cashout, so one rejection (or one TTL lapse) locks the platform-override path for that cashout forever; only the club agent/admin path remains. Migration M-5 notes half of this. Fix: include an attempt discriminator in the key (e.g. `cashout:<id>:<requested_at epoch>` derived from the cashout row's `updated_at`) or let a `rejected` row be re-raised when the rejecting operator is not the new requester.

### L-3  fn_ca_operator_grant accepts a user id that has no profiles row, and the console lets an admin.manage holder grant the legacy keys
- **File:** supabase/migrations/20260903140000 lines 461-483 (no profiles existence check); pages/api/horses/operator-admin.js:669 (`enumOf(body.roleKey, OPERATOR_ROLE_KEYS)` includes god/superadmin/admin).
- **Why it matters:** A grant to a typo'd uuid is accepted, but `fn_ca_operator_staff` is driven by `profiles`, so the grant never appears on the Staff tab and cannot be revoked from the console. Granting `god` via ca_operator_grants produces an account that counts as an operator with all permissions, which is `owner` by another name and muddies the "legacy = profile role" story (`grantedRoles` also filters it oddly at operatorAuth.js:251). Fix: `raise exception` when `p_user_id` is not in profiles; refuse `is_legacy` keys in `fn_ca_operator_grant` and in the route (`NAMED_OPERATOR_ROLES` only).

### L-4  Expired pending rows are only swept when touched; the pending queue and the `status=pending` filter keep showing them
- **File:** migration 140000 M-5 (acknowledged as "half fixed"); pages/api/horses/operator-admin.js:482-515 (`sectionApprovals` filters on stored status only; `decorateApprovals` marks them `expired` per row but the list and `total` still count them as pending).
- **Why it matters:** The queue badge and the pending count lie until somebody clicks. Fix: in `sectionApprovals`, when `status === 'pending'` add `.or('expires_at.is.null,expires_at.gt.<now>')` and expose an `expired` view; long term the sweeper job the migration mentions.

### L-5  approve-cashout cancel path returns raw database text to the browser
- **File:** pages/api/club-arena/approve-cashout.js:387 (`details: rpcErr?.message`). Pre-dates Phase 1 (present in baseline 931a389), but it is in the route Phase 2 touched and contradicts contract line 5 / item 17. Fix: drop `details`, log it with the request id.

### L-6  hg-* routes turn an UNAUTHORIZED/expired-JWT RPC failure into a 500
- **File:** pages/api/horses/hg-appeals.js:48,80; hg-reports.js:60,83,111; hg-onboarding-status.js:39. Only hg-gdpr-erase.js:107 maps `42501` to 403. With the caller-scoped client (`userDb`) an operator whose profile the RPC does not accept (any granted non-legacy operator; see M-3) or whose JWT expired gets "Could Not Be Loaded" plus a Sentry report. Fix: share the 42501/UNAUTHORIZED -> 403 and PGRST301/JWT -> 401 mapping across the four routes.

### L-7  Audit-actor and requester label lookups exceed the 200-id `.in()` rule
- **File:** pages/api/horses/operator-admin.js:614 (`.in('id', ids.slice(0, 500))`; a 500-row page can carry up to 1,000 ids, requester + decider). Phase 1 review record: ".in() never exceeds 200 ids". Fix: `readByIds(db, ids, ...)`.

### L-8  Reason/status strings and dates from the client reach RPCs unvalidated in the hg list routes
- **File:** hg-appeals.js:50 (`p_status: query.status || null`), hg-reports.js:75-76. Not injectable (bound parameters) but an unexpected value is a 500 rather than a 400. Fix: `enumOf` with the RPC's accepted values.

### L-9  user_search ships unmasked player emails to every clubs.read holder
- **File:** pages/api/horses/club-arena-admin.js:518 (`select('... email ...')` on profiles). anti-abuse.js masks the same column for players.read. Under Phase 2 `support` and `read_only` hold clubs.read. Fix: mask as anti-abuse does, or gate the column on players.write.

### L-10  A degraded (fail-open) permission answer is cached for the full 30 seconds
- **File:** src/lib/horses/operatorAuth.js:271-283. Proved (/tmp/rev/probe1.test.mjs F3): after one RPC failure the legacy full set is served even when the RPC is back. Under enforcement that is 30s of un-narrowed access per lambda per failure. Fix: do not cache `degraded: true` results (or cache them for 5s).

### L-11  mint.js never records a `failed` status when fn_ca_mint refuses or errors
- **File:** pages/api/horses/mint.js:459-476. The auto_approved/approved row keeps its status with no `result`, while operator-admin.executeApproval records `failed` for the same outcome. The trail therefore reads differently depending on which door the mint went through. Fix: call `markApprovalExecuted(op, approval.approvalId, { ok:false, error: code }, { status: 'failed' })` on both refusal branches (the SQL treats a `failed` replay as a fresh request, so the operator can retry).

### L-12  A requester cannot withdraw their own pending request
- **File:** pages/api/horses/operator-admin.js:933 (`canDecideApproval` applies the self rule to `reject` too) and migration 140000 line 1090. A mistaken request sits until TTL. Fix: allow the requester to reject (cancel) their own pending row and audit it as `operator.withdraw_approval`.

---

## NOTE

### N-1  Two audit rows per Phase 2 write, three per mint
- fn_ca_operator_grant/revoke/set_policy/decide/mark_executed each `perform fn_log_admin_action` under the same action names the route then files again through operatorAudit (`operator.grant_role` twice, one with ip/ua/request_id and one without). With approvals off, one mint files `operator.request_approval` + `operator.execute_approval` (SQL) + `mint.issue` (JS). Contract section 1 sanctions this, but Phase 1 item 19 removed exactly this duplication from execute-sql, and the Audit tab's counts now double. Consider namespacing the SQL rows (`db.operator.grant_role`) or dropping the SQL audit where the route audits.

### N-2  fn_ca_mint / fn_ca_burn / fn_ca_fund_club idempotency is assumed, not present in this repo (unverified)
- No migration in this repo defines them or `ca_op_claims`. The whole exactly-once story (H-2 aftermath, execute_approval re-drive, executed-row replay) rests on `fn_ca_mint` returning the original result for a reused `p_op_id`. `fn_ca_fund_club(p_club_id, p_amount, p_reason, p_op_id)` in approvals.js:352 is an assumed signature. Confirm both against production before Phase 3 wires fund_club.

### N-3  `check_rate_limit_strict` and the null-actor audit fallback are unverified against production
- The durable limiter (mint POST, hg-gdpr-erase) fails CLOSED with 503 if `check_rate_limit_strict` is absent (src/lib/apiRateLimit.js:140). The cron path of generate-avatars and the service-role path of execute-sql rely on the direct-insert fallback in operatorAudit.js:143 accepting `admin_user_id: null`. Neither object is defined in this repo.

### N-4  fn_ca_operator_staff reports `mfa_enabled: null` for everyone when nobody has a verified factor
- migration 121500 line 246: `when v_mfa = '{}'::jsonb then null`. An empty aggregate is "nobody has MFA", not "unknown". The Staff tab cannot show "No" until at least one operator enrols.

### N-5  Migration `set local lock_timeout` outside an explicit transaction
- Both 120000 and 140000 open with `set local ...`. That is a no-op with a warning unless the runner wraps the file in a transaction (Supabase MCP apply_migration does; psql -f would not). Harmless as applied; worth a `begin;`/`commit;` in future files.

### N-6  Dead exports
- `validate.isUuid` and `operatorAuth._resetOperatorDbForTests` are imported nowhere (app or tests). `approvalPolicy`, `EXECUTABLE_APPROVAL_KINDS`, `REPLAY_REFUSAL_TEXT`, `DB_ERROR_CODES` are exported but only used inside their own module. No unused imports were found in any scope file (checked with a scratch script).

### N-7  `op.roles` includes non-operator profile roles
- operatorAuth.js:261 builds `roles` as `[profileRole, ...rpcRoles]`, so a granted finance operator reports `roles: ['user', 'finance']` and the Staff/policy envelope shows "user" as a role. Cosmetic.

### N-8  Tests: what is text-only and what has no test
- Text-only (acceptable as contracts but not behaviour): every test in horses-phase2-migration.test.mjs (60, necessarily, no DB); the `contract:` tests in phase2-server (mint/cashout ordering, wrapper presence, permission map); ~17 in console-phase1 and ~22 in routes-group-a read source strings.
- Behaviour enshrining a defect: phase2-server :886 asserts H-2's ceiling as correct.
- Behaviours with NO test: H-1 (named string in profiles.role + grant); H-2's pending-row aftermath (mark_executed refused after the money moved); M-1 (fallback writing enforce_named_roles); M-2 (legacy-no-grant not counted under enforcement); M-5 (merch audit skipped when syncHasVariants throws); M-6 (cashout ordering); L-1 (execute past expiry); L-10 (degraded result cached); concurrency of two execute_approval calls on one row; `fn_ca_operator_grant` with a non-profile uuid; hg 42501 mapping outside gdpr-erase; `sectionAuditTrail` fallback total when the RPC omits `total` (pagedResult/sectionAuditTrail fabricate `rows.length + offset`, which contract item 15 forbids for the hg routes and is unreachable today only because the RPC always returns `total`).

---

## Confirmed correct (verified by reading the path, and by the existing suite where noted)

1. All 16 /horses routes export `withOperatorRoute(spec, handle)` (generate-avatars wraps it in a POST-only cron/JWT splitter that reuses the same `handle`, envelope and rate limit); method allowlists match the handlers; 405 carries Allow.
2. No `.single()`, no raw `@supabase/supabase-js` import, no anon-key fallback in any scope file (hgOperator uses the anon key only to build the caller-scoped client with the caller's JWT, by design); no `req.query.userId` used as identity (club-arena-admin's `userId` is a lookup target).
3. Every DB write in the 16 routes is followed by `auditOperatorAction` with a valid dotted action name (regex checked); `auditOperatorAction` never throws (buildAuditRow inside the try, `unknown.action` fallback).
4. The envelope scrubs Postgres text on every route path; every route-composed error is an `ApiError`; `dbErrors.mapDbError` maps duplicate/bad-input/denied/missing to 409/400/403/404.
5. mint.js: `requireApproval` runs before `fn_ca_mint`/`fn_ca_burn`, the 202 body is `{ success, pending, approvalId, status, message, requestId }`, the approval carries the same opId the RPC claims, chips/diamonds destination law is enforced before the RPC, money2dp parses from the string.
6. `requireApproval`: unknown kind -> 500 route_misconfigured; advisory row failure proceeds; required-row failure -> 503; rejected/expired/payload_mismatch replays -> 409 and no RPC; only auto_approved/approved/executed release; threshold at `>=` in both JS and SQL (140000).
7. `fn_ca_operator_request_approval` (140000): material-field comparison with IS DISTINCT FROM runs before the status branch; expired pending rows are closed on replay; `failed` re-opens in place; ON CONFLICT on the partial unique index resolves the double-click race; decided_at set only with decided_by.
8. `fn_ca_operator_decide_approval` (140000): `for update`, refuses non-pending, closes expired rows, checks the decider's permission via `fn_ca_operator_permissions`, refuses self-decision unless alone and allowed; JS mirrors it and computes the alone rule from the same RPC.
9. `fn_ca_operator_mark_executed`: executed is idempotent (`already:true`), accepts approved/auto_approved/failed only, merges `result`.
10. executeApproval: re-reads the row with payload, re-checks the kind's permission, validates the stored payload field by field (asset/target law, uuid, money2dp, reason length, op_id match), runs under the ROW's op_id, records `failed` with the reason on refusal, audits every outcome, refuses non-executable kinds (cashout/fleet_policy/sanction) without touching any Phase 3 table.
11. operator-admin gates: staff/roles/policy/approvals = console.read, audit_trail = audit.read, grant/revoke/set_policy = admin.manage, decide/execute = the kind's permission; reason minimum 10 in both directions; invalidates the policy/permission cache after grant/revoke/set_policy; `set_policy` surfaces `enforce_named_roles_would_lock_out`.
12. operatorAuth: refuses unknown permissions (500), 503 without the service key, 401 without a bearer, 403 for non-legacy profile roles without a grant, a revoked grant (absent from the RPC's `roles`) no longer satisfies the gate after the 30s window, `admin.manage` floor for legacy profile roles, enforcement narrows only with a loaded policy row, cache bounded at 200 entries.
13. Migrations: every function SECURITY DEFINER with `search_path = public, pg_temp`, revoked from public/anon/authenticated and granted to service_role only (restated in 140000); RLS enabled with no policies on the five new tables; seeds idempotent; role permission seed equals ROLE_PERMISSIONS (test-enforced); `fn_ca_operator_staff` returns `grants[{id,...}]`; read functions file no audit row; assertion blocks roll back their probes.
14. hgOperator: per-token client cache with TTL and oldest-first eviction, bounded at 200; `userDb` for RPCs, service-role `db` for audit; permission mapping players.read / moderation.write / gdpr.erase is right for each route; gdpr erase has the durable limit and the confirmation flag.
15. stable-admin: `writeInChunks` returns `{ data, error, chunks }` and the caller audits before it throws on a partial bulk failure; audit_log applies actionPrefixes (OR of like), adminId, targetType, targetId (exact, 400 on unusable), from/to (to = end of day), days; returns ip_address/user_agent/request_id/actor_role; actor list cached 60s and not cached on failure; ACTION_PERMISSIONS covers every action.
16. horse-launch: launch_all/shutdown are 410 behind fleet.write with an audit row; `status` returns the new names plus the legacy aliases; no `mass_fund_horses` anywhere.
17. approve-cashout: only the platform-override path is gated, cancel is never gated, the approval row is closed after the atomic RPC, both audit writers carry `auth_path`.
18. Phase 1 stubs (trigger-pipeline, grinder club actions) return 501 `not_built` through the wrapper as contracted; no TODO/FIXME/placeholder text in scope.
19. HORSES ARE PLAYERS: `is_horse` appears only as a badge in mint player search and as the fleet identifier in horse-launch status; no report, total or list in scope filters horses out.

Confirmed-correct behaviours: 19 groups. Findings: 0 BLOCKER, 2 HIGH, 6 MEDIUM, 12 LOW, 8 NOTE (28 total).
