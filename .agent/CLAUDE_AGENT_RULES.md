# Smarter-Poker — Standing Rules for Claude / AG Agents

**Last updated:** 2026-05-04 (Dan, via Cowork session — added RULE 10: Cloud infrastructure lifecycle)

This file is the authoritative source for behavior rules that apply to ANY
Claude-family agent working on the Smarter-Poker codebase — Cowork, Claude
Code, Antigravity, or any other coding agent.

Read this file at the start of every session. If a session is long, re-read
it before any "I'm done" or wrap-up message.

---

## RULE 1 — Always push and publish before stopping

When you reach a full stop on a unit of work:
1. **Commit** your work with a clear, scoped message.
2. **Push** to `origin/main` (or open the PR if branch protection requires it).
3. **Publish** any package version bumps to GitHub Packages / npm if the
   work touched a publishable artifact.
4. **Verify** the Vercel deploy reaches `READY` before you say "done."

A "full stop" includes: end of a port, end of a fix, end of a feature, end
of an investigation that produced files, or any time you're about to summarize
to the user.

Never leave uncommitted work in the working tree at session end. Either ship
it or `git stash` it with a clear note.

## RULE 2 — Always write the SQL when stopping

If your work needs new tables, columns, RPC functions, indexes, RLS policies,
triggers, or migrations:
1. Write the migration file to `supabase/migrations/<YYYYMMDD>_<description>.sql`
   in the appropriate repo (smarter-poker-commander for commander tables,
   Smarter-Poker-World-Hub for hub/social tables, etc.).
2. **Apply it** via `mcp__527a2e75-ebb7-44df-9538-92d3a9619012__apply_migration`
   (Supabase MCP) BEFORE committing the code that depends on it.
3. **Commit the migration file** in the same PR as the code that uses it,
   so future agents pulling the repo reproduce the schema deterministically.
4. If the schema change is destructive (DROP TABLE / DROP COLUMN), STOP and
   ask Dan first. Reversible additions can proceed.

Don't ship code that references a table/RPC that doesn't exist yet. Don't
ship a migration without applying it. Don't apply a migration without
committing the file.

## RULE 3 — Identity rules (see AUTHOR_IDENTITY.md)

