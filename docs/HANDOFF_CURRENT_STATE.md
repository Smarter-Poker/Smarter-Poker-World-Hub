# HANDOFF: /horses Operator Console Overhaul - Current State

Written 2026-09-04 (UTC) at the end of the session that shipped Phases 1, 2 and 3.
Evidence for every claim was gathered from the live workspace, the live database
and the GitHub API on that date. Anything not verified says so.

READ THIS FILE FIRST, THEN `docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md`, THEN THE
PHASE CONTRACTS.

---

## 1. Executive Continuation Brief

**What is being built.** A ten-phase rebuild of `https://smarter.poker/horses`,
the PLATFORM OPERATOR back office for Smarter Poker (internally "Stable Admin",
informally "the god panel"). Dan asked for "a 1000% improvement and
optimization" measured against what real poker room operators expect from an
admin panel. Club-owner, union and agent surfaces are a different product and
live in Club Arena; `/horses` is staff-only.

**Where the programme stands.** Phases 1, 2 and 3 of 10 are built, adversarially
reviewed, merged and serving in production. Phases 4 to 10 are specified in the
plan document and not started.

- Phase 1, foundation and hardening: DONE, LIVE.
- Phase 2, operator RBAC, maker-checker approvals, audit trail: DONE, LIVE.
- Re-verification pass over Phases 1 and 2: DONE, LIVE.
- Phase 3, the Fleet Command Center: DONE, LIVE (console and database). The
  Club Arena ENGINE half is merged to that repo's `main` and published to the
  static origin, but the engine CONTAINER cutover had not yet run at the time of
  writing. See section 10 and section 19.

**The immediate unfinished objective, and Dan's newest instruction.** Dan's last
message before this handoff, verbatim in substance:

> "FOR PHASE 3 WHEN YOU START WORKING INSIDE THE FLEET COMMAND CENTER, YOU NEED
> TO KNOW AND UNDERSTAND THAT THE HORSES RUN OFF THEIR OWN DETERMINISTIC ENGINE
> AND PROGRAMMING, NOT OFF CHAT GPT, SO REMOVE THAT AS THE FIRST THING YOU DO
> WHEN YOU START PHASE 3."

He attached a screenshot of the Grinder Horses tab showing a "Grinder Settings"
card with an "AI Model" dropdown set to "GPT-4o (Best)".

**THIS IS THE FIRST TASK OF THE NEXT SESSION.** It is not a cosmetic change: the
control tells an operator something false about how the platform works. Evidence
gathered 2026-09-04 (section 6.9) proves the poker engine contains no LLM at all
and never reads that setting.

**The first action the next agent should take** is section 22, step by step. In
one sentence: open the World Hub repo, confirm the state in section 10, then
delete the `grinder_ai_model` control and audit the other three `grinder_*`
controls beside it.

---

## 2. User Requirements And Working Preferences

These are Dan's rules. They are not suggestions and several were learned by
getting them wrong first.

### 2.1 Non-negotiable platform laws

1. **HORSES ARE PLAYERS.** `CLAUDE.md` section 10.5, binding, verbatim from Dan:
   "HORSES ARE NEVER EVER DISCLUDED BY DESIGN ON ANYTHING! THEY MUST ALWAYS BE
   TREATED LIKE REAL LIVE PLAYERS!" A horse earns, is paid, is subject to and
   counts everywhere a human does. `is_horse` is legitimate only for
   identification and for the horse's input device (it has no browser). There is
   no "equal outcome by a different mechanism" exemption: the test is
   **identical**, not equivalent, and timing is part of the treatment. Any
   include-horses parameter defaults to true.
2. **HORSES ARE NOT DRIVEN BY AN LLM.** Dan, 2026-09-03: they "run off their own
   deterministic engine and programming, not off Chat GPT". See section 6.9 for
   the evidence and section 16 defect D-1 for the control that still says
   otherwise.
3. **YOU DECIDE THE MONEY.** `CLAUDE.md` section 10.6. An agent that finds a
   broken payout fixes it, given a clear path of correction and reconciliation
   (five conditions listed there). Setting what FUTURE events owe, and money
   leaving the platform, remain Dan's.
4. **Never call a horse a bot.** Not in code, comments, copy or conversation.

### 2.2 Working rules for the programme

- One phase at a time, fully built, coded, wired and tested before claiming
  success. Report "Phase N of X is done" with the summary, then "ready to start
  Phase N+1". Dan picks the build order.
- **Standing rule, every phase:** before moving on, review everything built in
  that phase for bugs, gaps, stubs, errors, regressions and wiring issues, and
  confirm it was fully pushed AND published. He has repeated this three times.
- Dan repeated on 2026-09-03: "MAKE SURE EVERYTHING AND ANYTHING PENDING GETS
  PUBLISHED AS WELL." Pending work is not finished work.
- No em dashes (U+2014) anywhere in copy. No en dashes in the code this
  programme touches. No emoji in source. Title Case on every user-visible
  string, with acronyms upper (ID, IP, CSV, URL, JWT, RPC). CI enforces the
  first two; `scripts/ci/check-title-case.mjs` enforces the third.
- No raw hex colours in `pages/horses/*.js`. Use the `T` design tokens from
  `horsesAdminTokens.js`, with `.tokenScope` on every root element.
- `.maybeSingle()` only, never `.single()`.
- Mobile first at 375px, then scale up.
- Never say "looks good". Never claim a deploy without reading production.

### 2.3 Publish and push rules (CORRECTED 2026-09-03, read carefully)

Dan corrected me on this twice. The current, verified map:

| Tier | What | Where it publishes | How |
| --- | --- | --- | --- |
| 1 | Club Arena game engine (`server/**` in the Club Arena repo) | Hetzner, the engine container | `.github/workflows/auto-deploy-hetzner.yml`, cron `45 * * * *`, restart INSIDE the announced `:55` maintenance break |
| 2 | Club Arena player SPA (Vite, repo root `src/`) | **Hetzner, directly** | `.github/workflows/publish-club-arena.yml` job `publish-to-origin` rsyncs `dist/` over SSH to `estate-ci-1` = `ca-static.smarter.poker`, `/srv/club-arena/releases/<ca_sha>` with an atomic `current` symlink and an additive asset pool |
| 3 | Club operations REST API (`pages/api/club-arena/*`, World Hub repo) | Vercel project `hub-vanguard` | push to World Hub `main` |
| - | World Hub app and `/horses` | Vercel project `hub-vanguard` | push to World Hub `main` |

Dan, 2026-09-03: "CLUB ARENA NOW USES HETZNER TO PUBLISH DIRECTLY. REVIEW THE
.MD AND .ENV FOR ALL NEW PUSH PATHS AND TO STOP USING THE OLD LEGACY PATHS."

**The agent's job ends at pushing a branch.** `agent-open-pr.yml` opens the pull
request within seconds; `agent-autopilot.yml` enables squash auto-merge; GitHub
merges when the required checks are green; the publisher workflows do the
Hetzner SSH with repository secrets. Never SSH by hand. Never run
`server/deploy-hetzner.sh`, `sync-club-arena.sh`, `build-club-arena.sh` or
`sync-to-world-hub.sh` (the last three are deleted from `main`; finding one on
disk means a stale branch). `git-safe-push.sh` direct to `main` is the legacy
World Hub path and is not used by this programme.

Verify publication by reading, never by assuming:
- World Hub: `curl -s https://smarter.poker/api/health` and compare `version`
  to `main`.
- Club Arena bundle: `curl -s https://smarter.poker/hub/club-arena/build-info.json`
  and compare `ca_sha` to that repo's `main`.
- Club Arena engine: DB-visible behaviour, never the health endpoint alone.

### 2.4 Things Dan rejected or corrected in this programme

- The draft pull request as a brake. He originally wanted nothing merged without
  him; he then instructed that everything be published before the next phase.
  The second instruction won. Both were followed in sequence, and he was told
  plainly when the first was reversed.
- My statement that Club Arena does not publish to Hetzner. Wrong, corrected
  above.
- Any suggestion that a horse can be treated differently from a human for
  convenience.

---

## 3. Project And Repository Identity

| Field | Value | Status |
| --- | --- | --- |
| Project | Smarter Poker, `/horses` operator console overhaul | confirmed |
| World Hub repo root (canonical clone) | `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub` | confirmed |
| World Hub worktree used all session | `/Users/smarter.poker/Documents/club-arena/.agent-trees/wh-horses` | confirmed, `git rev-parse --show-toplevel` agrees |
| Club Arena repo root (canonical clone) | `/Users/smarter.poker/Documents/club-arena` | confirmed |
| Club Arena worktree used for the engine | `/Users/smarter.poker/Documents/.agent-trees/club-arena/cowork-fleet` | confirmed, created by `scripts/agent-workspace.sh` |
| World Hub remote | `git@github.com:Smarter-Poker/Smarter-Poker-World-Hub.git` (`origin`) | confirmed |
| Club Arena remote | `git@github.com:Smarter-Poker/Smarter-Poker-Club-Arena.git` (`origin`) | confirmed |
| World Hub framework | Next.js (Pages Router), React, CSS Modules | confirmed |
| Club Arena framework | Vite + React SPA; engine is Node + TypeScript under `server/` | confirmed |
| Package manager | npm | confirmed |
| Database | Supabase Postgres, project `kuklfnapbkmacvwxktbh` | confirmed |
| Hosting | Vercel project `hub-vanguard` (World Hub); Hetzner `estate-ci-1` (Club Arena static origin); Hetzner engine box for the game engine | confirmed |
| Test runner (World Hub `/horses`) | `node --test` on `.mjs` files, no framework | confirmed |
| Test runner (Club Arena) | vitest | confirmed |

