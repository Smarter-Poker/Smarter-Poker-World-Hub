# Claude Instructions for Smarter-Poker-World-Hub

## SPEED MANDATE — All Agents (READ FIRST)

You are graded on SPEED, ACCURACY, and EFFICIENCY. Unnecessary research = failure.
Do NOT read Knowledge Items, skills, or workflows unless the task specifically requires them.
Do NOT create implementation plans or ask for approval on Tier 1-2 tasks.

### Task Classification (MANDATORY — Classify BEFORE Starting)

**Tier 1: Quick Fix (5-10 min)** — NO plan, NO approval, NO artifacts
- CSS/layout bugs, text changes, color/spacing fixes
- Single-file edits where you KNOW the file
- Adding/removing a class, adjusting padding/margin/overflow
- **→ Go directly to the file. Fix it. Browser-test. Deploy.**

**Tier 2: Feature Work (15-30 min)** — Brief inline plan, no approval wait
- Multi-file edits within ONE component/area
- New UI elements, wiring existing APIs, logic bug fixes
- **→ State your approach in 3 lines. Execute. Verify. Deploy.**

**Tier 3: Architecture (30+ min)** — Full plan, user approval required
- Database migrations, new API routes, cross-component refactors
- Anything touching payments, real-time, auth, or security
- **→ Full implementation plan. Wait for approval. Execute. Verify.**

### Scoped File Maps — Go DIRECTLY to the right files

**Club Arena (Vite SPA — separate from World Hub):**
```
Source repo:        ~/Documents/Smarter-Poker-Club-Arena/
Lobby:              src/pages/Lobby.tsx (in source repo)
Components:         src/components/ (in source repo)
Compiled output:    public/hub/club-arena/ (in World Hub — DO NOT edit directly)
API routes:         pages/api/club-arena/ (in World Hub)
Rebuild flow:       Edit source → Vite build → copy dist/ to public/hub/club-arena/
```

**Club Commander:**
```
Staff UI:           pages/commander/
Player UI:          pages/hub/commander/
API routes:         pages/api/commander/
Components:         src/components/commander/
State:              src/stores/commanderStore.js
Utilities:          src/lib/commander/
Skill docs:         .agent/skills/club-commander/
```

**World Hub Pages:**
```
Pages:              pages/hub/
Components:         src/components/
Shared libs:        src/lib/
Stores:             src/stores/
```

**DO NOT search outside your scoped area. If your task is Club Arena, don't search pages/hub/. If your task is Commander, don't search src/components/club-arena/.**

### Verification Protocol (Match to Task Tier)

**Test Account (if browser testing is needed):**
- Email: `daniel@bekavactrading.com` / Password: `Bek454545!!`
- Has all features unlocked. Works on localhost and production.

**Tier 1 (CSS/Layout) — NO browser test required:**
1. Make the fix
2. Deploy via `git-safe-push.sh`
3. Report what you changed
— The pre-push hook + CI/CD gate catch real issues. Do NOT browser-test padding/color/text changes.

**Tier 2 (Logic Changes) — Browser test ONLY if unsure:**
1. Deploy via `git-safe-push.sh`
2. If confident in the change → done, report results
3. If unsure about behavior → browser-test with test account, then report

**Tier 3 (Architecture) — Full verification required:**
1. `npm run build` to verify compilation
2. Browser-test all affected features
3. Run the 7 Immutable Rules grep checks
4. Deploy and check Vercel status after push

### Common Bug Patterns — Check Here BEFORE Researching

| Symptom | Cause | Fix |
|---|---|---|
| UI "cut off" or clipped | `overflow: hidden` on parent, or conditional padding for admin vs regular user | Check parent container CSS, look for role-based style logic |
| "Loading..." spinner hangs forever | Query param mismatch (`?club` vs `?club_id`) | Align URL params between link generators and receivers |
| Server 500 on page load | Corrupted `.next` cache | `rm -rf .next && npm run dev` |
| "Cannot access 'X' before initialization" | `useState` declared below a `useMemo` that references it | Hoist `useState` to the top of the component |
| "Cannot find module vendor-chunks" | `.next` cache corruption | `rm -rf .next && npm run dev` |
| Page works for admin but breaks for others | Hardcoded user ID or admin-only data path | Check for role/ID conditionals in the component |
| Styles not updating after push | Browser cache / stale `.next` / Vercel CDN delay | Hard refresh (Cmd+Shift+R), check in incognito |
| `.single()` crash (PGRST116) | Query returned 0 rows | Replace with `.maybeSingle()` |
| Emoji in UI (rule violation) | Agent added emoji characters | Strip all emoji, use plain text only |

