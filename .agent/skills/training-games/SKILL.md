---
name: GTO Training Games Engine
description: Complete knowledge base for the 100-game GTO Training Engine with PIO solver integration, Grok AI fallback, and 3-engine architecture (PIO/CHART/SCENARIO)
---

# GTO Training Games Engine Skill

## Overview

The GTO Training Engine is a 100-game poker training RPG where users progress through 10 levels per game, mastering GTO poker strategy through deliberate practice.

## Core Architecture

### The 3-Engine System

Every game routes to one of three engines:

#### ENGINE A: PIO (68 games)
- **Purpose**: Postflop solver-based GTO training
- **Database**: `solved_spots_gold` table in Supabase
- **Features**:
  - Full 1,326-hand strategy matrices
  - Flop/Turn/River scenarios
  - EV calculations and mixed strategies
  - Suit isomorphism (rotate suits for uniqueness)
- **Games**: Cash strategy, MTT postflop, 3-bet pots, advanced theory
- **Tags**: `['gto', 'math']`

#### ENGINE B: CHART (3 games)
- **Purpose**: Preflop & ICM range charts
- **Database**: `memory_charts_gold` table in Supabase
- **Features**:
  - 169-hand chart grids
  - Push/fold ranges
  - Nash equilibrium
  - Preflop opening ranges
- **Games**: Push/Fold Mastery (mtt-001), Chip & Chair (mtt-016), Short Stack Rat (cash-010)
- **Tags**: `['math']` (often with `['gto']`)

#### ENGINE C: SCENARIO (29 games)
- **Purpose**: Mental game & psychology training
- **Source**: Grok AI generation (no database)
- **Features**:
  - Tilt resistance scenarios
  - Decision-making under pressure
  - Emotional regulation
  - No poker math required
- **Games**: All 20 Psychology games + Table Selection (cash-020)
- **Tags**: `[]` (empty - no GTO/math)

---

## Database Schema

### Table 1: `solved_spots_gold` (Postflop Engine)

**Location**: `supabase/migrations/004_build_god_mode_library.sql`