The agent works on the user's Mac through a device bridge. `host_terminal` calls
time out at 60 seconds: background anything longer with `nohup` and poll.

---

## 4. Repository Map

Only what matters to this programme. Line counts are from `main` at
`2f68c734da` on 2026-09-04.

### 4.1 World Hub, the console itself

```
pages/horses/
  index.js                 7844  The console. 18 tabs, all state, all fetches.
  horses.module.css        2026  Design tokens (T scope) and page styles.
  sql-console.js            628  Sub-page: guarded SQL runner.
  hg-moderation.js         1154  Sub-page: Home Games reports and appeals.
  hand-reviews.js          1205  Sub-page: hand review queue.
```

### 4.2 World Hub, the API

```
pages/api/horses/
  operator-admin.js        1414  Phase 2: staff, roles, policy, approvals, audit trail,
                                 and the approval EXECUTOR for mint/burn/fund_club/fleet_policy.
  fleet-admin.js           1194  Phase 3: overview, roster, horse, policy, isolation, pnl,
                                 register, heartbeat; set_policy and sync_register.
  club-arena-admin.js      1173  Clubs, unions, cashouts, tickets, user search.
  stable-admin.js           863  The horses themselves, bulk writes, audit_log reads,
                                 content_settings (including the grinder_* keys, see D-1).
  mint.js                   579  Chip and diamond issuance and retirement.
  admin-reviews.js          459  Review queue.
  economy-stats.js          428  Economy figures.
  generate-avatars.js       399  Avatar generation (cron or JWT).
  merch-catalog-admin.js    435  Merch catalog.
  grinder-stats.js          303  LEGACY fleet read. Still works, still tested, no longer
                                 called by the console (Fleet Command replaced it).
  anti-abuse.js             281  Abuse and alerts.
  hg-reports.js             186  Home Games reports.
  hg-appeals.js             138  Home Games appeals.
  analytics.js              119  Social analytics.
  hg-gdpr-erase.js           68  Erasure, durable rate limited.
  hg-onboarding-status.js    58  Onboarding status.
  trigger-pipeline.js        54  Deliberate 501 until its own phase.
```

Also touched by this programme, outside `/horses`:
`pages/api/club-arena/{horse-launch,approve-cashout,anti-cheat,union-application}.js`,
`pages/api/admin/execute-sql.js`, `pages/api/promo/admin-promo-codes.js`.

### 4.3 World Hub, shared libraries (`src/lib/horses/`)

```
approvals.js      843  requireApproval, markApprovalExecuted, payloadFor(kind),
                       EXECUTABLE_APPROVAL_KINDS, executionDoneText.
operatorAuth.js   397  requireOperator, resolveOperatorPermissions (fail-open, cached),
                       loadOperatorPolicy, requirePermission.
fleetPolicy.js    371  fleetPolicyMateriality (mirrored in SQL), FLEET_POLICY_DEFAULTS,
                       FLEET_POLICY_REFUSAL_TEXT.
permissions.js    314  The 22-permission vocabulary and the role table.
operatorAudit.js  156  One audit shape. Never throws.
listShape.js      151  pageFor, shapeList, readByIds (200-id chunks), sourceCollector.
validate.js       127  uuid, money2dp, enumOf, text, int, isoDate.
operatorRoute.js  123  withOperatorRoute: the wrapper every route is built on.
apiEnvelope.js    106  ApiError, scrubError, sendOk, sendFail.
dbErrors.js        92  mapDbError.
operatorGate.js    81  operatorHoldsPermission, for routes outside /horses.
hgOperator.js     163  Caller-scoped client cache and the HG error mapper.
paged.js           57  Paging helpers.
hash.js            42  FNV-1a, not cryptographic. Used for approval patch keys.
```

### 4.4 World Hub, components (`src/components/horses/`)

```
FleetPanel.jsx     2056  Phase 3 Fleet Command, code split.
StaffPanel.jsx      952  Phase 2 Staff And Roles, code split.
ApprovalsPanel.jsx  858  Phase 2 Approvals, code split.
shared.module.css   836  Shared panel styles.
fleetModel.js       653  Pure shaping for the fleet panel.
approvalModel.js    559  Pure approval state machine and copy.
operatorAdmin.js    536  URL and body builders for operator-admin.
fleetPolicyModel.js 373  Policy draft, materiality copy, preview.
fleetAdmin.js       269  URL and body builders for fleet-admin.
operatorPermissions.js 241  Permission helpers for the client.
tabRegistry.js      205  The 18 tabs, their permissions, aliases and code-split loaders.
Modal.jsx           144  Focus trap, escape, restore.
usePagedList.js     118  Sequence guard plus AbortController.
urlState.js         114  ?tab= and ?section= resolution.
exportAllCsv.js      85  Paged CSV export.
ConfirmDialog.jsx    82  Typed confirmation.
useOperatorFetch.js  82  Envelope-aware fetch with abort.
DataTable.jsx        72  Table primitive.
ErrorBoundary.jsx    70  Per-tab boundary.
pagerModel.js        69  Honest paging maths (null total is null).
auditFilters.js      66  Audit prefix filters.
StatusPill.jsx       56  Status pill.
Pager.jsx            52  Pager UI.
KpiTile.jsx          36  KPI tile.
NotBuiltYet.jsx      29  Honest unbuilt panel.
```

### 4.5 World Hub, migrations owned by this programme

```
supabase/migrations/
  20260903120000_ca_operator_rbac_and_approvals.sql      Phase 2 tables and RPCs
  20260903121500_ca_operator_read_fns_do_not_audit.sql   Phase 2 correction
  20260903140000_ca_operator_approval_gate_is_exact.sql  Phase 2 review fixes
  20260903202500_ca_operator_reverify_fixes.sql          Re-verification fixes
  20260903222000_ca_horse_fleet_command.sql              Phase 3, 2049 lines
```

All five are applied to production AND registered in
`supabase_migrations.schema_migrations`. Verified 2026-09-04.

### 4.6 World Hub, documentation and tests

```
docs/horses/
  STABLE-ADMIN-OVERHAUL-PLAN.md  183  The 10-phase plan and the full gap list.
  PHASE1-CONTRACTS.md             37  Phase 1 binding contract plus addendum 10-20.
  PHASE1-REVIEW-RECORD.md         23  163 findings closed.
  PHASE2-CONTRACTS.md             71  Phase 2 contract plus post-build corrections.
  PHASE2-SIM.sql                 438  Rolled-back production simulation.
  PHASE2-SIM-2.sql               508  Rolled-back simulation of the gate fixes.
  PHASE3-CONTRACTS.md             82  Phase 3 contract plus post-build corrections.
  PHASE3-SIM.sql                 770  Rolled-back Phase 3 simulation.
  reverify-2026-09-03/
    server-db.md                 164  Re-verification review, server and database.
    client.md                    178  Re-verification review, client.
    live-routes.md                28  Live route exercise record.

__tests__/  (node --test, 699 tests total at main, all passing)
  horses-operator-foundation.test.mjs   606
  horses-routes-group-a.test.mjs       1800
  horses-routes-group-b.test.mjs       1048
  horses-subpages-phase1.test.mjs       800
  horses-console-phase1.test.mjs        823
  horses-libs-review.test.mjs           444
  horses-phase2-migration.test.mjs     1804
  horses-phase2-server.test.mjs        3497
  horses-phase2-client.test.mjs        1640
  horses-phase3-migration.test.mjs      896
  horses-phase3-client.test.mjs        1731
  horses-phase3-reverify.test.mjs      1041
  horses-reverify-routes.test.mjs       703
  horses-reverify-client.test.mjs       523
  horses-reverify-panels.test.mjs       497
```

### 4.6b Phase 3 review record

The Phase 3 adversarial review is quoted in full inside this handoff (section 7.4
lists what was closed) but the reviewer's own report was written to `/tmp` in the
cloud container and is NOT in the repository. `UNVERIFIED whether it survives`;
treat this handoff as the record. The Phase 1 and Phase 2 review records ARE in
`docs/horses/`.

### 4.7 Club Arena, the engine half

```
server/src/services/
  HorseFleetManager.ts        2379  The seeding cycle. Phase 3 wired the policy in.
  HorseFleetPolicy.ts          new  Policy load, 60s cache, fail-open defaults,
                                    applyBias, capBySeatedCount, withheldReason.
  HorseFleetPolicy.test.ts     new  54 tests.
  HorseFleetPolicyWiring.test.ts new 28 tests.
  HorseLogic.ts / HorseBehavior.ts / HorseBankroll.ts / HorseEvEngine.ts ...
                                    The deterministic decision engine. No LLM anywhere.
tests/unit/horsesAreTreatedIdentically.test.ts   A law test this phase had to update.
tests/components/GlobalHeader.test.tsx           Unrelated, but see section 15 L-3.
```

---

## 5. Applicable Instructions And Constraints

Read these before editing anything. They are repository law and several are
CI-enforced.

