# HorsePokerBrain Modularization Plan

## Status: APPROVED FOR EXECUTION
## Created: 2026-04-08
## Scope: Split 20,200-line monolith into variant-specific + game-type modules

---

## 1. CURRENT STATE

### File: `src/lib/poker-engine/HorsePokerBrain.js` (20,200 lines)
- **~120 functions** in a single file
- CommonJS (`module.exports` / `require`)
- 4 consumers: GameController, TableManager, LobbyManager, HealthWatchdog
- All consumers call `require('./HorsePokerBrain')` and access the exported object
- 1,734 tests in `test-brain-audit.js`

### Current Architecture (Monolith)
```
getDecision(profileId, engineState, legalActions, tableConfig)
  ├── [lines 15320-15502] Common routing: extract state, anti-exploit modules
  ├── [line 15502] if (isPLO) → makePLOFallbackDecision()  [lines 5278-6550]
  │     ├── Uses ~80 PLO-specific functions (lines 411-5154)
  │     ├── PLO8 Hi-Lo: evaluatePLO8Low() + 15 override points
  │     └── PLO5/6: getBestPLO5or6PreflopStrength/MadeHand wrappers
  └── [line 15538+] Holdem pipeline
        ├── makeFallbackDecision()    [lines 6596-7645]
        ├── makeFlopHeuristicDecision()   [lines 12018-13428]
        ├── makeTurnRiverHeuristicDecision() [lines 8390-12017]
        └── ~20 Holdem-specific utility functions [lines 13429-15185]
```

### Shared Infrastructure (lines 1-410, 15186-20261)
- Card parsing, position mapping, hash, delay
- Supabase client, horse ID loading
- Anti-exploit modules (Modules 1-32)
- Session management, analytics, opponent reads
- Threat intelligence, journal system

---

## 2. TARGET ARCHITECTURE

```
src/lib/poker-engine/brain/
├── index.js                    # Barrel — re-exports everything (backward compatible)
├── core.js                     # Shared utilities (cards, position, hash, delay, Supabase)
├── anti-exploit.js             # Modules 1-32 (anti-exploit, threat intel, tells)
├── holdem-brain.js             # Holdem decision engine (fallback + heuristics)
├── plo-core.js                 # Shared PLO logic (hand eval, outs, blockers, SPR, etc.)
├── plo4-brain.js               # PLO4 decision engine (thin wrapper over plo-core)
├── plo5-brain.js               # PLO5 decision engine (5-card combo selection + plo-core)
├── plo6-brain.js               # PLO6 decision engine (6-card combo selection + plo-core)
├── plo8-brain.js               # PLO8 Hi-Lo decision engine (lo8 eval + overrides + plo-core)
├── tournament.js               # Tournament-specific logic (ICM, bubble, blind levels, etc.)
├── cash.js                     # Cash game logic (session mgmt, rebuy, stake selection)
├── router.js                   # getDecision() — the master router
└── session-analytics.js        # Performance tracking, opponent reads, journals
```

### Key Design Decisions

1. **Backward Compatible Barrel**: `brain/index.js` exports EVERYTHING the old file exported.
   `require('./HorsePokerBrain')` still works — we add a 1-line redirect in the old file.

2. **Game Type Awareness**: Every brain module receives `gameType: 'cash' | 'tournament'`.
   Tournament module provides ICM pressure, bubble adjustments, blind defense mods.
   Cash module provides session management, rebuy strategy, stake selection.
   These are MIXINS applied to the variant-specific decision, not separate decision trees.

3. **PLO8 is its own module**: Not a flag on PLO4. It has its own `makePLO8Decision()` that
   imports plo-core for shared hand eval but adds all Hi-Lo specific logic.

4. **PLO5/PLO6 are thin wrappers**: They call plo-core with `getBestPLO5or6PreflopStrength()`
   and `getBestPLO5or6MadeHand()` combo selectors, then delegate to the PLO4 decision pipeline.

---

## 3. FUNCTION-TO-MODULE MAPPING

### core.js (~400 lines)
```
Lines 29-110:   cardIntToString, cardsToStrings, mapPosition, formatHandString
Lines 121-132:  getPreflopStrength
Lines 134-242:  getSupabase, loadHorseIds, isHorse, isHorseSync, getHorseIdsAtTable
Lines 243-314:  getHash, getActionDelay
Lines 315-377:  resolveESM, getGTOModule, getPersonalityModule, getAdvancedModule
Lines 379-409:  parseCard, parseCards
```

