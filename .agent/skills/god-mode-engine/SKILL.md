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
| **LevelSelector** | `src/components/training/LevelSelector.tsx` | 697 |
| Play Page | `pages/hub/training/play/[gameId].js` | 85 |
| Arena Page | `pages/hub/training/arena/[gameId].js` | 120 |
| **ChartGrid** | `src/components/training/ChartGrid.tsx` | 580 |
| **MentalGym** | `src/components/training/MentalGym.tsx` | 520 |

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

## Step 7: Level Select Screen

### Route Flow
```
/hub/training         → Training Hub (100 games)
     ↓ click game
/hub/training/play/[gameId]  → Level Selector (10 levels)
     ↓ click level
/hub/training/arena/[gameId] → Game Session (20 hands)
```

### LevelSelector Features
| Feature | Description |
|---------|-------------|
| **Vertical Level Map** | Levels 1-10 with connection lines |
| **Lock Logic** | Level 1 always open, others need 85%+ on previous |
| **High Scores** | Shows best % with color coding |
| **Play States** | PLAY / RETRY / REPLAY buttons |
| **Passing Grades** | Scales from 85% (L1) to 100% (L10) |

### API Integration
```javascript
// Fetch progress
GET /api/training/progress?userId=X&gameId=Y

// Start session
POST /api/session/start
Body: { user_id, game_id, level }
```

---

## Step 8: Missing Engines (CHART & SCENARIO)

### ChartGrid.tsx — Push/Fold Training
| Feature | Description |
|---------|-------------|
| **13x13 Grid** | All 169 hand combos (pairs diagonal, suited above, offsuit below) |
| **Cell Interaction** | Click hand → action popup (PUSH/FOLD) |
| **Visual Feedback** | Green=correct, Red=wrong, Gold=highlighted question |
| **Position Display** | Hero position badge with color coding |
| **Stack Depth** | Shows BB stack for ICM decisions |
| **Result Overlay** | Animated correct/incorrect with hand info |

### MentalGym.tsx — Psychology Training
| Feature | Description |
|---------|-------------|
| **Scenario Text** | Large italic quote with emotional context |
| **Countdown Timer** | Visual pressure with 15s default |
| **Choice Buttons** | Big buttons with icons and emotional type tags |
| **Emotional Types** | `impulsive` / `rational` / `passive` / `aggressive` |
| **Feedback Panel** | Explanation + emotional lesson after choice |
| **Trigger Badges** | TILT ALERT / FEAR TEST / GREED CHECK |

### Integration with GameSession
```typescript
// Engine detection and component switching
if (engineType === 'PIO') → PokerTable component
if (engineType === 'CHART') → ChartGrid component
if (engineType === 'SCENARIO') → MentalGym component
```

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

- [x] Step 1: Database schema
- [x] Step 2: Game seeder (100 games)
- [x] Step 3: Engine core backend
- [x] Step 4: GameSession component
- [x] Step 5: FastAPI server
- [x] Step 6: Training Hub enhancements
- [x] Step 7: Level Select screen
- [x] **Step 8: Missing Engines (ChartGrid & MentalGym)**
- [ ] Step 9: Production deploy
