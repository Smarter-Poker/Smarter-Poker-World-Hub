# Claude Instructions for Smarter-Poker-World-Hub

## Project Overview

This is the Smarter.Poker platform - a comprehensive poker training and community application.

## Key Project: Smarter Captain

**Smarter Captain** is a poker room management platform (competing with PokerAtlas TableCaptain).

### Before Working on Smarter Captain

**ALWAYS read these files first:**
```
.agent/skills/smarter-captain/SKILL.md              # Overview
.agent/skills/smarter-captain/IMPLEMENTATION_PHASES.md  # Step-by-step guide
.agent/skills/smarter-captain/DATABASE_SCHEMA.sql   # Table structures
.agent/skills/smarter-captain/API_REFERENCE.md      # Endpoint specs
```

### Critical Rules for Smarter Captain

1. **NO EMOJIS** - Clean, professional UI only
2. **Facebook color scheme** - Primary: #1877F2, Background: #F9FAFB
3. **Follow the spec exactly** - Do not invent features
4. **Check DATABASE_SCHEMA.sql** before creating/modifying tables
5. **Check API_REFERENCE.md** before creating/modifying endpoints
6. **Use Inter font** for all text

### Smarter Captain File Locations

```
Skill Documents:     .agent/skills/smarter-captain/
API Routes:          pages/api/captain/
Player UI:           pages/hub/captain/
Staff UI:            pages/captain/
Components:          src/components/captain/
State:               src/stores/captainStore.js
Utilities:           src/lib/captain/
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

1. Check `.agent/skills/smarter-captain/` first
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
