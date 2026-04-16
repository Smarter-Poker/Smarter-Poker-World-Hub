# Smarter-Poker-World-Hub -- Agent Instructions

ALL agents (Claude, AntiGravity, Cowork, any AI) MUST read this file at session start.
This is the single source of truth. Updated 2026-04-16.

---

## 1. DEPLOYMENT PIPELINE (read this FIRST)

There is exactly ONE deployment path. No exceptions. No alternatives.

### 1.1 Infrastructure

| Service    | Purpose                          | Project ID / URL                                   |
|------------|----------------------------------|-----------------------------------------------------|
| Vercel     | Frontend hosting (smarter.poker) | `hub-vanguard` / `prj_op66GkZyZcygXQKm76iyycfVFAQx` |
| Supabase   | Database + Auth + Realtime       | `kuklfnapbkmacvwxktbh.supabase.co`                  |
| Hetzner    | Poker engine server (Node.js)    | `server/` directory, deployed via SSH               |

The `smarter-poker` Vercel project (`prj_FNUaJmcjRnwCSh1JzblIUYuOXDGK`) is a DEAD DUPLICATE.
Its git integration is disconnected. Its deploy hooks are deleted. Do not touch it.

### 1.2 Mandatory End-of-Session Push

Every agent MUST run `git-safe-push.sh` before ending a session. No exceptions.
Uncommitted work is unfinished work. If the script fails, fix the issue and re-run
until it exits 0. Never leave files uncommitted in the working directory.

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
Source:     ~/Documents/Smarter-Poker-Club-Arena/src/
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
