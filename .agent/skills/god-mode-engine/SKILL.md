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
| Database Schema | `/database/migrations/god_mode_engine.sql` |
| Game Seeder | `/scripts/seed_games.py` |
| Engine Core | `/src/engine/engine_core.py` |
| Game Session UI | `/src/components/training/GameSession.tsx` |
| Fetch Hand API | `/pages/api/god-mode/fetch-hand.js` |
| Submit Action API | `/pages/api/god-mode/submit-action.js` |

---

## STEP 1: Database Schema

### Tables Created

```sql
-- game_registry: 100 Game Titles with engine routing
CREATE TABLE game_registry (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    engine_type TEXT CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    config JSONB NOT NULL DEFAULT '{}',
    max_level INTEGER DEFAULT 10,
    hands_per_round INTEGER DEFAULT 20
);

-- god_mode_user_session: Level progression and health bar
CREATE TABLE god_mode_user_session (
    user_id UUID REFERENCES auth.users(id),
    game_id UUID REFERENCES game_registry(id),
    current_level INTEGER DEFAULT 1,
    health_chips INTEGER DEFAULT 100,
    UNIQUE(user_id, game_id)
);

-- god_mode_hand_history: Tracks every hand with variant_hash
CREATE TABLE god_mode_hand_history (
    source_file_id TEXT NOT NULL,
    variant_hash TEXT NOT NULL,  -- Suit rotation (0-3)
    UNIQUE(user_id, source_file_id, variant_hash)  -- Prevents duplicate visuals
);
```

### Run Migration

```bash
# Via Supabase Dashboard SQL Editor:
# Copy contents of /database/migrations/god_mode_engine.sql
```

---

## STEP 2: Game Seeding

### Engine Auto-Assignment Rules

| Category | Engine | Logic |
|----------|--------|-------|
| Push/Fold, ICM, Bubble, Satellite | `CHART` | Static preflop charts |
| Psychology, Tilt, Mental | `SCENARIO` | Rigged RNG scenarios |
| Postflop, Cash, Advanced | `PIO` | Solver queries |

### Run Seeder

```bash
# View engine distribution
python3 scripts/seed_games.py --stats

# Generate SQL
python3 scripts/seed_games.py --output database/migrations/seed_game_registry.sql

# Result: PIO=56, CHART=20, SCENARIO=24 games
```

---

## STEP 3: Engine Core (Python)

### Suit Isomorphism ("Suit Spinner")

```python
from engine_core import GameEngine

# Rotate suits so same hand looks different
original = "AhKs"
rotated = GameEngine.rotate_suits(original, rotation_key=1)
# Result: "AdKh"

# 4 possible rotations per hand = 4x content multiplier
SUIT_ROTATIONS = {
    0: {'s':'s', 'h':'h', 'd':'d', 'c':'c'},  # Identity
    1: {'s':'h', 'h':'d', 'd':'c', 'c':'s'},  # +1
    2: {'s':'d', 'h':'c', 'd':'s', 'c':'h'},  # +2
    3: {'s':'c', 'h':'s', 'd':'h', 'c':'d'},  # +3
}
```

### Active Villain (Weighted RNG)

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

### Damage Calculation

```python
result = GameEngine.calculate_damage(
    user_action='fold',
    user_sizing=None,
    solver_node=solver_node,
    pot_size=100
)

# result.is_correct = False
# result.ev_loss = 12.5
# result.chip_penalty = 6  # Health bar damage

# INDIFFERENCE RULE: Actions with ≥40% frequency are accepted as correct
```

---

## STEP 4: Frontend Components

### GameSession.tsx Features

1. **Director Animation**
   - Typewriter effect shows action history
   - "Hero raises... Villain calls..." before table renders

2. **Health Bar**
   - Visual HP bar (0-100)
   - Screen shake on damage
   - Color transitions: Green → Yellow → Orange → Red

3. **Bet Slider with Snapping**
   - User drags to 53%, visually shows 53%
   - Snaps to nearest solver node (50%) on submit
   - Nodes: 0%, 25%, 33%, 50%, 66%, 75%, 100%, 150%, 200%

4. **Feedback Overlay**
   - Shows correct/incorrect result
   - Displays EV loss and chip penalty
   - Mixed strategy indicator for indifference

### API Endpoints

```javascript
// Fetch next hand with suit isomorphism
POST /api/god-mode/fetch-hand
Body: { gameId, userId }
Response: { hand: HandState, game: GameConfig }

// Submit action and get damage result
POST /api/god-mode/submit-action
Body: { gameId, userId, action, sizing, fileId, variantHash }
Response: { isCorrect, evLoss, chipPenalty, feedback }
```

---

## The 3-Engine Architecture

### ENGINE A: PIO (Postflop)

- **Source:** `solved_spots_gold` table (PioSolver files)
- **Isomorphism:** Randomly rotate suits for visual uniqueness
- **Active Villain:** Weighted RNG for opponent actions

### ENGINE B: CHART (Preflop/ICM)

- **Source:** Static JSON charts
- **Logic:** Compare user input to ranges, no solver calls
- **Use Cases:** Push/fold, bubble play, satellites

### ENGINE C: SCENARIO (Mental Game)

- **Source:** Hardcoded scripts
- **Logic:** Rigged RNG to test psychology
- **Use Cases:** Bad beat response, tilt control

---

## Gamification Rules

1. **Health Bar:** Start with 100 chips. Blunders reduce based on EV loss.
2. **Progression:** 20 hands per round. Pass threshold to unlock next level.
3. **Thresholds:** Level 1 = 85%, Level 10 = 100%
4. **Indifference:** Mixed strategies (≥40% freq) are both correct.

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

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `god_mode_architecture.md` | 100 | Master spec document |
| `god_mode_engine.sql` | 320 | Full database schema |
| `seed_games.py` | 350 | Python seeder with auto-assign |
| `seed_game_registry.sql` | 118 | Generated SQL for 100 games |
| `engine_core.py` | 500+ | Core Python engine |
| `GameSession.tsx` | 700+ | React game component |
| `fetch-hand.js` | 250 | API: fetch hand with isomorphism |
| `submit-action.js` | 200 | API: evaluate action & damage |
