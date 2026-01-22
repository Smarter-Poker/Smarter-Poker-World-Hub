# Smarter.Poker - Project Overview

## Vision
The world's most immersive poker training and discovery ecosystem.

## Architecture
11-Orb spatial hub with the following key features:

### Orb #4: Training (COMPLETE)
- GTO training engine with 100 games
- XP progression and mastery tracking
- React-native game logic
- URL: `smarter.poker/hub/training`

### Orb #9: Poker Near Me (IN PROGRESS)
- GPS search and venue discovery
- Tournament series tracking
- 777 venues across USA
- URL: `smarter.poker/hub/poker-near-me`

### Orb #1: Social (PLANNED)
- Community feed
- Video library
- Go Live streaming

---

## Tech Stack

### Frontend
- Next.js 14
- Tailwind CSS + DaisyUI
- Framer Motion, GSAP
- Zustand for state
- Three.js / Spline for 3D

### Backend
- Supabase (PostgreSQL + Auth)
- Next.js API Routes
- Vercel deployment

### Data Pipeline
- GitHub Actions (scraper every 3 days)
- Puppeteer for web scraping
- 777 poker venues tracked

---

## Project Structure

```
smarter-poker-world-hub/
├── pages/              # Next.js pages and API routes
├── src/
│   ├── components/     # React components by feature
│   ├── stores/         # Zustand stores
│   ├── services/       # Business logic
│   ├── engine/         # Training engine (Python + JS)
│   └── content-engine/ # AI content generation (separate package)
├── scripts/            # Data pipeline and automation
├── supabase/           # Database migrations
├── public/             # Static assets
└── docs/               # Documentation
```
