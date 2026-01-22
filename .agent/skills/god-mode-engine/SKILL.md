---
name: God Mode Engine
description: Build and manage the 100-game poker training RPG with 3-engine architecture (PIO, CHART, SCENARIO)
---

# God Mode Engine Skill

The complete implementation guide for the Smarter.Poker "God Mode" training system - a poker RPG with 100 Game Titles, suit isomorphism, active villain AI, and gamified progression.

## Quick Reference

| Component | Location | Lines |
|-----------|----------|-------|
| Database Schema | `/database/migrations/god_mode_engine.sql` | 322 |
| **Python Seeder** | `/scripts/seed_games.py` | 350 |
| Seed Data SQL | `/database/migrations/seed_game_registry_v2.sql` | 117 |
| **Engine Core** | `/src/engine/engine_core.py` | 733 |
| **Game Session UI** | `/src/components/training/GameSession.tsx` | 900+ |
| Fetch Hand API | `/pages/api/god-mode/fetch-hand.js` | — |
| Submit Action API | `/pages/api/god-mode/submit-action.js` | — |

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    GameSession.tsx                          │
│         (Director Mode, Health Bar, Bet Slider)             │
└─────────────────────┬───────────────────────────────────────┘
                      │ API Calls
           ┌──────────▼──────────┐
           │    API Routes       │
           │ fetch-hand.js       │
           │ submit-action.js    │
           └──────────┬──────────┘
                      │
           ┌──────────▼──────────┐
           │  engine_core.py     │
           │  (GameEngine)       │
           └──────────┬──────────┘
                      │ Routes by engine_type
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
┌─────────┐     ┌─────────┐     ┌─────────┐
│   PIO   │     │  CHART  │     │SCENARIO │
│  (60)   │     │  (19)   │     │  (21)   │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     ▼               ▼               ▼
solved_spots    static JSON    hardcoded
   _gold          charts        scripts
```

---

## ENGINE CORE (engine_core.py)

### GameEngine Class
```python
engine = GameEngine(supabase_client)

# Fetch hand (routes to PIO/CHART/SCENARIO)
hand = await engine.fetch_next_hand(user_id, game_id, level)

# Resolve villain action
villain = engine.resolve_villain_action(solver_node)

# Calculate HP damage
result = engine.calculate_hp_loss("CALL", solver_node)
```

### Suit Isomorphism (The Magic Trick)
```python
# 24x content from finite files
"AhKs" → "AdKh"  # rotation_key=1
"AhKs" → "AcKd"  # rotation_key=2
```

### Indifference Rule
≥40% solver frequency OR EV within 0.05 = **CORRECT**

---

## FRONTEND (GameSession.tsx)

### Game Phases
1. `LOADING` — Fetching hand
2. `DIRECTOR_INTRO` — Typewriter animation
3. `USER_TURN` — Controls unlocked
4. `VILLAIN_THINKING` — 1.5s delay
5. `SHOWING_RESULT` — Correct/incorrect
6. `SESSION_COMPLETE` — All 20 hands done

### Key Components
- **Director Mode**: Typewriter text with chip sounds
- **Health Bar**: Screen shake on damage (framer-motion)
- **Bet Slider**: Snaps to solver nodes [0,25,33,50,66,75,100,150,200]
- **Action Buttons**: FOLD / CHECK/CALL / BET

---

## GAME SEEDER (seed_games.py)

```bash
python3 scripts/seed_games.py --stats      # Preview
python3 scripts/seed_games.py --dry-run    # Test
python3 scripts/seed_games.py              # Execute
```

### Engine Distribution
| Engine | Count | Keywords |
|--------|-------|----------|
| PIO | 60 | Default (postflop) |
| CHART | 19 | push/fold, icm, bubble |
| SCENARIO | 21 | mental, tilt, zen |

---

## DATABASE

| Table | Purpose |
|-------|---------|
| `game_registry` | 100 games with engine routing |
| `god_mode_user_session` | Level/health per user |
| `god_mode_hand_history` | Tracks seen hands (file_id + variant_hash) |
| `god_mode_leaderboard` | Rankings |

---

## GAMIFICATION RULES

| Rule | Value |
|------|-------|
| Starting HP | 100 |
| Hands/Round | 20 |
| Level 1 Pass | 85% |
| Level 10 Pass | 100% |
| Max Damage | 25 |

---

## DEPLOYMENT CHECKLIST

- [x] Database schema
- [x] Game seeder (100 games)
- [x] Engine core backend
- [x] Frontend component
- [ ] API routes
- [ ] FastAPI server
- [ ] Production deploy