### Dev Server Protocol
- If port 3000 responds to `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/hub` → server is running, DO NOT restart
- If not responding → `npm run dev` from project root
- ONLY nuke `.next` if you get `vendor-chunks` or `MODULE_NOT_FOUND` errors
- NEVER nuke `.next` while other agents are active — it crashes everyone

### Agent Isolation Protocol (MANDATORY for all concurrent agents)

**Multiple agents CAN work in the same area (e.g., 5 agents in Club Arena). Isolation is at the FILE level, not the area level.**

**1. File-Level Ownership:**
- At the start of your task, identify the SPECIFIC FILES you will modify
- Do NOT modify any file that another agent is likely editing (e.g., if you were told "fix the lobby cards" and another agent was told "fix the marketplace," don't touch marketplace files)
- If your task requires editing a shared file (e.g., a layout component used everywhere), mention it in your report so the user knows

**2. Browser Isolation:**
- Launch your OWN browser session — do NOT take over a browser window that is already open on a different page
- If a browser is already open and navigated somewhere, open a NEW browser or a new tab — do not navigate away from an existing page
- Close your browser session when done testing

**3. Git Conflict Safety:**
- After `git-safe-push.sh` completes, verify YOUR changes survived by checking the push output
- If the push script reports "Accepting remote changes" during rebase, your changes may have been overwritten — re-apply them
- Do NOT modify files outside your declared scope, even if you see bugs in them — report those bugs instead

**4. Shared Resources — Do NOT Touch:**
- `rm -rf .next` — kills ALL agents' active compilations. Only do this if the server is fully crashed for everyone
- `npm run build` — blocks the dev server for minutes, stalling all other agents
- `npm install` — modifies `node_modules` and `package-lock.json`, can crash other agents mid-compilation
- Dev server restart — wait 10 seconds before restarting, another agent may already be restarting it

### KI & Artifact Policy
- Do NOT read Knowledge Items for Tier 1 or Tier 2 tasks
- Create `task.md` / `implementation_plan.md` / `walkthrough.md` ONLY for Tier 3 tasks
- For Tier 1-2: just fix it, verify it, deploy it, report results

---

## 🚨 MANDATORY: Git Push Protocol (ALL AGENTS)

**NEVER run individual git commands (`git add`, `git commit`, `git push`, `git pull`).** 
Always use the autonomous push script:

```bash
bash ~/Documents/Smarter-Poker-World-Hub/scripts/git-safe-push.sh "your commit message"
```

This script handles lock files, ghost files, conflicts, and retries — fully autonomously. 
See `.agent/workflows/deploy.md` for details. **Violation of this rule causes cascading failures.**

---

## ABSOLUTE LAW: Code Safety Rules (ALL AGENTS — ZERO EXCEPTIONS)

These rules apply to ALL agents: Claude.ai, Antigravity, any AI agent working on this codebase.
Violation of ANY rule = automatic rollback and investigation.

### Enforced By:
- **Local**: `.git/hooks/pre-push` (blocks pushes with violations)
- **CI/CD**: `.github/workflows/build-safety-gate.yml` (blocks deploys on ALL branches)
- **Post-Deploy**: Automated 5-minute verification after every deploy to main

### The 7 Immutable Rules:

1. **NEVER use `.single()` on Supabase queries** — ALWAYS use `.maybeSingle()`.
   `.single()` throws PGRST116 when 0 rows returned, crashing the entire route.
   There are ZERO valid exceptions to this rule.

2. **NEVER import a React hook without calling it.** If you `import { useXxx }`, you MUST
   call `useXxx()` in the component body. Unused hook imports cause ReferenceError during
   SSG and crash the ENTIRE build — every single page goes down.

3. **NEVER use `createClient()` at module scope** without a `typeof window` guard.
   Module-scope code runs during SSG (server-side) — browser APIs don't exist there.

4. **NEVER use raw `@supabase/supabase-js` import in API routes.** ALL API routes MUST
   use `import { createClient } from 'src/lib/supabaseServerClient'` — the patched client
   with JWT decode fallback. Raw imports bypass GoTrue resilience.

5. **NEVER trust `req.query.userId` or `req.body.userId`** for identity. ALL user identity
   MUST come from JWT via `supabase.auth.getUser(token)`. Query params = IDOR attack vector.

6. **NEVER call `.limit()` on JavaScript arrays.** `.limit()` is a Supabase query builder
   method. Calling it on `.filter()`, `.map()`, or `.reduce()` results throws TypeError.

7. **ALWAYS verify your changes** per the Verification Protocol above (match to Task Tier).
   - Tier 1-2: Browser-test only. The pre-push hook catches rules 1-2 automatically.
   - Tier 3: Run `grep -rn '.single()' --include='*.js' --include='*.jsx' pages/ src/` + `npm run build`
   - The CI/CD gate catches rules 1-4 on every push — no manual re-check needed for Tier 1-2.

8. **NEVER use emoji characters anywhere in UI code, page text, button labels, modal titles,
   tab names, toast messages, admin panels, or any user-facing string in `.js`, `.jsx`, or
   `.tsx` files.** This is an absolute, permanent, zero-exception rule across ALL pages and
   ALL components in this codebase. This means no emoji in:
   - JSX text content (`<h1>`, `<span>`, `<p>`, `<button>`, etc.)
   - String literals passed as props (`title="..."`, `label="..."`, `desc="..."`)
   - Toast / notification messages
   - Menu item labels and section headers
   - Admin tile titles and descriptions
   - Comment-adjacent UI strings
   Use plain text or Unicode symbols (arrows, dashes, bullets) instead.
   **Every agent and every session must scan for and strip any emoji before committing.**

### Post-Push Protocol (Tier 3 only):
After pushing Tier 3 changes: check Vercel deployment status within 5 minutes.
If deployment FAILED: `git revert HEAD && git push` IMMEDIATELY.
Tier 1-2 pushes are protected by pre-push hook + CI/CD — no manual post-push checks needed.

---

## Project Overview

This is the Smarter.Poker platform - a comprehensive poker training and community application.

## Key Project: Club Commander

**Club Commander** is a poker room management platform (competing with PokerAtlas).

### Before Working on Club Commander

**For Tier 1-2 tasks:** Go directly to the file. The scoped file map above tells you where everything is. You do NOT need to read the skill docs for CSS fixes or simple wiring.

**For Tier 3 tasks ONLY** (new features, schema changes, new API routes): Read these files first:
```
1. .agent/skills/club-commander/AGENT_INSTRUCTIONS.md  # ENFORCEMENT RULES
2. .agent/skills/club-commander/DATABASE_SCHEMA.sql    # Table structures
3. .agent/skills/club-commander/API_REFERENCE.md       # Endpoint specs
```

### Critical Rules for Club Commander

1. **NO EMOJIS** - Clean, professional UI only
2. **Facebook color scheme** - Primary: #1877F2, Background: #F9FAFB
3. **Follow the spec exactly** - Do not invent features
4. **Check DATABASE_SCHEMA.sql** before creating/modifying tables
5. **Check API_REFERENCE.md** before creating/modifying endpoints
6. **Use Inter font** for all text

File locations are in the **Scoped File Maps** section above. If unsure about Commander architecture, check `.agent/skills/club-commander/`.

## Club Arena Integration

Club Arena is a **Vite + React SPA** served from `public/hub/club-arena/` on smarter.poker. NO iframe, NO proxy.

- **Source repo:** `~/Documents/Smarter-Poker-Club-Arena/` — see **Scoped File Maps** above
- **Rebuild workflow:** Run `/club-arena-rebuild` (see `.agent/workflows/club-arena-rebuild.md`)
- **Auth:** Shared same-origin localStorage (`smarter-poker-auth`) — no postMessage or token relay
- **Routing:** Static files served directly, unmatched routes fall through to `index.html` via fallback rewrite
- **Rules:** NO iframe code, NO proxy rewrites, NO editing `public/hub/club-arena/` directly (always rebuild from source)

---

## General Project Info

**Stack:** Next.js 14 (Pages Router), React 18, Supabase (PostgreSQL + Auth + Realtime), Tailwind CSS + DaisyUI, Zustand.
**Directories:** See **Scoped File Maps** above. Auth storage key: `smarter-poker-auth`.
