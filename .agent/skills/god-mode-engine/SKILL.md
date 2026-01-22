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
| API Server | `server.py` | 500+ |
| **GameCard** | `src/components/training/GameCard.jsx` | 295 |
| Training Page | `pages/hub/training.js` | 1108 |

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
# API Server
uvicorn server:app --reload --port 8000

# Frontend
npm run dev

# Seed games
python3 scripts/seed_games.py --stats
```

---

## Step 6: Training Hub Enhancements

### GameCard Features
| Feature | Description |
|---------|-------------|
| **Progress Bar** | Visual "Level X/10" with animated fill |
| **Action States** | `▶ START` / `▶ RESUME` / `✓ MASTERED` |
| **Color Coding** | Cyan=new, Green=progress, Gold=mastered |

### Preserved Features
- Netflix-style horizontal scroll lanes
- 5-category filter tabs
- Mastered crown overlay + gold border
- Streak badge, Daily Challenge, Fix Your Leaks

---

## Skill Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main guide |
| `ENGINE_CORE_REFERENCE.md` | Python backend |
| `GAMESESSION_REFERENCE.md` | React frontend |
| `SERVER_REFERENCE.md` | FastAPI endpoints |
| `SEEDER_REFERENCE.md` | Game seeding |
| `TRAINING_HUB_REFERENCE.md` | Training Hub UI |
| `DATABASE_DEPLOYMENT.md` | Browser automation |

---

## Deployment Checklist

- [x] Database schema
- [x] Game seeder (100 games)
- [x] Engine core backend
- [x] Frontend component
- [x] FastAPI server
- [x] **Training Hub enhancements**
- [ ] Production deploy
