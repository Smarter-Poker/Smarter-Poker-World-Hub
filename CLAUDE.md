# Claude Instructions for Smarter-Poker-World-Hub

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
