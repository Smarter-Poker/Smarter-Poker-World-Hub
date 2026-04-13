# Gap Analysis: PokerBros Spec vs Current Smarter.Poker Build

**Date:** 2026-04-13
**Spec Reference:** docs/POKERBROS_CLONE_SPEC.md (1500+ lines, 16 sections)
**Analysis Scope:** Club Arena SPA + Training/PvP + Shared Engines

---

## EXECUTIVE SUMMARY

The smarter.poker platform has a STRONG backend (60+ API routes, Supabase schema, auth, club management) and a rich LOBBY/MANAGEMENT layer (club cards, wallets, tournaments, leaderboards). However, **the actual poker TABLE — the live game UI where cards are dealt and players act — DOES NOT EXIST yet**. This is the #1 gap.

### What EXISTS (Strong Foundation):
- 60+ Club Arena API routes (buy-in, cashout, rake, BBJ, tournaments, chat, leaderboards)
- Zustand stores (clubArenaStore, trainingStore, etc.)
- SoundManager with 16 event types and 13 audio files
- CardAssets engine (52-card deck, optimized images, preloading)
- HandStateMachine engine (full hand lifecycle: preflop through showdown)
- GTOScoreEngine (move classification, session scoring, grades)
- PvPMatchEngine (match formats, state management, imports HandStateMachine)
- DeckEngine, HandStrengthEngine, BoardTextureEngine, EVCalculator
- 25+ free avatars, card images with backs, club branding assets
- TableMiniView (SVG lobby thumbnail with seat dots, timer rings, action labels)
- BBJDisplay, DynamicWallet, TableChatHUD, NotificationBell components
- Horse Opponent API (427 lines, fully functional AI decisions)

### What's COMPLETELY MISSING (The Entire Game Table):
- Live poker table UI (felt, seats, cards, pot, action buttons)
- Player seat components with avatars, stacks, action tags
- Hero section (hole cards display, hand strength label)
- Action button bar (Fold / Check-Call / Raise-Bet)
- Bet sizing slider with presets (2X/3X/4X, 1/2 POT/2/3 POT/POT)
- Advance action toggles (Check/Fold, Check, Call Any)
- Pre-action to action transition animation
- Fold protection dialog ("Check or Fold?")
- Timer/countdown ring around active player
- Timebank system (consume clock, extend time, auto-fold)
- Community card dealing animation (flop/turn/river)
- Pot display with real-time updates
- Pot shipping animation (chips fly to winner)
- Net profit floating text (+X display)
- Showdown sequence (card flips, hand comparison, winner highlight)
- Card dealing animations (3D flip, slide)
- Chip movement animations (bet to pot, pot to winner)
- Multi-table tab bar with mini hole cards
- Hamburger menu (slide-out sidebar)
- Table settings panel (all toggles)
- Stats panel ("Real Time Result")
- Previous hand viewer (hand history with street-by-street detail)
- Share hand feature (URL generation, web replay)
- Chat/messenger integration at table level
- Emoji throwing system
- Sitting out / Stand up / Stand up next BB
- Empty table "waiting for players" state
- Congratulations popup (win celebration)
- Club entry promotional popup
- 9-handed table layout (currently only has seat positions for 2-10 in TableMiniView SVG)
- Game variant support (PLO, Pineapple) with different card counts
- Sound triggers during gameplay (currently only mapped, not wired to game events)

---

## DETAILED GAP ANALYSIS BY SPEC SECTION

### 1. CORE TABLE LAYOUT (Spec Section 2)

| Feature | Spec Requirement | Current State | Gap Level |
|---------|-----------------|---------------|-----------|
| Oval felt table | Dark green felt, diamond pattern, gold rim, 3D depth | PokerTable3D.jsx exists but is DECORATIVE only (spinning chips, not functional) | MISSING |
| Mobile-first portrait viewport | 9:16, responsive 320px-768px | No game viewport exists | MISSING |
| Background | Gradient fade, ambient texture, near-black | No game background | MISSING |
| Table sizing | 90-95% viewport width, centered | No game table | MISSING |

