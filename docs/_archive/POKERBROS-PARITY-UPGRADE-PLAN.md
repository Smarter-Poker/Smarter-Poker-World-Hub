# Club Arena — Comprehensive PokerBros Parity Upgrade Plan

**Date:** April 13, 2026
**Author:** Claude (Opus) for Dan / Smarter Poker
**Source Documents:** POKERBROS_SPEC.md, GAP-ANALYSIS-v8-REAL.md, full codebase audit
**Goal:** Achieve and exceed PokerBros feature parity while fixing all critical architecture issues

---

## Executive Summary

Club Arena has an impressive codebase with 74 pages, 120+ component directories, 80+ services, and 30+ engine files. However, the platform has a **fatal architectural flaw** (dual-engine architecture) and significant feature gaps vs PokerBros. This plan addresses everything — from the critical engine rewrite to UI polish — in a prioritized, phased approach.

**Current State:** ~45% PokerBros parity (UI/lobby/club management are strong; gameplay engine is fundamentally broken)
**Target State:** 100%+ parity (match PokerBros + surpass with training integration, web access, better stats)
**Estimated Timeline:** 12-16 weeks across 8 phases

---

## Phase 0: EMERGENCY FIXES (Week 1) — Ship-Blocking Bugs

These are bugs visible to users RIGHT NOW that must be fixed before any feature work.

### 0.1 Avatar Display Pipeline (FIXED TODAY)
- **Problem:** WebSocket presence doesn't include avatar field; presence merge overwrites DB avatars with empty strings; buy-in sets avatar to empty string
- **Root Cause:** Three code locations in TablePage.tsx wipe avatar data
- **Fix Applied:**
  - initUser() now fetches avatar_url from profiles (was missing from SELECT)
  - Presence merge preserves existing avatar instead of overwriting with empty
  - Buy-in local state uses heroAvatarUrl instead of empty string
- **Files:** src/pages/TablePage.tsx (lines 521, 537, 3756, 5757)
- **Status:** Code committed (b63ce556), pending deploy

### 0.2 Hamburger Menu Invisible (FIXED PREVIOUSLY)
- **Problem:** TableMenu.css was never imported in TableMenu.tsx — menu appeared as a 1px dot
- **Fix Applied:** Added `import './TableMenu.css'` to TableMenu.tsx
- **Files:** src/components/table/TableMenu.tsx (line 14)
- **Status:** Code committed (372942d3), pending deploy

### 0.3 Hero Seat Blocked by Action Panel (FIXED TODAY)
- **Problem:** Hero seat at y:100% sits directly under the fixed-position action panel; hole cards are obscured
- **Fix Applied:**
  - Increased table-container bottom padding from 50px to 100px
  - Increased max-height reserve from 180px to 220px
  - Moved hero seat from y:100 to y:97 for card clearance
- **Files:** src/pages/TablePage.css (line 348, 351), src/pages/TablePage.tsx (lines 346, 355)
- **Status:** Code committed, pending deploy

### 0.4 Seat Position Layout (FIXED PREVIOUSLY)
- **Problem:** Seat positions had values like x:-4, x:104, y:108, y:110 pushing seats off-screen
- **Fix Applied:** Constrained to proper oval: 2-98% horizontal, 0-97% vertical
- **Status:** Code committed (372942d3), pending deploy

### 0.5 TestAlias99 Join Issue
- **Problem:** User reported stuck on "Joining" — DB confirms user IS seated (seat 2, 195 chips, status active)
- **Root Cause:** Likely transient WebSocket presence sync delay; page refresh resolves it
- **Recommendation:** Add a 3-second fallback that re-queries table_seats if presence doesn't confirm seating after buy-in RPC succeeds
- **Priority:** Medium (workaround exists: refresh page)

---

## Phase 1: CRITICAL ENGINE REWRITE (Weeks 2-4) — The Foundation

This is the single most important phase. Nothing else matters until the dual-engine architecture is fixed. Every other feature built on the broken foundation will need to be redone.

### 1.1 Remove Client-Side HandController (BLOCKING)
**Gap Analysis Finding #1 and #7: Dual-engine architecture is catastrophically broken**

The client runs its own HandController that creates its own Deck, shuffles its own cards, deals its own hole cards — completely separate from the server. Two different game states exist simultaneously.