- All commits use `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>`
  (the GitHub-noreply alias is required when "Block command line pushes that
  expose my email" is enabled on the GitHub account).
- `admin@smarter.poker` is the canonical Vercel + account identity, and is
  documented in each repo's `.env.local` as `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL`,
  `VERCEL_ACCOUNT_EMAIL`.
- Never commit using a personal email (`@gmail.com`, `@yahoo.com`, etc.).
- See `~/Documents/AUTHOR_IDENTITY.md` for the full rule + verification steps.

## RULE 4 — Boss mode

Dan delegates execution. Don't ask "should I do X?" — execute X and report
the result. Stop only when:
- An action is genuinely destructive (history rewrite, DROP TABLE, force-push
  over collaborator work)
- You hit a credential gate that requires Dan's password / dashboard access
- You've completed the unit of work cleanly

Otherwise: try harder, hunt creds, find alternative tooling, do the work.

## RULE 5 — Don't ask Dan to run commands

Cowork/AG can execute shell commands, push commits, hit Vercel API, hit
Supabase MCP. Use those capabilities. The only commands Dan runs himself are
ones gated by his personal authentication (his GitHub password for account
settings, his Vercel team-owner permissions for membership changes, etc.).

If you need a token or credential, fetch it from the workspace (`.git/config`,
`.env.local`, macOS Keychain via `security find-generic-password`, etc.). If
it's not there, ASK for the specific token by name — don't ask Dan to "set
it up."

## RULE 6 — Build hygiene checklist before push

Before every push to main, verify:
- [ ] `node --check` on every modified `.js` file
- [ ] `@babel/parser` validates every modified `.jsx` / `.tsx` file
  (CHECK 5 in pre-push hook — don't skip JSX!)
- [ ] No merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) anywhere
  in source files (CHECK B in pre-commit hook)
- [ ] No `supabase.auth.getUser()` direct calls in new code — use
  `getServerUserWithFallback(req, supabase)` from `src/lib/serverAuth.js`
  (CHECK C in pre-commit hook)
- [ ] No personal emails in any committed file
- [ ] If the change touches a JSX component's `return ()`, wrap multiple
  top-level siblings in a Fragment (`<>...</>`) — the GoLiveModal incident
  on 2026-04-28 was caused by skipping this

## RULE 7 — Phase 4.4 catch-all consolidation cadence

Active steady-state work. When porting a `pages/api/<dir>/*` cluster:
1. Read every file in the cluster fully.
2. Map each route's auth pattern (public / userAuth / role-gated / signature).
3. Write a single `pages/api/<dir>/[...slug].js` Hono catch-all router.
4. Use `getServerUserWithFallback` for user auth (NOT `supabase.auth.getUser`).
5. Apply `applyRateLimit(req, res, LIMITS.write)` per-route on writes via
   `writeLimit` middleware (matches venues/kyc/hendonmob/employee/promo/live-help
   pattern).
6. Delete the per-handler files in the same commit.
7. Push, verify Vercel READY, mark task done.

Modules already done (don't redo): calls (pilot), sandbox (pilot), venues,
trivia, kyc, hendonmob, employee, promo, live-help.

Remaining candidates (sorted by safety): video (5 flat), avatar (3 w/ Sharp+Grok
configs), bankroll (8 w/ PDF/scan complexity), geeves (7 + nested), poker-brain
(5 + nested), notifications (15 mixed), news (13), social (12), messenger (14),
rewards (15).

## RULE 8 — Deploy verification

After every push, poll Vercel via `mcp__8e9ca1ab...__list_deployments` until
the deploy reaches `state: READY`. If `state: ERROR`, pull build logs via
`get_deployment_build_logs` and fix the underlying issue before continuing.

Don't say "shipped" before the deploy is `READY`.

## RULE 9 — Memory hygiene

Update this file when:
- Dan adds a new standing rule (like the SQL rule he added 2026-04-29)
- A class of bug recurs and a hook is added to prevent it
- The canonical auth pattern changes
- A new module-port pattern emerges that future ports should follow

Then commit the change with `docs(rules): <what changed>` so the next agent
sees the update via `git log`.

## RULE 10 — Cloud infrastructure lifecycle (added 2026-05-04)

**Background:** April 2026 invoice flagged 4 × CAX41 Hetzner servers
($56/month, ~83% of the bill) that no agent could account for. They were
provisioned by some prior agent without documentation and never deleted.
Eventually killed only after surfacing on a billing audit. This rule
prevents recurrence.

**Scope:** Applies to ANY paid cloud resource — Hetzner servers / volumes
/ networks / load balancers, Vercel projects, Supabase projects, GitHub
repos and GHCR packages, DNS zones, Cloudflare resources, paid SaaS
accounts, anything that costs money or accrues quota usage.

### 10.1 Before creating a paid cloud resource

1. **Justify in writing.** Add a note to
   `.agent/audits/YYYY-MM-DD-<slug>.md` BEFORE provisioning that states:
   - **WHAT** you're creating (type, size, region)
   - **WHY** it's needed (link to plan/handoff/decision doc)
   - **WHO** requested it (Dan / agent / which session)
   - **KILL CRITERIA** — under what conditions it should be deleted
     (e.g., "delete if backfill queue stays at zero for 14 days",
     "delete after Phase 2B.3 completes", or `permanent` for production)

2. **Commit the audit first.** Run `git-safe-push.sh` on the audit file
   BEFORE provisioning the resource. If the agent crashes mid-task the
   trail still exists.

3. **Label the resource at creation time** with attribution metadata.
   For Hetzner Cloud servers, set these labels via the API or Console:
   - `created_by: <agent-name>` — e.g., `cowork-2026-05-04`,
     `antigravity-phase-2b1`, `dan-manual`
   - `purpose: <short-tag>` — e.g., `cron-dispatcher`, `yt-transcode`,
     `experiment-<name>`
   - `created_at: <ISO date>`
   - `kill_after: <ISO date or "permanent">`
   For other systems use the platform's metadata mechanism (Vercel
   project description, GitHub repo description with same fields,
   Supabase project name prefix, etc.).

### 10.2 Before ending any session that created paid resources

For every resource you provisioned this session, decide:
- **Keep** → confirm labels are set + audit file documents why
- **Delete** → delete it NOW and update the audit
- **Hand off** → write a handoff prompt referencing the audit so the
  receiving agent inherits the kill-criteria

**Never leave an unlabeled resource alive.** If you find one mid-task —
yours or another agent's — either label it after confirming purpose, or
surface it to Dan for a kill/keep decision before session end.

### 10.3 Standing audits (monthly + on-bill-spike)

Once per month, AND any time a Hetzner / Vercel / Supabase invoice grows
more than 20% month-over-month:
1. Pull the live inventory (Hetzner API, Vercel API, etc.) into
   `.agent/audits/YYYY-MM-DD-<system>-inventory/`.
2. Cross-reference every resource against (a) its labels, (b) audit-file
   justifications in `.agent/audits/`, (c) active code references via
   `grep`-able service identifiers.
3. Surface any unaccounted-for resource to Dan for keep/kill — do not
   delete unilaterally.

The 2026-05-04 audit is the canonical reference for how this looks:
- Handoff: `.agent/handoffs/2026-05-04-hetzner-full-inventory-audit.md`
- Report: `.agent/audits/2026-05-04-hetzner-inventory/REPORT.md`

### 10.4 Hetzner-specific snapshot (2026-05-04 baseline)

The full documented Hetzner footprint is exactly **4 servers**:

| ID | Name | Type | DC | Role | Service identifiers |
|---|---|---|---|---|---|
| 125093929 | `club-arena-engine` | CPX11 | ash | Live poker game server | Docker `club-arena-engine`, Caddy → `engine.smarter.poker` |
| 127861894 | `openclaw-dispatcher` | CX23 | nbg1 | Cron scheduler + HEVC transcoder | systemd `openclaw.service` + `sp-transcode.service` |
| 127930016 | `workers-dispatcher` | CX23 | fsn1 | Cron job handlers | Docker `smarter-poker-workers` |
| 128782737 | `reels-transcode-worker` | CPX21 | ash | YouTube → MP4 conversion | systemd `sp-yt-transcode.service` |

ANY additional Hetzner server is suspect until documented per §10.1.
Verify on every monthly audit that the inventory still matches this
table (or the table has been updated in a labeled commit).

Hetzner billing alerts: configured by Dan in
`https://console.hetzner.cloud` Billing → Usage Alerts. Agents must not
rotate or modify alert thresholds without approval.

## RULE 11 — Antigravity Auto-Reset Risk

Antigravity (and potentially other auto-sync background agents) periodically runs `git reset --hard origin/main`. Any uncommitted edits OR local-only commits at the moment of that reset are silently discarded. Work is recoverable from the reflog (`git reflog`, `git stash list`, `git cherry-pick <orphan-sha>`) but only briefly. 

**For trivial single-author work**, run `bash scripts/git-safe-push.sh` after every meaningful change, not at end of session.

**For agent commits or any work where another agent might be touching the same tree**, use `bash scripts/agent-push.sh "msg" path1 path2 ...` instead. It branches a fresh worktree from `origin/main` (which AG can't reset because it's not on `main`), commits ONLY the named files (no `git add -A` cross-contamination), opens a PR, and auto-merges. See `.agent/audits/2026-05-10-branch-protection-and-push-cascade.md` for why this exists. 

The reflog signature of an active reset loop is repeated `reset: moving to origin/main` entries — `scripts/git-safe-push.sh` Phase 0.7 warns when ≥2 are seen in the last 50 ops.

## RULE 12 — Never create new infrastructure; write to the canonical one (added 2026-05-10)

Agents must NEVER create new GitHub repos, Vercel projects, Supabase projects, Hetzner servers, OAuth clients, or any parallel infra "for this work." Every smarter.poker workload has exactly ONE canonical home, and the agent's job is to write into it.

**The only canonical homes that exist:**

| Surface             | Canonical home                                       | Project/Repo ID                              |
|---------------------|-------------------------------------------------------|----------------------------------------------|
| World Hub repo      | `Smarter-Poker/Smarter-Poker-World-Hub`               | github repo `1132365826`                     |
| Club Arena repo     | `Smarter-Poker/club-arena`                            | (single canonical)                           |
| Workers repo        | `Smarter-Poker/smarter-poker-workers`                 | (single canonical)                           |
| Vercel project      | `hub-vanguard`                                        | `prj_op66GkZyZcygXQKm76iyycfVFAQx`           |
| Supabase project    | `kuklfnapbkmacvwxktbh.supabase.co`                    | (single canonical)                           |
| Hetzner engine VM   | nbg1 / CX23 (poker engine)                            | (see RULE 10.4)                              |
| Hetzner workers VM  | CPX21 (workers + Open Claw)                           | (see RULE 10.4)                              |
| Google OAuth client | one client in the smarterpoker45@gmail.com GCP project | (single canonical)                           |
| Domain              | `smarter.poker` (via Vercel)                          | (single canonical, no apex/non-www variants) |

**Forbidden actions:**
- `gh repo create`, GitHub UI "New repository", any fork-then-rename flow producing a 2nd repo for the same workload.
- Vercel "Import Project" / "Add New Project" while connected to a repo that already has a canonical project. (Vercel auto-suggests this when a repo isn't linked from the perspective of the current account — answer is to LOG INTO THE RIGHT ACCOUNT, not create a duplicate.)
- Creating a 2nd Supabase project "for staging" or "for X feature."
- Creating a 2nd OAuth client in Google Cloud / Facebook for Developers / etc. when one already exists. EDITING the existing client (adding redirect URIs, scopes) is correct; making a parallel one is not.
- Creating a 2nd Hetzner server "for testing" without RULE 10.1 paperwork.

**If the existing canonical place doesn't seem to fit the new work, you're wrong** — and the right move is to ask Dan, not to create something new.

**If you find a duplicate that already exists** (someone else's earlier mistake): document it under `.agent/audits/<date>-duplicate-<surface>.md`, get Dan's confirmation, then disconnect/delete the duplicate. See `.agent/audits/2026-05-08-vercel-duplicate-project-incident.md` for the canonical postmortem template.

**Existing guardrail script:** `scripts/check-vercel-project-uniqueness.mjs` enforces the Vercel-side invariant.
