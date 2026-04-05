# GTO Wizard 1:1 Clone — Master Build Plan

**Owner:** Dan / Antigravity Agents
**Created:** 2026-04-05
**Goal:** Match and exceed every GTO Wizard feature across 6 phases

---

## Architecture Decisions

- **All new engines go in:** `src/engines/` (new directory)
- **All new components go in:** `src/components/training/` (existing)
- **All new pages already exist as stubs in:** `pages/hub/training/`
- **Solver data source of truth:** `src/config/solverRanges.js`
- **Scenario pipeline:** solverRanges → SolverScenarioGenerator → ScenarioDatabase
- **State management:** React hooks + Supabase for persistence
- **Styling:** Inline styles (existing convention in UniversalTrainingTable)

---

## Phase 1: Postflop Engine (FOUNDATION)
*Without this, we're a preflop-only trainer. This unlocks everything.*

### Wave 1A — Core Engines (parallel)

- [ ] **`src/engines/DeckEngine.js`** — Deterministic card dealing
  - 52-card deck, shuffle, deal flop/turn/river
  - Dead card removal (hero + villain holdings)
  - Seed-based reproducible deals for replays
  - ~100 lines | Complexity: LOW

- [ ] **`src/engines/BoardTextureEngine.js`** — Board classification
  - Classify: monotone, two-tone, rainbow
  - Classify: paired, trips, quads
  - Classify: connected, gapped, disconnected
  - Classify: high (broadway), medium, low
  - Wetness score (0-10): flush draws, straight draws, combo draws
  - ~200 lines | Complexity: MEDIUM

- [ ] **`src/engines/HandStrengthEngine.js`** — Hand evaluation
  - 5-card hand ranking (high card → royal flush)
  - Made hand classification (pair, two pair, set, straight, flush, etc.)
  - Draw classification (flush draw, OESD, gutshot, combo draw)
  - Relative hand strength on board
  - ~300 lines | Complexity: MEDIUM

### Wave 1B — Postflop Strategy (depends on 1A)

- [ ] **`src/engines/PostflopStrategyEngine.js`** — GTO postflop decisions
  - C-bet frequencies by board texture (IP/OOP)
  - Check-raise frequencies by board texture
  - Bet sizing logic (25%/33%/50%/75%/100%/150% pot)
  - Turn barrel frequencies based on runout
  - River value/bluff ratios
  - ~400 lines | Complexity: HIGH

- [ ] **`src/engines/PostflopScenarioGenerator.js`** — Build L8-10 scenarios
  - L8: Flop decisions (c-bet, check-raise, float)
  - L9: Turn decisions (barrel, give up, raise)
  - L10: River decisions (value bet, bluff, check-call, hero call)
  - Integrates with existing SolverScenarioGenerator pipeline
  - Each scenario: board, positions, action tree, correct play + EV
  - ~350 lines | Complexity: HIGH

### Wave 1C — Wire Into Pipeline (depends on 1B)

- [ ] **Update `src/games/SolverScenarioGenerator.js`** — Add L8-L10 generators
- [ ] **Update `src/games/ScenarioDatabase.js`** — Route L8-10 through postflop engine
- [ ] **Update `src/config/GameScenarioMap.ts`** — Map games to postflop levels

---

## Phase 2: Full Hand Simulation
*Play complete hands preflop → river like GTO Wizard's trainer.*

### Wave 2A — Hand State Machine

- [ ] **`src/engines/HandStateMachine.js`** — Complete hand lifecycle
  - States: PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → COMPLETE
  - Pot tracking, stack tracking, position tracking
  - Action history (who did what at each street)
  - Supports heads-up and multiway (up to 6 players)
  - ~300 lines | Complexity: HIGH

- [ ] **`src/engines/ActionTreeEngine.js`** — Decision tree navigation
  - Build valid action set at any node (fold/check/call/bet/raise)
  - Bet sizing options (1/4, 1/3, 1/2, 2/3, 3/4, pot, 1.5x, all-in)
  - Map user action to closest solver node
  - Navigate the GTO strategy tree
  - ~250 lines | Complexity: HIGH

### Wave 2B — Difficulty Modes (depends on 2A)

- [ ] **`src/engines/DifficultyEngine.js`** — 3 difficulty levels
  - SIMPLE: bet/check/fold (3 options, like GTO Wizard)
  - GROUPED: action type only — bet/raise, check/call, fold
  - STANDARD: exact sizing — check, bet 33%, bet 67%, bet 150%, etc.
  - Hand filters: premium only, close decisions, remove trivial folds
  - ~150 lines | Complexity: MEDIUM

### Wave 2C — UI Integration (depends on 2A + 2B)

