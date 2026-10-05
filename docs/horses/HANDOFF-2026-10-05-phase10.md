# Stable Admin Ten-Phase Programme Handoff

Current working handoff, 2026-10-05. This file replaces the 2026-09-04 Phase 3
snapshot as the continuation authority for `https://smarter.poker/horses`.
Before relying on a moving production fact, re-read it live.

## 1. Mission And Product Boundary

Stable Admin is the platform-operator back office. It owns fleet oversight,
platform player lifecycle, integrity, platform money evidence, cross-club floor
oversight, platform controls, RBAC and audit. Club-owner, union-manager and agent
authority stays in Club Arena. A platform card may deep-link to that authority;
it must not create a second writer.

The programme is ten phases:

| Phase | Scope | Source State |
| ---: | --- | --- |
| 1 | Foundation, route/auth/audit/validation hardening | Merged and historically production-verified. |
| 2 | Named RBAC, maker-checker, staff and audit | Merged and historically production-verified. |
| 3 | Fleet Command Center and engine policy | Merged and historically production-verified. |
| 4 | Player 360, restrictions, protection and support | Merged; production enforcement switch remains policy-controlled. |
| 5 | Integrity ranking, cases, evidence and sanctions | Merged and subsequently hardened through multiple protected fixes. |
| 6 | Floor, tournaments, cashier, rake and cross-scope oversight | Merged as `2a833a041` in PR #2122. |
| 7 | Economy and finance reporting | Merged as `39d2d8565` in PR #2129. |
| 8 | Platform controls and observability | Merged as `cdf7f141e` in PR #2136. |
| 9 | Console architecture, code splitting, folded pages, mobile and accessibility | PR #2141 merged as `46df73f9377023dedb03d5228217954c84b88368`; final head `a299da579c8f9f0945c89477867f7d3347a063f2`. Production identity is recorded in section 9. |
| 10 | Verification, runbooks, permission/disclosure records, gap re-score and handoff | This package. Final protected revision is recorded in section 9 when complete. |

## 2. Laws That Must Survive Every Continuation

1. Horses are players. They are never excluded from a player rule, report,
   total, integrity check, earning or payment. They run deterministic
   HorseLogic, not a language model, and are never called bots.
2. Permission visibility is not authorization. Enforce at route and database
   boundaries and test both allowed and refused flows.
3. Unknown is not zero. Stale, unavailable, truncated and divergent evidence
   remain visible in text.
4. Money uses existing idempotent mint/burn/fund/settlement/reconciliation
   paths. Never hand-write a balance or repeat an unknown operation.
5. Maker-checker approval binds kind, target, operation ID and payload. Approval
   is not execution and execution is exactly once.
6. No real chips, active seats or player accounts are spent to test a rule.
7. No em dash in UI copy, no emoji, Title Case, `.maybeSingle()`, 375px first.
8. Releases use protected GitHub merge and the canonical provider. No watcher,
   scheduler, local publisher, deploy hook or second project advances a release.
9. Database installation is separate from merging a migration. Verify the exact
   ledger row, post-image and PostgREST authorization behavior.

## 3. Canonical Source Map

| Area | Location |
| --- | --- |
| Shell and admission | `pages/horses/index.js` |
| Design and responsive tokens | `pages/horses/horses.module.css`, `src/components/horses/horsesAdminTokens.js` |
| Tab inventory and URL aliases | `src/components/horses/tabRegistry.js` |
| Explicit lazy chunks | `src/components/horses/dynamicPanels.js` |
| Shared operator state | `src/stores/stableAdminStore.js` |
| Panel modules | `src/components/horses/*Panel.jsx` |
| Shared client primitives | `src/components/horses/` |
| Permission vocabulary | `src/lib/horses/permissions.js` |
| Server auth/API/audit/validation | `src/lib/horses/operatorAuth.js`, `operatorApi.js`, `operatorAudit.js`, `validate.js` |
| Stable Admin APIs | `pages/api/horses/` |
| Database history | `supabase/migrations/` |
| Programme plan | `docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md` |
| Phase contracts | `docs/horses/PHASE1-CONTRACTS.md` through `PHASE10-CONTRACTS.md` |
| Operator runbook | `docs/horses/STABLE-ADMIN-OPERATOR-RUNBOOK.md` |
| Permission matrix | `docs/horses/STABLE-ADMIN-PERMISSION-MATRIX.md` |
| GLI-19 operating record | `docs/horses/STABLE-ADMIN-GLI19-DISCLOSURE.md` |
| Final re-score | `docs/horses/STABLE-ADMIN-FINAL-GAP-RESCORE.md` |