**What to remove from TablePage.tsx:**
- `handControllerRef` (useRef at ~line 2711)
- All local `performAction()` calls
- `broadcastLocalHandState()` function
- Local HandController creation logic (~lines 2727-2813)

**What to keep:**
- `subscribeToHandState()` listener — this becomes the ONLY source of game state
- `submitAction()` HTTP calls — this becomes the ONLY way to send actions
- All UI rendering logic

**Implementation:**
1. Create a new `useServerGameState` hook that ONLY listens to server broadcasts
2. All action buttons call `submitAction()` and show a "pending" spinner until server confirms
3. UI optimistically shows the action (fold animation, etc.) but rolls back if server rejects
4. Remove all imports of client-side HandController, HeadlessTableEngine, etc.

**Files to modify:**
- src/pages/TablePage.tsx (major refactor — remove ~500 lines of local engine code)
- src/services/GameServerAPI.ts (upgrade submitAction to return Promise with server response)

**Estimated effort:** 3-4 days

### 1.2 Fix Hole Card Security (BLOCKING)
**Gap Analysis Finding #3 and #10: All cards broadcast to all clients**

The server's `broadcastCurrentState()` sends every player's hole cards to every client. Anyone with browser DevTools can see opponents' cards.

**Current (broken):**
```
Server broadcasts: { players: [{ cards: ['Ah', 'Kd'] }, ...] }  // ALL cards visible
```

**Required (secure):**
```
Server broadcasts: { players: [{ cards: [] }, ...] }  // Cards scrubbed
Per-player channel: table_hole_cards INSERT → user gets only THEIR cards
```

**Implementation:**
1. Modify ServerTableEngine.ts `broadcastCurrentState()` to scrub `cards` from all players
2. At showdown, include revealed cards in the broadcast (only for players who must show)
3. Use the existing `table_hole_cards` Supabase table + RLS for secure per-player delivery
4. Client already has the `handleHoleCardPayload` subscription — just need server to INSERT into table_hole_cards instead of broadcasting

**Files to modify:**
- server/src/engine/ServerTableEngine.ts (broadcastCurrentState, ~line 769-797)
- server/src/engine/HandController.ts (add INSERT into table_hole_cards after dealing)

**Estimated effort:** 2 days

### 1.3 Make submitAction Await Server Response
**Gap Analysis Finding #1: Actions are fire-and-forget**

Currently `submitAction()` sends an HTTP POST and doesn't wait for a response. The client immediately updates local state via the local engine.

**Implementation:**
1. `submitAction()` returns `{ success, newState?, error? }`
2. Client shows action pending state (greyed button, spinner) until response
3. On success, server broadcast updates the state
4. On failure, show error toast and re-enable action buttons
5. Add 2-second timeout — if no response, show "Connection issue" and retry

**Files to modify:**
- src/services/GameServerAPI.ts
- src/pages/TablePage.tsx (handleActionPanelAction)
- src/components/table/ActionPanel.tsx (pending state UI)

**Estimated effort:** 1-2 days

### 1.4 Upgrade Server Action Validation
**Gap Analysis Finding #6: Server auto-folds on any validation error**

If a raise fails validation, the player gets force-folded. This is terrible UX and a fairness violation.

**Implementation:**
1. Port `ServerActionValidator.ts` logic to the actual server
2. Return proper error responses instead of auto-folding
3. Add duplicate action suppression (same action arriving twice via HTTP)
4. Add timing validation (2-second grace period)
5. Add action expiry check

**Files to modify:**
- server/src/engine/ServerTableEngine.ts (handlePlayerAction, ~line 288-358)
- server/src/engine/ServerActionValidator.ts (port to server-side)

**Estimated effort:** 2 days

---

## Phase 2: COMPLETE THE SERVER ENGINE (Weeks 4-6)

With the architecture fixed, the server engine needs all the features that currently only exist on the client.

### 2.1 Formal State Machines
**Gap Analysis Finding #8: No formal state machine exists**

