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
| **Python Seeder** | `/scripts/seed_games.py` |
| Seed Data SQL | `/database/migrations/seed_game_registry_v2.sql` |
| **Engine Core** | `/src/engine/engine_core.py` |
| Game Session UI | `/src/components/training/GameSession.tsx` |
| Fetch Hand API | `/pages/api/god-mode/fetch-hand.js` |
| Submit Action API | `/pages/api/god-mode/submit-action.js` |

---

## ENGINE CORE (engine_core.py)

### Location
`/src/engine/engine_core.py` — 733 lines

### GameEngine Class

```python
from src.engine.engine_core import GameEngine

engine = GameEngine(supabase_client)

# Fetch next hand (routes to PIO/CHART/SCENARIO)
hand = await engine.fetch_next_hand(user_id, game_id, current_level)

# Resolve villain action with weighted RNG
villain = engine.resolve_villain_action(solver_node)

# Calculate HP damage from user action
result = engine.calculate_hp_loss("CALL", solver_node)
```

### Key Methods

| Method | Input | Output |
|--------|-------|--------|
| `fetch_next_hand()` | user_id, game_id, level | HandResult / ChartInstruction / ScenarioInstruction |
| `_rotate_suits()` | hand_json, suit_map | Transformed hand with variant_hash |
| `resolve_villain_action()` | solver_node | VillainAction (action, sizing, next_node) |
| `calculate_hp_loss()` | user_action, solver_node | HPResult (damage 0-25, feedback) |

### Suit Isomorphism (The Magic Trick)

24x content multiplication from finite solver files:
```python
# 4! = 24 possible suit permutations
suit_map = {"s": "h", "h": "d", "d": "c", "c": "s"}
variant_hash = "c=s,d=c,h=d,s=h"

# Same hand appears visually different
"AhKs" → "AdKh"  # Rotation 1
"AhKs" → "AcKd"  # Rotation 2
```

### Indifference Rule

Actions with **≥40% solver frequency** OR **EV within 0.05 of max** = CORRECT (0 damage)

### HP Damage Scaling

| EV Loss % | HP Damage |
|-----------|-----------|
| 0% | 0 |
| 1-5% | 1-5 |
| 6-25% | 6-15 |
| 25%+ | 16-25 (max) |

---

## GAME SEEDER (seed_games.py)

### Location
`/scripts/seed_games.py`

### Commands
```bash
python3 scripts/seed_games.py --stats      # Preview distribution
python3 scripts/seed_games.py --dry-run    # Preview without inserting
python3 scripts/seed_games.py --output X   # Generate SQL file
python3 scripts/seed_games.py              # Execute upsert
```

### Engine Assignment Keywords

| Engine | Keywords | Count |
|--------|----------|-------|
| CHART | push/fold, bubble, satellite, icm, preflop, bounty | 19 |
| SCENARIO | mental, tilt, zen, focus, discipline, ego, fear | 21 |
| PIO | Everything else (C-Bet, Cash, Postflop) | 60 |

---

## DATABASE TABLES

| Table | Purpose | RLS |
|-------|---------|-----|
| `game_registry` | 100 training games | Public read |
| `god_mode_user_session` | Level/health tracking | User-owned |
| `god_mode_hand_history` | Hand logs + variant_hash | User-owned |
| `god_mode_leaderboard` | Competitive rankings | Public read |

---

## The 3-Engine Architecture

### ENGINE A: PIO (60 Games)
- **Source**: `solved_spots_gold` table
- **Feature**: Suit isomorphism (24x content)
- **Tracking**: `(file_id + variant_hash)` prevents duplicates

### ENGINE B: CHART (19 Games)
- **Source**: Static JSON charts
- **Use Cases**: Push/fold, bubble, ICM, preflop

### ENGINE C: SCENARIO (21 Games)
- **Source**: Hardcoded scripts
- **Feature**: Rigged RNG for psychology testing

---

## Gamification Rules

| Rule | Value |
|------|-------|
| Starting Health | 100 chips |
| Hands per Round | 20 |
| Level 1 Threshold | 85% |
| Level 10 Threshold | 100% |
| Max Damage/Hand | 25 chips |

---

## Deployment Checklist

- [x] Database schema created
- [x] Python seeder script
- [x] 100 games seeded (PIO=60, CHART=19, SCENARIO=21)
- [x] RLS policies enabled
- [x] **Engine core backend (engine_core.py)**
- [ ] Frontend component (GameSession.tsx)
- [ ] API routes (fetch-hand.js, submit-action.js)
- [ ] Production deployment