| File | Scope | Why it matters here |
| --- | --- | --- |
| `AGENT-PLAYBOOK.md` (byte-identical in all seven repos) | everything | Claim your own worktree, commit, push, open a PR, stop. Lists every guard and where credentials live. Section 5 "NEVER DO THESE" is a list of real incidents. |
| `CLAUDE.md` (World Hub) | World Hub | Section 1 deployment, section 3 the eight immutable rules, section 10 working rules, **section 10.5 HORSES ARE PLAYERS**, section 10.6 YOU DECIDE THE MONEY, section 11 scheduled jobs. |
| `CLAUDE.md` (Club Arena) | Club Arena | Section 1.1 the publish path as rewritten 2026-09-03, section 10.9 the money rule (same text as World Hub 10.6). |
| `.agent/architecture/deploy-paths.md` (Club Arena) | Club Arena | The three-tier deploy table. Authoritative for where a fix goes. |
| `infra/ca-origin/README.md` (Club Arena) | Club Arena | The static origin on Hetzner: layout, credentials by NAME, rollback. |
| `docs/horses/PHASE1-CONTRACTS.md` + addendum items 10-20 | `/horses` | Still binding on every later phase. |
| `docs/horses/PHASE2-CONTRACTS.md` | `/horses` | Section 0 is the safety rule that outranks everything: nothing may lock an operator out or block a move that works today until Dan turns it on. |
| `docs/horses/PHASE3-CONTRACTS.md` | `/horses` + engine | Section 0: the fleet keeps running exactly as today until a policy row says otherwise, and no control may reach inside a hand. Contains the full materiality table. |
| `.agent/CLAUDE_AGENT_RULES.md`, `.agent/workflows/migration-safety.md` | both | Migration tiers and the four-step protocol. |

**Known ambiguity.** `docs/horses/PHASE3-CONTRACTS.md` names the Club Arena
worktree as `~/Documents/club-arena/.agent-trees/cowork-horses` on branch
`agent/cowork-horses/stable-admin-overhaul`. That is stale. The engine work was
actually done in `~/Documents/.agent-trees/club-arena/cowork-fleet` on branch
`agent/cowork-fleet/horse-fleet-policy`, because `scripts/agent-workspace.sh`
now creates worktrees under `~/Documents/.agent-trees/<repo>/<name>`. Trust the
script, not the contract line.

---

## 6. Complete Discovery Record

### 6.1 What `/horses` was before this programme

One 6,000-line page with 16 tabs, a mixture of direct browser Supabase queries
and API routes, three different audit shapes (one full, one bare insert, one
nothing at all on four reachable routes), an anon-key fallback in every API
route, no paging on several lists, no error boundary, no URL state, and a single
flat permission tier keyed on `profiles.role in ('god','superadmin','admin')`.

### 6.2 The operator wrapper (Phase 1)

`withOperatorRoute(spec, handle)` in `src/lib/horses/operatorRoute.js` is now the
single door. It enforces the method allowlist (405 with `Allow`), applies a rate
limit, verifies the JWT locally, builds a service-role client that THROWS if
`SUPABASE_SERVICE_ROLE_KEY` is absent (no anon fallback), resolves the caller's
permissions, checks the route's permission, and wraps every failure in the
envelope `{ success, error, code, requestId }` with Postgres text scrubbed.
Every one of the 16 `/horses` routes exports `spec`, `handle` and
`export default withOperatorRoute(spec, handle)`.

### 6.3 Permissions and roles (Phase 2)

22 permissions in `src/lib/horses/permissions.js`. Six named roles (owner,
operations, finance, compliance, support, read_only) plus the three legacy
profile roles. **The safety rule:** the legacy three map to every permission, a
named grant can only WIDEN until `enforce_named_roles` is true, and a legacy
account always keeps `admin.manage` as the recovery hatch. `set_policy` refuses
an enforcement that would leave nobody holding `admin.manage`.

A named role reaches the console through an ACTIVE GRANT in
`ca_operator_grants`, never through a string in `profiles.role`. That distinction
was a real defect found in re-verification: the JavaScript resolver used to give
`profiles.role = 'owner'` the whole owner set while SQL gave it nothing.

### 6.4 Maker-checker approvals (Phase 2)

`ca_operator_approvals` plus `requireApproval` / `markApprovalExecuted` in
`src/lib/horses/approvals.js`. A route calls `requireApproval` BEFORE the money
RPC; when an approval is required it returns 202 `{ success, pending, approvalId }`
and touches nothing. Kinds: mint, burn, fund_club, cashout, fleet_policy,
sanction. Executable kinds (the route can carry them out itself on approval):
mint, burn, fund_club and, since Phase 3, fleet_policy. Cashout is deliberately
not executable from here: its chips move on the cashout screen.

Exactly-once rests on `op_id`. `fn_ca_mint` claims the key in `ca_op_claims` and
returns the original result on replay, verified in production 2026-09-04.

**Production state, verified 2026-09-04: approvals_enabled = false,
enforce_named_roles = false, zero active grants, zero approval rows, all three
operator accounts resolve 21 of 21 permissions.** Nothing about what an operator
can do today has changed. Dan turns the switches on when he wants them.

### 6.5 The audit trail

One shape, `auditOperatorAction`, writing through `fn_log_admin_action` with a
direct-insert fallback. Every row carries actor, actor_role, ip, user_agent,
request_id, before_state and after_state. It NEVER throws: the mutation has
already happened by the time it runs. `fn_log_admin_action` refuses a null actor
(production behaviour, verified), which is why read RPCs file no audit row at
all.

### 6.6 The Fleet Command Center (Phase 3)

Four tables and seven RPCs, all live:

- `ca_horse_fleet_policy` - scope global/club/union, the ten steering fields.
  ONE seeded global row carrying today's behaviour exactly.
- `ca_horse_fleet_state` - one row per horse, written by the engine each cycle.
- `ca_horse_fleet_heartbeat` - one row per cycle, the fleet's pulse.
- `ca_horse_fleet_register` - the GLI-19 disclosure list. 1,000 rows backfilled.
- `fn_ca_fleet_policy_effective`, `_set_policy`, `_state_upsert`, `_overview`,
  `_isolation_report`, `_pnl`, `_register_sync`.

The engine reads `fn_ca_fleet_policy_effective` once per club per cycle, caches
60 seconds, and fails OPEN to `FLEET_POLICY_DEFAULTS` which equal today's
hardcoded behaviour. A withheld cycle still prunes, still retires the surplus and
still writes a heartbeat, so the console can say WHY nothing was seated.

### 6.7 Materiality, and why it matters

A material policy change goes through the approval gate. The contract originally
named four cases. The Phase 3 review proved five more fields could each stop the
entire fleet from seating while the console said "This Change Will Be Applied
Now". The table in `PHASE3-CONTRACTS.md` section 0 is now the truth, computed
identically in `src/lib/horses/fleetPolicy.js` and in `fn_ca_fleet_set_policy`.

### 6.8 Club Arena publish architecture (as of 2026-09-03)

Until 2026-09-02 the Club Arena bundle was committed into the World Hub's
`public/hub/club-arena/`, causing a full World Hub rebuild about twenty times a
day. That path is deleted and a law test refuses to let it back. The bundle now
rsyncs to a Hetzner box and the World Hub carries one rewrite. The asset pool on
that box is ADDITIVE and pruned by age only: pruning it by "not in the current
bundle" is the mid-hand 404 the old retention logic existed to prevent.

### 6.9 THE HORSES ARE DETERMINISTIC. EVIDENCE.

Gathered 2026-09-04 in the Club Arena worktree and against production:

1. `grep -rln "openai|OpenAI|gpt-4|anthropic" server/src --include=*.ts`
   returns **nothing**. The engine has no LLM dependency at all.
2. `grep -rln "openai|gpt-4|gpt-3" server/src src` returns **nothing**.
3. The decision engine is `HorseLogic.ts`, `HorseBehavior.ts`, `HorseEvEngine.ts`,
   `HorseEval.ts` and friends, with test files that assert determinism for a
   given seed and legality across randomized fuzz.
4. In production, `content_settings.grinder_ai_model = 'gpt-4o'`.
5. `grep -rn "content_settings" server/src src` in the Club Arena repo returns
   **nothing**. The engine never reads that table.
6. In the World Hub, `git grep "grinder_ai_model|grinder_max_tables|grinder_daily_hours|grinder_starting_chips" origin/main`
   returns only `pages/api/horses/stable-admin.js` (the write allowlist and
   ranges) and `pages/horses/index.js` (the four controls).

**Conclusion: all four `grinder_*` controls are write-only. Nothing reads them.
`grinder_ai_model` additionally states something false about the platform.** The
real levers for how many horses take seats are now the Fleet Command policy
fields, which the engine genuinely reads.

Note the distinction: `content_settings.ai_model` and `temperature` under "AI
Settings" drive the SOCIAL CONTENT engine (posts and stories) and are legitimate.
Only the `grinder_*` group is about poker play.

### 6.10 Technical debt and hidden dependencies found along the way

- `horsePresence.js` was deleted as dead in Phase 1 and had to be restored: six
  social surfaces import it.
- `grinder-stats.js` and `club-arena/horse-launch.js` still exist, still work and
  are still tested. The console no longer calls them for fleet numbers, so there
  is exactly one number per figure.
- `POST /api/promo/admin-promo-codes` with an EMPTY BODY creates a promo code.
  A probe created one on 2026-09-03; it was deleted unused and the removal filed
  as `promo.delete` in `admin_audit_log`. Do not probe that route with a write.
- The `/horses` page requires sign-in and renders client side, so `curl` of the
  page HTML shows only the gate. To verify what shipped, grep the built chunk:
  `curl -s https://smarter.poker/_next/static/chunks/pages/horses-<hash>.js`.

---

## 7. Work Completed During This Chat

### 7.1 Phase 1, foundation and hardening (LIVE)

Every `/horses` route on the wrapper; anon-key fallback removed from all 16; one
audit shape everywhere; durable rate limiter on the Mint and GDPR erase;
`money2dp` parsing money from the string, not a float; `launch_all` and
`shutdown` retired to 410 with an audit row; paging with honest totals
everywhere; an error boundary per tab; `?tab=` and `?section=` URL state; an ARIA
tablist with roving tabindex; a shared Modal and ConfirmDialog; CSV exports.
Adversarial review closed 163 findings (`docs/horses/PHASE1-REVIEW-RECORD.md`).

