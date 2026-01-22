---
name: God Mode Engine
description: Build and manage the 100-game poker training RPG with 3-engine architecture (PIO, CHART, SCENARIO)
---

# God Mode Engine Skill

The complete implementation guide for the Smarter.Poker "God Mode" training system - a poker RPG with 100 Game Titles, suit isomorphism, active villain AI, and gamified progression.

## Quick Reference

| Component | Location |
|-----------|----------|
| Master Spec | `/god_mode_architecture.md` |
| Business Rules | `/GOD_MODE_SPECS.md` |
| Database Schema | `/database/migrations/god_mode_engine.sql` |
| **Game Seeder Script** | `/scripts/seed_games.py` |
| Seed Data SQL | `/database/migrations/seed_game_registry_v2.sql` |
| Engine Core | `/src/engine/engine_core.py` |
| Game Session UI | `/src/components/training/GameSession.tsx` |
| Fetch Hand API | `/pages/api/god-mode/fetch-hand.js` |
| Submit Action API | `/pages/api/god-mode/submit-action.js` |

---

## GAME SEEDER SCRIPT (seed_games.py)

### Location
`/scripts/seed_games.py`

### Usage
```bash
# Preview engine distribution stats
python3 scripts/seed_games.py --stats

# Preview without inserting to database
python3 scripts/seed_games.py --dry-run

# Generate SQL file
python3 scripts/seed_games.py --output database/migrations/seed_game_registry_v2.sql

# Execute upsert to Supabase (requires SUPABASE_URL & SUPABASE_KEY)
python3 scripts/seed_games.py
```

### Engine Assignment Logic

| Pattern | Engine | Reasoning |
|---------|--------|-----------|
| Push/Fold, Bubble, Satellite, ICM, Preflop, Bounty, Registration, Ranges | `CHART` | Static preflop charts |
| Mental, Tilt, Zen, Focus, Discipline, Ego, Fear, Habits, Mind | `SCENARIO` | Scripted riggings |
| Everything else (C-Bet, Cash, Postflop) | `PIO` | Solver queries |

### Config Auto-Assignment

**Stack Depth:**
- "Short Stack", "Push/Fold", "10-20BB" → `{"stack": 20}`
- "Deep Stack" → `{"stack": 200}`
- "Hyper" → `{"stack": 10}`
- Default → `{"stack": 100}`

**Players:**
- "Heads Up", "Duel" → `{"players": 2}`
- "3-Max", "Spin" → `{"players": 3}`
- Default → `{"players": 6}`

### Current Distribution
| Engine | Count |
|--------|-------|
| **PIO** | 60 |
| **SCENARIO** | 21 |
| **CHART** | 19 |
| **Total** | **100** |

---

## DATABASE TABLES

### Tables Created

| Table | Purpose | RLS Policy |
|-------|---------|------------|
| `game_registry` | 100 training games | Public read |
| `god_mode_user_session` | Level/health tracking | User-owned |
| `god_mode_hand_history` | Hand logs + variant_hash | User-owned |
| `god_mode_leaderboard` | Competitive rankings | Public read |

### Browser Automation Deployment

```bash
# 1. Copy schema SQL to clipboard
cat database/migrations/god_mode_engine.sql | pbcopy

# 2. Use browser_subagent to execute in Supabase SQL Editor
# 3. Repeat with seed SQL
cat database/migrations/seed_game_registry_v2.sql | pbcopy
```

---

## The 3-Engine Architecture

### ENGINE A: PIO (Postflop) — 60 Games

- **Source:** `solved_spots_gold` table (PioSolver files)
- **Isomorphism:** Randomly rotate suits for visual uniqueness
- **CRITICAL:** Track `(file_id + variant_hash)` to prevent duplicate questions

### ENGINE B: CHART (Preflop/ICM) — 19 Games

- **Source:** Static JSON charts (`/data/charts`)
- **Logic:** Compare user input to ranges, no solver calls
- **Use Cases:** Push/fold, bubble play, satellites

### ENGINE C: SCENARIO (Mental Game) — 21 Games

- **Source:** Hardcoded scripts (`/data/scenarios`)
- **Logic:** Rigged RNG to test psychology
- **Use Cases:** Bad beat response, tilt control

---

## Core Features

### 1. Suit Isomorphism ("Suit Spinner")

```python
from engine_core import GameEngine

SUIT_ROTATIONS = {
    0: {'s':'s', 'h':'h', 'd':'d', 'c':'c'},  # Identity
    1: {'s':'h', 'h':'d', 'd':'c', 'c':'s'},  # +1
    2: {'s':'d', 'h':'c', 'd':'s', 'c':'h'},  # +2
    3: {'s':'c', 'h':'s', 'd':'h', 'c':'d'},  # +3
}

rotated = GameEngine.rotate_suits("AhKs", rotation_key=1)
# Result: "AdKh"
```

### 2. Active Villain (Weighted RNG)

```python
solver_node = {
    'actions': {
        'check': {'frequency': 0.60, 'ev': 0.5},
        'bet_50': {'frequency': 0.25, 'ev': 0.7},
    }
}
villain_action = GameEngine.resolve_villain_action(solver_node)
```

### 3. Damage Calculation

```python
result = GameEngine.calculate_damage(
    user_action='fold',
    solver_node=solver_node,
    pot_size=100
)
# result.chip_penalty = 0-25 based on EV loss
# INDIFFERENCE: Actions with ≥40% frequency are accepted as correct
```

---

## Gamification Rules

| Rule | Value |
|------|-------|
| Starting Health | 100 chips |
| Hands per Round | 20 |
| Level 1 Threshold | 85% accuracy |
| Level 10 Threshold | 100% accuracy |
| Indifference | ≥40% freq = correct |
| Max Damage per Hand | 25 chips |

---

## Deployment Checklist

- [x] Database schema created (`god_mode_engine.sql`)
- [x] Python seeder script (`seed_games.py`)
- [x] 100 games seeded (PIO=60, CHART=19, SCENARIO=21)
- [x] RLS policies enabled on all tables
- [x] Backend engine core (`engine_core.py`)
- [x] Frontend component (`GameSession.tsx`)
- [x] API routes (`fetch-hand.js`, `submit-action.js`)
- [x] Production deployment to `smarter.poker`
