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
| Seed Data (100 Games) | `/database/migrations/seed_game_registry.sql` |
| Game Seeder Script | `/scripts/seed_games.py` |
| Engine Core | `/src/engine/engine_core.py` |
| Game Session UI | `/src/components/training/GameSession.tsx` |
| Fetch Hand API | `/pages/api/god-mode/fetch-hand.js` |
| Submit Action API | `/pages/api/god-mode/submit-action.js` |

---

## DATABASE DEPLOYMENT (Browser Automation)

### Automated via Supabase SQL Editor

The database migrations can be executed automatically using browser subagent:

```javascript
// 1. Copy SQL to clipboard
cat /database/migrations/god_mode_engine.sql | pbcopy

// 2. Use browser_subagent to:
//    - Navigate to Supabase SQL Editor
//    - Use Monaco API: window.monaco.editor.getModels()[0].setValue(sql)
//    - Click Run button
//    - Verify with SELECT COUNT(*) query
```

### Tables Created

| Table | Purpose | RLS Policy |
|-------|---------|------------|
| `game_registry` | 100 training games | Public read |
| `god_mode_user_session` | Level/health tracking | User-owned |
| `god_mode_hand_history` | Hand logs + variant_hash | User-owned |
| `god_mode_leaderboard` | Competitive rankings | Public read |

### Verified Engine Distribution

| Engine | Count | Purpose |
|--------|-------|---------|
| **PIO** | 56 | Postflop solver (suit isomorphism) |
| **CHART** | 20 | Preflop/ICM static charts |
| **SCENARIO** | 24 | Mental game "rigged" psychology |
| **Total** | **100** | |

---

## The 3-Engine Architecture

### ENGINE A: PIO (Postflop)

- **Source:** `solved_spots_gold` table (PioSolver files)
- **Isomorphism:** Randomly rotate suits for visual uniqueness
- **CRITICAL:** Track `(file_id + variant_hash)` to prevent duplicate questions

### ENGINE B: CHART (Preflop/ICM)

- **Source:** Static JSON charts (`/data/charts`)
- **Logic:** Compare user input to ranges, no solver calls
- **Use Cases:** Push/fold, bubble play, satellites

### ENGINE C: SCENARIO (Mental Game)

- **Source:** Hardcoded scripts (`/data/scenarios`)
- **Logic:** Rigged RNG to test psychology
- **Use Cases:** Bad beat response, tilt control

---

## Core Features

### 1. Suit Isomorphism ("Suit Spinner")

```python
from engine_core import GameEngine

# Rotate suits so same hand looks different visually
SUIT_ROTATIONS = {
    0: {'s':'s', 'h':'h', 'd':'d', 'c':'c'},  # Identity
    1: {'s':'h', 'h':'d', 'd':'c', 'c':'s'},  # +1
    2: {'s':'d', 'h':'c', 'd':'s', 'c':'h'},  # +2
    3: {'s':'c', 'h':'s', 'd':'h', 'c':'d'},  # +3
}

original = "AhKs"
rotated = GameEngine.rotate_suits(original, rotation_key=1)
# Result: "AdKh"
```

### 2. Active Villain (Weighted RNG)

```python
solver_node = {
    'actions': {
        'check': {'frequency': 0.60, 'ev': 0.5},
        'bet_50': {'frequency': 0.25, 'ev': 0.7},
        'bet_100': {'frequency': 0.15, 'ev': 0.65}
    }
}

villain_action = GameEngine.resolve_villain_action(solver_node)
# Randomly selects action weighted by frequency
```

### 3. Damage Calculation

```python
result = GameEngine.calculate_damage(
    user_action='fold',
    user_sizing=None,
    solver_node=solver_node,
    pot_size=100
)

# result.is_correct = False
# result.ev_loss = 12.5
# result.chip_penalty = 6  # Health bar damage (0-25 range)

# INDIFFERENCE RULE: Actions with ≥40% frequency are accepted as correct
```

---

## Frontend Components

### GameSession.tsx Features

1. **Director Animation** - Typewriter effect: "Hero raises... Villain calls..."
2. **Health Bar** - Visual HP (0-100) with screen shake on damage
3. **Bet Slider** - Snaps to solver nodes (25%, 33%, 50%, 66%, 75%, 100%, 150%, 200%)
4. **Feedback Overlay** - Shows EV loss, chip penalty, mixed strategy indicator

### API Endpoints

```javascript
// Fetch next hand with suit isomorphism
POST /api/god-mode/fetch-hand
Body: { gameId, userId }

// Submit action and get damage result
POST /api/god-mode/submit-action
Body: { gameId, userId, action, sizing, fileId, variantHash }
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

## Usage Example

```tsx
import { GameSession } from '@/components/training/GameSession';

function TrainingPage() {
  return (
    <GameSession
      gameId="short-stack-ninja"
      userId={currentUser.id}
      onSessionComplete={(stats) => {
        console.log(`Passed: ${stats.passed}`);
        console.log(`Score: ${stats.correctAnswers}/${stats.handsPlayed}`);
      }}
    />
  );
}
```

---

## Deployment Checklist

- [x] Database schema created (`god_mode_engine.sql`)
- [x] 100 games seeded (PIO=56, CHART=20, SCENARIO=24)
- [x] RLS policies enabled on all tables
- [x] Backend engine core (`engine_core.py`)
- [x] Frontend component (`GameSession.tsx`)
- [x] API routes (`fetch-hand.js`, `submit-action.js`)
- [x] Production deployment to `smarter.poker`