```sql
CREATE TABLE solved_spots_gold (
    id UUID PRIMARY KEY,
    scenario_hash TEXT NOT NULL UNIQUE,
    street TEXT NOT NULL,              -- 'Flop', 'Turn', 'River'
    stack_depth INTEGER NOT NULL,      -- 20, 40, 60, 80, 100, 200
    game_type TEXT NOT NULL,           -- 'Cash', 'MTT', 'Spin'
    topology TEXT NOT NULL,            -- 'HU', '3-Max', '6-Max', '9-Max'
    mode TEXT NOT NULL,                -- 'ChipEV', 'ICM', 'PKO'
    board_cards TEXT[],                -- ['As', '7d', '2h']
    macro_metrics JSONB,               -- Range advantage, SPR, etc.
    strategy_matrix JSONB,             -- Full 1,326-hand strategy
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Strategy Matrix Structure**:
```json
{
  "AhKd": {
    "best_action": "Raise",
    "max_ev": 10.5,
    "ev_loss": 0,
    "actions": {
      "Raise": {"ev": 10.5, "freq": 1.0, "size": "66%"},
      "Call": {"ev": 8.2, "freq": 0.0},
      "Fold": {"ev": 0.0, "freq": 0.0}
    },
    "is_mixed": false
  }
}
```

### Table 2: `memory_charts_gold` (Preflop Engine)

```sql
CREATE TABLE memory_charts_gold (
    id UUID PRIMARY KEY,
    chart_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,            -- 'Preflop', 'PushFold', 'Nash'
    chart_grid JSONB,                  -- 169-hand chart
    stack_depth INTEGER,
    topology TEXT,
    position TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Chart Grid Structure**:
```json
{
  "AA": {"action": "Raise", "freq": 1.0, "size": "3bb"},
  "AKs": {"action": "Raise", "freq": 1.0, "size": "3bb"},
  "AQo": {"action": "Mixed", "raise_freq": 0.45, "fold_freq": 0.55},
  "72o": {"action": "Fold", "freq": 1.0}
}
```

### Table 3: `training_question_cache` (Grok Cache)

```sql
CREATE TABLE training_question_cache (
    id UUID PRIMARY KEY,
    question_id TEXT UNIQUE NOT NULL,
    game_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,         -- 'PIO', 'CHART', 'SCENARIO'
    game_type TEXT NOT NULL,           -- 'cash', 'tournament', 'sng'
    level INTEGER NOT NULL,
    question_data JSONB NOT NULL,
    generated_at TIMESTAMPTZ,
    times_used INTEGER DEFAULT 0
);
```

---

## Game Distribution

### By Category (100 Total)
- **MTT**: 25 games (Tournament tactics)
- **CASH**: 25 games (Ring game fundamentals)
- **SPINS**: 10 games (Hyper-turbo formats)
- **PSYCHOLOGY**: 20 games (Mental game)
- **ADVANCED**: 20 games (Solver-level theory)

### By Engine Type
- **PIO**: 68 games (GTO/math-focused)
- **CHART**: 3 games (Push/fold)
- **SCENARIO**: 29 games (Psychology)

### By Player Count
- **2 Players (Heads-Up)**: 3 games
  - cash-018: Blind vs Blind
  - mtt-015: Heads Up Duel
  - spins-004: SNG Endgame
  
- **3 Players (3-Max)**: 11 games
  - mtt-014: 3-Max Blitz
  - All 10 Spin & Go games
  
- **6 Players (6-Max)**: 61 games
  - 24 Cash games
  - 20 Psychology games
  - 17 Advanced games
  
- **9 Players (9-Max)**: 25 games
  - 24 MTT games

---

## Question Flow

### Priority Order

1. **Query PIO Database** (PRIMARY)
   ```javascript
   const { data } = await supabase
       .from('solved_spots_gold')
       .select('*')
       .eq('game_type', gameConfig.gameType)
       .eq('topology', gameConfig.topology)
       .eq('stack_depth', gameConfig.stackDepth)
       .limit(25);
   ```

2. **Query Preflop Charts** (For CHART games)
   ```javascript
   const { data } = await supabase
       .from('memory_charts_gold')
       .select('*')
       .eq('category', 'PushFold')
       .eq('stack_depth', gameConfig.stackDepth);
   ```

3. **Check Cache**
   ```javascript
   const { data } = await supabase
       .from('training_question_cache')
       .select('*')
       .eq('game_id', gameId)
       .eq('level', level);
   ```

4. **Generate with Grok AI** (FALLBACK)
   ```javascript
   question = await generateQuestionWithGrok(gameId, engineType, level, gameType, game, gameConfig);
   ```

---

## Game Configuration

**File**: `src/config/gameConfigs.js`

Each game has:
- `players`: 2, 3, 6, or 9
- `format`: "Heads-Up Cash", "6-Max Cash", "9-Max Tournament", etc.
- `stackDepth`: "100bb", "10-15bb", "200bb", etc.
- `gameType`: 'cash', 'tournament', or 'sng'
- `engine`: 'PIO', 'CHART', or 'SCENARIO'

**Example**:
```javascript
'cash-018': {
    players: 2,
    format: 'Heads-Up Cash',
    stackDepth: '100bb',
    gameType: 'cash',
    engine: 'PIO',
    pioQuery: {
        table: 'solved_spots_gold',
        game_type: 'Cash',
        topology: 'HU',
        stack_depth: 100,
        mode: 'ChipEV'
    }
}
```

---

## Progression System

### Levels 1-10
- **Level 1**: 85% passing threshold (21/25 correct)
- **Level 2**: 87% passing threshold (22/25 correct)
- **Level 10**: 100% passing threshold (25/25 correct)

### XP Rewards
- **Level 1**: 50 XP
- **Level 5**: 200 XP
- **Level 10**: 1000 XP (Mastery bonus)

### Difficulty Scaling
- **Level 1-3**: Basic scenarios, clear-cut decisions
- **Level 4-6**: Mixed strategies, close decisions
- **Level 7-10**: Advanced theory, exploitative adjustments

---

## API Endpoints

### GET `/api/training/get-question`

**Query Params**:
- `gameId`: Game identifier (e.g., 'cash-018')
- `userId`: User ID (for no-repeat tracking)
- `level`: Current level (1-10)
- `engineType`: 'PIO', 'CHART', or 'SCENARIO'

**Response**:
```json
{
  "question": {
    "id": "grok_cash-018_1234567890",
    "type": "PIO",
    "question": "What is the GTO play in this spot?",
    "scenario": {
      "heroPosition": "SB",
      "heroStack": 100,
      "gameType": "Heads-Up Cash",
      "heroHand": "AhKs",
      "board": "Jh7s2d",
      "pot": 12,
      "villainPosition": "BB",
      "villainStack": 100,
      "action": "Villain bets 8bb"
    },
    "options": [
      {"id": "a", "text": "Fold"},
      {"id": "b", "text": "Call"},
      {"id": "c", "text": "Raise to 24bb"},
      {"id": "d", "text": "All-In"}
    ],
    "correctAnswer": "c",
    "explanation": "Raising is optimal because..."
  },
  "level": 1,
  "passThreshold": 85,
  "gameType": "cash"
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/data/TRAINING_LIBRARY.js` | 100-game library definitions |
| `src/config/gameConfigs.js` | Game-specific configurations |
| `src/config/trainingConfig.js` | Level thresholds and XP rewards |
| `pages/api/training/get-question.js` | Question fetching API |
| `src/components/training/MillionaireQuestion.jsx` | Question display UI |
| `supabase/migrations/004_build_god_mode_library.sql` | PIO database schema |
| `supabase/migrations/20260129_training_question_cache.sql` | Cache schema |

---

## Critical Implementation Notes

### 1. Suit Isomorphism (PIO Engine)
Users must NEVER see the same visual hand twice. Rotate suits:
```javascript
const SUIT_MAP = {
  0: { s: 's', h: 'h', d: 'd', c: 'c' }, // No rotation
  1: { s: 'h', h: 'd', d: 'c', c: 's' }, // Rotate +1
  2: { s: 'd', h: 'c', d: 's', c: 'h' }, // Rotate +2
  3: { s: 'c', h: 's', d: 'h', c: 'd' }  // Rotate +3
};
```

### 2. No-Repeat Tracking
Track `(file_id + suit_hash)` in `user_seen_questions` table.

### 3. Mixed Strategies
When solver shows mixed strategy (e.g., 45% raise, 55% call), accept BOTH as correct.

### 4. Grok Prompt Requirements
- Use accurate game format from `gameConfig`
- Include player count (2, 3, 6, or 9)
- Specify stack depth in BB
- Match engine type (PIO/CHART/SCENARIO)
- Generate contextually appropriate scenarios

---

## Testing Checklist

- [ ] Verify PIO data exists in `solved_spots_gold`
- [ ] Verify chart data exists in `memory_charts_gold`
- [ ] Test Heads-Up games (2 players)
- [ ] Test 3-Max games (3 players)
- [ ] Test 6-Max games (6 players)
- [ ] Test 9-Max games (9 players)
- [ ] Test PIO engine games
- [ ] Test CHART engine games
- [ ] Test SCENARIO engine games
- [ ] Verify suit rotation works
- [ ] Verify no-repeat tracking works
- [ ] Test Grok fallback
- [ ] Test cache system
- [ ] Verify XP rewards
- [ ] Test level progression

---

## Common Issues

### Issue 1: Heads-Up Games Showing as "6-Max"
**Cause**: API only detected game type, not player count  
**Fix**: Use `gameConfig.format` and `gameConfig.players`

### Issue 2: Grok Generating Wrong Format
**Cause**: Prompt defaulted to "6-Max Cash Game"  
**Fix**: Pass `gameConfig` to Grok function and use accurate format

### Issue 3: No PIO Data Found
**Cause**: Table might be empty or query parameters wrong  
**Fix**: Check data coverage and verify query parameters match schema

---

## Future Enhancements

1. **Real PIO Integration**: Ingest actual PioSolver files
2. **Chart Library**: Add comprehensive preflop/push-fold charts
3. **Scenario Scripts**: Write psychology game scenarios
4. **Adaptive Difficulty**: Adjust based on user performance
5. **Leak Detection**: Identify user weaknesses
6. **Personalized Training**: Recommend games based on leaks

---

## Resources

- **God Mode Specs**: `GOD_MODE_SPECS.md`
- **Architecture**: `god_mode_architecture.md`
- **Skill Reference**: `.agent/skills/god-mode-engine/SKILL.md`
- **PIO Discovery**: Research artifacts in brain directory
