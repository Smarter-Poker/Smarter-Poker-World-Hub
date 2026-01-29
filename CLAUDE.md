# Claude Instructions for Smarter-Poker-World-Hub

## Project Overview

This is the Smarter.Poker platform - a comprehensive poker training and community application.

## Key Project: Club Commander

**Club Commander** is a poker room management platform (competing with PokerAtlas TableCaptain).

**IMPORTANT**: Club Commander is a SEPARATE product that only activates when a club/venue adopts the software. It is NOT part of Club Arena or the public-facing poker search features.

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
API Routes:          pages/api/club-commander/
Player UI:           pages/hub/club-commander/
Staff UI:            pages/club-commander/
Components:          src/components/club-commander/
State:               src/stores/clubCommanderStore.js
Utilities:           src/lib/club-commander/
```

### Build Phases

| Phase | Focus |
|-------|-------|
| 1 | Database + Waitlist MVP |
| 2 | Cash Game Management |
| 3 | Tournament System |
| 4 | Home Games Module |
| 5 | Promotions & Analytics |
| 6 | Scale & Polish |

### If Unsure

1. Check `.agent/skills/club-commander/` first
2. The spec is comprehensive - the answer is likely there
3. If truly not covered, document the gap and ask

## Public Poker Data Pages (PokerAtlas-style)

All verified casinos, clubs, tours, and tournament series have searchable data pages within Smarter.Poker. These are NOT published externally - they are internal searchable pages only.

### Venue Detail Pages
- **Route**: `/hub/venues/[id]`
- PokerAtlas-style layout with address, phone, website, amenities, games spread, tournament schedule
- Follow/add functionality for social discovery
- Searchable from Poker Near Me

### Tour Detail Pages
- **Route**: `/hub/tours/[code]`
- Tour info, upcoming series, regions, buy-in ranges
- Follow functionality

### Series Detail Pages
- **Route**: `/hub/series/[id]`
- Series info, event counts, prize pools, schedules
- Follow functionality

### Poker Near Me (Unified Search)
- **Route**: `/hub/poker-near-me`
- 4-tab interface: Venues, Tours, Series, Daily Tournaments
- GPS-based search with distance calculation
- Links to detail pages for each entity

### Data Sources
```
/data/tour-source-registry.json       # 26 poker tours
/data/tournament-venues.json          # 163 verified venues
/data/daily-tournament-schedules.json # Daily recurring tournaments
/data/poker-tour-series-2026.json     # 2026 tour events
/data/verified-venues-master.csv      # Comprehensive venue database
```

### Search API Endpoints
```
GET /api/poker/venues          # Venue search + distance calc
GET /api/poker/tours           # Tour registry
GET /api/poker/series          # Tournament series
GET /api/poker/daily-tournaments  # Daily tournament schedules
```

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
/data            # Tournament and venue data (JSON/CSV)
```

### Database
- Supabase PostgreSQL
- Row-Level Security enabled
- Real-time subscriptions available

### Authentication
- Supabase Auth
- JWT tokens
- Session storage key: 'smarter-poker-auth'
