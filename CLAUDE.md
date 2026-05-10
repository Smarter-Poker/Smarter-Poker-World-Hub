# Smarter-Poker-World-Hub -- Agent Instructions

ALL agents (Claude, AntiGravity, Cowork, any AI) MUST read this file at session start.
This is the single source of truth for **this repo**. Updated 2026-04-29.

**Also read `.agent/CLAUDE_AGENT_RULES.md` at session start** — that's the
canonical, version-controlled rule book all agents share. Audit records go
under `.agent/audits/`. Open handoffs go under `.agent/handoffs/`.
(`.memory/` is gitignored by design — local-only.)

## RULE 0 (BINDING): No manual human work

If you need something done that you cannot physically do yourself (token
scope missing, dashboard-only setting, requires a different platform, etc.)
you do NOT ask the human to do it manually. You write a self-contained
**Antigravity handoff prompt** to `.agent/handoffs/YYYY-MM-DD-<slug>.md`
that another agent (running with the right credentials/scope) can execute
end-to-end. The full rule + handoff template is in
`.memory/decisions/2026-04-29-no-manual-human-work.md` (which is local-only
because `.memory/` is gitignored — copy the salient parts into the handoff
itself so the receiving agent doesn't depend on `.memory/`).

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
Never run `vercel deploy`, `vercel --prod`, or call any deploy hook URL.
Never run `scripts/antigravity-deploy.sh` (legacy, contains dead code).

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

There is NO deploy hook. There is NO manual promotion step.
One push = one build = one deployment = auto-promoted to production.

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

Has `cancel-in-progress: true` so rapid pushes don't queue 15 stale builds.

### 2.3 Secret Scanning (Phase 0)

Blocks push if any file contains `ghp_` or `github_pat_` patterns.
GitHub auto-revokes leaked tokens. This gate prevents that.

### 2.4 Protected Zone Enforcement (Phase 0.5)

`public/hub/club-arena/` is a protected zone.
Only agents whose commit message contains "club-arena" can modify files there.
All other agents: your changes to that directory are auto-unstaged.

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
Email: `daniel@bekavactrading.com` / Password: `Bek454545!!`
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
Source:     ~/Documents/club-arena/src/  (pending Phase 5.1.2 rename -> smarter-poker-club-arena/)
Output:     public/hub/club-arena/ (DO NOT edit directly)
API:        pages/api/club-arena/
Rebuild:    Edit source -> Vite build -> copy dist/ to public/hub/club-arena/
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
`public/hub/club-arena/` -- Club Arena agents only
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
- `club-arena-scheduled-deploy.yml`
- `vercel-uniqueness-check.yml`
- `branch-protection-watchdog.yml` — daily 09:00 UTC, auto-corrects `main` branch protection (added 2026-05-10 with PR #302)
- `push-velocity-watchdog.yml` — hourly during work hours, alerts via GitHub Issue if no commits land on main for >4h (added 2026-05-10 after the 3h CHECK 6c stall)

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
