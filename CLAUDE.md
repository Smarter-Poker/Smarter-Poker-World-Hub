# Smarter-Poker-World-Hub -- Agent Instructions

## ↗ START HERE: `AGENT-PLAYBOOK.md`

**Before this file, before anything: read [`AGENT-PLAYBOOK.md`](./AGENT-PLAYBOOK.md).**

It is byte-identical in all seven repos and it answers, in one page, how to ship
without losing work: claim your own worktree, commit, push, open a pull request,
stop. It also lists every guard that is protecting you, what each one is telling
you when it speaks, and **where every credential lives** (never the value — the
place). `estate-integrity` checks hourly that all seven copies still agree.

If you are lost, cannot find a credential, or something is red and you do not
know why, that file is the answer. This one is the repo-specific detail
underneath it.

---


ALL agents (Claude, AntiGravity, Cowork, any AI) MUST read this file at session start.
This is the single source of truth for **this repo**. Updated 2026-04-29.

**MANDATORY reading at session start, in this order:**
0. `.agent/workflows/claude-mcp-push.md` — **how you push and publish on
   your own.** No handoffs. No "review beats". Never ask the user to run a
   deploy script. If your shell has no network route to GitHub, the GitHub
   MCP server does — it runs natively on the Mac and is already
   authenticated. Read this FIRST if you will change any file.
1. `.agent/AGENT_BINDING_RULES.md` — the **short binding rules** on push,
   publish, and branch protection. Every rule corresponds to a real
   regression. Violations are auto-detected. Read this FIRST.
2. `.agent/CLAUDE_AGENT_RULES.md` — the longer, version-controlled rule
   book all agents share (RULES 1-12).
3. `.agent/AGENT-OPERATIONS-GUIDE.md` — which shell you are in, how to push
   and publish YOURSELF (no handoffs), where credentials live post-rotation,
   verify-against-reality rules, the house bug shape, concurrency rules.
   `.agent/SELF-PUBLISH-PROTOCOL.md` holds the push mechanics.

Audit records go under `.agent/audits/`. (`.memory/` is public and tracked on main — NEVER put secrets in it.)

`.agent/handoffs/` is **CLOSED for deploy, push, and build work.** A
handoff is permitted ONLY for the genuine human-only exceptions listed in
RULE 0 (consent, credentials, financial/legal, interactive 2FA). Never
write a handoff — or leave files uncommitted — that asks a human or the
next agent to push, build, or deploy your work. Uncommitted work is
DESTROYED by the Antigravity `git reset --hard origin/main` loop.

## RULE 0 (BINDING): No manual human work

**Shipping is never "something you cannot do yourself."** Pushing,
building, and deploying always have a route available to you:

1. **GitHub MCP** (`create_or_update_file`, `push_files`) — runs natively
   on the Mac, already authenticated, has network access. This is the
   primary path for text and code, and it works even when your own shell
   is network-blocked.
2. **A local commit with explicit paths** — picked up and pushed by the
   `git-safe-push-auto` background process. Use for binaries that exceed
   the MCP base64 ceiling.

Never convert a deploy into a handoff, a "review beat", or a request that
the user run `git-safe-push.sh`. Full procedure:
`.agent/workflows/claude-mcp-push.md`.

If you need something done that you cannot physically do yourself (token
scope missing, dashboard-only setting, requires a different platform, etc.)
you do NOT ask the human to do it manually. You write a self-contained
**Antigravity handoff prompt** to `.agent/handoffs/YYYY-MM-DD-<slug>.md`
that another agent (running with the right credentials/scope) can execute
end-to-end. The full rule + handoff template is in
`.memory/decisions/2026-04-29-no-manual-human-work.md`. `.memory/` is PUBLIC
and tracked on main, so treat it as published: never put a credential in it.
Still copy the salient parts into the handoff itself so the receiving agent
does not depend on `.memory/`.

Exceptions — things only a human can legitimately do:
- Approve `request_access` on a new application (consent)
- Provide credentials the agent has no path to obtain
- Make a financial/legal decision
- Settings that genuinely require interactive 2FA or biometric

Everything else gets a handoff, not a "please do this".

**Handoff delivery:** every handoff is BOTH (a) committed to
`.agent/handoffs/YYYY-MM-DD-<slug>.md` AND (b) pasted into the same chat
as a copy-pasteable Markdown block. Dan's standing preference is "always
send handoffs inside this chat" — the on-disk file is the durable
backup, the chat paste is the active delivery. Skipping (b) is a rule
violation.

**Platform-level plan** (World Hub + Club Arena + Club Engine + Supabase + Hetzner):
`./CLUB-ARENA-OFFICIAL-UPGRADE-INTEGRATION.md`

That document is the authoritative upgrade/integration plan and supersedes
`POKERBROS-PARITY-UPGRADE-PLAN.md` plus every older upgrade/blueprint doc in
the club-arena repo. If anything conflicts, the platform plan wins.

---

## 1. DEPLOYMENT PIPELINE (read this FIRST)

There is exactly ONE deployment path. No exceptions. No alternatives.

### 1.1 Infrastructure

| Service    | Purpose                          | Project ID / URL                                   |
|------------|----------------------------------|-----------------------------------------------------|
| Vercel     | Frontend hosting (smarter.poker) | `hub-vanguard` / `prj_op66GkZyZcygXQKm76iyycfVFAQx` |
| Supabase   | Database + Auth + Realtime       | `kuklfnapbkmacvwxktbh.supabase.co`                  |
| Hetzner    | Poker engine server (Node.js)    | `server/` directory, deployed via SSH               |

**Canonical Vercel project for this repo: `hub-vanguard` ONLY.** Never re-link this
GitHub repo (`Smarter-Poker-World-Hub`) to any other Vercel project. Doing so
fires a duplicate build on every push, and the duplicate's queue starves the
real one — the symptom is "deployments queued forever, never build" in the
Vercel dashboard.