**Implementation:**
- Table FSM: empty -> waiting -> seating -> running -> paused -> closing
- Hand FSM: idle -> posting_blinds -> dealing -> preflop -> flop -> turn -> river -> showdown -> settlement -> cleanup
- Turn FSM: waiting -> timer_running -> time_bank -> expired -> action_processed
- Use the existing `server/src/engine/StateMachine.ts` (it exists but isn't wired in)

**Files:** server/src/engine/StateMachine.ts, ServerTableEngine.ts, HandController.ts
**Estimated effort:** 3 days

### 2.2 Straddle Support
**PokerBros Feature: UTG straddle, Mississippi straddle, re-straddle**

Client has `StraddleEngine.ts` — port to server.

**Files:** server/src/engine/StraddleEngine.ts (exists but may be incomplete)
**Estimated effort:** 2 days

### 2.3 Run-It-Twice (RIT)
**PokerBros Feature: Deal remaining cards twice when all-in, split pot by outcome**

Client has `RunItTwiceEngine.ts` — port to server. Need to:
1. Detect all-in runout
2. Offer RIT to both players (popup with 5s timer)
3. Deal two boards
4. Calculate split pot

**Files:** server/src/engine/RunItTwiceEngine.ts (exists but may be incomplete)
**Estimated effort:** 3 days

### 2.4 Insurance
**PokerBros Feature: Buy insurance when all-in before runout**

Client has `InsuranceEngine.ts` — port to server. Need Monte Carlo equity calculations.

**Files:** server/src/engine/InsuranceEngine.ts, MonteCarloEquity.ts
**Estimated effort:** 2 days

### 2.5 Big Blind Ante (BBA)
**PokerBros Feature: BB posts ante for entire table**

Server currently only has traditional antes. Add BBA option.

**Files:** server/src/engine/HandController.ts (ante posting logic, ~line 135-142)
**Estimated effort:** 1 day

### 2.6 Pre-Action Engine
**PokerBros Feature: Auto-fold, auto-check/fold, auto-call buttons**

Client has `PreActionEngine.ts` — port to server. Pre-actions must be server-authoritative.

**Files:** server/src/engine/PreActionEngine.ts (exists)
**Estimated effort:** 2 days

### 2.7 Disconnect Engine
**PokerBros Feature: Heartbeat-based disconnect detection with grace period**

Client has `DisconnectEngine.ts` — port to server. Server needs:
1. WebSocket heartbeat monitoring (every 5s)
2. 15s grace period before marking player disconnected
3. Auto sit-out after 2 missed turns while disconnected
4. Reconnection restore within grace period

**Files:** server/src/engine/DisconnectEngine.ts (exists)
**Estimated effort:** 2 days

### 2.8 Timer System Overhaul
**Gap Analysis Finding #5: Server uses setTimeout, not deadline-based timers**

Replace server's simple `setTimeout` with `PreciseActionTimer` (deadline-based, 100ms polling). This prevents timer drift and ensures consistent behavior.

**Files:** server/src/engine/PreciseActionTimer.ts (exists), ServerTableEngine.ts
**Estimated effort:** 1 day

### 2.9 Showdown Logic
**PokerBros Feature: Muck/show decision, last-aggressor-shows-first, auto-muck preference**

Server currently shows all cards at showdown with no decision logic.

**Implementation:**
1. Last aggressor shows first
2. Other players get muck/show option (3s timer, default muck)
3. If hero has winning hand and auto-muck is off, show automatically
4. Player preference setting: auto-muck losing hands

**Files:** server/src/engine/HandController.ts (completeHand)
**Estimated effort:** 2 days

### 2.10 Settlement Order Fix
**Gap Analysis Finding #9: Settlement is fire-and-forget with no table lock**

Implement the strict 15-step settlement sequence with table locking and transactional DB updates.

**Files:** server/src/engine/ServerTableEngine.ts (postHandTasks)
**Estimated effort:** 2 days

---

## Phase 3: GAME VARIANTS (Weeks 6-8)

### 3.1 Omaha (PLO4, PLO5, PLO6)
**PokerBros Feature: Full Omaha support with pot-limit betting**

Engine already has `PokerEngine.ts` with Omaha evaluation. Need:
1. Server-side PLO dealing (4/5/6 cards)
2. Pot-limit betting enforcement
3. Best-2-of-N hand evaluation
4. UI for displaying 4-6 hole cards

**Estimated effort:** 5 days

### 3.2 Omaha Hi-Lo
**PokerBros Feature: Split pot between best high and best low hand**

PokerEngine already has Hi-Lo support. Need:
1. Low hand qualification (8-or-better)
2. Split pot calculation
3. UI for showing hi/lo winners

**Estimated effort:** 3 days

### 3.3 Short Deck (6+)
**PokerBros Feature: Cards 2-5 removed, modified hand rankings**

Need modified deck (36 cards), adjusted hand rankings (flush beats full house), and modified dealing.

**Estimated effort:** 3 days

### 3.4 Open Face Chinese (OFC)
**PokerBros Feature: OFC with Pineapple variant**

Engine has `OFCPineappleEngine.ts` and `OFCDealingOrchestrator.ts`. Need:
1. Server-side OFC game flow
2. Fantasy land detection
3. Scoring system (royalties)
4. UI for 3-row hand display

**Estimated effort:** 5 days

### 3.5 Bomb Pot
**PokerBros Feature: Everyone antes, skip preflop, deal flop directly**

Server already has basic bomb pot support. Need:
1. Configurable frequency (every X hands)
2. Configurable ante amount (1-5 BB or random)
3. UI announcement when bomb pot triggers
4. Double board bomb pot variant

**Estimated effort:** 2 days

### 3.6 Double Board
**PokerBros Feature: Two separate community boards dealt simultaneously**

Need:
1. Server deals two separate boards
2. Pot split by board winners
3. UI for displaying two board rows

**Estimated effort:** 3 days

### 3.7 Mixed Games
**PokerBros Feature: Rotate between game types every X hands**

Engine has `MixedGameEngine.ts`. Need:
1. HORSE rotation (Hold'em, Omaha H/L, Razz, Stud, Eight-or-better)
2. Configurable rotation frequency
3. Game type indicator in UI
4. Blind structure changes per game type

**Estimated effort:** 3 days

---

## Phase 4: TOURNAMENT SYSTEM (Weeks 8-10)

### 4.1 Multi-Table Tournament (MTT) Engine
**PokerBros Feature: Full MTT support with table balancing**

Engine has `TournamentEngine.ts`, `TournamentOrchestrator.ts`, `TableBalancer.ts`, `ChipRaceEngine.ts`.

Need to wire up:
1. Registration/late registration
2. Blind level progression
3. Auto table balancing (TableBalancer)
4. Final table formation
5. Prize distribution (PayoutEngine exists)
6. Hand-for-hand at bubble
7. Chip race for eliminated denominations

**Files:** Existing engine files + TournamentPage.tsx, XMTTPage.tsx
**Estimated effort:** 8 days

### 4.2 Sit & Go (SNG)
**PokerBros Feature: Starts when full, fast blind structure**

Simpler variant of MTT — single table, starts when N players register.

**Estimated effort:** 3 days

### 4.3 Spin-It (Jackpot SNG)
**PokerBros Feature: 3-player hyper-turbo with random prize multiplier (2x-100x)**

Engine has `SpinItEngine.ts`. Need:
1. Random multiplier selection with weighted distribution
2. Hyper-turbo blind structure
3. Prize pool display
4. Spin animation UI

**Estimated effort:** 3 days

### 4.4 Flash Pool
**PokerBros Feature: Quick-match queuing system**

Page exists (`FlashPoolPage.tsx`), engine exists (`FlashPoolEngine.ts`). Need:
1. Queue matching algorithm
2. Auto table creation when match found
3. Configurable stake levels

**Estimated effort:** 2 days

---

## Phase 5: SECURITY AND ANTI-CHEAT (Weeks 10-11)

### 5.1 GPS Restriction
**PokerBros Feature: Prevent players physically too close from same table**

Need:
1. Client-side geolocation API permission
2. Server-side distance calculation
3. Configurable minimum distance (per club setting)
4. Bypass for club owner if desired

**Estimated effort:** 2 days

### 5.2 IP Restriction
**PokerBros Feature: Prevent same IP address at same table**

Need:
1. Capture client IP on WebSocket connect and HTTP action
2. Server-side IP comparison per table
3. Club-configurable toggle

**Estimated effort:** 1 day

### 5.3 Device ID Tracking
**PokerBros Feature: Prevent multi-accounting via device fingerprinting**

Need:
1. Client-side device fingerprint generation (canvas, WebGL, audio context)
2. Server-side fingerprint storage and comparison
3. Multi-account detection alerts to club owner

**Estimated effort:** 3 days

### 5.4 In-Game CAPTCHA
**PokerBros Feature: Random verification prompts to detect bots**

Need:
1. Periodic image-based verification (every N hands, random)
2. Failure to complete = auto sit-out
3. Configurable frequency per club

**Estimated effort:** 2 days

### 5.5 Live Alert Engine
**PokerBros Feature: AI-powered suspicious activity detection**

Need:
1. Pattern detection for collusion (coordinated fold/raise patterns)
2. Chip dumping detection (repeated large losses to same player)
3. Bot detection (consistent timing, perfect GTO play)
4. Alert dashboard for club owners

**Estimated effort:** 5 days (MVP), ongoing improvement

---

## Phase 6: ECONOMY AND CLUB MANAGEMENT (Weeks 11-12)

### 6.1 Rake System Completion
**PokerBros Feature: Configurable rake %, caps, no-flop-no-drop, reduced short-handed**

Rake system exists (`RakeService.ts`, `RakebackEngine.ts`). Need:
1. Per-stake rake caps (1.5BB - 6BB)
2. No-flop-no-drop toggle
3. Short-handed reduction (e.g., 2.5% at 3 or fewer players)
4. Rake reporting dashboard for owners

**Estimated effort:** 2 days

### 6.2 Rakeback System
**PokerBros Feature: Configurable rakeback % (up to 70%)**

RakebackEngine exists. Need:
1. Per-club configurable rakeback percentage
2. Automatic rakeback credit to player wallets
3. Rakeback history/dashboard for players

**Estimated effort:** 2 days

### 6.3 Bad Beat Jackpot Completion
**PokerBros Feature: Progressive jackpot for qualifying bad beats**

BBJ system exists (`BBJService.ts`, `BadBeatJackpotPage.tsx`). Verify:
1. Configurable qualifying hand (e.g., aces full beaten)
2. Progressive jackpot accumulation from rake
3. Distribution (loser %, winner %, table share %, next seed %)
4. BBJ display at table (visible in screenshot)

**Estimated effort:** 2 days (audit + fix gaps)

### 6.4 Agent System Completion
**PokerBros Feature: Full agent hierarchy with chip distribution and tracking**

Agent pages exist (`AgentPage.tsx`, `AgentDashboardPage.tsx`, `AgentManagementPage.tsx`, `SuperAgentDashboard.tsx`). Verify:
1. Agent -> player chip flow
2. Agent commission tracking
3. Agent recruitment tools
4. Agent performance dashboard

**Estimated effort:** 3 days (audit + fix gaps)

### 6.5 Union System Completion
**PokerBros Feature: Club networks that combine player pools**

Union pages exist (`UnionsPage.tsx`, `UnionDashboardPage.tsx`, `UnionDetailPage.tsx`, `UnionGamesPage.tsx`). Verify:
1. Cross-club table visibility
2. Combined player pool for tables
3. Union-level rake sharing
4. Union admin dashboard

**Estimated effort:** 3 days (audit + fix gaps)

---

## Phase 7: UI/UX POLISH (Weeks 12-14)

### 7.1 Table UI — PokerBros Visual Parity
**Current state:** Functional but rough. Missing premium animations and polish.

**Needed:**
1. Animated card dealing (cards slide from dealer position to each player)
2. Chip stack visualization (actual chip images, not just numbers)
3. Pot animation (chips slide from players to center pot)
4. Winner celebration animation (chips slide from pot to winner)
5. Smooth player action animations (fold cards fly to muck, raise chips move to center)
6. Timer ring visualization (circular progress around avatar)
7. All-in dramatic mode (darken background, spotlight on remaining players)
8. Card reveal animation at showdown (flip cards one at a time)

**Estimated effort:** 5 days

### 7.2 Multi-Tabling
**PokerBros Feature: Up to 4 tables simultaneously**

`MultiTablePage.tsx` exists. Need:
1. Tile layout (2x2 grid)
2. Cascade layout option
3. Quick table switching with action priority alerts
4. Minimize/maximize individual tables
5. Action-needed badge on inactive tables

**Estimated effort:** 3 days

### 7.3 Lobby UI Polish
**PokerBros Feature: Clean lobby with traffic indicators, filters, game type tabs**

Lobby exists. Need:
1. Real-time player count per table
2. Traffic light indicators (green = active, yellow = starting, red = full)
3. Game type tabs (Hold'em, Omaha, OFC, Tournaments)
4. Filter by stakes, player count, features
5. Table preview on hover/tap

**Estimated effort:** 3 days

### 7.4 Hand History Viewer
**PokerBros Feature: Last 6 days of hand history with replay**

`HandHistoryPage.tsx` and `HandReplayEngine.ts` exist. Need:
1. Searchable/filterable hand list
2. Visual hand replayer (step through actions)
3. Export to text format
4. Share hand via link

**Estimated effort:** 3 days

### 7.5 Player Stats Enhancement
**PokerBros Feature: VPIP, PFR, ROI, player style classification**

`PlayerStatsPage.tsx`, `PlayerStyleClassifier.ts` exist. Need:
1. Real-time VPIP/PFR/AF calculation per session
2. Player style icons (Rock, Maniac, Calling Station, etc.)
3. Stat popup when clicking player avatar at table
4. Leak analysis (VPIP/PFR by position)

**Estimated effort:** 2 days

### 7.6 Throwable Items and Emojis
**PokerBros Feature: Throwable reactions at table**

`ThrowableService.ts` exists. Need:
1. Emoji picker at table
2. Throw animation (item flies from sender to target)
3. Purchasable premium items
4. Diamond economy integration

**Estimated effort:** 2 days

### 7.7 Rabbit Cam
**PokerBros Feature: See undealt community cards after hand ends**

Already appears in UI ("Rabbit Hunt FREE" button visible in screenshot). Verify:
1. Only available after hand ends (not during)
2. Shows remaining community cards
3. Free or purchasable with diamonds
4. Animation for card reveal

**Estimated effort:** 1 day (audit + fix gaps)

### 7.8 Sound and Haptic System
**PokerBros Feature: Full sound effects for all actions**

`SoundService.ts`, `PremiumSFX.ts`, `HapticService.ts` exist. Need:
1. Sound for: deal, check, call, raise, fold, all-in, win, timer warning
2. Haptic feedback for: action buttons, timer warning, win
3. Volume control per category
4. Mute toggle per table

**Estimated effort:** 2 days (audit + fill gaps)

---

## Phase 8: "BETTER THAN POKERBROS" FEATURES (Weeks 14-16)

These are features that PokerBros doesn't have — our competitive differentiators.

### 8.1 GTO Training Integration (Orb #4)
**Our Advantage: Built-in poker training tools**

Training pages exist in `pages/hub/training/`. Need:
1. Post-hand GTO analysis ("optimal play" feedback)
2. Training mode tables (play vs AI with GTO coaching)
3. Spot quiz integration (test decision-making)
4. Training stats dashboard

**Estimated effort:** 5 days

### 8.2 Web Access
**Our Advantage: Play from any browser, not just mobile apps**

Already implemented — Club Arena IS a web app. But need:
1. Responsive design audit (mobile, tablet, desktop)
2. PWA support (install to home screen)
3. Desktop keyboard shortcuts (F = fold, C = call, R = raise)
4. Touch optimization for mobile

**Estimated effort:** 3 days

### 8.3 Advanced Analytics
**Our Advantage: More detailed analytics than PokerBros**

Analytics pages exist. Need:
1. Position-based win rate charts
2. Session timeline graph (chips over time)
3. Opponent profiling (HUD stats per opponent)
4. Profit/loss by game type, stake level, time of day
5. Tilt detection alerts

**Estimated effort:** 3 days

### 8.4 Social Features
**Our Advantage: Integrated social layer**

Messaging, friends, and social features exist. Need:
1. Friend list with online status
2. Direct challenge (invite friend to heads-up)
3. Club leaderboard seasons
4. Achievement badges (visible at table)
5. Player reputation scores

**Estimated effort:** 3 days

### 8.5 Diamond Economy Completion
**Our Advantage: Richer in-app economy**

Diamond system exists. Need:
1. Diamond Store with all purchasable items
2. Time bank purchases
3. Premium avatar packs
4. Table themes
5. Card back designs
6. Throwable items

**Estimated effort:** 3 days

---

## Feature Parity Checklist

### Game Types
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| NL Hold'em | Yes | Yes | DONE |
| FL Hold'em | Yes | No | Phase 3 |
| Short Deck (6+) | Yes | No | Phase 3 |
| PLO4 | Yes | Partial | Phase 3 |
| PLO5 | Yes | No | Phase 3 |
| PLO6 | Yes | No | Phase 3 |
| Omaha Hi-Lo | Yes | Partial | Phase 3 |
| OFC Pineapple | Yes | Partial | Phase 3 |
| Double Board | Yes | No | Phase 3 |
| Mixed Games | Yes | Partial | Phase 3 |

### Table Features
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| Straddle | Yes | Client only | Phase 2 |
| Bomb Pot | Yes | Partial | Phase 3 |
| Run It Twice | Yes | Client only | Phase 2 |
| Insurance | Yes | Client only | Phase 2 |
| Pre-Actions | Yes | Client only | Phase 2 |
| Time Bank | Yes | Mismatched | Phase 2 |
| Rabbit Cam | Yes | Partial | Phase 7 |
| Throwables | Yes | Partial | Phase 7 |
| Multi-Table (4x) | Yes | Partial | Phase 7 |

### Tournament Types
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| MTT | Yes | Partial | Phase 4 |
| SNG | Yes | Partial | Phase 4 |
| Spin-It | Yes | Partial | Phase 4 |
| Satellite | Yes | No | Phase 4+ |

### Security
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| GPS Restriction | Yes | No | Phase 5 |
| IP Restriction | Yes | No | Phase 5 |
| Device Fingerprint | Yes | No | Phase 5 |
| In-Game CAPTCHA | Yes | No | Phase 5 |
| Collusion Detection | Yes | No | Phase 5 |
| RNG Certification | Yes | No | Future |

### Economy
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| Rake System | Yes | Yes | Audit needed |
| Rakeback | Yes | Partial | Phase 6 |
| Bad Beat Jackpot | Yes | Partial | Phase 6 |
| Daily Rewards | Yes | Partial | Exists |
| Diamond Store | Yes | Partial | Phase 8 |
| VIP System | Yes | Yes | Exists |

### Club Management
| Feature | PokerBros | Club Arena | Status |
|---------|-----------|------------|--------|
| Club Creation | Yes | Yes | DONE |
| Role Hierarchy | Yes | Yes | DONE |
| Agent System | Yes | Partial | Phase 6 |
| Union System | Yes | Partial | Phase 6 |
| Club Settings | Yes | Yes | DONE |
| Push Notifications | Yes | Partial | Exists |

---

## Resource Requirements

### Development Team Recommendation
- **2 Senior Backend Engineers** — Engine rewrite, server features, state machines
- **1 Senior Frontend Engineer** — UI polish, animations, multi-table
- **1 Full-Stack Engineer** — Tournament system, economy, analytics
- **1 QA/Security Engineer** — Anti-cheat, testing, security audit

### Infrastructure
- **Game Server:** Current Hetzner VPS (178.156.160.206) — adequate for Phase 1-2
- **Scaling:** Move to Kubernetes cluster after Phase 4 for multi-region support
- **Database:** Current Supabase instance — adequate through Phase 6
- **CDN:** Vercel (current) — adequate for static assets

---

## Risk Assessment

### High Risk
1. **Engine rewrite breaks existing gameplay** — Mitigation: Feature flag to toggle between old and new engine; parallel testing
2. **Tournament system complexity** — Mitigation: Start with SNG (simpler), then MTT
3. **Card security fix breaks existing sessions** — Mitigation: Deploy during low-traffic window; clear all active tables first

### Medium Risk
1. **Omaha hand evaluation edge cases** — Mitigation: Comprehensive test suite with known hands
2. **Multi-table performance** — Mitigation: Load testing with simulated players before launch
3. **Anti-cheat false positives** — Mitigation: Start with alerts only, no auto-action; tune thresholds

### Low Risk
1. **UI animations performance** — Mitigation: CSS animations preferred over JS; will-change hints
2. **Diamond economy balance** — Mitigation: Soft launch with adjustable pricing
3. **Social features scope creep** — Mitigation: MVP first, iterate based on usage data

---

## Success Metrics

| Metric | Current | Target (Phase 4) | Target (Phase 8) |
|--------|---------|-------------------|-------------------|
| PokerBros Feature Parity | ~45% | ~75% | 100%+ |
| Concurrent Tables | 1 | 50+ | 500+ |
| Game Types Available | 1 (NLH) | 5+ | 10+ |
| Avg Session Length | Unknown | 30 min | 45 min |
| Player Retention (7-day) | Unknown | 40% | 60% |
| Engine Uptime | Unknown | 99.5% | 99.9% |

---

## Immediate Next Steps (This Week)

1. **Deploy all Phase 0 fixes** (avatar, hamburger, seat layout, hero clearance)
2. **Verify on production** with test account
3. **Begin Phase 1.1** — Map all client-side HandController references for removal
4. **Set up staging environment** for engine rewrite testing
5. **Create automated test suite** for poker hand evaluation (needed before any engine changes)

---

*This document is a living plan. Update after each phase completion with lessons learned and adjusted timelines.*
