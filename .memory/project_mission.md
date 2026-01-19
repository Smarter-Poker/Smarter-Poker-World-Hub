# Smarter.Poker - Training Hub Vanguard

## Project Overview

**Project Name:** Smarter.Poker (Training Hub Vanguard)  
**Repository:** hub-vanguard  
**Primary Focus:** GTO Poker Training Engine

---

## Core Mission

Build a world-class poker training platform that teaches players Game Theory Optimal (GTO) strategy through interactive, video-game-quality drills and clinics.

---

## Project Status

### 1. Training Orb (Orb #4)
**STATUS: ✅ CODE COMPLETE - MAINTENANCE ONLY**

- 100 training games across 5 categories (MTT, Cash, Spins, Psychology, Advanced)
- 28 specialized training clinics for leak remediation
- 12 Laws of Training Immersion (all implemented)
- Pure React poker table (Scorched Earth Protocol)
- Leak detection system with 75% confidence threshold
- XP progression with 2.5x remediation multiplier
- Database integration (user_leaks, xp_logs, training_clinics)

### 2. Poker Near Me (Orb #9)
**STATUS: 🔄 PENDING - SEPARATE WINDOW**

- Live venue discovery
- Tournament calendar
- GPS-based search
- **⚠️ CRITICAL:** This is a SEPARATE micro-app. Do not mix with Training codebase.

### 3. Social Engine (Orb #1)
**STATUS: 📋 FUTURE**

- Community feed
- Go Live streaming
- Messenger PWA

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14 |
| **Database** | Supabase (PostgreSQL) |
| **Styling** | Tailwind CSS + Vanilla CSS |
| **Animations** | Framer Motion |
| **State** | React Hooks + Zustand |
| **Auth** | Supabase Auth |

---

## Hard Rules (NEVER VIOLATE)

### 1. Scorched Earth Protocol
- **NO external game scripts or HTML templates**
- **React State drives ALL visuals**
- Self-contained components only
- No iframe dependencies for core gameplay

### 2. Visual Anchors (Fixed Positioning)
- Hero: `bottom: -10%, left: 50%` (locked)
- Villain: `top: -10%, left: 50%` (locked)
- Board: `top: 50%, left: 50%` (locked)

### 3. Asset Integrity
- **NO 404 errors in production**
- Generate CSS fallbacks for missing images
- Mock audio files acceptable (replace before launch)

### 4. Data Security
- **NO sensitive data in client code**
- Use environment variables for API keys
- RLS policies on all Supabase tables

### 5. Project Isolation
- Training code stays in `hub-vanguard`
- Maps/Discovery code goes in `smarter-poker-maps`
- **Never cross-pollinate**

---

## Key Architectural Decisions

### Scorched Earth Rewrite (2026-01-18)
- Replaced HTML template approach with 100% Pure React
- Fixed card positioning bugs (villain cards no longer hang)
- State-driven rendering prevents visual glitches
- **Result:** Stable, maintainable, production-ready

### Brain Transplant (2026-01-18)
- Integrated TRAINING_CLINICS data layer
- Connected leak detection (Law 1)
- Wired XP progression to Supabase
- **Result:** Real logic + Stable UI = Complete system

---

## Success Metrics

- ✅ All 12 Laws implemented
- ✅ 100 games in library
- ✅ 28 clinics defined
- ✅ Leak detection operational
- ✅ XP logging to database
- ✅ Zero 404 errors
- ✅ Zero positioning bugs

---

**Last Updated:** 2026-01-19  
**Version:** 2.0 (Anti Gravity Intelligence Patch)