Known dead duplicates (do NOT touch, do NOT re-link):
| Project name              | Project ID                                | Why it's dead |
|---------------------------|-------------------------------------------|---------------|
| `smarter-poker`           | `prj_FNUaJmcjRnwCSh1JzblIUYuOXDGK`        | Disconnected, hooks deleted |
| `smarter-poker-world-hub` | `prj_PGNqOQZSSWwWx7p86leBf5YTOWEU`        | 2026-05-08: deleted after duplicate-builds incident — see `.agent/audits/2026-05-08-vercel-duplicate-project-incident.md` |

If you find a NEW Vercel project linked to this repo, it's a regression of
this exact bug — disconnect/delete it. Run
`scripts/check-vercel-project-uniqueness.mjs` to verify exactly one project
serves this repo at any time.


### 1.1.1 No new infra, ever — write to the canonical place (RULE 12)

Agents are FORBIDDEN from creating new GitHub repos, Vercel projects,
Supabase projects, Hetzner servers, OAuth clients, or any parallel
infrastructure. Every smarter.poker workload has exactly one canonical
home and that's where agents write. See RULE 12 in
`.agent/CLAUDE_AGENT_RULES.md` for the full canonical-homes table and
forbidden-actions list.

Quick rule: if you're about to run `gh repo create`, click Vercel
"Import Project", create a second Supabase project "for X", or make a
second OAuth client in any provider's console — STOP. The existing
canonical thing is what you write into. If it doesn't fit, ask Dan,
don't create something new.

### 1.2 Mandatory End-of-Session Push

Canonical rules live in `.agent/CLAUDE_AGENT_RULES.md` — RULE 1 (push), RULE 2
(SQL), RULE 3 (identity). Read that file at session start.

Summary, every agent MUST do ALL THREE at the end of every session, no
exceptions:

1. **Push code.** Run `git-safe-push.sh` until it exits 0 with
   `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`. Auditing without shipping
   is forbidden. If a fix is identified, ship it in the same session — even
   if other audit items remain — then open follow-up work for the rest.

2. **Write and apply SQL.** If the work touched data, schema, RLS, RPCs, or
   anything in Supabase, save migrations under
   `supabase/migrations/<YYYYMMDD>_<description>.sql` AND apply them to
   production via the Supabase MCP `apply_migration` tool. Confirm via
   `list_migrations` that the migration appears. Never apply schema changes
   via raw `execute_sql` — migrations only, so the change is auditable.

   For Tier-2+ migrations (anything beyond doc/comment changes), follow
   the four-step protocol in `.agent/workflows/migration-safety.md`:
   write from the `supabase/migrations/.template.sql` skeleton, run the
   pre-flight checklist, apply, then run the post-apply assertions.
   The template includes `DO $$ ... RAISE EXCEPTION ... $$` blocks so
   the migration aborts on its own assumption violations. Tier 3
   (DROP, ALTER COLUMN TYPE, RPC overload changes) MUST include a
   pasted ROLLBACK section.

3. **Document substantive audits/incidents** under `.agent/audits/<YYYY-MM-DD>-<slug>.md`
   so future agents can read what was investigated, what was fixed, and what
   was deferred. Update `.agent/CLAUDE_AGENT_RULES.md` if a new operating rule
   was learned.

NEVER claim "the fix is documented" as success. Only "production
`/api/health` serves SHA `<hash>` containing the new code" counts.

Before pushing, verify the staged files make sense:
1. Run `git status` to see what will be committed
2. Confirm no build artifacts, temp files, or junk are included
3. If files should be ignored, add them to `.gitignore` first
4. Then push

### 1.3 The Only Push Command

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh "descriptive commit message"
```

Never run `git add`, `git commit`, `git push`, `git pull` individually.
Never run `vercel deploy` or `vercel --prod`.
Never call the deploy hook URL. CORRECTED 2026-09-04: this used to say the
hook was "owned exclusively by the sanctioned daily safety-net workflow
`club-arena-scheduled-deploy.yml`". **That workflow does not exist.** It was
retired on 2026-09-03 together with the Club Arena sync it was a safety net
for, and `scripts/ci/check-no-vercel-deploy.mjs` has had an EMPTY allowlist
ever since. So the words here promised a safety net that is not running, which
is worse than having none: an agent reads it, assumes a missed publish gets
caught, and stops checking. **Nothing may call a deploy hook now.** CI
enforces it (`scripts/ci/check-no-vercel-deploy.mjs`, exit 1 on any caller).
(`scripts/antigravity-deploy.sh` was DELETED on 2026-08-27 — issue #653: a
file the rules name as forbidden, sitting where an agent will find it, is a
trap. The rule against running it survives as the CI check.)

The script handles everything autonomously:
- Phase 0: Secret scanning, account verification, .env safety
- Phase 0.5: Destructive change detection, protected zone enforcement, emoji scanning
- Phase 1: Lock cleanup, stale rebase/merge abort
- Phase 2: Stage, commit, ghost file sweep
- Phase 2.5: Build gate (`npx next build` -- catches errors before they hit Vercel)
- Phase 3: Pull-rebase with auto-conflict resolution, push with retries
- Phase 4: Post-deploy verification (polls /api/health until SHA matches)

The script exits 0 ONLY when production is verified serving your commit.
If it exits non-zero, your code is NOT deployed. Fix the issue and re-run.

### 1.4 What Happens After Push

1. GitHub receives the commit on `main`
2. Vercel git integration on `hub-vanguard` auto-triggers a build
3. Build runs (~3-5 min for Next.js)
4. If build succeeds: deployment becomes READY and is auto-promoted to Current (production)
5. `verify-deploy.js` (called by the push script) confirms production serves the new SHA

There is NO manual promotion step and NO deploy hook anywhere in this repo's
path — one push = one build = one deployment = auto-promoted to production.

CORRECTED 2026-09-04. This paragraph used to describe a daily safety net,
`club-arena-scheduled-deploy.yml`, POSTing `VERCEL_HUB_VANGUARD_DEPLOY_HOOK`
"so a missed Club Arena sync still publishes". That was true when issue #653
resolved it on 2026-08-27 and stopped being true on 2026-09-03, when the Club
Arena sync was replaced by Club Arena's own origin and both the sync and its
safety net were deleted. Club Arena no longer publishes through this repo at
all, and a Vercel rebuild here would not publish it if it did. Its own nets
live in its own repo: the `*/30` catch-up cron inside `publish-club-arena.yml`,
`publish-watchdog.yml`, and the orphan sweep in `agent-autopilot.yml`.

### 1.5 Claiming Success

You may ONLY say a change is deployed after `git-safe-push.sh` exits 0.
The script output will contain `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`.

Never say:
- "should be live in a few minutes"
- "deploy triggered"
- "Vercel will pick it up"
- "pushed successfully" (push != deploy)

Instead say:
> "Production smarter.poker served SHA `<hash>` at `<UTC time>`. Verified via /api/health."

### 1.6 Self-Healing Deploy Monitor

`/api/deploy-monitor` + `/api/deploy-autofix` form an automated self-healing system.
When a Vercel deployment fails, it auto-fixes the error and redeploys with zero human
intervention.

How it works:
1. Vercel webhook fires on `deployment.error`
2. `/api/deploy-monitor` receives it, fetches build logs from Vercel API
3. `/api/deploy-autofix` parses the error, fetches the broken file from GitHub,
   calls Anthropic API (Claude) to generate a minimal fix, pushes via GitHub Contents API
4. New commit triggers Vercel auto-rebuild
5. Circuit breaker: max 3 fix attempts per commit SHA, then stops

Agents do NOT need to interact with this system. It runs autonomously.
If you see `[autofix]` commits in the git log, that is the deploy monitor fixing a build error.

### 1.7 When Deployment Fails

If `git-safe-push.sh` reports `DEPLOY_VERIFIED:false` or exits non-zero:

1. Check the Vercel dashboard: `https://vercel.com/smarter-poker/hub-vanguard/deployments`
2. If the build ERROR'd: read the build logs, fix the code, re-run the push script
3. If the build is CANCELED: a newer push superseded yours. Confirm your changes are in the newer commit.
4. If SHA mismatch after timeout: the build may still be running. Wait and re-check.