- [ ] **`src/components/training/FullHandTrainer.tsx`** — Main trainer component
  - Renders poker table with cards, pot, stacks
  - Action buttons based on difficulty mode
  - Street-by-street progression with dealing animations
  - Integrates with existing scene/ components (PokerTableScene, SceneCards)
  - ~600 lines | Complexity: HIGH

- [ ] **Update `pages/hub/training/play/[gameId].js`** — Wire full hand trainer
- [ ] **Update `pages/hub/training/spot-trainer.js`** — Add postflop spots

---

## Phase 3: EV Tracking & GTO Scoring
*Real-time feedback that makes training addictive.*

### Wave 3A — Scoring Engines (parallel)

- [ ] **`src/engines/EVCalculator.js`** — Per-move EV calculation
  - Calculate EV of each action in BB
  - EV loss = GTO EV - Player EV
  - Support preflop and postflop decisions
  - Mixed strategy EV (weighted by frequencies)
  - ~200 lines | Complexity: HIGH

- [ ] **`src/engines/GTOScoreEngine.js`** — Session scoring
  - GTO Score (0-100%) = weighted accuracy across moves
  - Color coding: green (>90%), yellow (70-90%), red (<70%)
  - Per-move classification: correct, inaccuracy, mistake, blunder
  - Thresholds: <0.5BB loss = correct, <2BB = inaccuracy, <5BB = mistake, >5BB = blunder
  - Streak tracking within session
  - ~200 lines | Complexity: MEDIUM

### Wave 3B — Persistence (depends on 3A)

- [ ] **`src/engines/SessionTracker.js`** — Session persistence
  - Save session to Supabase: hands played, score, EV loss, time
  - Session history with filtering
  - Performance trends over time (daily/weekly/monthly)
  - ~200 lines | Complexity: MEDIUM

- [ ] **Supabase schema: `training_sessions` table**
  - id, user_id, game_id, level, hands_played, gto_score, ev_loss_total, ev_loss_avg, duration_seconds, completed_at

- [ ] **Supabase schema: `training_moves` table**
  - id, session_id, hand_number, street, hero_cards, board, action_taken, gto_action, ev_loss_bb, classification

### Wave 3C — UI Components (depends on 3A)

- [ ] **`src/components/training/GTOScoreHUD.tsx`** — Live score display
  - Floating score panel during training
  - GTO Score %, EV loss in BB, hands played, streak
  - Per-move feedback popup (green/yellow/red flash)
  - ~200 lines | Complexity: MEDIUM

- [ ] **`src/components/training/SessionStatsCard.tsx`** — Post-session summary
  - Score breakdown, biggest mistakes, best plays
  - Comparison to previous sessions
  - Diamond rewards earned
  - ~250 lines | Complexity: MEDIUM

- [ ] **`src/components/training/PerformanceDashboard.tsx`** — Lifetime stats
  - Charts: GTO score over time, EV loss trend, hands played
  - Breakdown by format, position, street
  - Leak identification (worst positions, worst board textures)
  - ~400 lines | Complexity: HIGH

---

## Phase 4: Range Builder Grading
*Make the existing RangeGrid competitive with GTO Wizard's Range Builder.*

### Wave 4A — Grading Engine

- [ ] **`src/engines/RangeGradingEngine.js`** — Compare strategy to GTO
  - Input: user's 13x13 grid with action assignments
  - Compare to solver solution for the spot
  - Output: 0-100% accuracy score
  - Per-hand deviation report (which hands are most wrong)
  - Category breakdown (pairs, suited connectors, broadways, etc.)
  - ~250 lines | Complexity: HIGH

### Wave 4B — UI Enhancement (depends on 4A)

- [ ] **Update `src/components/training/RangeGrid.jsx`** — Add grading mode
  - Paintbrush tool for assigning actions (raise/call/fold)
  - "Verify" button → grade against solver
  - Deviation heatmap overlay (green=correct, red=wrong)
  - Show GTO solution side-by-side after grading
  - ~200 lines added | Complexity: MEDIUM

- [ ] **`src/components/training/RangeBuilderPage.tsx`** — Full Range Builder
  - Spot selector: position, villain position, stack depth
  - Preflop AND postflop range building
  - Board texture filter (monotone, paired, etc.)
  - Difficulty: Easy (2 actions), Medium (4), Hard (all sizings)
  - History of attempts with scores
  - ~500 lines | Complexity: HIGH

---

## Phase 5: Hand History & Reports
*Upload, analyze, identify leaks, auto-recommend drills.*

### Wave 5A — Parsers

