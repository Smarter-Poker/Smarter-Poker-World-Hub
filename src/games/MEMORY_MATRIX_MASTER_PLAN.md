# 🧠 MEMORY MATRIX MASTER BUILD PLAN
## Project Manager: Antigravity Engine
## Version: 2.0 — "GTO Wizard Killer"
## Last Updated: 2026-01-12

---

# 🎯 MISSION STATEMENT

Build the most addictive, gamified GTO training platform in poker. Beat GTO Wizard on features while offering FREE access with Diamond currency or $19.99/month VIP. Every interaction must feel like a video game, not a study session.

---

# 💰 BUSINESS MODEL

| Access Type | Cost | Features |
|-------------|------|----------|
| **Free Play** | 10 💎 per game | Limited access, earn diamonds through other orbs |
| **VIP Unlimited** | $19.99/month | All games, all levels, unlimited plays, exclusive modes |
| **Diamond Packs** | IAP | Buy diamonds for à la carte access |

---

# 🎮 GAME MODES (7 Core Games)

## 1. 🧠 RANGE MEMORY (Current Game — Enhanced)
**Theme**: Neural Network Visualization
- Paint the 13x13 grid with GTO ranges
- Pressure timer with visual countdown
- Screen shake on wrong answers
- Combo meter for streaks
- **10 Levels** (vs GTO Wizard's 5)

## 2. ⚡ SPEED DRILL
**Theme**: Arcade Lightning Round
- Flash a hand → pick the action in 3 seconds
- Escalating speed as streak builds
- Miss 3 = Game Over
- High score leaderboards
- **Perfect for mobile gaming feel**

## 3. 🎯 SPOT TRAINER
**Theme**: Sniper Mission
- Single spot focus (e.g., "CO opens, you're BB")
- Full hand trees: preflop → river
- Score based on cumulative EV
- "Strategy React" — see how ranges shift
- **GTO Wizard's core feature, done better**

## 4. 🔥 PRESSURE COOKER
**Theme**: Bomb Defusal
- Ticking clock with escalating tension
- Answer 10 spots before time runs out
- Each correct answer adds time
- Wrong answers accelerate clock
- **Heart-pounding intensity**

## 5. 🎲 MIXED STRATEGY TRAINER
**Theme**: Roulette Wheel
- Train GTO mixed frequencies
- RNG spinner for 70/30 or 50/50 spots
- Build "frequency intuition"
- Track deviation from optimal
- **Unique to Smarter.Poker**

## 6. 🧩 PATTERN RECOGNITION
**Theme**: Matrix Decode
- Show partial range, complete the pattern
- Identify "range shapes" across positions
- Visual geometric training
- Tests true understanding vs memorization
- **Smarter.Poker Exclusive**

## 7. 🏆 TOURNAMENT MODE
**Theme**: Battle Royale
- Bracketed competition (8/16/32 players)
- Diamond entry fees → prize pools
- Real-time head-to-head range painting
- Weekly championships
- **Social + Competitive + Economic**

---

# 📊 10-LEVEL PROGRESSION SYSTEM

| Level | Name | Focus | Required Score |
|-------|------|-------|----------------|
| 1 | **Neural Boot** | UTG/MP Opening Ranges | 85% |
| 2 | **Position Pulse** | CO/BTN/SB Opening | 85% |
| 3 | **Defense Matrix** | BB Defense vs All Positions | 85% |
| 4 | **3-Bet Ignition** | 3-Bet Ranges (IP & OOP) | 85% |
| 5 | **Call Protocol** | Flatting Ranges (Value + Traps) | 85% |
| 6 | **4-Bet Override** | 4-Bet/5-Bet Polarization | 85% |
| 7 | **Flop Architect** | C-Bet Frequencies by Texture | 85% |
| 8 | **Turn Calibration** | Turn Barrel/Check Decisions | 85% |
| 9 | **River Execute** | Value/Bluff River Ratios | 85% |
| 10 | **GTO MASTER** | All Spots, Mixed Strategies | 85% |

**Unlock Mechanism**: Must score 85%+ on 5 consecutive scenarios to advance.

---

# 🎨 VIDEO GAME UI/UX REQUIREMENTS

## Visual Effects
- [ ] **Screen shake** on wrong answers
- [ ] **Particle explosions** on correct answers
- [ ] **Combo fire effects** (3+ streak)
- [ ] **Pulse glow** on timer pressure
- [ ] **Glass shatter** on failure
- [ ] **Level-up cinematic** with XP rain
- [ ] **Diamond burst** animation on rewards

## Audio Requirements
- [ ] Tension music (escalates with timer)
- [ ] Correct answer "ding" with satisfaction
- [ ] Wrong answer "buzz" with screen flash
- [ ] Combo sounds (building)
- [ ] Level complete fanfare
- [ ] Leaderboard position announcement

## Pressure Mechanics
- [ ] **Countdown timer** with color changes (green → yellow → red)
- [ ] **Heartbeat sound** at <10 seconds
- [ ] **Screen vignette** darkening at edges under pressure
- [ ] **Character reactions** (avatar stress indicators)

## Gamification Loop
1. **Play** → Pressure creates excitement
2. **Score** → Immediate feedback (visual + audio)
3. **Reward** → Diamonds + XP + Streak bonuses
4. **Progress** → Level advancement + unlocks
5. **Compete** → Leaderboards + tournaments
6. **Return** → Daily challenges + streak maintenance

---

# 🏗️ TECHNICAL ARCHITECTURE

## Frontend Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + Framer Motion
- **State**: Zustand (global) + React State (local)
- **Audio**: Howler.js
- **Animations**: Framer Motion + CSS keyframes

## Backend Stack
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Real-time**: Supabase Channels (for tournaments)
- **Payments**: Stripe (VIP subscriptions)

## Data Architecture
```
Tables:
├── game_scenarios (PioSolver data)
├── user_progress (level, xp, streaks)
├── game_sessions (individual plays)
├── leaderboards (weekly/monthly)
├── vip_subscriptions (Stripe integration)
└── tournament_brackets (real-time)
```

---

# 📅 BUILD PHASES

## PHASE 1: Core Game Engine (Week 1)
**Goal**: All 7 game modes functional with placeholder data

### Tasks:
- [ ] 1.1 Refactor Range Memory with pressure timer
- [ ] 1.2 Add screen shake + particle effects
- [ ] 1.3 Implement combo/streak system
- [ ] 1.4 Build Speed Drill game mode
- [ ] 1.5 Build Pressure Cooker game mode
- [ ] 1.6 Build Pattern Recognition game mode
- [ ] 1.7 Build Mixed Strategy Trainer
- [ ] 1.8 Create 10-level progression UI
- [ ] 1.9 Implement 85% gate logic
- [ ] 1.10 Add audio engine (Howler.js)

## PHASE 2: Diamond Economy Integration (Week 2)
**Goal**: Full monetization flow

### Tasks:
- [ ] 2.1 Implement 10💎/game deduction
- [ ] 2.2 Create VIP subscription check
- [ ] 2.3 Build VIP purchase flow (Stripe)
- [ ] 2.4 Add "Out of Diamonds" modal with upsell
- [ ] 2.5 Implement streak multipliers for rewards
- [ ] 2.6 Create Diamond wallet UI in header

## PHASE 3: Spot Trainer + Full Hands (Week 3)
**Goal**: Complete hand scenarios (preflop → river)

### Tasks:
- [ ] 3.1 Build Spot Trainer game mode
- [ ] 3.2 Implement game tree navigation
- [ ] 3.3 Add Strategy React feature
- [ ] 3.4 Create EV comparison displays
- [ ] 3.5 Build range comparison overlays
- [ ] 3.6 Implement postflop texture filters

## PHASE 4: Tournament Mode (Week 4)
**Goal**: Real-time competitive play

### Tasks:
- [ ] 4.1 Design tournament bracket system
- [ ] 4.2 Implement Supabase real-time channels
- [ ] 4.3 Build matchmaking queue
- [ ] 4.4 Create head-to-head UI
- [ ] 4.5 Implement prize pool distribution
- [ ] 4.6 Add tournament leaderboards

## PHASE 5: PioSolver Integration (Week 5+)
**Goal**: Real GTO data

### Tasks:
- [ ] 5.1 Import PioSolver solutions
- [ ] 5.2 Parse solution files to JSON
- [ ] 5.3 Seed database with all scenarios
- [ ] 5.4 Implement dynamic scenario loading
- [ ] 5.5 Add ICM adjustments for MTT scenarios

## PHASE 6: Polish + Launch (Week 6)
**Goal**: Production-ready

### Tasks:
- [ ] 6.1 Performance optimization
- [ ] 6.2 Mobile responsiveness
- [ ] 6.3 SEO + meta tags
- [ ] 6.4 Analytics integration
- [ ] 6.5 Beta testing
- [ ] 6.6 Marketing launch

---

# 📊 SCENARIO DATABASE STRUCTURE

## Preflop (Levels 1-6): 200+ Scenarios
```
Positions: UTG, UTG+1, MP, MP+1, HJ, CO, BTN, SB, BB
Stack Depths: 20bb, 30bb, 50bb, 100bb, 200bb
Actions: Open, 3-bet, 4-bet, Flat, Defend
Total Combinations: 9 × 5 × 4 = 180 base scenarios
```

## Postflop (Levels 7-10): 500+ Scenarios
```
Flop Textures: Monotone, Two-tone, Rainbow, Paired, Connected
Board Types: Dry, Wet, Dynamic
Positions: IP vs OOP combinations
Actions: C-bet, Check, Raise, Call, Fold frequencies
Total: Exponential (will use PioSolver aggregation)
```

---

# 🏆 COMPETITIVE ADVANTAGES OVER GTO WIZARD

| Feature | GTO Wizard | Smarter.Poker |
|---------|------------|---------------|
| Levels | 5 | **10** |
| Game Modes | 1 (Trainer) | **7** |
| Feeling | Study tool | **Video Game** |
| Pressure Timer | Basic | **Bomb defusal intensity** |
| Economy | Subscription only | **Diamond à la carte + VIP** |
| Price | $26-$129/mo | **$19.99/mo or FREE with 💎** |
| Social | Forums | **Tournaments + Leaderboards** |
| Unique Games | None | **Pattern Recognition, Mixed Trainer** |
| Streaks | None | **Daily streaks with multipliers** |
| Sounds | None | **Full audio experience** |

---

# ✅ IMMEDIATE NEXT STEPS (Starting NOW)

1. **Create game engine core** with timer + effects
2. **Build Speed Drill** as second game mode
3. **Implement combo system** with visual feedback
4. **Add 10 more scenarios** to Range Memory
5. **Create level selection UI** with progression bars

---

# 📁 FILE STRUCTURE

```
/hub-vanguard/
├── pages/hub/
│   └── memory-games.js         # Main hub (enhanced)
├── src/
│   ├── games/
│   │   ├── RangeMemory/        # Current game (enhanced)
│   │   ├── SpeedDrill/         # Game #2
│   │   ├── SpotTrainer/        # Game #3
│   │   ├── PressureCooker/     # Game #4
│   │   ├── MixedStrategy/      # Game #5
│   │   ├── PatternRecognition/ # Game #6
│   │   └── Tournament/         # Game #7
│   ├── engine/
│   │   ├── GameEngine.js       # Core game logic
│   │   ├── SoundEngine.js      # Audio system
│   │   ├── EffectsEngine.js    # Visual effects
│   │   └── ProgressionEngine.js # Levels + XP
│   └── data/
│       └── scenarios/          # GTO solution database
```

---

**SEAL: ANTIGRAVITY_PROJECT_MANAGER**
**STATUS: BUILD_INITIATED**
**TIMESTAMP: 2026-01-12T16:09:08-06:00**