Never revert without understanding the failure. Never push the same broken code twice.

---

## 2. PRE-PUSH CHECKS (enforced automatically)

### 2.1 Build Gate (Phase 2.5 of git-safe-push.sh)

`npx next build` runs locally before push. If it fails, the push is blocked.
This catches 100% of the errors that would fail on Vercel.
To skip for emergency hotfixes ONLY: `--skip-build` flag.

### 2.2 GitHub Actions Safety Gate

`.github/workflows/build-safety-gate.yml` runs on every push to main:
- CHECK 1: No `.single()` calls (must use `.maybeSingle()`)
- CHECK 2: No unused React hook imports
- CHECK 3: No raw `@supabase/supabase-js` imports in API routes
- CHECK 4: No merge conflict markers in source files
- CHECK 5: TypeScript compilation (advisory, does not block)
- CHECK 15: Commit author resolves to a GitHub user (RULE 3). Vercel will not
  build a commit it cannot attribute — the deployment goes to **BLOCKED** with
  no build logs at all, so nothing else in this gate can see it and the only
  symptom is a red row in the Vercel dashboard. Added 2026-08-19 after five
  production deployments were blocked in one afternoon, every one of them
  authored `Claude (Cowork) <...@gmail.com>`. Commits must be authored
  `Smarter-Poker <254329056+Smarter-Poker@users.noreply.github.com>` or
  `github-actions[bot]`.

Has `cancel-in-progress: true` so rapid pushes don't queue 15 stale builds.

### 2.3 Secret Scanning (Phase 0)

Blocks push if any file contains `ghp_` or `github_pat_` patterns.
GitHub auto-revokes leaked tokens. This gate prevents that.

### 2.4 Protected Zone Enforcement (Phase 0.5)

`public/hub/club-arena/` was a protected zone. It is now something stronger:
**the directory is DELETED and must never come back.** Club Arena moved to its
own origin on 2026-09-02 and is reached from here by a single Next.js rewrite
(see the Club Arena section below). Next serves `public/` BEFORE `afterFiles`
rewrites, so a file re-vendored there does not merely duplicate the bundle - it
silently SHADOWS the live one, and the site keeps serving whatever was last
committed. `tests/club-arena-is-a-rewrite.test.mjs` fails CI if the directory
or its retired sync scripts return.

---

## 3. CODE SAFETY RULES (8 Immutable Rules)

Violation of ANY rule = automatic rollback. Enforced by pre-push hooks and CI/CD.

1. **No `.single()`** -- Always `.maybeSingle()`. `.single()` throws PGRST116 on 0 rows.

2. **No unused hook imports** -- If you `import { useXxx }`, you MUST call `useXxx()`.
   Unused hooks cause ReferenceError during SSG, crashing the entire build.

3. **No module-scope `createClient()`** without `typeof window` guard.
   Module-scope runs during SSG where browser APIs don't exist.

4. **No raw `@supabase/supabase-js` in API routes** -- Use `src/lib/supabaseServerClient`.
   The patched client has JWT decode fallback. Raw imports bypass GoTrue resilience.

5. **No trusting `req.query.userId`** for identity -- Use JWT via `supabase.auth.getUser(token)`.
   Query params are an IDOR attack vector.

6. **No `.limit()` on JavaScript arrays** -- `.limit()` is a Supabase query builder method.

7. **No emoji in source files** -- No emoji in JSX, string literals, props, toast messages,
   admin panels, or any user-facing string. Use plain text or Unicode symbols.
   Bare emoji break the SWC compiler and cause Vercel build failures.

8. **Verify every change** before claiming done (see Section 5: Verification Protocol).

---

## 4. TASK CLASSIFICATION