## 4. Architecture At Programme Close

- The shell owns authentication, policy bootstrap, account reset, URL
  reconciliation, header, notifications, tablist, common tabpanel and shared
  error/loading boundaries.
- Twenty-eight visible tabs are pure registry data. Thirty explicit dynamic
  panel imports let Next create real lazy chunks.
- No panel body remains inline in `pages/horses/index.js`.
- Cross-panel context is held in a non-persisted Zustand store. Active tab,
  section, rows, drafts, filters, SQL history, modal callbacks and money data do
  not enter that store.
- URL state remains authoritative. `grinder` aliases Fleet Command. The three
  former standalone pages issue HTTP 307 to their top-level tab.
- Long bounded collections may virtualize rendering but retain server paging,
  authoritative totals, stable keys and accessible relationships.

## 5. Database Programme Inventory

Key installed families include:

- Phase 2: `20260903120000`, `20260903121500`, `20260903140000`,
  `20260903202500` for roles, grants, permissions, policy, approvals and audit.
- Phase 3: `20260903222000_ca_horse_fleet_command.sql` for policy, state,
  heartbeat, register and fleet RPCs.
- Phase 4: `20260904150000_ca_player_360_and_restrictions.sql` plus reachability
  and revived-seat follow-ups at `20260904183000` and `20260904183500`.
- Phase 5: `20260906101639` and integrity health/sanction/queue follow-ups at
  `20260906141131`, `20260906170000`, `20260906180000` and `20260906200000`.
- Phase 6/7 database additions are named in their contracts and must be read
  from the production ledger rather than inferred from files.
- Phase 9: `20261005231629_stable_admin_phase9_named_operator_database_gates.sql`
  and `20261005232042_stable_admin_phase9_rpc_execute_grants.sql`.

Never replay an installed file. Before DDL, respect the database refusal window
`:50-:03 UTC`. The supported migration path must write the exact history row and
post-image integrity receipt. A direct `postgres` call is not PostgREST auth
proof.

## 6. Operator Model

Canonical roles are owner, operations, finance, compliance, support and
read_only, plus legacy god/superadmin/admin recovery roles. There are 21 named
permissions. Current values of `approvals_enabled`, `enforce_named_roles` and
`restrictions_enforced` are production state, not constants in this handoff.
Read them before an operation and never flip them as a verification step.

The exact matrix and tab admission table live in
`STABLE-ADMIN-PERMISSION-MATRIX.md`. For database-self-gated pages such as Home
Games moderation and Hand Reviews, verify allowed and refused calls through
PostgREST after any function rewrite.

## 7. Known Honest Limitations

The final re-score records zero unaccounted gaps and nine partial capabilities:

- P3: transfer/social restriction convergence guards are not present and the
  production enforcement switch remains policy-controlled.
- I3: link-graph usefulness is bounded by the identity/device/IP evidence the
  platform actually records.
- O1/O2: no browser-owned engine control is invented; unsupported global table
  and tournament controls remain with their authoritative owners or Missing.
- O7: exports are complete within explicit caps but there is no universal
  asynchronous export-job ledger.
- E7: some digest/export receipt history remains source-dependent and Unknown
  when no durable record exists.
- C2/C4/C7: safe global maintenance control, complete global kill switches and
  one durable cross-source acknowledgement schema do not exist. The UI states
  those boundaries instead of manufacturing controls.

These are product/platform debts, not hidden stubs in the Phase 10 package.
Implementing them is new feature authority and requires a new scoped phase.