- [ ] **`src/engines/HandHistoryParser.js`** — Multi-site parser
  - PokerStars format (.txt)
  - GGPoker format (.txt)
  - 888poker format
  - Generic converter to internal format
  - ~400 lines | Complexity: MEDIUM

### Wave 5B — Analysis Engine (depends on 5A)

- [ ] **`src/engines/HandAnalyzer.js`** — Map hands to GTO solutions
  - Parse each decision point
  - Map to closest solver solution
  - Calculate EV loss per decision
  - Classify mistakes (blunder/inaccuracy/correct)
  - Generate overall GTO Report
  - ~350 lines | Complexity: HIGH

- [ ] **`src/engines/LeakDetector.js`** — Auto-identify leaks
  - Aggregate stats by position, street, action type
  - Compare to GTO benchmarks
  - Identify top 5 leak areas
  - Auto-generate recommended drill configurations
  - ~250 lines | Complexity: HIGH

### Wave 5C — Reports UI (depends on 5B)

- [ ] **`src/components/training/HandHistoryUploader.tsx`** — Upload interface
  - Drag-and-drop file upload
  - Progress bar, file validation
  - Session list with quick stats
  - ~250 lines | Complexity: MEDIUM

- [ ] **`src/components/training/AnalysisReplay.tsx`** — Hand replay with GTO overlay
  - Replay uploaded hands on poker table
  - Show GTO action at each node
  - Color-coded decisions (green/yellow/red)
  - ~400 lines | Complexity: HIGH

- [ ] **`src/components/training/GTOReport.tsx`** — Aggregated report
  - Preflop frequency comparison (your stats vs GTO)
  - Flop c-bet frequency by board texture
  - Position-by-position breakdown
  - Auto-recommended spots to practice
  - ~500 lines | Complexity: HIGH

---

## Phase 6: Competitive Play (BETTER THAN GTO WIZARD)
*This is where smarter.poker EXCEEDS GTO Wizard.*

### Wave 6A — PvP Arena

- [ ] **`src/engines/PvPMatchEngine.js`** — Competitive match logic
  - Heads-up hyper-turbo format (like PokerArena)
  - Realtime via Supabase subscriptions
  - GTO precision scoring per hand
  - TrueSkill-style rating system
  - Diamond entry fees + prize pools (unique to us)
  - ~400 lines | Complexity: HIGH

- [ ] **Supabase schema: `pvp_matches`, `pvp_ratings`, `pvp_seasons`**

### Wave 6B — AI Coaching (our secret weapon)

- [ ] **`src/engines/AICoachEngine.js`** — Geeves/Jarvis coaching integration
  - Post-hand analysis with natural language explanation
  - "Why was this wrong?" interactive explanations
  - Personalized study plans based on leak detection
  - Live coaching during training sessions
  - ~300 lines | Complexity: HIGH

### Wave 6C — Social & Leaderboards

- [ ] **`src/components/training/SeasonalLeaderboard.tsx`** — Diamond-staked ranks
  - Iron/Bronze/Silver/Gold/Diamond ranks (like PokerArena)
  - Seasonal resets with diamond prizes
  - Daily/weekly challenges
  - ~400 lines | Complexity: MEDIUM

- [ ] **`src/components/training/CommunityChallenge.tsx`** — Social challenges
  - Weekly community challenges (e.g., "BB Defense Week")
  - Shared leaderboards, chat, replays
  - Diamond pool rewards
  - ~300 lines | Complexity: MEDIUM

---

## Execution Summary

| Phase | Files | Est. Lines | Complexity | Dependencies |
|-------|-------|-----------|------------|--------------|
| 1: Postflop Engine | 7 new + 3 updates | ~1,750 | HIGH | None |
| 2: Full Hand Sim | 4 new + 2 updates | ~1,300 | HIGH | Phase 1 |
| 3: EV & Scoring | 6 new + 2 schemas | ~1,450 | HIGH | Phase 1+2 |
| 4: Range Builder | 2 new + 1 update | ~950 | MEDIUM | Phase 1 |
| 5: Hand History | 6 new | ~2,150 | HIGH | Phase 1+3 |
| 6: Competitive | 4 new + 3 schemas | ~1,400 | HIGH | Phase 1-5 |
| **TOTAL** | **29 new files** | **~9,000** | — | — |

## What Makes Us BETTER Than GTO Wizard

1. **Diamond economy** — real stakes, earn while you train
2. **AI coaching** — Geeves/Jarvis explain mistakes in plain English
3. **Social integration** — friends, clubs, shared replays
4. **100-game catalog** — they have formats, we have individual focused games
5. **Mobile-first PWA** — already deployed, already installable
6. **Free competitive play with diamond prizes** — they charge $39-129/mo