Classify your task BEFORE starting. This determines your workflow.

### Tier 1: Quick Fix (5-10 min)
CSS bugs, text changes, single-file edits where you know the file.
Workflow: Fix it. Run `git-safe-push.sh`. Report what changed.

### Tier 2: Feature Work (15-30 min)
Multi-file edits, new UI elements, logic bug fixes.
Workflow: State approach in 3 lines. Execute. Run `git-safe-push.sh`. Report.

### Tier 3: Architecture (30+ min)
Database migrations, new API routes, cross-component refactors, auth/payment changes.
Workflow: Write implementation plan. Get user approval. Execute. Verify. Deploy.

For Tier 1-2: Do NOT read Knowledge Items, skills, or workflows.
For Tier 3: Read `.memory/WORKING-RULES.md` and `.memory/REALIGN-PROTOCOL.md` first.

---

## 5. VERIFICATION PROTOCOL

### Tier 1 (CSS/Layout)
1. Make the fix
2. Run `git-safe-push.sh` (build gate + deploy verification handle the rest)
3. Report what changed

### Tier 2 (Logic Changes)
1. Run `git-safe-push.sh`
2. If confident: done
3. If unsure: browser-test with test account, then report

### Tier 3 (Architecture)
1. Run `npm run build` locally first
2. Browser-test all affected features
3. Run the 8 Immutable Rules grep checks
4. Run `git-safe-push.sh`
5. Verify deployment via Vercel MCP or dashboard

### Test Account
Email: `daniel@bekavactrading.com` / Password: `<TEST_USER_PASSWORD — see .env.local, never commit>`
All features unlocked. Works on localhost and production.

---

## 6. FILE MAP

### World Hub (Next.js)
```
pages/hub/              World Hub pages
pages/api/              API routes (300+)
pages/commander/        Club Commander staff UI
pages/hub/commander/    Club Commander player UI
src/components/         Shared React components
src/lib/                Shared libraries
src/stores/             Zustand stores
```

### Club Arena (Vite SPA -- separate repo)
```
Source:     Smarter-Poker-Club-Arena repo (~/Documents/club-arena/src/)
Output:     https://ca-static.smarter.poker  -- its OWN origin, NOT this repo.
            /srv/club-arena on the Hetzner box: releases/<ca_sha>/, an
            atomically swapped `current` symlink, an additive pool/.
Serving:    ONE rewrite in next.config.js afterFiles:
              /hub/club-arena/:path*  ->  https://ca-static.smarter.poker/:path*
            The browser never sees the origin hostname, so the shared
            smarter-poker-auth session is untouched. Nothing to sync here.
API:        pages/api/club-arena/   (still lives in this repo)
Rebuild:    You do not. Push a branch in the Club Arena repo; its
            publish-club-arena.yml rsyncs the bundle to the origin.
Auth:       Same-origin Supabase session via smarter-poker-auth localStorage key
```

### Club Commander
```
Staff UI:       pages/commander/
Player UI:      pages/hub/commander/
API:            pages/api/commander/
Components:     src/components/commander/
State:          src/stores/commanderStore.js
Schema:         .agent/skills/club-commander/DATABASE_SCHEMA.sql
```

Stay in your scoped area. If your task is Commander, don't touch Club Arena files.

---

## 7. AGENT ISOLATION (concurrent work)

### File-Level Ownership
- Identify the specific files you will modify at task start
- Do not modify files another agent is likely editing
- Report any shared-file edits

### Protected Zones
`public/hub/club-arena/` -- DELETED 2026-09-02, never re-create it (see 2.4)
`pages/api/club-arena/` -- Club Arena agents only

How to know if you're a Club Arena agent: your task mentions "Club Arena", "poker table",
"club-arena", or references `~/Documents/club-arena/`.

### Shared Resources -- Do Not Touch
- `rm -rf .next` -- kills all agents' compilations
- `npm run build` -- blocks dev server for minutes
- `npm install` -- modifies node_modules mid-compilation
- Dev server restart -- wait 10s, another agent may be restarting

### Git Conflict Safety
After `git-safe-push.sh` completes, verify your changes survived.
If the script reports "Accepting remote changes" during rebase, your changes
may have been overwritten. Re-apply them and re-run the script.

---

## 8. COMMON BUG PATTERNS

| Symptom | Cause | Fix |
|---------|-------|-----|
| `.single()` crash (PGRST116) | Query returned 0 rows | Replace with `.maybeSingle()` |
| Build fails with "Unexpected character" | Bare emoji in JSX | Wrap in `{'emoji'}` or remove |
| "Loading..." hangs forever | Query param mismatch (`?club` vs `?club_id`) | Align URL params |
| Server 500 on page load | Corrupted `.next` cache | `rm -rf .next && npm run dev` |
| "Cannot find module vendor-chunks" | `.next` corruption | `rm -rf .next && npm run dev` |
| Page works for admin only | Hardcoded user ID | Check role/ID conditionals |
| Styles not updating | Browser cache / Vercel CDN | Hard refresh, check incognito |
| Unused hook ReferenceError | Hook imported but not called | Remove unused import or call it |
| Merge conflict markers in source | Bad rebase resolution | `grep -rn "^<<<<<<< " src/ pages/` and fix |

---

## 9. PROJECT DETAILS

**Stack:** Next.js 14 (Pages Router), React 18, Supabase (PostgreSQL + Auth + Realtime),
Tailwind CSS + DaisyUI, Zustand.

**Auth:** Same-origin Supabase via `smarter-poker-auth` localStorage key.
User logs into smarter.poker, all sub-apps share the session.

**Production URL:** `https://smarter.poker`
**Club Arena URL:** `https://smarter.poker/hub/club-arena/`

### Club Commander Rules
- No emoji. Clean professional UI.
- Facebook color scheme: Primary #1877F2, Background #F9FAFB
- Inter font for all text
- Check DATABASE_SCHEMA.sql before creating/modifying tables
- Check API_REFERENCE.md before creating/modifying endpoints