### anti-exploit.js (~2,600 lines)
```
Lines 18114-18259: Module 25-31 (min-raise, squeeze, RIO, cold-call, bomb-pot, angle, RIT)
Lines 18258-18290: Module 32 (chip leak)
Lines 18290-18400: Modules 17-24 (runout equity, SPR trap, probe, image, limp-trap, iso, OOP, donk)
Lines 18506-18629: Module 9/14/16 (threat intel, blacklist, threat score)
Lines 18645-18727: Module 11/13 (range rotation, nut-bias exploit)
Lines 18728-18767: Module 8 (counter-exploit profiler)
Lines 3833-3979:  Modules 1/3/4/6/7 (frequency obfuscation, showdown exposure, pattern exploit, chaos, bot detect)
Lines 4022-4192:  Module 6 enhanced chaos, counter-exploit profile, cold-call decision
```

### holdem-brain.js (~7,500 lines)
```
Lines 6596-7645:   makeFallbackDecision (Holdem preflop/postflop heuristic)
Lines 7645-8389:   evaluatePostflopHand
Lines 8390-12017:  makeTurnRiverHeuristicDecision
Lines 12018-13428: makeFlopHeuristicDecision
Lines 13429-13578: evaluateBoardWetness, getSPRStrategy, getMultiwayAdjustment
Lines 13579-14003: getCheckRaiseStrategy, getOOPDecisionMatrix
Lines 14004-15185: getCBetStrategy, get3BetStrategy, getDrawEquity, getRiverStrategy,
                   getDeepStackAdjustment, getOptimalBetSize, getGeometricSizing,
                   handleDonkBet, applyTiltDegradation, analyzeBoardEvolution, shouldAutoSeat
```

### plo-core.js (~4,800 lines)
```
Lines 411-552:    classifyPLOPreflop
Lines 553-862:    countStraightOuts, countFlushOuts, countBackdoorOuts
Lines 863-1336:   evaluatePLOMadeHand
Lines 1560-2377:  All getPLO* utility functions (SPR, boardTexture, scareCard, ERC, blockers,
                  gameType, potRaise, betSize, limpedPot, multiway, 3bet, limperIso, sidePot,
                  lateSession, multiStreetPlan, cBet, turnBarrel, showdownValue, rangeBalance,
                  impliedOdds, opponentAdj, allInEquity, nutAdvantage, riverOverbet)
Lines 2399-2593:  handlePLODonkBet, getPLO4BetPotDecision, getPLOGifTrigger
Lines 2594-2647:  updatePLOOpponentRead
Lines 2648-3832:  All remaining PLO utility functions (variance protection, blind defense,
                  card removal, runout, exploitation profile, pot manipulation, ICM,
                  river float, deep stack, squeeze, combo dedup, HvR, RIO, table image,
                  flop continuance, check-behind, river optimizer, GIF state machine,
                  bet sizing tell, stack preservation, probe bet, position ranges,
                  chat response, timing tell, chip accumulation, per-street bluff,
                  frequency obfuscation, bet size noise, showdown exposure, pattern exploit,
                  stack sandwich, GTO chaos, bot detect, counter-exploit, cold call,
                  blind battle, donk opportunity, river check-raise)
Lines 4356-5154:  Decision cache, wrap draw, dirty outs, adaptive bet size, Bayesian model,
                  board scenarios, hand history correction, preflop enhancement, equity confidence,
                  audit decision, preflop action
```

### plo8-brain.js (~250 lines, new module extracted from plo-core + PLO fallback)
```
Lines 1337-1530:  evaluatePLO8Low (full Hi-Lo evaluator with counterfeit, quartering, etc.)
                  + New: makePLO8Decision() wrapper that:
                    1. Calls evaluatePLO8Low
                    2. Applies multiway quartering amplification (Bug #210)
                    3. Delegates to plo-core for hand eval, outs, etc.
                    4. Applies all PLO8 overrides (freeroll, scoop, pot-control, bluff suppression,
                       split-pot odds, nut low fold overrides)
                    5. Returns final decision
```

### plo5-brain.js (~50 lines)
```
Lines 1643-1667:  getBestPLO5or6PreflopStrength, getBestPLO5or6MadeHand
                  + makePLO5Decision() that selects best 4-card combo, delegates to plo-core
```

### plo6-brain.js (~50 lines)
```
Same as PLO5 but with 6-card combos (C(6,4) = 15 combos)
```

### tournament.js (~300 lines)
```
Lines 2900-2940:  getPLOICMBubblePressure
Lines 3754-3783:  getPLOChipAccumulationMode
Lines 2648-2683:  getPLOVarianceProtection
                  + New: getTournamentAdjustments(stackBB, blindLevel, playersLeft, payouts)
                    - ICM equity calculation
                    - Bubble factor (tighten near money)
                    - Short stack push/fold ranges
                    - Pay jump awareness
                    - Blind defense adjustments per blind level
```