## 8. Verification Commands And Evidence Rules

Use the repository's existing focused suites and hooks. The key Phase 9/10
source checks are:

```text
node --test __tests__/horses-*.test.mjs
node scripts/ci/check-undefined-identifiers.mjs
npx eslint pages/horses src/components/horses src/lib/horses pages/api/horses src/stores/stableAdminStore.js
npm run build
```

Run the dedicated browser smoke at desktop and Pixel 5/375px with the configured
authorized test identity. It must visit every permitted tab, assert URL/tab/
tabpanel agreement, fail on chunk/page errors, cover keyboard navigation and
reduced motion, confirm no document overflow and follow all three redirects.

Do not copy secrets into a command or document. Use the owning authenticated
tool/session. A signed-in shell screenshot alone is not route, database or
publication proof.

## 9. Final Delivery Record

This section is updated immediately before the Phase 10 protected merge and
again if a newer protected descendant becomes the served revision.

| Layer | Required Final Evidence | Recorded Result |
| --- | --- | --- |
| Phase 9 source | PR, protected checks, merge revision | PR #2141, every required check green, merged as `46df73f9377023dedb03d5228217954c84b88368`; final head `a299da579c8f9f0945c89477867f7d3347a063f2`. |
| Phase 9 database | Exact ledger version/hash, owner, security, grants, allowed/refused PostgREST | Installed `20261005231629` at SHA-256 `0933b94edbe85b366a2b0aeb03cadb51ba30141af4790404ebb6e8e3c699d6d4` and `20261005232042` at SHA-256 `f3bb5dc9454689a37922d78de2f6d7e4abc95441ec743f93080d143a15a82ccc`. Readback proved all nine functions owned by `postgres`, security definer, pinned search path, authenticated execute, no anonymous execute and canonical named-role gates. Live PostgREST run `37389319986` proved own-user allow, mismatched-user refusal, unknown-permission refusal and anonymous refusal. |
| Phase 9 publication | Vercel deployment ID, READY, selected revision, `/api/health` | Pending successful protected descendant publication after deployment `dpl_DD9GcDe7g9z3Xve4CFv66vzZH43v` failed before becoming READY. |
| Phase 9 live behavior | Authenticated shell, tabs, redirects, desktop/mobile | Pending merge. |
| Phase 10 source | PR, protected checks, merge revision | Pending Phase 10 PR. |
| Phase 10 publication | Vercel deployment ID, READY, selected revision, `/api/health` | Pending Phase 10 merge. |
| Phase 10 live behavior | Documentation served in source, live console unchanged and healthy | Pending Phase 10 merge. |

No pending cell above may remain when the programme is declared delivered.

## 10. Exact Continuation Procedure

1. Run the four-policy reader and record policy version/hash.
2. Inspect the active worktree, branch, PR and clean status. Do not create a
   duplicate PR or push into a merged one.
3. Read PR checks for the current head. Fix actual failures with the smallest
   scoped correction; never bypass a required check.
4. Complete protected merge. Record the merge revision.
5. Install any unapplied assigned migration through the supported path outside
   the DDL refusal window. Read back exact history and object/security state.
6. Confirm Vercel READY and `/api/health` identity, including ancestry when a
   newer descendant serves.
7. Run authenticated live read-only proof of the affected surfaces.
8. Update section 9 and the current-state pointer with immutable evidence.
9. Submit Phase 10 from a fresh Phase 9 descendant branch, pass protected checks,
   merge, publish and verify again.
10. Remove only this task's finished SSD worktrees after evidence is durable.

## 11. Never Do These Things

- Never restore a horse-exclusion filter or timing suppression.
- Never clear detector-gap/stale columns to turn a banner green.
- Never infer migration installation from a merged file.
- Never trust a SECURITY DEFINER probe run only as `postgres`.
- Never issue real chips, seat a live player or acknowledge a real incident for
  a smoke test.
- Never call a provider queue result a deployment or a deployment a behavior
  verification.
- Never use a watcher, recurring agent, cron or retired publisher to advance or
  certify the release.