---

## 10. WORKING RULES (set by Dan, binding on all agents)

1. One step at a time. Finish and verify before starting the next.
2. Do it right, not fast. No band-aids. No polyfills over broken foundations.
3. However long it takes. Scope honestly.
4. Plan before you code (Tier 3 only).
5. Verify on real hardware. "It compiles" is not verification.
6. No forbidden language: never say "looks good". Never call AI players "bots" (they are horses). No emoji in code.
7. Mobile-first. 375px width first, then scale up.
8. Never stop to ask for permission to do obvious work.
9. When corrected, change course immediately. Do not defend the rejected path.
10. Write it down. Read `.memory/` at session start, update at session end.
11. No exceptions. Every rule, every task, every session.
12. Never ask "should I?" -- just do it. Only stop for genuine forks.
13. **Commit + push small, often.** Antigravity (and any other auto-sync agent
    on Dan's Mac) periodically runs `git reset --hard origin/main`. Any
    uncommitted edits OR local-only commits at the moment of that reset are
    silently discarded — work is recoverable from the reflog (`git reflog`,
    `git stash list`, `git cherry-pick <orphan-sha>`) but only briefly. Run
    `bash scripts/git-safe-push.sh` after every meaningful change, not at
    end of session. The reflog signature of an active reset loop is
    repeated `reset: moving to origin/main` entries — `scripts/git-safe-push.sh`
    Phase 0.7 warns when ≥2 are seen in the last 50 ops.

---

---

## 10.5 HORSES ARE PLAYERS (Dan, 2026-08-27, BINDING — NO EXCEPTIONS)

**Dan, verbatim: "HORSES ARE NEVER EVER DISCLUDED BY DESIGN ON ANYTHING! THEY
MUST ALWAYS BE TREATED LIKE REAL LIVE PLAYERS!"**

This is a HARD LAW. It outranks any optimisation, any convenience, and any
assumption you arrive with. If you are writing a filter, a report, a payout, a
rule, a limit, a stat, a sweep or a guard, and you find yourself typing
`is_horse` in order to leave horses OUT of something a human would get — stop.
You are writing a bug.

### The rule

A horse pays the same buy-in, out of the same club wallet, through the same
RPCs, and sits in the same seat as anybody else. Therefore a horse:

- **EARNS** everything a human earns from the same action — VIP points, agent
  and super-agent commissions, `player_stats`, rakeback basis, leaderboard
  position, achievements, anything downstream of play or of rake;
- **IS PAID** everything a human is paid — prizes, bounties, refunds,
  shortfall back-pay, jackpots. Never "skip the horses" on a repayment;
- **IS SUBJECT TO** every rule a human is subject to — nit/VPIP eviction,
  limits, guards, integrity checks;
- **COUNTS** everywhere a human counts — player counts, engine provisioning,
  table liveness, conservation and reconciliation totals;
- **IS NEVER** silently filtered out of a report, a total, or a ledger.

### What is still allowed

`is_horse` remains legitimate for exactly two things:

1. **Identification** — surfacing the flag as DATA (a badge, a column, a
   roster field), or the horse-specific plumbing that creates, seats, funds
   and steers the fleet (`fn_register_horse_for_tournament`,
   `fn_seed_horses_to_floor`, `autoRebuyHorse`, HorseLogic, and so on). Those
   spawn and drive horses; they do not deny horses anything.
2. **The horse's input device.** A horse has no browser, so the engine
   supplies what a browser would: HorseLogic chooses its actions,
   `scheduleHorseAction` submits them inside the SAME turn timer a human
   gets, a synthetic heartbeat keeps its seat alive, and `autoRebuyHorse`
   funds its rebuy. Those exist to make a horse EQUAL to a human, not to
   give it a different deal. They are the only legitimate horse branch.

**THERE IS NO "EQUAL OUTCOME BY A DIFFERENT MECHANISM" EXEMPTION.** I proposed
one on 2026-08-27 — arguing a horse did not need the five-second rebuy pause
because `autoRebuyHorse` got it back another way — and Dan rejected it
outright:

> "TABLES ARE DESIGNED TO BE USED BY EVERYONE, EVERY HORSE OR HUMAN PLAYER
> NEEDS TO BE TREATED 100% EXACTLY THE SAME ALL ACROSS THE BOARD IN EVERYTHING
> FOR THE CLUB ARENA. YES IT STILL NEEDS TO THE SAME 5 SECOND PAUSE TO REBUY.
> NOT EVERY HORSE ALWAYS REBUYS IN THE CASH GAMES, AND IF YOU DIDN'T GIVE THEM
> THE SAME EXACT FEATURES AND FUNCTIONALITY, PEOPLE WOULD NOTICE!"

**TIMING IS PART OF THE TREATMENT.** The tell is never one hand, it is the
RHYTHM: a table that stops for five seconds when one seat busts and rolls
straight on when another has just told every watching player which seats are
horses. And the pause is not ceremonial for a horse either — the stop-loss
(two rebuys) and an empty club treasury both mean it genuinely may not come
back, so the window it gets to decide has to be the same window.

The test is therefore **"is it identical"**, not "is it equivalent". Same
features, same functionality, same pauses, same timers, same rules.

Anything where horses would be reported as opt-in (a `p_include_horses`
parameter) MUST default to **true**.

### Why this rule exists

On 2026-08-27 I wrote `AND NOT COALESCE(p.is_horse, false)` into
`fn_settle_tournament_rake` on my own assumption that horses are "house
players" who should not earn. Nobody asked for it. Every tournament on this
platform is horse-heavy, so the effect was that tournament rake attribution
earned **nothing for anyone** — 39 settled events, zero VIP points, zero agent
commissions — and I then reported that zero as "correct behaviour". It was my
invention presented as a design decision, which is worse than a plain bug.

Fixed and backfilled in `20260827_horses_are_players_law.sql`, along with two
others found in the same sweep: horses were exempt from nit eviction, and a
lone horse was denied a dealing engine that a lone human would have received.

### The one open item Dan must decide

`sp_prune_hand_history` keeps human hands forever and prunes horse-only hands
after `hand_history_retention_policy.horse_retention_days` (currently 7). That
is a STORAGE policy, not player treatment: `hand_history` is already 3.6 GB
over 1.57M hands, 99.95% horse-only, growing ~221k hands/day (~0.5 GB/day if
never pruned). It was left in place and raised with Dan rather than changed
silently, because the honest answer is that equal retention has a real
infrastructure cost. **The knob is a config row — Dan sets it, not an agent.**

---

## 10.6 YOU DECIDE THE MONEY (Dan, 2026-09-02, BINDING)

**Dan, verbatim: "YOU HAVE FULL CONTROL TO MAKE ANY AND ALL DECISIONS ON WHAT
SHOULD BE DONE WITH REAL MONEY AND REAL CHIP SCENARIOS. ALL CLAUDE AGENTS CAN
CHOOSE THE BEST OPTION THATS RECOMMENDED AND MAKE ALL CHANGES WITHOUT ASKING
ME, IF THEY HAVE A CLEAR PATH OF CORRECTION AND RECONCILIATION."**

Identical text lives in the Club Arena CLAUDE.md as section 10.9. The database
is shared, so the rule has to be, or an agent reading the wrong repo reaches
the wrong conclusion about the same wallet.

This ends the holding pattern where an agent finds a broken payout, writes a
careful paragraph explaining it, files it "for Dan", and leaves the money
frozen. That pattern has a cost and players pay it: on 2026-09-02 three
tournaments sat frozen at once and the oldest had been unpaid for fifteen
hours, entirely because the last agent to look decided the money was somebody
else's call. It was not. It is yours.

### What the grant covers

Unpaid prizes, wrong finishing positions, refunds owed, shortfall back-pay,
stranded stacks, commissions and VIP points never attributed, a ledger that
does not balance because of a platform defect. Find it, decide it, ship it,
and say plainly what you did. You do not open with a question.

### A path is CLEAR only when all five of these hold

1. **The outcome is READ, not assumed.** You can state what happened from rows
   in this database. The invented `is_horse` filter in section 10.5 is what an
   assumption dressed as a decision looks like, and it cost 39 events their
   whole rake attribution.
2. **Nobody is paid twice.** The credit goes through the platform's own
   idempotent path (`fn_tournament_payout_reconcile`, `fn_credit_and_log`, the
   per-user prize keys). Never hand-write a wallet row.
3. **Nothing is taken back from a player for our mistake.** Overpay our defect
   caused is absorbed, reported, and left alone.
4. **You proved it in a transaction you rolled back first.** The numbers you
   commit are the numbers the probe returned, and the migration asserts them so
   it aborts if the board moved underneath you. This is also RULE 2 and
   `.agent/workflows/migration-safety.md`: a money migration is Tier 3.
5. **You can write the paragraph.** One paragraph naming every affected player
   and why they got what they got. If you cannot write it, you do not
   understand the case well enough to settle it.

Fail any one and it goes to Dan as options with their costs and your
recommendation, never as a question.

### When the evidence disagrees with itself, prefer the witness that was there

Settling the 12:00 AM freeroll on 2026-09-02, re-deriving all 215 finishing
places from `eliminated_at` moved players by up to three places and would have
paid 168.51 in top-ups on a pool with 282.06 already out the door. The live
engine had watched each player bust and recorded the order as it happened; the
timestamps had not. The recorded order was kept and ONE player inserted into it.

### The record is part of the fix

A settlement is finished when all four exist: the migration with its reasoning
in the header, the audit note under `.agent/audits/`, the `financial_alerts`
row resolved with a `resolution` note saying what was accepted and why, and the
code fix that stops it recurring.

### Still Dan's, and only Dan's

- **Anything that sets what players are owed in FUTURE events**: prices, rake,
  guarantees, payout structures, retention policy. Fixing what a past event
  owes is yours. Deciding what the next one owes is his.
- **Money leaving the platform**: withdrawals, payment providers, anything a
  bank sees.
- **Rewriting or deleting a settled record to make a number look tidy.**
  Correct it forward with a row that says what changed.

---

## 10.7 MERGED IS NOT LANDED (2026-09-06, BINDING)

**`agent-autopilot.yml` squash-merges the moment the required checks pass** -
under two minutes on an asset-only change. A push made after that lands on a
CLOSED pull request: the branch moves, the PR stays merged, `git push` exits 0,
and the commits reach nobody.

**#1387 shipped 1 of its 3 commits this way.** The push reported success, the
pull request reported merged, and the branch really did contain all three. The
Global Footer E2E fix and two file deletions were not on `main`, and it was
found hours later by accident.

1. **A follow-up commit needs a NEW BRANCH off current `main`.**
   `scripts/guard-merged-branch.sh` refuses the push from `.husky/pre-push` and
   prints the recovery. It fails OPEN on a missing token, no network, or an
   unreadable answer. Override: `AGENT_MERGED_BRANCH_OK=1 git push ...`
2. **Verify the FILES, not the tick**: `git cat-file -e origin/main:<path>`.
   RULE 1 already says only production serving the sha counts as deployed; this
   is that rule one step earlier.

---

## 10.8 A CHECK THAT NOBODY CAN SEE IS NOT A CHECK (2026-09-06, BINDING)

`Global Footer E2E` failed on EVERY run on `main` from 2026-09-04, found two
days later by accident. Not in the `main: no rewinds` ruleset, so it blocked no
merge and opened no issue. Twenty-odd merges landed on top of it. None of its
three failures was in the footer - they were marketplace tests run by
`npm run build`, each one a correct change that left its test behind.

`scripts/ci/check-main-is-green.mjs`, in `publish-watchdog.yml`, now raises a
single issue for any workflow red on `main` past a threshold **with no open
issue naming it**. Workflows that fail deliberately to raise an alarm are
reported as `loud` and never paged on - the first run caught `Publish Watchdog`
doing exactly that, and treating it as a defect would have trained everyone to
ignore the detector.

It cannot live in Open Claw, for the reason section 11.4 already gives about
this workflow: it asks GitHub about GitHub.

---

## 10.9 NEVER SCHEDULE ANYTHING ON THE CLAUDE SCHEDULER (Dan, 2026-09-04, BINDING)

**Dan, verbatim: "IF YOU ARE SCHEDULING ANYTHING TO 'RUN ON CLAUDE SCHEDULER'
IT WON'T WORK OR SAVE, BECAUSE IM NEVER ON THE SAME ACCOUNT LONG ENOUGH" and
"MAKE IT A HARD LAW THAT NO OTHER AGENT SCHEDULES ANY CRITICAL TASK, WATCH DOG
OR ANYTHING ELSE THERE ... ALWAYS CREATE A REAL CRON USING OPEN CLAW".**

An agent MUST NOT create a scheduled task with the Claude scheduled-tasks tool
(`mcp__scheduled-tasks__create_scheduled_task`, the "Scheduled" panel). Not a
watchdog, not a verification timer, not a follow-up check, not "I will look at
this again in an hour". Section 11 below already says every scheduled
application trigger goes through Open Claw; this closes the one loophole it did
not name.

### Why it fails silently

Those tasks belong to ONE Claude account. Dan works across several, so a task
installed from this session is unreachable from the next. It does not error and
does not warn - it keeps reporting `enabled: true` and never fires again.

Measured, not theoretical: `smarter-poker-cron-health` was scheduled every six
hours, read `enabled: true`, and its `lastRunAt` was **2026-06-17** - dead for
two and a half months while looking healthy. It also duplicated
`.github/workflows/cron-health.yml`, which had been doing the job correctly the
whole time. Deleted 2026-09-04.

A scheduler that lies about running is worse than none, because somebody stops
watching the thing it claimed to watch.

### Where it goes instead

- **Application logic on a schedule** -> Open Claw on Hetzner. Add the handler
  under `pages/api/cron/<name>.js`, register it in
  `scripts/openclaw-cron-dispatcher.py`, deploy with
  `bash scripts/deploy-openclaw.sh`. Full procedure in section 11.2.
- **CI-side work that genuinely needs GitHub's environment** -> a workflow
  `schedule:` trigger, and only if it is on the section 11.4 allowlist.
- **A follow-up you want to make personally** -> do it now, or open an issue.
  Never a timer. Club Arena Playbook 7b already forbids sitting on CI.

### What this does NOT forbid

Dan installs tasks there himself, on every account at once, on purpose.
`horse-daily-audit-analysis` is his: deliberately present on multiple accounts
for redundancy, claiming a row in `horse_job_runs` so exactly one account runs
it per day. That is his design, it works, and it stays.

The ban is on AGENTS putting platform-critical work somewhere it will quietly
vanish - not on Dan's own tooling.

---

## 11. SCHEDULED JOBS / CRONS (binding — CI-enforced)

**All new scheduled jobs go to Open Claw on Hetzner. Never to `vercel.json`.**

The platform is mid-migration (Phase 2 of `smarter-poker-optimization-plan.md`).
Until Phase 2A.4 closes, the 40 jobs currently in `vercel.json` stay there,
but NO new entries are permitted. The 16 overflow jobs are already on Hetzner.

### 11.1 Where scheduled jobs live

| Layer              | Path / URL                                               | Purpose                                  |
|--------------------|----------------------------------------------------------|------------------------------------------|
| **Scheduler**      | `scripts/openclaw-cron-dispatcher.py` (deployed to Hetzner `openclaw-dispatcher` VM — systemd `openclaw.service`) | Decides when a job fires |
| **Handler (now)**  | `pages/api/cron/<name>.js` in this repo                  | Does the work (will move to `workers` repo in Phase 2B) |
| **Handler (later)**| `smarter-poker-workers` repo (Phase 2B, not yet created) | Will replace monolith cron routes        |
| **Auth**           | `Authorization: Bearer $CRON_SECRET` on every call       | Same secret, all tiers                   |

### 11.2 How to add a new scheduled job

1. Add the handler under `pages/api/cron/<name>.js` following the existing
   pattern (check `Authorization` header against `process.env.CRON_SECRET`,
   use `src/lib/supabaseServerClient.js`).
2. Add the schedule entry to `scripts/openclaw-cron-dispatcher.py` — cron
   expression + URL path + human-readable name. Commit to main.
3. Deploy the dispatcher to Hetzner: `bash scripts/deploy-openclaw.sh`
   (script scp's the updated Python file, restarts systemd, and tails
   `journalctl -u openclaw` to verify the new job registered).
4. Watch one fire-cycle in production before considering the job shipped.
5. If the job's FAILURE is itself an incident (a probe, a watchdog, a
   settlement), add it to `CRITICAL_JOBS` in the dispatcher with a
   consecutive-failure threshold. The dispatcher then pages (SMS via the
   existing `_alert()` path) after that many non-200s in a row and sends one
   recovery when it is 200 again. A journal line nobody reads is not an
   alert. Added 2026-09-04 with the Club Commander login-bridge probe as the
   first entry; `__tests__/openclaw-critical-jobs.test.mjs` proves the
   counting.