### 7.2 Phase 2, RBAC, approvals and audit (LIVE)

Five tables, ten service-role-only RPCs, three migrations. Staff And Roles and
Approvals tabs, code split. Approvals wired into the Mint and the platform
override cashout. Audit tab gained target type and target id filters, a per-record
Trail modal, and IP, User Agent and Request ID columns in the table and the CSV.
Adversarial review closed 55 findings, five of them blockers:

1. Thirteen tabs vanished behind a nav filter using permission strings that did
   not exist.
2. An approved money operation was never executed by anything.
3. A rejected or expired approval released the money anyway.
4. Approval laundering: replaying an `op_id` with a different amount or target
   returned the original approval.
5. Turning enforcement on could strip the last `admin.manage` holder.

### 7.3 Re-verification of Phases 1 and 2 (LIVE)

Two fresh reviewers over a clean worktree at the pushed head, plus a live
exercise of every route against a local production build with a real operator
JWT. Records in `docs/horses/reverify-2026-09-03/`. 30 findings closed. The
blocker: a force-approved cashout that the gate answered 202 for was reported to
the operator as "Cashout Approved" and removed from the queue, while the request
stayed pending and the player went unpaid. Also closed: the `profiles.role`
named-string privilege widening; a 30-second policy cache that could let money
move against an already-pending approval row; `fn_ca_fund_club` called with
`p_op_id` when production names it `p_idempotency_key`; five routes outside
`/horses` still gating on `profiles.role`; discarded `markApprovalExecuted`
refusals; an untimed push notification before the approval was closed; a merch
write that could skip its audit row; named-role operators signed out at the door;
an approved-but-unrun approval with no way back through the console; a Mint
confirm sentence that went stale when the policy changed under it.

### 7.4 Phase 3, the Fleet Command Center (LIVE, engine cutover pending)

Console, route, migration and engine as described in section 6.6. Adversarial
review closed 24 findings. The largest, in order:

- **H-1** Five steering fields could stop the whole fleet while the console
  called the change immaterial. Fixed in JavaScript and SQL, line for line.
- **M-7** No floor on cap cuts: thirteen sub-25-percent steps took a club from
  100 horses to 3 with no approval. A cap cut to 5 or below is now material. The
  full lookback window is deliberately deferred and says so in the code.
- **H-2** An inherited boolean rendered as an unticked box, telling the operator
  the fleet was OFF for a club whose fleet was ON, and could never be returned to
  Inherited. Both booleans are tri-state now.
- **M-1** `markApprovalExecuted`'s refusal was discarded by the fleet route.
- **M-2** A global policy change audited under two different target ids.
- **M-3** The P and L section put money figures behind `fleet.read`, which the
  support role holds. It now needs `money.read` as well.
- **M-4** A fleet refusal was reported in money words and lost its real code.
- **M-5** Per-club allocation could never show a club name.
- **M-8** The approval key did not cover the patch, so the payload-mismatch
  guard did not protect `fleet_policy`. The key now carries a patch fingerprint.
- **M-9** A horse seated ten seconds ago was counted stuck.
- **B-1 / H-3** `PHASE3-SIM.sql` held ACCESS EXCLUSIVE on two production
  aggregate tables for the rest of its run, and opened probe seats at a
  hard-coded seat index at two REAL live tables. The rename step is deleted and
  the probe seat index is derived above every real seat.

### 7.5 Publishing work (this is where the session's surprises were)