### cash.js (~400 lines)
```
Lines 19135-19185:  canRebuy
Lines 19186-19315:  evaluateSessions
Lines 19425-19462:  getRecommendedStake
Lines 19546-19579:  getDynamicRebuyStrategy
Lines 19663-19752:  evolveHorseSkill, getSkillDrift, getSessionReview
                    + New: getCashGameAdjustments(stackBB, sessionMinutes, tableImage)
                      - Session length awareness (fatigue factor)
                      - Table selection recommendations
                      - Stack-to-blind ratio strategy shifts
```

### session-analytics.js (~600 lines)
```
Lines 19316-19424:  recordPerformanceAction, getPerformanceStats, recordPerformanceResult, getAdaptiveStrategy
Lines 19463-19511:  saveSessionAnalytics
Lines 19512-19545:  isSoftPlayAllowed, recordSoftPlay
Lines 19580-19662:  saveOpponentRead, saveKeyHand
Lines 19753-20261:  canSitAtTable, getChatMessages, cleanupMultiTable, warmGTOCache,
                    persistOpponentJournal, loadOpponentJournal, persistTableJournals,
                    loadTableJournals, _applyJournalToProfile
```

### router.js (~500 lines)
```
Lines 15270-15536:  getDecision() — extract state, run anti-exploit modules, route to variant
                    + Enhanced routing:
                      if (isPLO8)  → plo8-brain.makePLO8Decision()
                      if (isPLO5)  → plo5-brain.makePLO5Decision()
                      if (isPLO6)  → plo6-brain.makePLO6Decision()
                      if (isPLO4)  → plo4-brain.makePLO4Decision()
                      else         → holdem-brain.makeHoldemDecision()
                    + Tournament/Cash mixin applied to every decision
```

---

## 4. EXECUTION WAVES (Parallel Task Breakdown)

### WAVE 0: Scaffold (must be first, 1 agent)
- [ ] **Task 0.1**: Create `src/lib/poker-engine/brain/` directory
- [ ] **Task 0.2**: Create `brain/index.js` barrel that re-exports from HorsePokerBrain.js (backward compat)
- [ ] **Task 0.3**: Verify all 4 consumers still work with the barrel import
- [ ] **Task 0.4**: Create `brain/test-framework.js` — extract test utilities (test/expect/asyncTest/makePLOCards)
- **Complexity**: Low | **Risk**: Low | **Time**: 15 min

### WAVE 1: Extract Pure Utilities (3 agents in parallel)
- [ ] **Task 1.1**: Extract `brain/core.js` — card parsing, position, hash, delay, Supabase, horse IDs
- [ ] **Task 1.2**: Extract `brain/session-analytics.js` — performance tracking, journals, opponent reads
- [ ] **Task 1.3**: Extract `brain/anti-exploit.js` — Modules 1-32, threat intel, tells
- Each task: move functions, update imports in HorsePokerBrain.js to require from new module
- **Complexity**: Medium | **Risk**: Medium (import wiring) | **Time**: 30 min each

### WAVE 2: Extract Game Type Modules (2 agents in parallel)
- [ ] **Task 2.1**: Extract `brain/tournament.js` — ICM, bubble, chip accumulation, variance protection
- [ ] **Task 2.2**: Extract `brain/cash.js` — session management, rebuy, stake selection, skill evolution
- **Complexity**: Medium | **Risk**: Low | **Time**: 20 min each

### WAVE 3: Extract PLO Core (1 agent, critical path)
- [ ] **Task 3.1**: Extract `brain/plo-core.js` — all shared PLO functions (~80 functions, ~4800 lines)
  - This is the biggest extraction. Every PLO function from classifyPLOPreflop through getPLOPreflopAction.
  - EXCLUDES evaluatePLO8Low (goes to plo8-brain) and PLO5/6 combo selectors (goes to plo5/6-brain).
  - INCLUDES makePLOFallbackDecision — renamed to makePLO4Decision.
- **Complexity**: High | **Risk**: High (many cross-references) | **Time**: 45 min

### WAVE 4: Extract Variant Brains (4 agents in parallel)
- [ ] **Task 4.1**: Extract `brain/plo8-brain.js` — evaluatePLO8Low + all PLO8 override logic
  - Extract the PLO8 code from inside makePLOFallbackDecision into its own makePLO8Decision
  - Import plo-core for shared functions
- [ ] **Task 4.2**: Extract `brain/plo5-brain.js` — PLO5 combo selector + delegate to plo-core
- [ ] **Task 4.3**: Extract `brain/plo6-brain.js` — PLO6 combo selector + delegate to plo-core
- [ ] **Task 4.4**: Extract `brain/holdem-brain.js` — all Holdem decision logic
  - makeFallbackDecision, evaluatePostflopHand, makeFlopHeuristicDecision,
    makeTurnRiverHeuristicDecision, and all Holdem utility functions