### 11.3 What is BANNED

- **Adding entries to `vercel.json`'s `crons` array.** CI will fail.
- **Creating files in `pages/api/cron/`** that don't correspond to an
  existing job being moved from Mac-LaunchAgent or Vercel. CI will fail on
  net-new file count growth.
- **Scheduling jobs from any other source** — no raw cron on other servers,
  no GitHub Actions on a `schedule:` trigger for application logic, no
  Supabase `pg_cron`, no Vercel deploy hooks acting as scheduled triggers.
  Every scheduled application trigger goes through Open Claw.
- **Deploying `openclaw-cron-dispatcher.py` changes without running
  `bash scripts/deploy-openclaw.sh`.** The repo file and the production
  file on Hetzner must never drift.

### 11.4 Exceptions (must be explicitly approved by Dan)

The following `.github/workflows/*.yml` files DO have legitimate `schedule:`
triggers because they run CI-side work (not application logic) and need
GitHub's environment to execute:

- `charity-scraper-v5.yml`
- `daily-scraper.yml`
- `hendonmob-auto-sync.yml`
- `jsonld-scraper.yml`
- `poker-series-auto-pilot.yml`
- `venue-scraper.yml`
- `weekly-schedule-scraper.yml`
- `stale.yml`
- ~~`club-arena-scheduled-deploy.yml`~~ — **RETIRED 2026-09-03**, together
  with the Club Arena sync it was the daily deploy-hook safety net for. Club
  Arena publishes to its own origin now and this repo is not rebuilt for a Club
  Arena merge. `scripts/ci/check-no-vercel-deploy.mjs` allows NO deploy-hook
  caller. Do not re-add it.