### 2. PLAYER SEATS (Spec Section 3)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| 6-seat layout (60-degree spacing) | Oval perimeter, equal intervals | TableMiniView has SEAT_POSITIONS for 2-10 players (SVG only) | PARTIAL — positions defined in lobby thumbnail, not game table |
| Player avatar (60-80px, circular) | Caricature cartoon, border, shadow | 25+ free avatars exist as assets | PARTIAL — assets exist, no game-table avatar component |
| Avatar overlays (D, SB, BB, All-in) | Small badges, pulsing all-in ring | Not implemented | MISSING |
| Player name + chip stack | Below avatar, formatted, dynamic | Not in game context | MISSING |
| Action tags (FOLD, CHECK, BET, RAISE, ALL IN) | Above avatar, color-coded, animated | TableMiniView has micro-labels (lobby only) | PARTIAL — lobby only |
| Bet chip display (between player and pot) | Gold text, slide animation | Not implemented | MISSING |
| Timer ring (around active avatar) | Circular progress, gold glow, pulse | TableMiniView has neon timer ring (lobby SVG only) | PARTIAL — SVG only |

### 3. HERO SECTION (Spec Section 4)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Hero avatar (80-100px, enhanced) | Thicker border, glow ring, pulse on turn | Not implemented | MISSING |
| Hole cards (2 cards, fanned) | 50-70px, always face-up, 3D flip animation | CardAssets.js has card mapping + image paths | PARTIAL — asset system exists, no display component |
| Hand strength label | "HIGH CARD", "TWO PAIR" etc., dynamic | HandStrengthEngine exists (evaluateHand) | PARTIAL — engine exists, no UI |
| Hero name + stack | Centered, gold for stack | Not implemented | MISSING |
| Yellow glow (turn to act) | Gold box-shadow, pulse animation | Not implemented | MISSING |

### 4. ACTION SYSTEM (Spec Section 5)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Fold / Check-Call / Raise-Bet buttons | Three full-width, colored, responsive | Not implemented | MISSING |
| Bet sizing slider | Vertical/angled, real-time amount update | Not implemented | MISSING |
| Preflop presets (2X, 3X, 4X) | BB multiplier buttons | Not implemented | MISSING |
| Post-flop presets (1/2 POT, 2/3 POT, POT) | Pot-fraction buttons | Not implemented | MISSING |
| Manual amount input (tap number to type) | Numeric keyboard overlay | Not implemented | MISSING |
| Advance action toggles | Check/Fold, Check, Call Any — dynamic labels | Not implemented | MISSING |
| Pre-action to action transition | Smooth morph from toggles to buttons | Not implemented | MISSING |
| Fold protection ("Check or Fold?") | Modal when folding is suboptimal | Not implemented | MISSING |
| Timebank counter display | Bottom-left, clock + count | Not implemented | MISSING |

### 5. COMMUNITY CARDS + POT (Spec Section 6)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| 5-card horizontal row | 50-65px per card, centered on table | CardAssets has all 52 card images | PARTIAL — images exist, no layout |
| Card dealing animation | 3D flip + slide, staggered 100ms | Not implemented | MISSING |
| Pot display (label + amount) | "POT $X.XX", real-time updates, scale pop | Not implemented | MISSING |
| Pot shipping (chips to winner) | Physics-based scatter, curved arc, 600ms | Not implemented | MISSING |
| Net profit display | "+X" yellow float text (Total Pot - Own Contribution - Rake) | Not implemented | MISSING |