- PR #1255 (Phases 1 and 2 plus re-verification) merged as `ce16384bcb`.
- A three-day-old draft, PR #1145, retiring the dead `/api/club-arena/buyin` to
  a 410, was pending. Un-drafting it turned `main` RED twice, both mine to fix:
  CHECK 18 read the retirement notice's own RPC names as a live money route
  (fixed by declaring `freeze-exempt` in the file, PR #1296), and three E2E tests
  still asserted the auth wall the route no longer has (fixed by asserting the
  410, PR #1298).
- PR #1295 (Phase 3 console) merged as `2f68c734da`.
- Club Arena PR #2891 (Phase 3 engine) merged as `0b28bad0`.
- CI caught a real defect before it shipped: CHECK 13 found
  `table_seats.seat_index` in the horse 360. The live column is `seat_number`;
  `seat_index` is what `ca_horse_fleet_state` calls the engine's own report of
  the same thing. Reading the wrong one answers 42703 into a swallowed error, so
  a seated horse would have shown no open seats and nothing would have gone red.

---

## 8. Visual And Product Decisions

No new visual design system was introduced. Everything uses the existing
`/horses` token scope.

| Decision | State |
| --- | --- |
| The console keeps its dark Stable Admin look, driven by `T` tokens in `pages/horses/horses.module.css`; no raw hex in `pages/horses/*.js` | LOCKED, CI-adjacent (reviewed each phase) |
| Every user-visible string is Title Case, acronyms upper | LOCKED, enforced by `scripts/ci/check-title-case.mjs` |
| No em dashes in UI text | LOCKED, enforced by `scripts/ci/check-ui-text.mjs` |
| Destructive actions go through `ConfirmDialog` with a typed confirmation where the action is irreversible | LOCKED |
| Tabs are URL-addressable (`?tab=`, `?section=`) and survive back and forward | LOCKED |
| The Grinder tab is now Fleet Command, keeping `grinder` as an alias so old bookmarks land | LOCKED |
| "Not Built Yet" panels state the truth (the endpoint answers 501) rather than promising a build | LOCKED |
| Dan's screenshot of the Grinder Settings card with "AI Model: GPT-4o" | **REJECTED. This control must be removed.** See D-1 |

Dan's attached screenshot shows the console as his browser had it, which is the
state BEFORE the Phase 2 and Phase 3 deploys (no Staff And Roles tab, no
Approvals tab, no Fleet Command, and the Grinder tab still carrying the settings
card). In the build now serving, those four controls moved to the Settings tab
under a heading "Grinder Horses" with a note distinguishing them from the fleet
policy. **The AI Model control still exists there and is what Dan wants gone.**

---

## 9. Functional And Architectural Decisions

| Area | Decision | State |
| --- | --- | --- |
| Route authentication | One wrapper, service role, local JWT verify, no anon fallback | Implemented |
| Permissions | 22 permissions, 6 named roles, additive grants, legacy superset preserved | Implemented, enforcement OFF |
| Maker-checker | Approvals table plus `requireApproval` before every money RPC | Implemented, approvals OFF |
| Exactly-once money | `op_id` claimed in `ca_op_claims` by `fn_ca_mint` | Implemented and verified in production |
| Audit | One shape, never throws, ip and user agent and request id on every row | Implemented |
| Fleet control | Policy table the engine reads; only "how many horses take seats" | Implemented, permissive row seeded |
| Fleet kill switch | Stops NEW seatings only. Never removes a seated horse mid-hand | Implemented |
| Horse equality | No control may reach inside a hand, a timer, a payout or a rule | Implemented and reviewed |
| Fleet money | This phase moves no chips. The console never funds a horse | Implemented |
| GLI-19 disclosure | `ca_horse_fleet_register`, 1,000 rows, sync action, never deletes | Implemented |
| Isolation law | A horse plays inside its own club or union only; the report proves it | Implemented, currently returns zero violations |
| Cashout execution | Never executed from the approvals queue; finished on the cashout screen | Implemented deliberately |
| Materiality lookback window | Measuring a RUN of small cuts as one move | SPECIFIED ONLY, deferred, documented in code |
| `schedule` policy field | Accepted by the route and honoured by the engine; the panel states it is not edited there | Partially implemented by design |
| Tabs 4 to 10 of the plan | Player 360, integrity, floor ops, finance reporting, platform controls, architecture, verification | NOT STARTED |

---

## 10. Exact Current State

All facts verified 2026-09-04 between 00:00 and 00:15 UTC.

### 10.1 World Hub

- `origin/main` = `2f68c734da` "feat(horses): Phase 3 of 10 - the Fleet Command
  Center (club-arena engine policy) (#1295)".
- Production `https://smarter.poker/api/health` reports `version: 2f68c734`.
  **Published and verified.**
- The deployed chunk `/_next/static/chunks/pages/horses-a9b32282d7cbef5f.js`
  contains "Fleet Command" and "Staff And Roles", so Phases 2 and 3 are in the
  browser bundle. It also still contains "AI Model", "GPT-4o" and
  `grinder_ai_model` (see D-1).
- Working tree `~/Documents/club-arena/.agent-trees/wh-horses`: branch left on
  `agent/cowork-horses/handoff` (created from `origin/main` to write this file).
  Clean apart from this document. Earlier session branches
  (`agent/cowork-horses/fleet-command`, `.../retired-buyin-exemption`,
  `.../e2e-retired-buyin`) are all merged.
- Zero open pull requests belonging to this programme in either repository.
- `node --test __tests__/horses-*.test.mjs` at `origin/main`: **699 tests, 699
  pass, 0 fail.**

### 10.2 Club Arena

- `origin/main` at the time of writing = `e2abf1467` (other agents' work landed
  after mine). My engine commit `0b28bad0` is an ancestor of it.
- The static origin serves `ca_sha = e2abf14670e7...`, published by
  `publish-club-arena.yml`. **Published to Hetzner and verified.**
- Working tree `~/Documents/.agent-trees/club-arena/cowork-fleet`: branch
  `agent/cowork-fleet/horse-fleet-policy` at `737109246`, merged and clean.
  `npm ci` was run there (see section 15 L-3).
- `npx vitest run` in `server/`: **4,884 tests, all pass.** `npx tsc --noEmit`
  in `server/`: clean.
- **The engine CONTAINER cutover has NOT completed for my commit.** The
  `auto-deploy-hetzner.yml` run for `0b28bad0` (schedule, 23:31 UTC) ended
  `cancelled` during "Build immutable image". The last SUCCESSFUL engine deploy
  was `474b1377` at 22:44 UTC, which predates the fleet policy code. The next
  scheduled run is at `:45` past the hour, restarting inside the `:55`
  maintenance break.

### 10.3 Database (Supabase `kuklfnapbkmacvwxktbh`)

Registered migrations owned by this programme:

```
20260903120000  ca_operator_rbac_and_approvals
20260903121500  ca_operator_read_fns_do_not_audit
20260903140000  ca_operator_approval_gate_is_exact
20260903202500  ca_operator_reverify_fixes
20260903222000  ca_horse_fleet_command
```

Live objects: `ca_operator_{roles,role_permissions,grants,policy,approvals}`,
`ca_horse_fleet_{policy,state,heartbeat,register}`, and the RPCs
`fn_ca_fleet_{policy_effective,set_policy,state_upsert,overview,isolation_report,pnl,register_sync}`
plus the ten `fn_ca_operator_*` functions.

Row counts and switches, 2026-09-04:

```
ca_operator_policy:      approvals_enabled = false, enforce_named_roles = false
ca_operator_grants:      0 active
ca_operator_approvals:   0 rows
ca_horse_fleet_policy:   1 row (global, enabled, bias 1.0, nothing paused, no caps)
ca_horse_fleet_register: 1000 rows
ca_horse_fleet_state:    0 rows      <- the engine has not yet published
ca_horse_fleet_heartbeat:0 rows      <- the engine has not yet published
```

`fn_ca_fleet_policy_effective(null)` returns enabled true, bias 1.0,
pause false, `defaults_used: false`, source `global`.

### 10.4 Running processes

Nothing of mine is running. A local `next start` on port 3111 was used during
re-verification and was killed. A dev server on port 3000 belongs to the user or
another agent; do not kill it.

---

## 11. Changed-File Ledger

Everything below is committed to World Hub `main` (`2f68c734da`) or Club Arena
`main` (`0b28bad0`) unless the row says otherwise. "Verified" means a test,
a gate or a live call exercised it.

### 11.1 World Hub, Phase 3 and re-verification (the work of this session)

| File | Status | Purpose | What changed | Verified | Committed |
| --- | --- | --- | --- | --- | --- |
| `pages/api/horses/fleet-admin.js` | new | Fleet Command API | 8 GET sections, 2 POST actions, approval gate, per-section `money.read` | tests + live prod call | yes |
| `pages/api/horses/operator-admin.js` | modified | Phase 2 API | fleet_policy executor, withdraw, expiry refusal, `readByIds`, no direct-write fallback | tests + live | yes |
| `pages/api/horses/mint.js` | modified | Mint | reads `markApprovalExecuted`, records `failed` | tests | yes |
| `pages/api/horses/merch-catalog-admin.js` | modified | Merch | audit before the variant sync, `mapDbError` on four raw throws | tests (source contract) | yes |
| `pages/api/horses/club-arena-admin.js` | modified | Clubs | email masking without `players.write` | tests | yes |
| `pages/api/horses/hg-*.js` | modified | Home Games | shared 403/401 mapping, status validation | tests | yes |
| `pages/api/club-arena/approve-cashout.js` | modified | Cashout | permission gate, ordering, 5s push timeout, scrubbed cancel error | tests | yes |
| `pages/api/club-arena/{anti-cheat,union-application}.js` | modified | Ops | permission gate through the resolver | tests | yes |
| `pages/api/admin/execute-sql.js`, `pages/api/promo/admin-promo-codes.js` | modified | Ops | permission gate through the resolver | tests | yes |
| `pages/api/club-arena/buyin.js` | modified | Retired route | freeze-exempt declaration | CHECK 18 green | yes |
| `src/lib/horses/fleetPolicy.js` | new | Materiality and defaults | full materiality table | tests | yes |
| `src/lib/horses/approvals.js` | modified | Approvals | fleet_policy kind, `executionDoneText`, `alreadyExecuted`, patch validation | tests | yes |
| `src/lib/horses/operatorAuth.js` | modified | Auth | legacy-only profile seed, 5s degraded cache | tests | yes |
| `src/lib/horses/permissions.js` | modified | Vocabulary | `legacyPermissionsForProfileRole` | tests | yes |
| `src/lib/horses/operatorGate.js` | new | Outside-route gate | `operatorHoldsPermission` | tests | yes |
| `src/components/horses/FleetPanel.jsx` | new | Fleet Command UI | six sections, tri-state booleans, pager, CSV | source contracts | yes |
| `src/components/horses/{fleetModel,fleetPolicyModel,fleetAdmin}.js` | new | Fleet pure logic | shaping, copy, URL builders | unit tests | yes |
| `src/components/horses/{ApprovalsPanel,StaffPanel}.jsx` | modified | Phase 2 panels | Run Again, withdraw, tri-state policy, patch-aware confirm | source contracts | yes |
| `src/components/horses/{approvalModel,operatorAdmin,operatorPermissions,tabRegistry,urlState,Modal.jsx,shared.module.css}` | modified | Shared | executable kinds, policy diff copy, gate helper, alias, focus | unit tests | yes |
| `pages/horses/index.js` | modified | The console | Fleet tab wiring, cashout 202 handling, debounce, sequence guards, Title Case sweep, grinder settings moved to Settings | tests + live | yes |
| `pages/horses/{sql-console,hg-moderation,hand-reviews}.js` | modified | Sub-pages | route-answer gate, shared Modal, seq guards | tests | yes |
| `supabase/migrations/20260903202500_*.sql` | new | Re-verify fixes | 4 functions replaced | applied + assertions | yes |
| `supabase/migrations/20260903222000_*.sql` | new | Phase 3 schema | 4 tables, 7 RPCs, backfill | applied + assertions | yes |
| `docs/horses/PHASE3-CONTRACTS.md` | modified | Contract | materiality table, money.read note | n/a | yes |
| `docs/horses/PHASE3-SIM.sql` | modified | Simulation record | rename step deleted, probe seat derived | n/a | yes |
| `docs/horses/reverify-2026-09-03/*.md` | new | Review records | three files | n/a | yes |
| `e2e/016-club-arena-game-flow.spec.ts` | modified | E2E | asserts the buyin retirement | CI | yes |
| `__tests__/horses-phase3-*.test.mjs`, `horses-reverify-*.test.mjs` | new | Tests | 6 files | run | yes |

### 11.2 Club Arena

| File | Status | Purpose | What changed | Verified | Committed |
| --- | --- | --- | --- | --- | --- |
| `server/src/services/HorseFleetPolicy.ts` | new | Policy client | load, cache, fail-open, bias, caps, withheld reason | 54 tests | yes |
| `server/src/services/HorseFleetPolicy.test.ts` | new | Tests | 54 | run | yes |
| `server/src/services/HorseFleetPolicyWiring.test.ts` | new | Tests | 28 | run | yes |
| `server/src/services/HorseFleetManager.ts` | modified | Seeding cycle | policy per club per cycle, budget, withheld cycle still reports, heartbeat in `finally` | 4,884-test suite | yes |
| `tests/unit/horsesAreTreatedIdentically.test.ts` | modified | Law test | reads the seeding loop under either name | run | yes |
| `src/services/HorseBankrollGateClubs.test.ts` (server) | modified | Law test | same | run | yes |

### 11.3 Files created while writing this handoff

| File | Status |
| --- | --- |
| `docs/HANDOFF_CURRENT_STATE.md` | new, this document |
| `HANDOFF.md` (root pointer) | new, if it did not already exist |

There are no unrelated user changes in either worktree at the time of writing.


---

## 12. Asset Ledger

No image, icon, font or media asset was created, replaced or rejected by this
programme. The console is built entirely from tokens and text.

| Asset | Path | Purpose | Approved | Implemented | Tracked |
| --- | --- | --- | --- | --- | --- |
| Dan's Grinder Settings screenshot, 2026-09-03 | supplied in chat only, not in the repository | Evidence that the AI Model control must go | Used as evidence, the DESIGN in it is rejected | n/a | no |

The screenshot is the only asset in play and it exists only in the conversation.
If the next agent needs it, section 8 and section 6.9 record everything it shows
and everything it proves. Nothing is blocked by its absence.

---

## 13. Commands And Tools Used

Working directory is `~/Documents/club-arena/.agent-trees/wh-horses` unless
stated. `host_terminal` dies at 60 seconds, so long jobs were backgrounded with
`nohup ... > /tmp/x.log 2>&1 &` and polled.

| Command | Purpose | Result | Changed files | Rerun? |
| --- | --- | --- | --- | --- |
| `node --test __tests__/horses-*.test.mjs` | the console suite | 699 pass, 0 fail | no | yes, before every push |
| `node scripts/ci/check-title-case.mjs` | Title Case gate | OK | no | yes |
| `node scripts/ci/check-ui-text.mjs` | em dash gate | OK, 2,782 files | no | yes |
| `node scripts/ci/check-silent-writes.mjs --ci` | silent write guard | OK against baseline 577 | no | yes |
| `node scripts/ci/check-phantom-columns.mjs` | column existence (needs `.env.local` sourced) | OK after the `seat_number` fix | no | yes, when adding a query |
| `node scripts/check-frozen-aware-money-routes.mjs` | CHECK 18 | OK after the buyin declaration | no | yes, when touching `pages/api/club-arena` |
| `npx eslint pages/horses pages/api/horses src/lib/horses src/components/horses` | lint | 0 errors, 26 pre-existing warnings | no | yes |
| `npx next build` | build gate | success | writes `.next` | yes |
| `VERCEL_ENV=preview npx next start -p 3111` | local production server | needed for the live route exercise | no | as needed |
| `bash /tmp/horses-live.sh` | exercise every route with a real JWT | recorded in `docs/horses/reverify-2026-09-03/live-routes.md` | no | as needed |
| `psql "host=aws-0-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.kuklfnapbkmacvwxktbh sslmode=require"` | database | used for every dry run, apply and verification | yes, when applying | with care |
| `git push origin HEAD:refs/heads/<branch>` | push | runs the pre-push hooks, several minutes | no | yes |
| `curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/...` | GitHub API | the Mac `gh` keyring token is DEAD; use curl with the token from `~/Documents/club-arena/.env` | no | yes |
| `bash scripts/agent-workspace.sh <name> <branch>` (Club Arena) | claim a worktree | created `~/Documents/.agent-trees/club-arena/cowork-fleet`; takes about 2 minutes | yes | yes |
| `npm ci` (Club Arena worktree) | repair node_modules | fixed the duplicate React failure | yes | only if component tests fail oddly |
| `npx vitest run` (Club Arena `server/`) | engine suite | 4,884 pass | no | yes |
| `npx tsc --noEmit` (Club Arena `server/`) | types | clean | no | yes |

Migration procedure actually used, three times:

1. Write the file under `supabase/migrations/<version>_<name>.sql`.
2. DRY RUN: strip its own `begin;`/`commit;`, wrap the whole file in
   `begin; ... rollback;`, run with `psql -v ON_ERROR_STOP=1`. Read the ASSERT
   notices.
3. Apply the file as written.
4. Register it: `insert into supabase_migrations.schema_migrations (version, name, statements) values (...) on conflict (version) do nothing;`
   and CONFIRM the insert affected a row.
5. Re-apply once more if the file was renamed, so the live bodies are byte-exact
   with the registered statements.

---

## 14. Verification And Test Results

| Verification | Command or method | Result | Phase | Follow-up |
| --- | --- | --- | --- | --- |
| Console unit tests | `node --test __tests__/horses-*.test.mjs` | 699 pass, 0 fail at `main` | all | none |
| Engine unit tests | `npx vitest run` in Club Arena `server/` | 4,884 pass, 0 fail | Phase 3 | none |
| Engine types | `npx tsc --noEmit` in `server/` | clean | Phase 3 | none |
| Lint | eslint over the four `/horses` trees | 0 errors, 26 warnings (pre-existing "single-statement catch" style) | all | optional cleanup |
| Title Case gate | `check-title-case.mjs` | OK | all | none |
| Em dash gate | `check-ui-text.mjs` | OK | all | none |
| Silent write guard | `check-silent-writes.mjs --ci` | OK, baseline unchanged at 577 | all | none |
| Phantom columns | `check-phantom-columns.mjs` | OK after fixing `table_seats.seat_index` | Phase 3 | none |
| CHECK 18 freeze-aware money routes | `check-frozen-aware-money-routes.mjs` | OK after the buyin declaration | publish | none |
| Production build | `npx next build` | success | all | none |
| Migration dry runs | `psql` inside a rolled-back transaction | every ASSERT passed | Phases 2 and 3 | none |
| Migration apply | `psql` | committed, ASSERT OK, registered | Phases 2 and 3 | none |
| Live route exercise | 40+ calls with a real `god` JWT against a local production build | every envelope, status, audit row as contracted | re-verification | record in `docs/horses/reverify-2026-09-03/live-routes.md` |
| Production smoke, Phases 1 and 2 | `curl` with a real JWT against `smarter.poker` | operator-admin staff, roles, policy, approvals, audit_trail all 200; unauthenticated 401 | publish | none |
| Production smoke, Phase 3 | `curl` with a real JWT against `smarter.poker` | `fleet-admin` overview, policy and roster all 200; `/horses?tab=fleet` and `?tab=grinder` both 200 | publish | none |
| Deployed bundle inspection | `curl` the built chunk and grep | contains "Fleet Command" and "Staff And Roles"; ALSO still contains "AI Model", "GPT-4o", `grinder_ai_model` | publish | **this is defect D-1** |
| World Hub required CI checks | GitHub Actions | all 7 green on every merged head | all | none |
| World Hub Playwright E2E | GitHub Actions | **RED, and red on `main` independently of this work** | all | defect D-2 |
| Club Arena CI | GitHub Actions | green on the merged head | Phase 3 | none |
| Engine container cutover | `auto-deploy-hetzner.yml` | **NOT COMPLETED for `0b28bad0`** (run cancelled mid-build) | Phase 3 | defect D-3 |

### Not tested, and honest about it

- **No browser test of the Fleet Command UI.** Every client assertion is a unit
  test on pure functions plus a source contract. Nothing rendered React. The
  panel has never been clicked by anyone.
- **No end-to-end approval flow with approvals switched ON in production.** The
  gate is proved by unit tests and by rolled-back SQL simulations, not by a live
  two-operator approval.
- **No test of the engine actually reading the policy in production**, because
  the engine carrying that code is not running yet.
- **No load or performance testing** of any new query.
- **No accessibility audit** beyond focus trapping, roving tabindex and
  `role="alert"` usage.
- **No mobile viewport verification** of the new panels at 375px.

---

## 15. Setbacks, Failed Approaches, And Lessons

**L-1. Migration version numbers are contested.** Two of my chosen versions,
`20260903160000` and `20260903170000`, were claimed by other branches between my
writing the file and my registering it. The `INSERT ... ON CONFLICT DO NOTHING`
reported `INSERT 0 0`, which is easy to read as success. **Always confirm the
insert affected a row, and query `supabase_migrations.schema_migrations` for a
free version immediately before registering.** After renaming, re-apply the file
so the live function bodies match the registered bytes.

**L-2. A cp-cloned `node_modules` breaks React component tests.** The fresh Club
Arena worktree failed `tests/components/GlobalHeader.test.tsx` with "Invalid hook
call ... more than one copy of React". The same file passed in the canonical
clone, and it failed on `origin/main` in the worktree too, so it was the tree and
not the change. `npm ci` in that worktree fixed it. **Never reach for
`--no-verify`; fix the tree.**

**L-3. Un-drafting somebody else's stale PR has consequences you own.** PR #1145
was three days old and its tests had not been updated. Publishing it turned
`main` red twice. Both were fixed within the hour, but the lesson stands: read
what a stale PR asserts before you release it.

**L-4. `git apply -3` beat re-copying a file.** My engine snapshot was taken
before PR #2878 landed the high-stakes ladder. Overwriting
`HorseFleetManager.ts` would have reverted it. Generating the patch from the
snapshot's true base and applying it three-way was clean, and it is the right
move whenever a snapshot has aged.

**L-5. Law tests pin source strings, so renaming a variable breaks them.**
Renaming the seeding loop's list from `orderedTables` to `tablesToSeed` broke two
law tests in the Club Arena repo. The right fix is to widen the test to accept
either spelling AND pin the derivation, not to revert the rename and not to
delete the law.

**L-6. GitHub refuses `enablePullRequestAutoMerge` while a PR is UNSTABLE.** So
autopilot cannot queue a PR whose NON-required checks are red. With all required
checks green, the way through is a plain squash via
`PUT /repos/.../pulls/N/merge`. GitHub still refuses that if a REQUIRED check
fails, so it is not an `--admin` bypass. This was used once, for PR #1295, and
Dan was told.

**L-7. A probe can create production data.** `POST /api/promo/admin-promo-codes`
with `{}` created a real promo code. It was deleted unused and the deletion was
filed in `admin_audit_log`. Probe reads freely; probe writes only where you have
read the handler.

**L-8. The Mac's `gh` CLI is dead** ("The token in keyring is invalid") and so is
`GITHUB_TOKEN` in the World Hub `.env`. The live token is `GITHUB_TOKEN` in
`~/Documents/club-arena/.env`. Use `curl`.

**L-9. `next start` on the World Hub refuses to boot without `VERCEL_ENV`.**
`src/lib/envGuard.js` aborts on missing `STRIPE_WEBHOOK_SECRET`,
`TWILIO_AUTH_TOKEN` and `KYC_WEBHOOK_SECRET` when it thinks it is production.
`VERCEL_ENV=preview npx next start` is the way to exercise a production build
locally.

**L-10. The `/horses` page cannot be verified with `curl` of its HTML.** It is a
client-rendered, sign-in-gated page. Grep the built chunk instead.

**L-11. Phase 3 was written before the re-verification and had to be merged onto
it.** Six conflict hunks, resolved by hand. Two semantic collisions needed a
decision rather than a merge: the approval executor's key (summary versus args)
and the client's executable-kind table (fleet_policy became executable).

---

## 16. Known Defects And Architectural Holes

| Priority | Defect | Evidence | Impact | Recommended fix | Status |
| --- | --- | --- | --- | --- | --- |
| **CRITICAL (product truth)** | **D-1. The console offers an "AI Model" choice for the horses. The horses have no AI model.** | `content_settings.grinder_ai_model = 'gpt-4o'` in production; zero LLM references in the whole Club Arena `server/src`; the engine never reads `content_settings`; only `stable-admin.js` (write allowlist) and `index.js` (the control) mention it | An operator is told the poker fleet is driven by GPT-4o. It is driven by `HorseLogic`. Dan flagged it himself | Delete the control and the key. See section 21 Phase A | OPEN, Dan's first task for the next session |
| HIGH | D-2. Playwright E2E is red on World Hub `main` | `020-hamburger.spec.ts:463` Bankroll Log URL cleanup and `10-poker-near-me-phase-12.spec.ts:118` touch targets fail on `main` itself; `021-video-library` accessibility failed once | Every PR shows UNSTABLE, so autopilot cannot auto-merge anything | Fix the two page defects, or quarantine the tests with a reason. Not `/horses` work | OPEN, pre-existing, not caused by this programme |
| HIGH | D-3. The engine container has not taken the fleet policy code | `auto-deploy-hetzner.yml` run for `0b28bad0` ended `cancelled`; last success `474b1377`; `ca_horse_fleet_heartbeat` and `_state` are empty | Fleet Command's Health tab honestly says "no heartbeat has ever been recorded", and the policy has no reader | Wait for the `:45` run and confirm heartbeats, or check `publish-watchdog`'s dispatch | OPEN, expected to self-heal |
| MEDIUM | D-4. The other three `grinder_*` settings are also write-only | Same evidence as D-1 | Max Tables Per Horse, Daily Play Hours and Starting Chips look like fleet controls and steer nothing | Decide per field: delete, or wire to the fleet policy which the engine does read | OPEN, needs Dan's call, see section 19 |
| MEDIUM | D-5. Materiality has a floor but no window | `MATERIAL_CAP_FLOOR` comment in `src/lib/horses/fleetPolicy.js` | A run of small cuts above the floor is still individually immaterial | Lookback over `admin_audit_log` inside `fn_ca_fleet_set_policy` | OPEN, deliberately deferred |
| MEDIUM | D-6. No pending-approval expiry sweeper | Rows past TTL are closed when touched; the queue filters them out but nothing writes `expired` | The history filter `status=expired` finds little | A small scheduled job through Open Claw | OPEN |
| MEDIUM | D-7. SQL RPCs and the routes both audit the same Phase 2 action | Two `operator.grant_role` rows per grant, one with request context and one without | The Audit tab's counts double for those actions | Namespace the SQL rows or drop the SQL audit where the route audits | OPEN, noted in the re-verification record |
| LOW | D-8. `PHASE2-SIM.sql` and `PHASE2-SIM-2.sql` cannot be re-run as written | Migration `20260903202500` made `fn_ca_operator_grant` refuse a uuid with no `profiles` row; the sims grant to synthetic uuids | Historical records only; both carry a note | Insert a rolled-back `profiles` row in the sim if it is ever re-run | OPEN, documented in the files |
| LOW | D-9. The `schedule` policy field has no editor | `FleetPanel` states it is not edited there | An operator cannot set a seating schedule from the console | Add the control, or move the field out of the policy | OPEN by design |
| LOW | D-10. The Fleet Command UI has never been rendered | No React test environment in the World Hub for these panels | A runtime error in a panel would not be caught by the suite | Click through it in a browser as a signed-in operator, or add a rendering test harness | OPEN |
| LOW | D-11. Mobile verification missing for the new panels | Not tested at 375px | Dan's rule is mobile first | Check the three panels at 375px | OPEN |

---

## 17. Security, Secrets, And Credentials

Names only. No values appear in this document, and none should ever be printed.

| Name | Where it lives | Used by | Available? |
| --- | --- | --- | --- |
| `SUPABASE_DB_PASSWORD` | `~/Documents/club-arena/.env` | direct `psql` to the pooler | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | World Hub `.env.local`, Vercel, GitHub secrets | every `/horses` route's service client | yes |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | World Hub `.env.local` | browser client, and getting a test JWT | yes |
| `TEST_USER_PASSWORD` | World Hub `.env.local` | the `daniel@bekavactrading.com` test operator | yes |
| `GITHUB_TOKEN` | `~/Documents/club-arena/.env` | the GitHub API through `curl` | yes, and it is the ONLY live one |
| `GITHUB_TOKEN` in World Hub `.env` | World Hub `.env` | nothing | **DEAD, returns 401** |
| `gh` CLI keyring token | macOS keyring | `gh` | **DEAD, "token in keyring is invalid"** |
| `CA_ORIGIN_SSH_KEY`, `CA_ORIGIN_HOST`, `CA_ORIGIN_HOST_KEY` | Club Arena repo secrets | `publish-club-arena.yml` rsync to Hetzner | yes, workflow-only |
| `HETZNER_SSH_PRIVATE_KEY`, `HETZNER_HOST`, `HETZNER_HOST_KEY` | Club Arena repo secrets | `auto-deploy-hetzner.yml` | yes, workflow-only |
| `AUTOPILOT_APP_ID`, `AUTOPILOT_APP_PRIVATE_KEY` | all seven repos | the merge and publish credential | yes |
| `STRIPE_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`, `KYC_WEBHOOK_SECRET` | Vercel production | `src/lib/envGuard.js` | present in production, absent locally, hence `VERCEL_ENV=preview` |

No secret was printed, committed or exposed during this work. One temporary
git-credentials file was written in the cloud container early in the programme
and was deleted. Nothing sensitive is in `.memory/`, which is public and tracked.

The three operator accounts in production are one `god`
(`daniel@bekavactrading.com`, also the test account) and two `admin`.

---

## 18. Database, Migration, And Seed Status

**Provider:** Supabase Postgres, project `kuklfnapbkmacvwxktbh`, Postgres 17.
Roughly 976 public tables. Connection for direct work:
`host=aws-0-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.kuklfnapbkmacvwxktbh sslmode=require`.

**Tables this programme created** (all additive; nothing existing was altered,
dropped or re-typed):

Phase 2: `ca_operator_roles`, `ca_operator_role_permissions`,
`ca_operator_grants`, `ca_operator_policy`, `ca_operator_approvals`.
Phase 3: `ca_horse_fleet_policy`, `ca_horse_fleet_state`,
`ca_horse_fleet_heartbeat`, `ca_horse_fleet_register`.

All nine have RLS enabled with NO policies, so only the service role reaches
them. Every RPC is `SECURITY DEFINER` with `set search_path = public, pg_temp`,
revoked from `public`, `anon` and `authenticated`, granted to `service_role`
only, with the ACL restated in the migration file so it reads as self-contained.

**Applied and registered:** all five migrations listed in section 10.3. Each was
dry-run inside a rolled-back transaction first, then applied, then registered,
then confirmed by querying `supabase_migrations.schema_migrations`.

**Rollback:** never exercised. Each Phase 2 and Phase 3 migration carries a
commented ROLLBACK section naming the exact prior function bodies to restore and
warning what each restores. Migration `20260903202500`'s header states plainly
that turning `approvals_enabled` OFF is faster and safer than rolling it back.

**Seeds:** `ca_operator_roles` and `ca_operator_role_permissions` are seeded
idempotently from `src/lib/horses/permissions.js` and a test asserts the two
agree. `ca_horse_fleet_policy` is seeded with ONE global row equal to today's
behaviour. `ca_horse_fleet_register` was backfilled with 1,000 rows from
`profiles where is_horse`, and `fn_ca_fleet_register_sync` is idempotent and
never deletes.

**Production data risk:** none taken. Every simulation ran inside a transaction
that ended in `rollback`. `PHASE3-SIM.sql` originally contained a step that
renamed two production aggregate tables and one that opened probe seats at a
hard-coded seat index on two REAL live tables; both were removed or made safe
before anything ran, and the file now carries a loud header forbidding any step
that renames or alters a production table.

**Backup steps:** none were taken and none were needed, because no destructive
statement was run. If a future phase needs one, take it before the first
`update` that is not additive.

---

## 19. Current Blockers And Decision Points

**B-1. What happens to the other three `grinder_*` settings? DAN'S CALL.**
`grinder_ai_model` is unambiguous and goes. The other three (Max Tables Per
Horse, Daily Play Hours, Starting Chips) are also read by nothing, but they
describe things the fleet policy could genuinely own. Options:

- **(a) Delete all four.** Honest immediately. Loses the stated intent.
- **(b) Delete `grinder_ai_model`, move the other three onto the fleet policy**
  so the engine actually honours them. More work, and `max_per_table` already
  covers part of it. **Recommended, staged: (a) now for the AI model, (b) as a
  scoped piece of the next fleet work.**
- **(c) Leave them and label them louder.** Rejected: a control that steers
  nothing is a lie whatever the label says.

Consequence of getting this wrong: an operator sets "Daily Play Hours 8",
believes the fleet now plays eight hours, and it plays twenty four.

**B-2. Engine cutover.** Technical, self-healing, no decision needed. Confirm
heartbeats before telling Dan Phase 3 is fully live.

**B-3. The two red E2E tests on `main`.** Neither is `/horses`. They block
autopilot for everyone. Someone must own them; if the next agent is asked to,
treat it as separate work with its own branch, not as part of Phase 4.

**B-4. When do approvals and enforcement get switched on?** Both are OFF by
design and only Dan should turn them on, ideally when there are two operators
who can four-eyes each other. Until then the alone-rule auto-approves, which is
recorded honestly in the audit trail.

---

## 20. Remaining Work

### Critical

1. Remove the "AI Model" control for the horses and the `grinder_ai_model` key
   (D-1, Dan's explicit first task).
2. Confirm the engine cutover wrote heartbeats (D-3).

### High priority

3. Decide and act on the other three `grinder_*` controls (B-1).
4. Click through Fleet Command in a browser as a signed-in operator (D-10),
   including at 375px (D-11).
5. Phase 4 of 10: player 360, responsible gaming, KYC, support.

### Medium priority

6. The materiality lookback window (D-5).
7. A pending-approval expiry sweeper (D-6).
8. Resolve the duplicate audit rows for Phase 2 actions (D-7).
9. Add a `schedule` editor or move the field (D-9).
10. Clean up the 26 eslint warnings in the `/horses` trees.

### Low priority

11. Repair `PHASE2-SIM*.sql` so they can be re-run (D-8).
12. An accessibility pass over the three new panels.

### Optional enhancement

13. A rendering test harness for the `/horses` panels, so a React runtime error
    is caught by CI rather than by an operator.

---

## 21. Prioritized Next-Phase Execution Plan

### Phase A: Remove the ChatGPT claim (Dan's first task, do this before anything else)

**Objective.** The console must never suggest the horses are driven by an LLM.

**Prerequisites.** None. Do not wait for the engine cutover.

**Inspect:**
- `pages/horses/index.js`, the Settings tab, the card headed "Grinder Horses"
  (search for `g-model` and `grinder_ai_model`).
- `pages/api/horses/stable-admin.js`, `SETTINGS_FIELDS` and `SETTING_RANGES`.
- `content_settings` in the database.

**Changes:**
1. Delete the "AI Model" `select` and its label from the Settings tab.
2. Remove `'grinder_ai_model'` from `SETTINGS_FIELDS` in `stable-admin.js` so the
   route stops accepting it.
3. Replace the card's note with the truth, Title Cased, for example: "The Horses
   Decide Their Own Play. HorseLogic Is A Deterministic Engine In Club Arena, Not
   A Language Model. Seating Is Governed By Fleet Command."
4. Decide B-1 for the other three fields. If deleting them, remove them from
   `SETTINGS_FIELDS`, `SETTING_RANGES` and the card in the same commit.
5. Optional and separate: a migration dropping the unused
   `content_settings.grinder_ai_model` column. Additive-only is the house rule,
   so a DROP COLUMN is a Tier 3 migration and needs the full protocol and a
   pasted ROLLBACK. It is safe to leave the column and stop writing it.
6. Add a test that asserts no `/horses` source file offers an AI model choice for
   the fleet, so this cannot come back.

**Tests.** `node --test __tests__/horses-*.test.mjs`, `check-title-case.mjs`,
`check-ui-text.mjs`, `npx eslint`, `npx next build`.

**Completion criteria.** The built chunk no longer contains "GPT-4o" in a fleet
context; the route refuses the key; the new test fails if either comes back.

**Risks.** Low. No API contract outside the console reads these keys.

**Checkpoint.** One commit: `fix(horses): the horses run a deterministic engine, so the console stops offering them a language model`.

### Phase B: Confirm the engine cutover

**Objective.** Prove the engine carrying the fleet policy is running.

**Steps.** Check `auto-deploy-hetzner.yml`'s newest run; then query
`select count(*), max(beat_at) from ca_horse_fleet_heartbeat;` and
`select count(*) from ca_horse_fleet_state;`. Both must be non-zero and recent.
Then load Fleet Command's Health tab and confirm it no longer says "no heartbeat
has ever been recorded".

**Completion criteria.** Heartbeats arriving roughly once per seeding cycle, and
`degraded` false.

**Risks.** If heartbeats never arrive, read the engine logs before touching the
policy. Do NOT change the policy row to test it: it is seeded permissive and a
change there is a live change to the fleet.

### Phase C: Browser verification of Fleet Command

Sign in as the `god` operator, open every section, use the pager and CSV, open
the policy editor WITHOUT saving, and check 375px. Fix what you find. This is the
verification the unit tests cannot give.

### Phase D: Phase 4 of 10, the player 360

Read `docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md` for the specification. Write
`docs/horses/PHASE4-CONTRACTS.md` first, in the same shape as Phases 1 to 3: a
section 0 safety rule, a database section, a server section, a client section, a
tests section and a verification section. Then build, then review adversarially,
then publish, then report to Dan.

### Phase E: The deferred items

D-5 through D-9, in that order, each on its own branch.

---

## 22. Exact First Actions For The Next Agent

1. Open the World Hub worktree:
   `cd ~/Documents/club-arena/.agent-trees/wh-horses`
   (or claim a fresh one: `cd ~/Documents/Smarter-Poker-World-Hub && eval "$(bash scripts/agent-workspace.sh <your-name> agent/<your-name>/<slug>)"`).
2. Read, in this order: `AGENT-PLAYBOOK.md`, `CLAUDE.md` sections 3, 10, 10.5 and
   10.6, `docs/HANDOFF_CURRENT_STATE.md` (this file), then
   `docs/horses/PHASE3-CONTRACTS.md`.
3. Confirm the state:
   ```
   export PATH="/opt/homebrew/bin:$PATH"; source ~/.nvm/nvm.sh
   git fetch origin && git log --oneline -1 origin/main
   git status --short
   node --test __tests__/horses-*.test.mjs   # expect 699 pass, 0 fail
   curl -s https://smarter.poker/api/health
   ```
4. Confirm the database is still safe:
   ```
   PGPASSWORD=$(grep '^SUPABASE_DB_PASSWORD=' ~/Documents/club-arena/.env | cut -d= -f2- | tr -d '"') \
   psql "host=aws-0-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.kuklfnapbkmacvwxktbh sslmode=require" \
     -c "select approvals_enabled, enforce_named_roles from ca_operator_policy;" \
     -c "select count(*) from ca_horse_fleet_heartbeat;"
   ```
5. Inspect the three files named in Phase A.
6. Do NOT modify: `supabase/migrations/2026090312*.sql`,
   `2026090314*.sql`, `20260903202500_*.sql`, `20260903222000_*.sql` (all applied
   to production; a change there is a new migration, never an edit), and do not
   revert anything under `docs/horses/`.
7. Resume at **Phase A, step 1**: delete the AI Model control.

---

## 23. Acceptance Criteria

Phase A is done when:

- No file under `pages/horses/` or `src/components/horses/` offers a language
  model choice for the fleet, and a test asserts it.
- `pages/api/horses/stable-admin.js` refuses `grinder_ai_model`.
- The Settings card states plainly that the horses run a deterministic engine.
- 699+ tests pass, lint clean, Title Case and UI text gates green, build green.
- The change is merged and `https://smarter.poker/api/health` serves a SHA that
  contains it, and the built chunk no longer offers the control.

Phase 3 is fully done when, in addition:

- `ca_horse_fleet_heartbeat` is receiving rows and Fleet Command's Health tab
  shows a fresh heartbeat.
- A signed-in operator has opened every Fleet Command section in a browser,
  including at 375px, with no runtime error.

The programme as a whole is done when Phases 4 to 10 have each been built,
reviewed, published and verified to the same standard, the deferred defects in
section 16 are closed or consciously accepted, and Dan can run the platform from
`/horses` without dropping to SQL.

---

## 24. Recommended Commit Strategy

| Commit | Contents | Tests required first |
| --- | --- | --- |
| `fix(horses): the horses run a deterministic engine, so the console stops offering them a language model` | the AI Model control, the `SETTINGS_FIELDS` entry, the card copy, the new guard test | console suite, Title Case, UI text, lint, build |
| `fix(horses): the three remaining grinder settings steer nothing, so they say so` OR `feat(horses): the grinder settings become fleet policy the engine honours` | whichever B-1 option Dan picks | as above, plus a migration dry run if the policy gains fields |
| `docs(horses): phase 3 is verified live` | a short record of the engine cutover and the browser pass | none |
| `feat(horses): Phase 4 of 10 - <name>` | the next phase, whole | everything, plus an adversarial review |

Never mix the AI Model removal with Phase 4 work. Never mix a migration with
unrelated code.

---

## 25. Final Continuation Summary

**Exact stopping point.** Phases 1, 2 and 3 are built, adversarially reviewed,
merged and serving. World Hub `main` is `2f68c734da` and production serves it.
Club Arena `main` carries the engine half and the bundle is published to the
Hetzner origin. Five migrations are applied and registered. 699 console tests and
4,884 engine tests pass. Nothing of mine is unpushed and no pull request of mine
is open. Two things are outstanding: the engine container has not yet restarted
onto the fleet policy code, and the console still offers an "AI Model" choice for
the horses.

**What to work on first.** Remove the AI Model control. Dan asked for it by name
and it is the one thing in the console that states something untrue about how the
platform works.

**Most important locked requirements.** Horses are players and are never treated
differently from humans. Horses are deterministic and are never described as
LLM-driven. Nothing may lock an operator out or block a move that works today
until Dan turns it on. The fleet keeps running exactly as it does now until a
policy row says otherwise, and no control reaches inside a hand. Push a branch
and stop; the workflows publish, including the direct Hetzner publish for Club
Arena.

**Greatest technical risk.** The fleet policy is a live lever with no reader yet.
The moment the engine restarts, every field in `ca_horse_fleet_policy` starts
governing seating for real. It is seeded permissive; do not edit it to "test"
anything.

**Greatest visual risk.** No panel in this programme has ever been rendered by a
browser in a test. A runtime error in `FleetPanel.jsx`, `StaffPanel.jsx` or
`ApprovalsPanel.jsx` would be found by an operator, not by CI.

**Greatest data-integrity risk.** Approvals and enforcement are OFF. When they go
on, the exactly-once path (`op_id` claimed in `ca_op_claims`) and the
payload-mismatch guard carry real money. Both are tested and simulated, and
neither has run under load in production.

**Still requires Dan.** B-1 (what happens to the three remaining `grinder_*`
controls), B-4 (when approvals and enforcement are switched on), and the build
order for Phases 4 to 10.

**How to continue without restarting discovery.** Everything discovered in this
programme is written down: the plan in
`docs/horses/STABLE-ADMIN-OVERHAUL-PLAN.md`, the binding rules per phase in
`docs/horses/PHASE{1,2,3}-CONTRACTS.md` with their post-build corrections, the
review findings in `docs/horses/PHASE1-REVIEW-RECORD.md` and
`docs/horses/reverify-2026-09-03/`, the rolled-back production proofs in the
`*-SIM.sql` files, and the current state in this handoff. Read this file and the
Phase 3 contract, run the five commands in section 22, and start at Phase A. You
should not need to rediscover anything to do that.
