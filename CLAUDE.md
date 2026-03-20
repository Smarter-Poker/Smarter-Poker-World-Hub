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

**Tier 1 (CSS/Layout):**
1. Browser-test the specific page with test account
2. Screenshot the fix
3. Deploy via `git-safe-push.sh`
— No build verification. No route testing. No grep audits.

**Tier 2 (Logic Changes):**
1. Browser-test the affected feature with test account
2. Check the dev server console for errors
3. Deploy via `git-safe-push.sh`

**Tier 3 (Architecture):**
1. `npm run build` to verify compilation
2. Browser-test all affected features
3. Run the 7 Immutable Rules grep checks
4. Deploy and check Vercel status after push

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

7. **ALWAYS verify your changes.** After ANY code modification:
   - Run `grep -rn '.single()' --include='*.js' --include='*.jsx' pages/ src/` to confirm no `.single()` leaked back
   - Run `npm run build` to verify compilation passes
   - After pushing: check Vercel deployment status within 5 minutes

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

### Post-Push Verification Protocol:
After EVERY push to main:
1. Wait 5 minutes for Vercel deploy
2. Check deployment status at https://vercel.com/team/hub-vanguard
3. Verify site loads at https://smarter.poker
4. If deployment FAILED: `git revert HEAD && git push` IMMEDIATELY
5. The CI/CD workflow (build-safety-gate.yml) also runs automated post-deploy checks

### Incident History:
- **March 7, 2026**: One unused hook import → 14 failed deployments → all pages down.
  Root cause: `.single()` + unused hooks + unpatched Supabase imports cascading.
  Resolution: 1,491 `.single()` → `.maybeSingle()` conversions, pre-push hook, CI/CD gate.

### The pre-push git hook (`.git/hooks/pre-push`) enforces rules 1-2 locally.
### The GitHub Action (`.github/workflows/build-safety-gate.yml`) enforces rules 1-4 on every push.

---

## Project Overview

This is the Smarter.Poker platform - a comprehensive poker training and community application.

## Key Project: Club Commander

**Club Commander** is a poker room management platform (competing with PokerAtlas).

### MANDATORY: Before Working on Club Commander

**STOP. Read these files IN ORDER before writing any code:**

```
1. .agent/skills/club-commander/AGENT_INSTRUCTIONS.md  # ENFORCEMENT RULES - READ FIRST
2. .agent/skills/club-commander/SKILL.md               # Overview
3. .agent/skills/club-commander/IMPLEMENTATION_PHASES.md   # Step-by-step guide
4. .agent/skills/club-commander/DATABASE_SCHEMA.sql    # Table structures
5. .agent/skills/club-commander/API_REFERENCE.md       # Endpoint specs
6. .agent/skills/club-commander/ENHANCEMENTS.md        # UI design system
```

**You MUST provide the confirmation from AGENT_INSTRUCTIONS.md before starting work.**

### Critical Rules for Club Commander

1. **NO EMOJIS** - Clean, professional UI only
2. **Facebook color scheme** - Primary: #1877F2, Background: #F9FAFB
3. **Follow the spec exactly** - Do not invent features
4. **Check DATABASE_SCHEMA.sql** before creating/modifying tables
5. **Check API_REFERENCE.md** before creating/modifying endpoints
6. **Use Inter font** for all text

### Club Commander File Locations

```
Skill Documents:     .agent/skills/club-commander/
API Routes:          pages/api/commander/
Player UI:           pages/hub/commander/
Staff UI:            pages/commander/
Components:          src/components/commander/
State:               src/stores/commanderStore.js
Utilities:           src/lib/commander/
```

### Build Phases

| Phase | Weeks | Focus |
|-------|-------|-------|
| 1 | 1-4 | Database + Waitlist MVP |
| 2 | 5-8 | Cash Game Management |
| 3 | 9-12 | Tournament System |
| 4 | 13-16 | Home Games Module |
| 5 | 17-20 | Promotions & Analytics |
| 6 | 21-24 | Scale & Polish |