### 6. ANIMATIONS (Spec Section 7)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Card dealing (3D flip + slide) | 200-300ms, ease-out | Not implemented | MISSING |
| Chip betting (slide + curve) | 300-400ms, bezier path | Not implemented | MISSING |
| Pot shipping (physics scatter) | 600ms, chip particles | Not implemented | MISSING |
| Action tag pop-in (scale + fade) | 200ms, spring-like | Not implemented | MISSING |
| Timer glow (pulsing opacity) | 800ms loop, faster in final 5s | Not implemented | MISSING |
| Winner celebration (float text) | 800ms translate + fade | Not implemented | MISSING |
| Between hands clear (fade out) | 300-400ms | Not implemented | MISSING |
| Timebank system | Finite clocks, auto-consume, extend timer | Not implemented | MISSING |

### 7. AUDIO SYSTEM (Spec Section 8)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| SoundManager | 16 event types, volume control, mute | SoundManager.ts EXISTS and is complete | COMPLETE |
| Audio files | deal, check, fold, chips, win, etc. | 13 files in public/audio/ (deal, chip-stack, click, correct, incorrect, tick, heartbeat, cinematic, options) | PARTIAL — missing check, fold, chips_to_table, hand_won, showdown_flip, all_in, player_join/leave, timebank sounds |
| Sound triggers in game | Each game event triggers appropriate sound | NO game loop exists to trigger sounds | MISSING |
| HapticsManager | Vibration patterns for mobile | HapticsManager.ts EXISTS | COMPLETE |

### 8. NAVIGATION + MENUS (Spec Section 9)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Top header bar (hamburger, jackpot, icons) | 50-60px, jackpot counter | Not implemented at table level | MISSING |
| Hamburger slide-out menu | 10 items, 70-80% width | Not implemented | MISSING |
| Table settings panel | 10+ toggles | Not implemented | MISSING |
| Multi-table tab bar | Mini hole cards, swipe, action indicators | Not implemented | MISSING |
| Sidebar icons (chat, stats, hand history) | Vertical icon bar | Not implemented | MISSING |
| Stats panel ("Real Time Result") | Slide-in, session stats, VPIP | Not implemented | MISSING |

### 9. PREVIOUS HAND / HAND HISTORY (Spec Section 10)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Hand summary list (scrollable) | Player rows, cards, win/loss amounts | my-hands API route exists | PARTIAL — API exists, no viewer UI |
| Hand detail (street-by-street log) | PreFlop/Flop/Turn/River/Showdown sections | Not implemented | MISSING |
| Share hand (unique URL + replay) | Generate URL, web-based animated replay | Not implemented | MISSING |
| Star/Replay/Export buttons | Hand bookmark, in-app replay, export | Not implemented | MISSING |

### 10. CHAT + EMOJI (Spec Sections)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Table chat | Messages, presets, send button | TableChatHUD.js exists, club-chat API exists | PARTIAL — component + API exist, not wired to game |
| Chat disabled for tournaments | Auto-disable in tournament mode | Not implemented | MISSING |
| Chat disabled when all-in | Anti-collusion measure | Not implemented | MISSING |
| Emoji throwing | Animated emoji from player to player | Not implemented | MISSING |

### 11. GAME VARIANTS (Spec Section 11)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| NLH | Primary game type | HandStateMachine supports it | PARTIAL — engine supports, no table UI |
| PLO (4 cards) | Pot-limit, 4 hole cards display | Not implemented | MISSING |
| Pineapple (3 cards, discard 1) | 3 hole cards, discard step | Not implemented | MISSING |
| PLO5/PLO6 | 5-6 hole cards | Not implemented | MISSING |
| Game type selector in lobby | Tabs: ALL, Hold'em, Omaha, Mixed, OFC | Not implemented | MISSING |

### 12. LOBBY (Spec Section 12)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Table list with game info | Stakes, players, buy-in, join button | GameCard.jsx exists, public-clubs API, lobby-ordering API | PARTIAL — lobby card exists, needs game type filters |
| Game type filter tabs | ALL, NLH, PLO, Pineapple, etc. | Not implemented | MISSING |
| Create table modal | Game type, stakes, buy-in range, etc. | create-table API exists, CreateTournamentModal exists | PARTIAL — API + tournament modal exist |
| Club home screen | Club info, BBJ, announcements, game tabs | BBJDisplay, DynamicWallet, NotificationBell exist | PARTIAL |
| Club entry promotional popup | Full-screen banner, custom image | Not implemented | MISSING |