- **Complexity**: High | **Risk**: High | **Time**: 30-45 min each

### WAVE 5: Build Router + Wire Tournament/Cash (1 agent)
- [ ] **Task 5.1**: Extract `brain/router.js` — getDecision with enhanced variant routing
  - Add tournament/cash game type detection
  - Route to correct variant brain
  - Apply tournament.getTournamentAdjustments() or cash.getCashGameAdjustments()
- **Complexity**: High | **Risk**: High (integration point) | **Time**: 45 min

### WAVE 6: Update Barrel + Legacy Redirect (1 agent)
- [ ] **Task 6.1**: Update `brain/index.js` to import from all new modules
- [ ] **Task 6.2**: Replace HorsePokerBrain.js content with `module.exports = require('./brain')`
- [ ] **Task 6.3**: Update test-brain-audit.js to require from brain/ modules
- **Complexity**: Medium | **Risk**: High (breaking change gate) | **Time**: 30 min

### WAVE 7: Split Test File (3 agents in parallel)
- [ ] **Task 7.1**: Create `brain/tests/test-holdem.js` — Holdem-specific tests
- [ ] **Task 7.2**: Create `brain/tests/test-plo.js` — PLO4/5/6 tests
- [ ] **Task 7.3**: Create `brain/tests/test-plo8.js` — PLO8 Hi-Lo tests
- [ ] **Task 7.4**: Create `brain/tests/test-anti-exploit.js` — Module 1-32 tests
- **Complexity**: Medium | **Risk**: Low | **Time**: 20 min each

### WAVE 8: Verification (1 agent, critical)
- [ ] **Task 8.1**: Run full test suite — verify 1734+ tests pass with 0 failures
- [ ] **Task 8.2**: Run `npx tsc --noEmit` — verify TypeScript clean
- [ ] **Task 8.3**: Verify all 4 consumers still import correctly
- [ ] **Task 8.4**: Git commit + push
- **Complexity**: Low | **Risk**: Gate | **Time**: 15 min

---

## 5. CRITICAL INTERFACES (Cross-Module Dependencies)

```
router.js
  → core.js (cardsToStrings, mapPosition, formatHandString, getHash, getActionDelay)
  → anti-exploit.js (selectCounterStrategy, all Module functions)
  → holdem-brain.js (makeHoldemDecision)
  → plo4-brain.js (makePLO4Decision)
  → plo5-brain.js (makePLO5Decision)
  → plo6-brain.js (makePLO6Decision)
  → plo8-brain.js (makePLO8Decision)
  → tournament.js (getTournamentAdjustments)
  → cash.js (getCashGameAdjustments)
  → session-analytics.js (recordPerformanceAction)

plo4-brain.js → plo-core.js (ALL shared PLO functions)
plo5-brain.js → plo-core.js + plo5 combo selectors
plo6-brain.js → plo-core.js + plo6 combo selectors
plo8-brain.js → plo-core.js + plo8 evaluator

holdem-brain.js → core.js (getPreflopStrength, parseCard, parseCards)
```

---

## 6. RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular dependencies between modules | Build breaks | Strict dependency tree (core → no deps, brain modules → core + shared only) |
| Module-scope state (Maps, caches) shared across modules | Runtime bugs | Keep all Maps/state in anti-exploit.js and session-analytics.js, pass by reference |
| Test file too tightly coupled to monolith | Test failures | Wave 6 creates a barrel import; tests import from barrel initially |
| getDecision routing changes break GameController | Production down | Barrel re-exports getDecision identically; consumers don't change |
| PLO8 overrides scattered across makePLOFallbackDecision | Logic loss | Audit ALL lo8/isHiLo references before extraction; consolidate into plo8-brain |
| Other agents editing HorsePokerBrain.js during refactor | Merge conflicts | Coordinate: do this in a feature branch, merge when complete |

---

## 7. SUCCESS CRITERIA

1. All 1,734+ tests pass with 0 failures
2. TypeScript check passes (no new errors)
3. `require('./HorsePokerBrain')` returns identical exports
4. GameController, TableManager, LobbyManager, HealthWatchdog work unchanged
5. Each module file is < 5,000 lines (ideally < 3,000)
6. No circular dependencies
7. `node -e "require('./src/lib/poker-engine/brain')"` loads in < 5 seconds (vs current ~30s for monolith)
8. PLO8 tests can run independently: `node brain/tests/test-plo8.js` in < 10 seconds