- `vercel-uniqueness-check.yml`
- `branch-protection-watchdog.yml` — daily 09:00 UTC, auto-corrects `main` branch protection (added 2026-05-10 with PR #302)
- `push-velocity-watchdog.yml` — hourly during work hours, alerts via GitHub Issue if no commits land on main for >4h (added 2026-05-10 after the 3h CHECK 6c stall)
- `vercel-deploy-retry.yml` — already present in the CHECK 6c allowlist but previously missing from this list; recorded here to remove the doc/CI drift.
- `agent-autopilot.yml` — every-10-minutes sweep that enables squash auto-merge
  on open pull requests and refreshes a branch only when it cannot merge as it
  stands. It is CI-side work by definition: it operates on GitHub pull requests
  through the GitHub API and has no application logic and no database access,
  so Open Claw is not merely inconvenient here, it is the wrong layer. Added to
  this list and to CHECK 6c on 2026-08-22 — the workflow was rolled out across
  all seven repos without either, and CHECK 6 had been failing on `main` ever
  since, which is one of the two reasons Pre-Deploy Safety Checks could not be
  made a required check.
- `publish-watchdog.yml` — every 15 minutes, compares `main`'s HEAD against the
  short sha `/api/health` reports and raises a self-closing issue when they
  diverge past a 20-minute budget. It cannot live in Open Claw: it asks GitHub
  what `main` is and asks the Vercel API what happened to that commit's
  deployment, and it exists precisely to catch the case where the deploy
  pipeline is not running. A watchdog that shares a failure domain with the
  thing it watches is not a watchdog. It never deploys anything — section 1.3
  forbids that, and it diagnoses instead.
  Since 2026-08-31 it carries two further checks on the same schedule rather
  than new `schedule:` triggers: the root service-worker precache, and
  **`check-cron-fleet-alive.mjs`**, which asks Supabase directly how long it
  has been since ANY Open Claw job recorded a run. That one must never become
  an Open Claw cron for the reason stated above — on 2026-08-31 the production
  `CRON_SECRET` was rotated without the Hetzner VM being updated, all 85 jobs
  returned 401, and nothing noticed, because a 401 is refused before
  `withCronHealth` records anything: the log does not fill with errors, it
  STOPS. `check-cron-liveness.mjs` asks for failures over 7 days in CI and is
  structurally unable to see that. Silence is the only observable, so silence
  is what is measured — threshold 25 minutes, against a worst observed gap of
  11 minutes across 21,095 runs in a normal week.
- ~~`news-digest.yml`~~ — **RETIRED 2026-08-16.** Migrated to Open Claw and
  removed from this list and from the CHECK 6c allowlist together, as this
  entry required. The stated blocker ("Open Claw replacement cannot deploy,
  SSH failures since 2026-05-17") had a concrete cause: `deploy-openclaw.sh`
  was hardcoded to `$HOME/.ssh/openclaw_ed25519`, a key that was never
  created, so it aborted at its prereq check every run — no deploy had ever
  succeeded, which is also why the dispatcher drifted 6 jobs behind the repo.
  The dispatcher additionally crashed on boot with `ConflictingIdError`
  because one path was registered 3x and job ids came from the
  path alone. Both fixed; deployed with 85 jobs, 0 errors. The digest now
  runs solely from Open Claw at tue 14:00 UTC. Do not re-add a GitHub
  `schedule:` for it — two schedulers at the same instant mail the real
  subscriber list twice.

These are the ONLY permitted GitHub Actions `schedule:` cron triggers. Any
net-new workflow with a `schedule:` trigger is blocked by CI. To add one:
put the logic in a `pages/api/cron/` handler and schedule it via Open Claw
instead. If there's a genuine reason it must run GitHub-side (e.g., needs
the `github.token`), update section 11.4 above in the same PR and document
why Open Claw won't work.

### 11.5 CI enforcement

`.github/workflows/build-safety-gate.yml` has a dedicated check
(CHECK 6: Cron governance) that fails the build if:

- `vercel.json` crons array grows beyond its current size (40)
- `pages/api/cron/` file count grows beyond its current size (45)
- Any workflow file gets a new `schedule:` trigger that's not on the
  allowlist in section 11.4

Bypass = not allowed. If you legitimately need to move a job OUT of one of
these (e.g., retire a Vercel cron), shrink the baseline in the same PR.
The CI check compares to current-state, not a hard-coded number.

## Live Cash Games / scrapers — read before touching

`Cash Games Running` is published from MODELLED history, not a live scrape. The
Bravo live scraper is intentionally off. Before changing anything that reads or
writes `venue_live_tables`, `game_live_history`, `/api/poker/live-tables`, or the
PNM cash-games surface, read:

    .agent/workflows/live-cash-games-policy.md

It also records the Supabase key setup (Vercel is the source of truth — the keys
are correct), how the launchd daemons start, and the sandbox limits that make
`git push`, `playwright install` and `next build` impossible from a remote shell.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