### 13. CONGRATULATIONS POPUP (Spec Section 13)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Win celebration modal | Avatar, total winnings, share button | Not implemented | MISSING |

### 14. SITTING OUT / STAND UP (Spec)

| Feature | Spec | Current | Gap |
|---------|------|---------|-----|
| Sit out (cards auto-folded) | Cash: dealt until BB. Tournament: always dealt | Not implemented | MISSING |
| Stand up | Leave seat, become observer | Not implemented | MISSING |
| Stand up next BB | Leave after posting next BB | Not implemented | MISSING |
| Empty table state | "Waiting for players" UI | Not implemented | MISSING |

---

## PRIORITY IMPLEMENTATION ROADMAP

### PHASE 1: Core Game Table (CRITICAL — Nothing Else Works Without This)
1. **PokerTableView** — The main game table component (oval felt, responsive)
2. **PlayerSeat** — Avatar, name, stack, position badges (D/SB/BB)
3. **HeroSection** — Hole cards display + hand strength label
4. **ActionButtons** — Fold / Check-Call / Raise-Bet
5. **BetSlider** — Presets + slider + manual input
6. **CommunityCards** — 5-card display with dealing animation
7. **PotDisplay** — Pot amount, real-time updates
8. **GameStateManager** — Wire HandStateMachine to UI, manage turns

### PHASE 2: Interactivity + Polish
9. **ActionTags** — Above-avatar labels with pop-in animation
10. **TimerRing** — Countdown around active player
11. **AdvanceToggles** — Pre-action toggles with dynamic labels
12. **FoldProtection** — "Check or Fold?" dialog
13. **PotShipping** — Chips fly to winner, net profit display
14. **ShowdownSequence** — Card flips, hand comparison
15. **SoundWiring** — Connect SoundManager to all game events

### PHASE 3: Features + Menus
16. **HamburgerMenu** — Slide-out sidebar with all settings
17. **TableSettings** — All toggle options
18. **MultiTableTabs** — Tab bar with mini hole cards
19. **StatsPanel** — Real-time session stats
20. **HandHistoryViewer** — Previous hand with street detail
21. **ChatIntegration** — Wire TableChatHUD to game state
22. **TimebankSystem** — Finite clocks, auto-consume, extend

### PHASE 4: Advanced Features
23. **ShareHand** — URL generation + web replay viewer
24. **EmojiThrowing** — Animated emoji system
25. **CongratulationsPopup** — Win celebration modal
26. **ClubEntryPopup** — Promotional banner system
27. **GameVariants** — PLO, Pineapple support
28. **SittingOut** — Stand up, stand up next BB
29. **9-HandedLayout** — Extended seat positions

---

## ASSET INVENTORY — What We Have vs Need

### HAVE:
- 52 card face images + optimized variants
- 4 card back designs (black, blue, red, white)
- 25+ avatar images
- SoundManager with 16 event types
- 13 audio files (deal, chip-stack, click, correct, incorrect, tick, heartbeat, cinematic, 5 option variants)
- Club branding assets (logos, frames, backgrounds)
- BBJ display component
- Wallet display component

### NEED:
- Poker table felt texture (SVG or PNG pattern)
- Gold rim/border asset
- Dealer button image
- SB/BB position badge graphics
- Action tag styling (or pure CSS — no image needed)
- Chip graphics (for bet display and pot shipping animation)
- Timer ring (SVG circle — can be generated in code)
- Missing audio files: check.mp3, fold.mp3, chips_to_table.mp3, hand_won.mp3, showdown_flip.mp3, all_in.mp3, player_join.mp3, player_leave.mp3, timebank_5s.mp3, timebank_3s.mp3
- Hamburger menu icon (can use CSS/SVG)
- Settings toggle components (can use DaisyUI)
