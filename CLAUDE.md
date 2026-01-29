# Claude Instructions for Smarter-Poker-World-Hub

## Project Overview

This is the Smarter.Poker platform - a comprehensive poker training and community application.

## Key Project: Club Commander

**Club Commander** is a poker room management platform (competing with PokerAtlas Table Captain).

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