### If Unsure

1. Check `.agent/skills/club-commander/` first
2. The spec is comprehensive - the answer is likely there
3. If truly not covered, document the gap and ask

## Club Arena Integration

### Architecture Overview
Club Arena is a **Vite + React SPA** that lives 100% inside smarter.poker. All files
(JS, CSS, HTML, images, cards, videos, logos) are in `public/hub/club-arena/` and served
directly from smarter.poker. ZERO external requests. NO iframe. NO proxy.

```
User visits smarter.poker/hub/club-arena/promotions
  → Next.js checks pages/ (no matching page for /promotions)
  → Checks public/ (no exact file match)
  → fallback rewrite serves public/hub/club-arena/index.html
  → Club Arena SPA boots, React Router renders /promotions
  → Auth via shared Supabase session (storageKey: 'smarter-poker-auth')
```

### Single Repo, Single Deployment
| Component | Location | Served From |
|-----------|----------|-------------|
| World Hub (Next.js) | pages/, src/ | smarter.poker |
| Club Arena (Vite SPA) | public/hub/club-arena/ | smarter.poker |
| Club Arena Source | Separate repo: Smarter-Poker-Club-Arena | Built with Vite, dist/ copied here |

### Deployment Pipeline
```
1. Change Club Arena source → build with Vite → copy dist/ to public/hub/club-arena/
2. Push World Hub to GitHub → Vercel deploys smarter.poker with updated files
3. Everything serves from smarter.poker — single deployment
```

### Key Files
```
World Hub side:
  public/hub/club-arena/              — ALL Club Arena files (618 files, 89MB)
  public/hub/club-arena/index.html    — SPA entry point
  public/hub/club-arena/assets/       — JS/CSS bundles
  public/hub/club-arena/cards/        — Card PNGs
  public/hub/club-arena/images/       — UI images
  public/hub/club-arena/club-logos/   — Club logo gallery
  next.config.js                      — fallback rewrite for SPA routing
  pages/hub/club-arena/lobby.js       — Native page (14 total)
  src/components/club-arena/          — 11 native components
  pages/api/club-arena/               — 66 API routes

Club Arena source (separate repo, built with Vite):
  src/App.tsx                    — React Router with 70+ routes
  src/pages/                     — All page components
  src/components/                — Shared components
  src/services/                  — API service layer (Supabase)
```

### Routing Rules
1. Native pages (lobby.js, tournaments.js, etc.) take priority
2. Static files in public/hub/club-arena/ (JS/CSS/images) are served directly
3. Unmatched routes fall through to index.html via `fallback` rewrite
4. React Router inside the SPA handles client-side navigation

### Auth Flow
1. User logs into smarter.poker (sets `smarter-poker-auth` in localStorage)
2. Club Arena loads from same origin (smarter.poker/hub/club-arena/)
3. Club Arena reads Supabase session from shared localStorage
4. No postMessage, no token relay, no handshake — just shared same-origin storage

### Rules
- NO iframe code — do not add `window.parent` checks, `postMessage`, or `ClubArenaEmbed`
- NO proxy rewrites to external domains — everything must be in public/hub/club-arena/
- When updating Club Arena: build with Vite, copy dist/ (minus .map files) to public/hub/club-arena/
- The SPA fallback rewrite must stay in `fallback` (not `afterFiles`) so public/ files take priority

---

## General Project Info

### Tech Stack
- Next.js 14 (Pages Router)
- React 18
- Supabase (PostgreSQL + Auth + Realtime)
- Tailwind CSS + DaisyUI
- Zustand for state

### Key Directories
```
/pages           # Next.js pages and API routes
/src/components  # React components
/src/lib         # Utilities and services
/src/stores      # Zustand stores
/supabase        # Migrations and seeds
/.agent/skills   # Agent knowledge bases
```

### Database
- Supabase PostgreSQL
- Row-Level Security enabled
- Real-time subscriptions available

### Authentication
- Supabase Auth
- JWT tokens
- Session storage key: 'smarter-poker-auth'
