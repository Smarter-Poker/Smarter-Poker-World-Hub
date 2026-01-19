# Smarter.Poker — Project Mission (North Star)

## Project Identity
**Name:** Smarter.Poker  
**Vision:** The world's most immersive poker training and discovery ecosystem  
**Architecture:** 11-Orb spatial hub with autonomous AI orchestration

---

## Core Goals (Priority Order)

### ✅ 1. Training Orb (Orb #4) — **COMPLETE**
- **Status:** Production-verified, 100 games live
- **Features:** GTO training engine, XP progression, mastery tracking, remediation clinics
- **Tech:** React-native game logic, Supabase state management, PioSOLVER integration
- **URL:** `smarter.poker/hub/training`

### 🚧 2. Poker Near Me (Orb #9) — **IN PROGRESS**
- **Status:** Frontend complete, database population blocked by Supabase infrastructure
- **Features:** GPS search, venue discovery, tournament series tracking, radius filtering
- **Current Blocker:** Supabase 100% CPU utilization preventing bulk data insertion
- **Data Ready:** 69 venues, 77 tournament series (migration files prepared)
- **URL:** `smarter.poker/hub/poker-near-me`

### 📋 3. Social Engine (Orb #1) — **FUTURE**
- **Planned:** Community feed, link previews, video library, Go Live streaming
- **Status:** Foundational architecture in place, awaiting activation

---

## Tech Stack

### Frontend
- **Framework:** Next.js 13+ (App Router)
- **Styling:** Tailwind CSS + Custom CSS (Glassmorphism, Neon Accents)
- **Animation:** Framer Motion, CSS transforms
- **State:** React Context + Zustand (selective)

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (SSO, RLS)
- **APIs:** Next.js API Routes (`/pages/api/*`)
- **Deployment:** Vercel (Production), DigitalOcean (Solver services)

### Specialized Services
- **Solver:** PioSOLVER (Windows VM, remote solve node)
- **AI:** OpenAI GPT-4 (Ghost Fleet, content generation)
- **Maps:** Google Maps API (venue discovery)
- **Media:** Supabase Storage (avatars, videos)

---

## Hard Rules (Non-Negotiable)

### 🔴 Code Architecture
1. **No External Game Scripts:** All game logic must be React-native (no `<script>` tags for gameplay)
2. **Scorched Earth Protocol:** Components must be self-contained, no external dependencies for core logic
3. **Batch Mapping (4x4):** Training games use 4x4 grid mapping for range construction
4. **No 404s:** Mock assets first, never ship broken UI (CSS fallbacks required)

### 🔴 Data Security
1. **No Sensitive Data in Client:** API keys, service role keys stay server-side only
2. **RLS Enforcement:** All Supabase tables must have Row Level Security policies
3. **God Mode Isolation:** Admin features require explicit `is_god_mode` flag checks

### 🔴 Visual Standards
1. **Glassmorphism UI:** `backdrop-filter: blur()`, semi-transparent backgrounds
2. **Neon Accents:** Cyan (#00d4ff), Purple (#a855f7), Gold (#fbbf24)
3. **Video Game Feel:** Animations, sound effects, haptic feedback (where supported)
4. **Universal Scaling:** Pattern A (content zoom), Pattern B (spatial viewport), Pattern C (fixed aspect)

### 🔴 Deployment
1. **Deployment Law:** All sessions conclude with one-click deployment command
2. **Auto-Publish Workflow:** `/auto-publish` triggers git commit + Vercel deploy
3. **Production Parity:** Localhost must match production behavior (no env-specific hacks)

---

## Project Structure

```
hub-vanguard/
├── pages/
│   ├── hub/
│   │   ├── training.js          # Orb #4 (GTO Training)
│   │   ├── poker-near-me.js     # Orb #9 (Discovery)
│   │   ├── social.js            # Orb #1 (Social Hub)
│   │   └── ...                  # Other orbs
│   └── api/
│       ├── poker/               # Venue & series APIs
│       ├── training/            # Game logic APIs
│       └── news/                # Content APIs
├── src/
│   ├── components/              # Reusable UI components
│   ├── contexts/                # React contexts (Auth, Avatar, etc.)
│   ├── stores/                  # Zustand stores
│   └── services/                # Business logic services
├── supabase/
│   └── migrations/              # Database schema & seed data
├── .memory/                     # Anti Gravity 2.0 memory bank
└── .cursorrules                 # AI agent system rules
```

---

## Current Phase: Orb #9 Expansion

**Objective:** Complete nationwide poker venue and tournament series database population.

**Blockers:**
- Supabase infrastructure overload (100% CPU)
- Outstanding billing issues preventing bulk inserts

**Next Steps:**
1. Resolve Supabase billing/infrastructure
2. Execute prepared migration files
3. Verify live data via API endpoints
4. Deploy to production

**Success Criteria:**
- 69 venues live in database
- 77 tournament series live in database
- GPS search functional with real data
- Production URL: `smarter.poker/hub/poker-near-me`
