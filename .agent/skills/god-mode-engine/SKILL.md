---
name: God Mode Engine
description: Build and manage the 100-game poker training RPG with 3-engine architecture (PIO, CHART, SCENARIO)
---

# God Mode Engine Skill

Complete implementation of the Smarter.Poker "God Mode" training system.

## Quick Reference

| Component | File | Lines |
|-----------|------|-------|
| Database Schema | `database/migrations/god_mode_engine.sql` | 322 |
| Game Seeder | `scripts/seed_games.py` | 350 |
| Engine Core | `src/engine/engine_core.py` | 733 |
| Frontend | `src/components/training/GameSession.tsx` | 900+ |
| **API Server** | `server.py` | 500+ |

---

## Architecture

```
     GameSession.tsx
           │ REST
     ┌─────▼─────┐
     │ server.py │ FastAPI
     └─────┬─────┘
           │
     ┌─────▼─────┐
     │engine_core│ GameEngine
     └─────┬─────┘
     ┌─────┼─────┐
    PIO  CHART SCENARIO
    (60)  (19)   (21)
```

---

## Run Commands

```bash
# API Server (port 8000)
uvicorn server:app --reload --port 8000

# Frontend (port 3000)
npm run dev

# Seed games
python3 scripts/seed_games.py --stats
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/session/start` | POST | Init session (Level 1, HP 100) |
| `/api/hand/next` | POST | Fetch hand + narrative |
| `/api/hand/action` | POST | Submit action → Grade → Save |
| `/api/games` | GET | List 100 games |
| `/api/leaderboard/{slug}` | GET | Rankings |

---

## Game Loop

```
1. POST /session/start → session_id
2. POST /hand/next → hand_data, narrative
3. User makes decision
4. POST /hand/action → result, damage
5. Repeat 2-4 for 20 hands
6. Level complete or HP = 0
```

---

## Key Features

| Feature | Logic |
|---------|-------|
| Suit Isomorphism | 24x content (4! permutations) |
| Indifference Rule | ≥40% freq = correct |
| Director Mode | Typewriter animation |
| Health Bar | Screen shake on damage |
| Bet Slider | Snaps to solver nodes |

---

## Skill Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main guide |
| `ENGINE_CORE_REFERENCE.md` | Python backend |
| `GAMESESSION_REFERENCE.md` | React frontend |
| `SERVER_REFERENCE.md` | FastAPI endpoints |
| `SEEDER_REFERENCE.md` | Game seeding |
| `DATABASE_DEPLOYMENT.md` | Browser automation |

---

## Deployment Checklist

- [x] Database schema
- [x] Game seeder (100 games)
- [x] Engine core backend
- [x] Frontend component
- [x] FastAPI server
- [ ] Production deploy
