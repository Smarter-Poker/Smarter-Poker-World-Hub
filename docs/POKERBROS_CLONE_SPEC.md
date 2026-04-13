# PokerBros-Style Poker Table UI/UX Specification

**Document Version:** 1.0
**Date:** 2026-04-13
**Target Platforms:** Club Arena (Vite SPA), Training Games
**Stack:** React 18, Tailwind CSS + DaisyUI, Zustand, Howler.js

---

## TABLE OF CONTENTS

1. Overview and Design Principles
2. Core Table Layout
3. Player Seats and UI Elements
4. Hero Section
5. Action System
6. Community Cards and Pot Display
7. Game States and Animations
8. Audio System
9. Navigation and Menu Systems
10. Game Variants Support
11. Implementation Roadmap

---

## 1. OVERVIEW AND DESIGN PRINCIPLES

### Philosophy
This specification describes a recreation of the PokerBros gaming interface, adapted for the smarter.poker platform. We replicate the LAYOUT, GAME FLOW, ANIMATIONS, and INTERACTION PATTERNS from PokerBros, but use smarter.poker's own color palette, typography, and custom asset library.

### Key Design Goals
- Mobile-first, portrait-oriented viewport (9:16 aspect ratio)
- Rapid, responsive action feedback (sub-100ms animations)
- Clear visual hierarchy for game state and player actions
- Accessibility-first: high contrast, readable font sizes
- Sound design reinforces game events without overwhelming

### Smarter.Poker Brand Integration
- Color scheme: smarter.poker primary palette (not PokerBros blues/golds)
- Avatar system: custom cartoon horse avatars + AI training opponents
- GTO overlay: unique training mode score display (not in PokerBros)
- Diamond economy: seamless integration for chips/buy-ins
- No emoji characters anywhere in UI

### Technical Constraints
- Responsive design from mobile (320px) to tablet (768px)
- Touch-first interactions (large tap targets, swipe navigation)
- Realtime multiplayer via Supabase (not peer-to-peer)
- WebGL or Canvas for table rendering (consider Pixi.js or Three.js)
- Audio via Howler.js for cross-browser compatibility

---

## 2. CORE TABLE LAYOUT

### Viewport Structure

```
+-------------------------------------------+
|  Multi-table tabs (if playing 2+)         |
+-------------------------------------------+
|                                           |
|         [Hamburger] [Jackpot]  [Icons]   |
|                                           |
|                                           |
|            [POKER TABLE]                 |
|                                           |
|        (oval felt, 6 player seats)        |
|                                           |
|                                           |
+-------------------------------------------+
|  [Fold] [Check/Call] [Raise/Bet]         |
|  or                                       |
|  [Check/Fold] [Check] [Call Any]         |
+-------------------------------------------+
|     [Hero Avatar] [Hole Cards]            |
|     [Hand Strength Label]                 |
+-------------------------------------------+
```

### Table Appearance

**Shape and Dimensions:**
- Oval/pill-shaped table (landscape orientation within portrait viewport)
- Aspect ratio: ~3:2 (width:height)
- Diameter range: 90% of viewport width at desktop, 95% on mobile
- Center positioned with 20-40px margin from edges

**Surface Styling:**
- Felt color: dark green (#1a4d2e or similar from brand)
- Texture: subtle diamond pattern overlay (PNG or SVG pattern fill)
- 3D depth effect: inset box-shadow on table perimeter
- Glow effect: gold/brass-colored box-shadow border (10-20px blur)
- Rim: 2-4px solid brass/gold border

**Background:**
- Gradient fade from table glow outward
- Subtle ambient texture or noise overlay
- Dark color (near-black with slight tint toward brand primary)
- Prevents pure black to avoid harsh contrast with table glow

**Responsive Adjustments:**
- Desktop (768px+): Table centered in full viewport
- Tablet (600-767px): Slight size reduction, padding adjusted
- Mobile (320-599px): Maximum table size, minimal margins
- Landscape mode (if supported): Horizontal table orientation

---

## 3. PLAYER SEATS AND UI ELEMENTS

### Seat Layout
6 player maximum, positioned around the oval table at equal intervals (60-degree spacing).

**Seat Positions:**
- Position 0: Top center (UTG)
- Position 1: Top-right (UTG+1)
- Position 2: Bottom-right (CO)
- Position 3: Bottom center (Button)
- Position 4: Bottom-left (SB)
- Position 5: Top-left (BB)

**Seat Visibility:**
- Occupied seats display player UI
- Empty seats show a "+" join button with secondary text "Join Table"
- Recently joined players show "New" badge (visible for first 10 seconds)

### Player Avatar Component

**Avatar Container:**
- Circular shape, 60-80px diameter (responsive)
- Background: solid player color or gradient
- Border: 2-3px solid highlight (gold when active)
- Shadow: drop-shadow for table depth
- Positioned at seat coordinate on table perimeter

**Avatar Content:**
- Caricature-style cartoon avatar (horse, animal, or custom character)
- Centered within circle
- Clear, high-contrast colors
- No emoji characters (use custom icon font if needed)

**Overlay Indicators:**
- Dealer button ("D"): small gold circle, top-right of avatar (10-12px diameter)
- Small blind indicator ("SB"): badge, slightly offset from position
- Big blind indicator ("BB"): badge, slightly offset from position
- All-in indicator: red pulsing ring around avatar border

### Player Information Display

**Text Labels (displayed directly below avatar):**
1. Player Name (12-14px font weight: 600)
   - Truncate if longer than 16 characters + ellipsis
   - Color: white or light text on dark felt
   
2. Chip Stack (11-13px font weight: 700)
   - Format: "26,174.80" (locale currency, 2 decimal places)
   - Color: gold/brass for winning positions, white/grey for others
   - Dynamic: updates immediately when chips change

**Action Badge Display (above avatar):**
- Appears only during or immediately after player action
- Positioned 5-10px directly above avatar center
- Options:
  - FOLD: grey tag, white text, 10px padding
  - CHECK: green tag (#22c55e or similar), white text
  - BET [amount]: orange tag (#f97316), white text
  - RAISE [amount]: orange tag (#f97316), white text
  - CALL [amount]: green tag, white text
  - ALL IN: red tag (#ef4444), white text
- Animation: scale pop-in (0.5 to 1.0 over 200ms), ease-out
- Persistence: until next street or hand reset
- Font: monospace for amounts, 11px weight: 600

**Bet Chip Display (between player and pot):**
- Individual bet amounts displayed as small text labels
- Positioned along visual "betting line" from player toward pot
- Format: currency symbol + amount (e.g., "0.54", "4.00")
- Color: gold or white
- Font: 10-12px weight: 700
- Animation: slide from player position to pot center over 300ms as chips move
- Disappears when bet is collected into pot

**Timer/Action Indicator (around avatar when active):**
- Circular progress ring, 90-100px diameter
- Color: gold/brass with slight glow
- Animates as countdown (full circle = ~15-20 seconds)
- Pulsing glow effect increases urgency in final 3 seconds
- Sound alert at 5 seconds remaining (if enabled)

---

## 4. HERO SECTION

**Position:** Bottom of screen, below action buttons
**Aspect:** Emphasis player (user's perspective)

### Hero Avatar
- Large circular avatar, 80-100px diameter
- Center-aligned horizontally
- Enhanced styling vs. opponent avatars:
  - Thicker border (3-4px)
  - Additional outer glow ring
  - Subtle animation when it's hero's turn (slight scale pulse)

### Hole Cards Display
- Two playing cards, slightly fanned horizontally
- Card size: 50-70px width (responsive)
- Positioned directly above hero avatar or to sides
- Both cards always face-up (never hidden)
- Standard playing card design:
  - Rank displayed large in corners (K, Q, J, 10-2, A)
  - Suit symbol prominent (spades, hearts, diamonds, clubs)
  - Color: red for hearts/diamonds, black for spades/clubs
  - Corner indices and suit symbols for clarity

**Card Animations:**
- Deal: rotate in from deck position (3D flip, 200-300ms)
- Highlight on hero turn: subtle glow (gold outline, 2px)
- Flip for showdown: 3D rotate to reveal (if hidden preflop)

### Hand Strength Label
- Displayed below cards in center
- Font: 12-14px weight: 600, all-caps
- Examples: "HIGH CARD", "TWO PAIR", "STRAIGHT", "FULL HOUSE"
- Color: green for made hands, grey for draws, white for high card
- Updates dynamically as community cards change
- Greyed out post-hand (during pot shipping)

### Hero Name and Stack
- Name: centered, 13-15px weight: 600
- Stack: centered below name, 12-14px weight: 700
- Format: "[Name] - $26,174.80"
- Color: white primary text, gold for stack
- Position: below or to the side of cards, depending on layout

### Yellow Highlight (Turn to Act)
- When it's hero's turn: full cards + surrounding area gets yellow/gold glow
- Box-shadow: 0 0 20px rgba(255, 192, 0, 0.6)
- Subtle pulse animation (opacity 0.6 to 0.8 over 1 second, loop)
- Removed immediately when action is taken

---

## 5. ACTION SYSTEM

### 5.1 Hero Action Buttons (When It's Hero's Turn)

**Layout:**
- Three full-width buttons at bottom of screen
- Stacked horizontally or in grid (2 wide + 1, or 1-2-1 based on space)
- Responsive: stack vertically on small screens if needed
- Each button: 40-50px height, full or equal-width allocation

**Button States and Styling:**

1. **Fold Button**
   - Position: Left
   - Background: red gradient (#dc2626 to #991b1b)
   - Text: "FOLD" white 14px weight: 700
   - Tap feedback: slight scale down, shadow intensify
   - Enabled: always (unless all-in already)
   - Action: folds hand immediately, move to next hand

2. **Check / Call Button**
   - Position: Center
   - Background: dark/green gradient (brand primary to darker shade)
   - Text: "CHECK" or "CALL $X.XX" (white 14px weight: 700)
   - Label changes based on game state:
     - "CHECK" when no bet to call (preflop with blinds not to hero, or empty street)
     - "CALL $amount" when there's a bet
   - Tap feedback: scale down, shadow intensify
   - Action: checks or calls as appropriate

3. **Raise / Bet Button**
   - Position: Right
   - Background: orange gradient (#f97316 to #d97706)
   - Text: "BET $X.XX" or "RAISE $X.XX" (white 14px weight: 700)
   - Label changes based on state:
     - "BET" if no prior bet
     - "RAISE" if prior bet exists
   - Tap feedback: opens bet sizing dialog
   - Action: opens advanced bet interface

### 5.2 Bet Sizing Interface (Raise/Bet Button Tap)

**Dialog/Overlay:**
- Modal overlay at bottom of screen (slides up from bottom)
- Dark semi-transparent background
- Title: "Bet Amount" or "Raise Amount"

**CRITICAL: Presets change based on STREET (preflop vs post-flop).**

**PREFLOP Bet Sizing Presets (when Raise is tapped preflop):**
- Preset row: "2X", "3X", "4X" (BB multipliers)
- Plus slider and Confirm button
- Default amount: minimum raise (2X BB)

**POST-FLOP Bet Sizing Presets (when Bet/Raise is tapped on flop/turn/river):**
- Preset row: "1/2 POT", "2/3 POT", "POT"
- Plus slider and Confirm button
- Default amount: minimum bet or minimum raise
- "POT" preset fills pot-sized bet

**Layout (OBSERVED — bottom bar replaces action buttons):**
- Four-button row at bottom of screen:
  - Three preset buttons (dark/outlined, highlighted when selected)
  - "Confirm" button (orange/gold filled, rightmost)
- The preset buttons and Confirm REPLACE the Fold/Check/Raise buttons
- Tapping a preset instantly updates the bet amount

**Slider (between hero cards and preset buttons):**
- Vertical or angled slider on the RIGHT side of the screen
- Slider thumb can be dragged smoothly up (increase) and down (decrease)
- Amount updates in REAL TIME as slider moves
- Amount displayed near the slider or above the hero area
- Range: minimum legal bet at bottom, all-in at top

**Tapping the Amount Number:**
- The displayed bet amount is TAPPABLE
- Tapping it opens a numeric keyboard input
- Player can type an EXACT amount manually
- If typed amount exceeds stack: AUTO-CAPS TO ALL-IN (does not error)
- If typed amount is below minimum: snaps to minimum legal bet

**+/- Fine Tuning:**
- Small +/- buttons adjacent to the amount for BB-increment adjustments

**Behavior:**
- Presets snap the slider to the corresponding position
- Slider updates the amount field in real time
- Amount field updates the slider position in real time
- Confirm button submits the bet/raise
- Tapping outside the slider area or pressing back cancels (returns to Fold/Check/Raise)
- Timer continues while slider is open — player must act before time expires

### 5.6 Fold Protection Dialog — "Check or Fold?" (OBSERVED)

When the player taps FOLD but CHECKING is available (no bet to face):
- A confirmation modal pops up INSTEAD of immediately folding
- **Title:** "Check or Fold?"
- **Body:** "Notice: You can check this hand instead of folding."
- **Two buttons:**
  - "Check" (left, outlined/bordered style)
  - "Fold" (right, filled/solid gold style)
- **Close X** top-right (dismisses dialog, no action taken)
- Blue/purple gradient modal background, rounded corners
- This ONLY triggers when folding is suboptimal (checking is free)
- If there IS a bet to call, tapping Fold executes immediately with no confirmation

This is a critical UX safety feature to prevent misclicks on free hands.

### 5.7 Timebank Counter Display (OBSERVED)

- Bottom-left corner of screen: small clock icon with count
- Shows remaining time clocks available (e.g., "20s" with pink diamond icon)
- Always visible during gameplay so player knows their timebank balance
- Diamond icon next to count indicates these are a purchasable resource

### 5.3 Advance Action Toggles (When NOT Hero's Turn)

**Layout:**
- Three toggle buttons, same position as action buttons
- Visible ONLY when it's NOT hero's turn
- Remain visible until hero's turn arrives or hand ends

**Toggle Options:**

**IMPORTANT: The toggle LABELS CHANGE dynamically based on game state.**

**When NO bet is pending (first to act scenario):**
1. **Check / Fold** (left) — auto-check if possible, auto-fold if bet comes
2. **Check** (center) — auto-check only
3. **Call Any** (right) — auto-call any incoming bet, or check if none

**When a BET IS PENDING (someone bet before your turn):**
1. **Fold** (left) — auto-fold when your turn arrives
2. **Call [amount]** (center, e.g., "Call 7K") — auto-call the exact pending amount
3. **Call Any** (right) — auto-call regardless of further raises

The labels dynamically update to reflect the current bet amount.
These are toggle buttons — tap to select, tap again to deselect.
You can also SLIDE between them (swipe gesture to switch selection).
Only one toggle can be active at a time.

**Pre-Select Toggle Visual Design (OBSERVED IN DETAIL):**
- Container: dark translucent/frosted glass bar docked at bottom of screen
- Three pill-shaped buttons in a row with subtle borders and rounded corners
- Each button has a DARK CIRCULAR TOGGLE DOT above the label text
  - When OFF: dot is dark/empty
  - When ON/selected: dot fills/highlights to indicate active selection
- Text: white, medium weight
- Background: dark semi-transparent
- Flanking icons on the bar:
  - LEFT side: card/hand icon (shortcut to previous hand viewer)
  - RIGHT side: chat bubble icon (shortcut to messenger)
- This bar is VISUALLY DISTINCT from the action buttons:
  - Pre-select toggles = muted, dark, translucent with toggle dots
  - Action buttons = vivid colored (red/green/orange), no toggle dots
- The transition from pre-select bar to action bar happens smoothly when hero's turn arrives

**Toggle Styling:**
- Background: muted grey when off, brand primary when on
- Text: white, 12-13px weight: 600
- Border: 1px outline, lighter when on
- Tap feedback: immediate highlight toggle
- Disable when toggle option is invalid (e.g., can't fold preflop with no bet)

**Behavior Notes:**
- Only one of {Check/Fold, Check, Call Any} can be active at once
- Toggles persist across streets until changed
- Once hero's turn arrives, selected action executes automatically
- After action, toggles reset to OFF
- Toggles clear when hand ends

### 5.4 Pre-Action to Action Transition (CRITICAL UX DETAIL)

When it is NOT hero's turn, the advance action toggles are displayed.
When it BECOMES hero's turn, the transition works as follows:

1. **If NO toggle is selected:**
   - Advance toggle buttons smoothly transition/morph into the full action buttons
   - The three toggle positions (Check/Fold, Check, Call Any) transform into (Fold, Check/Call, Raise/Bet)
   - The button bar changes from muted toggle style to vivid colored action buttons
   - Sound cue plays (current_turn sound)
   - Hero avatar gets timer glow ring

2. **If a toggle IS selected:**
   - The pre-selected action executes IMMEDIATELY and AUTOMATICALLY
   - No action buttons are shown -- the action fires instantly
   - The action tag pops up above hero avatar
   - Advance toggles reset to OFF
   - If the game state changed (e.g., someone raised after you toggled "Check"), 
     the toggle may become invalid -- in that case, show full action buttons instead

3. **When hero's turn ENDS:**
   - Action buttons fade/transition back to advance action toggles
   - Toggles appear in muted/inactive state
   - Player can pre-select for their next action

### 5.5 Bet Slider UX Details (MUST IMPROVE ON POKERBROS)

The bet slider is the most-used interactive element. Key details:

**Default Bet Amount:**
- When "Bet" or "Raise" is tapped, a DEFAULT amount is pre-filled
- Default = minimum legal bet (e.g., 1 BB for bet, min-raise for raise)
- The slider thumb starts at the left (minimum) position
- Slider track shows min on left, all-in on right

**Slider Interaction:**
- Smooth continuous drag along horizontal track
- Amount text updates in real-time as slider moves
- Preset buttons (2X, 3X, 4X, 1/3 Pot, 1/2 Pot, Pot, All-In) snap the slider
- +/- buttons for precise BB-increment adjustments
- Double-tap slider thumb to type exact amount

**Improvements over PokerBros for smarter.poker:**
- Add 33%, 50%, 75%, 100% pot-size presets (GTO Wizard style)
- Add keyboard shortcut support for desktop (Q=fold, W=check/call, E=raise)
- Haptic feedback on mobile when crossing preset thresholds
- Show pot odds calculation next to bet amount (training mode)

---

## 6. COMMUNITY CARDS AND POT DISPLAY

### Community Cards

**Position:** Center of table, horizontal row

**Card Layout:**
- 5 card slots, horizontally spaced
- Individual card width: 50-65px (responsive)
- Slight overlap or gap of 5-10px between cards
- Vertically centered in upper-mid area of table

**Card Appearance:**
- Standard playing card design (matching hero hole cards)
- Front face always visible (never dealt facedown first)
- Rank and suit clearly displayed
- Professional card-back design when not yet dealt

**Card Dealing Animation:**
- Preflop: cards exist but are hidden/not displayed
- Flop (3 cards): slide in from left to right, one per 200ms
  - Each card: 3D flip + slide, 300ms duration
  - Stagger: 100ms between each card
- Turn (4th card): slides in from right, larger 3D flip, 400ms
- River (5th card): slides in from right, larger 3D flip, 400ms
- Board clear (new hand): cards fade out, 300ms

**Card Highlighting (Showdown):**
- Winning hand cards: gold glow, +2px drop-shadow
- Player hand cards revealed: slight glow, white outline
- Discarded cards (Pineapple): dimmed opacity (0.6)

### Pot Display

**Position:** Center of table, directly below community cards (or upper area if no board)

**Elements:**

1. **Game Type Label**
   - Text: "NLH", "PLO", "PINEAPPLE", "PLO5", "PLO6"
   - Font: 11-12px weight: 600, all-caps
   - Color: gold/brass

2. **Pot Label and Amount**
   - Text: "POT [currency symbol][amount]"
   - Font: 14-16px weight: 700
   - Format: "POT $1,268.00"
   - Color: white or gold
   - Updates in real-time as bets come in

3. **Blinds / Game Info**
   - Subtext: "Blinds: 100/200/200" or "Limits: $0.25/$0.50"
   - Font: 10-11px weight: 500
   - Color: light grey

**Animation:**
- Amount change: slight scale pop (1.0 to 1.1 to 1.0 over 200ms)
- New pot after showdown: chip animation from center to winner
- Reset between hands: fade out, reset to 0.00

### Pot Shipping Animation (Showdown)

**Sequence:**
1. Remaining players' hole cards flip face-up (100ms per card)
2. Best hand determined, highlight winning cards
3. Chips animate from pot center to winner's avatar position
   - Duration: 400-600ms
   - Path: curved arc (quadratic bezier)
   - Chip visual: small gold circles, scattered physics
   - Sound: chip collection sound effect
4. Winner's chip stack updates with floating text animation
   - **CRITICAL: The displayed amount is NET PROFIT, not total pot**
   - **Formula: Total Pot - Hero's Own Contribution - Rake - BBJ = displayed "+X" amount**
   - Example observed: Pot was 8K, hero contributed ~4,680, display showed "+3,320"
   - The FULL pot (8K) is added to hero's stack (44,012 -> 51,532)
   - But the floating text ONLY shows what was won FROM OTHER PLAYERS
   - Hero's own chips silently return — they are NOT counted in the display
   - For TOURNAMENTS: no rake/BBJ deduction (rake only applies to cash games)
   - Text: "+3,320" in YELLOW, bold, above hero avatar
   - Position: floats upward from hero's chip area
   - Duration: 600ms, fades out at end
   - Color: yellow/gold text
5. Hand strength label displayed at pot center temporarily (1 second)
6. Board clears, next hand starts

---

## 7. GAME STATES AND ANIMATIONS

### Game State Flow

```
[NEW HAND] -> [PREFLOP BETTING] -> [FLOP DEALING] -> [FLOP BETTING] 
  -> [TURN DEALING] -> [TURN BETTING] -> [RIVER DEALING] -> [RIVER BETTING] 
  -> [SHOWDOWN] -> [POT SHIPPING] -> [HAND RESET]
```

### Animation Timing and Specs

**Card Dealing (All Streets)**
- Animation Type: 3D flip + slide
- Duration: 200-300ms per card
- Easing: ease-out
- Stagger: 100ms between cards
- Sound: card_deal.mp3 (whoosh sound)
- Path: smooth slide from deck position to destination

**Chip Betting (Any Action)**
- Animation Type: slide + curve (quadratic bezier path)
- Duration: 300-400ms per bet
- Easing: ease-out
- Start: player avatar position
- End: pot center or side pot position
- Multiple bets: simultaneous or staggered per action
- Sound: chips_to_table.mp3 (clinking)

**Pot Shipping (Showdown)**
- Animation Type: physics-based scatter
- Duration: 600ms
- Start: pot center
- End: winner avatar position
- Visual: chip particles with shadows
- Sound: hand_won.mp3 or chips_collected.mp3

**Action Tag Pop-In**
- Animation Type: scale + fade
- Duration: 200ms
- Start: scale 0, opacity 0
- End: scale 1, opacity 1
- Easing: ease-out (spring-like)
- Position: center above player avatar

**Timer Glow (Active Player)**
- Animation Type: pulsing opacity
- Duration: 800ms loop (fast pulse in final 5s)
- Color: gold, 15-20px blur
- Intensity: increases as time runs low
- Stops when action taken

**Timebank / Time Clock System**
- Each player has a FINITE number of time clocks (timebank activations)
- When the normal action timer expires, a time clock is consumed automatically
  to grant additional time (e.g., +15 or +30 seconds)
- Timebank economy:
  - VIP card holders: 100 time clocks per month included with VIP subscription
  - Non-VIP users: must use diamonds or buy time clock packs (no freebies)
  - When VIP time clocks are depleted: buy more packs or spend diamonds
- UI: time clock count displayed somewhere accessible (settings or avatar area)
- Timebank ONLY appears/activates when it is the player's turn to act
- Normal action timer: ~15-20 seconds with fast-depleting glow ring around player name
- When normal timer expires and player has time clocks available:
  - One time clock is consumed automatically
  - +20 seconds added to the decision timer
  - The glow box animation SLOWS DOWN to reflect the longer duration
  - Same smooth countdown ring, just moves proportionally slower
  - Action buttons remain visible throughout
- Visual indicator: "TIMEBANK" label or clock icon with remaining count
- **"Action Time Extended" popup/toast**: appears on screen when a time clock is consumed
  - This is a brief notification overlay confirming extra time was granted
  - Appears center-screen or near the timer area
  - Fades after 1-2 seconds
- Sound: distinct timebank activation sound plays when timebank kicks in
- If timebank timer ALSO expires without action:
  - Auto-CHECK if no bet is pending (free action available)
  - Auto-FOLD if there is a bet/raise pending that requires chips to call
- If NO time clocks remaining when normal timer expires:
  - Immediate auto-check or auto-fold (same rules as above)
  - No extra time granted

**Winner Celebration (Float Text)**
- Animation Type: translate + fade
- Start: pot center position, scale 1.0
- End: winner's stack position, fade to 0
- Duration: 800ms
- Text: "+$X.XX" or "+X chips"
- Font: bold, 14-16px, gold color
- Effect: slight arc path (upward curve)

**Between Hands Clear**
- Animation Type: fade out all board elements
- Duration: 300-400ms
- Elements fade: community cards, pot label, action tags
- Fresh table revealed: clean felt ready for next deal
- Sound: subtle transition sound (optional)

### State-Specific UI Changes

**Preflop:**
- Hole cards visible to hero only
- Action buttons show: Fold, Check/Call Big Blind, Raise
- Pot shows current blinds
- No community cards displayed

**After Flop:**
- 3 community cards visible
- Pot updates with flop bets
- Action buttons: Fold, Check, Bet/Raise
- Action tags: CHECK, BET, RAISE, FOLD, ALL IN

**Turn/River:**
- 4th or 5th community card added
- Action buttons remain the same
- Pot continues to grow

**Showdown:**
- All remaining player hole cards flip face-up
- Hand strength labels display above cards
- Winning hand highlighted (gold glow)
- Pot shipping animation initiates

**Hand End / Reset:**
- Community cards fade out
- Pot resets to 0
- Action tags cleared
- Advance toggles reset
- All players' status reset (no folds, no bets visible)
- Ready for next deal

---

## 8. AUDIO SYSTEM

**Audio Engine:** Howler.js (cross-browser web audio support)

**Sound Effects Library:**

1. **Game Action Sounds**
   - deal_card.mp3: Card dealing whoosh/slide (200-300ms)
   - check.mp3: Soft tap/knock for check action (100-150ms)
   - fold.mp3: Card toss/slide sound (200ms)
   - chips_to_table.mp3: Chip clinking as bets placed (300-400ms)
   - chips_collected.mp3: Plural chip collection at pot shipping (600-800ms)
   - hand_won.mp3: Celebration sound for winning (500-800ms)
   - showdown_flip.mp3: Card flip sound at showdown (100-150ms per card)

2. **Player Action Alerts**
   - current_turn.mp3: Subtle alert when hero's turn (soft sound, not jarring)
   - all_in.mp3: Dramatic emphasis for all-in action (300-400ms)
   - player_join.mp3: Notification when player joins (200ms)
   - player_leave.mp3: Notification when player leaves (200ms)

3. **Timebank Warnings**
   - timebank_5s.mp3: Alert at 5 seconds remaining
   - timebank_3s.mp3: Alert at 3 seconds remaining (higher urgency)
   - timebank_1s.mp3: Final second countdown alert (if used)

4. **UI Navigation Sounds**
   - button_tap.mp3: Subtle click for button presses (50-100ms)
   - menu_open.mp3: Slide-in sound for menu/sidebar (200ms)
   - menu_close.mp3: Slide-out sound for menu close (200ms)

**Sound Control:**
- Master volume slider in settings (0-100%)
- Per-category mutes: Game sounds, Alerts, UI sounds
- Toggle in hamburger menu: "Sounds ON/OFF"
- Default state: ON
- Mobile: respect system mute switch (use Web Audio vibration API as fallback)

**Volume Levels:**
- Game action: 70-80% (clearly audible, not overwhelming)
- Alerts/Turn notification: 60-70%
- UI sounds: 40-50% (subtle, not distracting)
- Music (if any): 30-40%

**Accessibility:**
- All critical game state changes have VISUAL indicators (not audio-dependent)
- Volume must not peak above 90dB equivalent
- Haptic feedback (vibration) available as alternative to audio

---

## 9. NAVIGATION AND MENU SYSTEMS

### 9.1 Top Header Bar

**Layout:** Horizontal bar at very top of viewport, height 50-60px

**Elements (left to right):**
1. **Hamburger Menu Icon** (left)
   - Icon: three horizontal lines (≡)
   - Size: 24x24px
   - Color: white or brand primary
   - Tap: opens slide-out menu (see 9.2)

2. **Jackpot Display** (center)
   - Text: "JACKPOT [formatted amount]"
   - Example: "JACKPOT 000,139,381"
   - Font: 12-13px weight: 600, monospace
   - Color: gold/brass
   - Animation: number ticker/counter effect for updates
   - Tap: opens jackpot info modal (if applicable)

3. **Quick Action Icons** (right)
   - Three clickable icons arranged horizontally
   - Icons: Challenges, Lucky Draw, Bonus
   - Size: 24x24px each
   - Color: white or brand primary
   - Tap: opens respective feature panel or modal

**Additional Display:**
- Table ID (small text, secondary color): "Table #12345"
- Game info (small text): "NLH $0.25/$0.50"

### 9.2 Hamburger Menu (Slide-Out Sidebar)

**Appearance:**
- Slide in from left, 70-80% viewport width
- Dark background (brand dark color)
- Semi-transparent overlay on table (click to close)
- Animation: slide-in 300ms from left edge

**Menu Items (OBSERVED in PokerBros, top to bottom):**
1. **Top Up** -- add chips to stack (icon + arrow to sub-panel)
2. **Table Settings** -- opens Table Settings overlay (icon + arrow)
3. **Auto Top-Up** -- configure automatic chip top-up rules (icon + arrow)
4. **Stand Up** -- leave seat but remain as observer (icon + arrow)
5. **Stand Up Next Big Blind** -- leave seat after posting next BB (icon + arrow)
6. **Sounds** -- sound settings sub-panel (icon + arrow)
7. **Vibrations** -- inline toggle, green when ON (only item with inline toggle)
8. **Share** -- share table link or invite friends (icon + arrow)
9. **VIP** -- VIP card info and purchase (icon + arrow)
10. **Exit** -- leave the table entirely (icon + arrow)

Each item has: icon on left, label text in center, right-arrow chevron
Exception: Vibrations uses an inline toggle instead of arrow

**Table Settings Sub-Panel (OBSERVED):**
- Theme Setting -- arrow to sub-menu for table felt/color theme selection
- Highlight Active Players -- toggle (default ON, green)
- Show Avatars -- toggle (default ON, orange)
- Show Badges -- toggle
- Cards Pre-Sort -- toggle (auto-sorts hero hole cards by rank)
- Gestures -- toggle (enables emoji throwing and tap interactions)
- Card Style -- toggle (switch between card face designs)
- Show Stack in Big Blinds -- toggle (displays chip count as BB count instead of currency)
- Auto Time Bank -- toggle (auto-activates timebank when timer runs low)
- Enhanced Video -- toggle (higher quality rendering)
- Close button: red X in top-right corner

**Menu Item Styling:**
- Font: 14px weight: 500
- Color: white text on dark background
- Padding: 15-20px horizontal, 12-15px vertical
- Icons: colored icon 20px left of each label
- Tap feedback: background highlight
- Menu slides in from left edge, table partially visible behind on right

### 9.3 Multi-Table Tabs (OBSERVED IN DETAIL)

**Position:** Horizontal tab bar at VERY TOP of screen, above everything else

**Tab Types (OBSERVED):**

1. **Active Table Tab** — shows hero's MINI HOLE CARDS face-up
   - The currently viewed table has a highlighted border/background
   - Cards are tiny but recognizable (rank + suit visible)
   - For PLO: shows 4 mini cards; for NLH: shows 2 mini cards
   
2. **Inactive Table Tab** — shows hero's hole cards for that table
   - If hero is dealt in: mini cards shown face-up
   - If hero folded: cards shown face-DOWN (card backs)
   - If waiting for next hand: card backs
   - Muted/dimmer than the active tab

3. **"+" Add Table Tab** — appears when fewer than max tables open
   - Shows a "+" icon
   - Tapping opens the LOBBY to select a new table
   - Also accessible via the "+" icon in the left sidebar

**Navigation:**
- TAP a tab to instantly switch to that table
- SWIPE LEFT/RIGHT on the table view to slide between tables
- The table view slides horizontally like a carousel
- Smooth animation between tables

**When Leaving a Table:**
- That table's tab disappears from the tab bar
- Remaining tabs re-center
- If only one table remains, the "+" tab appears next to it
- If NO tables remain, player returns to the lobby

**Action Required Indicator:**
- When it's hero's turn at a non-active table, that tab gets a 
  visual indicator (glow, badge, or pulsing border)
- Alerts the player to switch and take action before timer runs out

**Maximum Tables:**
- Observed up to 3 table tabs + the "+" tab
- Maximum appears to be 4 simultaneous tables

### 9.4 Sidebar Icons (Left of Table, Optional)

**Position:** Vertical icon bar on left side of screen (if space allows on tablet+)

**Icons (top to bottom):**
1. **Chat / Messenger** - open in-table chat
2. **Add Table (+)** - open lobby to join another table
3. **Previous Hand** - view replay of last hand
4. **Stats** - open player stats card
5. **Settings** (gear) - quick settings access

**Styling:**
- Icon size: 28-32px
- Spacing: 10-15px between icons
- Background: semi-transparent circle on hover
- Color: white or brand primary
- Hidden on mobile (< 600px width)

---

## 10. ADDITIONAL UI COMPONENTS

### 10.1 Stats Panel — "REAL TIME RESULT" (OBSERVED)

**Trigger:** Tap Stats icon in left sidebar (chart/graph icon)

**Display:** Slide-in panel from left side, covers ~60% of screen width.
Table remains partially visible on right. Game continues while panel is open.

**Header:**
- Timer icon with session duration (e.g., "06:30:01")
- Title: "REAL TIME RESULT" (right-aligned, bold)

**Stats Rows (OBSERVED — label left, value right):**
- **Tots** (Total hands played) — e.g., 97
- **Blinds** — e.g., 100/200
- **Ante** — e.g., 200
- **Profile Data** — clickable link/button to full player profile
- **Buy-In** — e.g., 8,000.00
- **Winnings** — e.g., 38,586.80
- **Current Table VPIP** — e.g., 48%

**Observers Section:**
- **Observers (N)** — header showing count of spectators
- Row of small circular avatars with names for each observer
- e.g., "Thomas", "Peter5"

**Styling:**
- Dark background panel
- White text for labels, bright/gold text for values
- Rows separated by subtle lines
- Compact vertical layout, scrollable if needed

### 10.1b Game Rules Panel — "?" Button (OBSERVED)

**Trigger:** Tap the "?" icon in the header/top bar

**Display:** Modal overlay centered on screen, with red X close button top-right.
Game continues behind the modal (action buttons still visible at bottom).

**Title:** "No Limit Hold'em Rules" (or whatever the current game variant is)

**Three Tabs:**
1. **Rules** (default selected, gold/highlighted tab)
   - Scrollable text explaining the game rules
   - "Example Hand" section walking through a full hand
   - Describes: first betting round, second betting round, third, fourth
   - Key terms bolded (e.g., "small blind", "big blind", "flop", "turn", "river")
2. **Betting Limit** — explains the NL/PL/FL betting structure
3. **Hand Ranking** — standard poker hand rankings reference

**Styling:**
- Purple/gradient header background
- White text content on dark background
- Gold tab for active tab, muted for inactive tabs
- Scrollable content area

### 10.1c "I'm Back" / Sitting Out State (OBSERVED IN DETAIL)

When a player times out or misses a hand:
- **"Sitting Out"** yellow text label appears under the player's avatar/name
- Cards ARE STILL DEALT to the sitting-out player:
  - **Cash games:** Cards dealt until their Big Blind position, then they stop receiving cards
  - **Tournaments:** Cards ALWAYS dealt to sitting-out players until they return
- Dealt cards are automatically FOLDED — a "Fold" tag appears above their avatar
- The player can still SEE the table, other players' actions, community cards, etc.
- A single **"I'm back"** button appears at the bottom-right of the screen
  - Blue/teal rounded rectangle button
  - Tapping it re-activates the player for the NEXT hand
- No pre-action toggles or action buttons shown while sitting out (only "I'm back")
- Bottom bar still shows: card icon (left), chat icon (right)
- Hero's hole cards are still visible (face-up) even while sitting out, but get auto-folded

### 10.1d Full Table UI Element Map (FROM HIGH-RES SCREENSHOT)

**Top Header Row (left to right):**
- Hamburger menu icon (three horizontal lines)
- Icon row: CHALLENGES, LUCKY DRAW, BONUS (small circular icons with labels)
- "?" help button (circle with question mark)
- Hand number / Table ID: e.g., "27744553362_274165"

**Left Sidebar (vertical stack):**
- "+" button (add another table / open new table)

**Center Table:**
- Oval felt table with gold glowing rim
- Dark diamond-pattern felt interior
- Dark blue/navy background with subtle diamond pattern behind table

**Pot Display (center of table, above community cards):**
- Two-line format:
  - Line 1: "35.2K" (current street bets) + "POT" label
  - Line 2: "51.3K" (total pot including previous streets)
- Pot icon (chip stack icon) to the left of amounts

**Game Info (below community cards):**
- "NLH" game type in bold
- "CLASSIC HOLD'EM" with heart suits as decorative separators
- "Blinds: 100/200 (200)" — blinds plus ante in parentheses

**Player Seat Details (observed for each player):**
- Circular avatar image
- Player name below (e.g., "baarsik)", "Poker2602447", "Shoeshine123")
- Chip stack in colored text below name (green for normal, yellow for active highlight)
- Active player: yellow/gold glow highlight around name + stack area
- Position badges: "D" for dealer (gold circle)
- Action tags above avatar: "All In" (green), "Fold" (grey)
- Bet amounts between seat and pot center when applicable

**Bottom Bar:**
- Left: card/hand replay icon (rounded square)
- Center: hero cards + name + stack
- Right: chat/messenger icon (speech bubble) + "I'm back" button when sitting out
- Refresh: updates in real-time as session progresses

**Close:**
- Back button or tap outside modal

### 10.2 Chat / Messenger

**Trigger:** Tap Chat/messenger icon (speech bubble) in bottom-right corner of table

**IMPORTANT CHAT RESTRICTIONS:**
- Chat is DISABLED for tournaments entirely
- Chat is ALWAYS DISABLED when ANY player is ALL IN (anti-collusion measure)
- Chat re-enables after the all-in hand completes

**Display:** FULL-SCREEN TRANSPARENT OVERLAY — the table, avatars, community
cards, and game action remain VISIBLE behind the chat. Players can still see
the game while chatting. This is a critical UX choice.

**Layout (OBSERVED):**
- Back arrow (top-left) to close/dismiss chat
- ">>" scroll icon near top to jump to latest messages
- Green banner at top: "Please report inappropriate chat" (report/moderation link)
- Chat message history: scrollable, newest at bottom
- Quick-chat preset list: scrollable list of pre-written messages (bottom area)
- Text input bar: docked at very bottom

**Chat Messages:**
- Player name displayed above their message (colored text, with "@seat# Name" format)
- Message text in white/light bubbles
- Messages are right-aligned or left-aligned based on sender
- Small avatar icon next to player name

**Quick-Chat Presets (OBSERVED list):**
- "Good luck!"
- "Was lucky!"
- "Well played"
- "One timer"
- "Ship it"
- "Running hot!"
- "Running cold!"
- "If I fold, will you show?"
- "Hey bro, hit me on the heart"
- "Don't act like you are not impressed"
- "A pair of balls beats..."
These are tappable presets — tapping one fills the text input field.
Player then taps the SEND button to confirm and send the message.
Presets do NOT auto-send on tap — they require explicit send confirmation.

**Bottom Input Bar:**
- Sticker/reaction icon (left side) — opens sticker/animated reaction picker
- Text input field (center, white) — tap to open keyboard and type custom message
- Keyboard/send icon (right side)
- If microphone is connected: voice chat icon appears for live voice communication

**Voice Chat (if mic available):**
- Push-to-talk or toggle-on voice
- Icon appears in the input bar area
- Only available when hardware mic is detected

**Styling:**
- Semi-transparent dark background overlay
- White text for messages
- Player names in colored text (different color per player)
- Font: 12-13px weight: 400
- Preset messages: dark pill-shaped buttons in a scrollable vertical list

**Close:**
- Back arrow (top-left) dismisses chat overlay
- Game action continues uninterrupted behind the transparent overlay

### 10.3 Emoji Throwing (Animated Reactions)

**How it works in PokerBros (observed):**
1. Player taps on an OPPONENT'S AVATAR at the table
2. A selection panel appears with animated emoji/sticker options
3. Player selects an emoji
4. The emoji FLIES from the sender's position across the table to the target opponent
5. The emoji animates at the target (bounces, explodes, spins, etc.)
6. Limited uses per hand/session (observed: limited throws available)

**Interaction Flow:**
1. Tap opponent avatar -> emoji selector overlay appears near that opponent
2. Emoji selector: grid of animated stickers/reactions (e.g., laugh, cry, thumbs up, angry, 
   trophy, bomb, heart, poop, chicken, etc.)
3. Select emoji -> it launches with a flight path animation
4. Flight path: arcs from hero's position to target opponent's avatar
5. On arrival: emoji plays a 1-2 second animation at the target (scale up, bounce, particle effect)
6. After animation: emoji fades out

**Profile Popup (observed):**
- Tapping an opponent avatar opens a PROFILE popup overlay
- Shows: avatar, player name, ID number
- Action buttons: "Table Hero", "Cold", "Hand Shake" (player relationship tags)
- "Tag" button for labeling opponents
- "Free emojis left: 6" counter (rate limiting)
- "Free throw pick-up: 1" (earn more throws)
- "Recently used" row of recently thrown stickers
- "Character Emojis" grid -- custom animated cartoon characters (NOT standard Unicode)
  - Categories selectable via icons at top of grid
  - Characters doing poker-themed actions, expressions, gestures
  - Each is an animated sticker, not a static icon
- "Confirm" button (gold/orange) to send the selected emoji

**On-Table Display (observed):**
- The thrown emoji appears as a LARGE animated character at the target player's position
- Character sits/stands near the opponent's avatar area
- Animation plays for 2-3 seconds then fades
- Multiple emojis can be in flight/displayed simultaneously

**smarter.poker Implementation (NOTE: we already partially built this):**
- Existing emoji throw system needs to be UPGRADED and WIRED IN properly
- Use custom animated reaction icons (NOT standard Unicode emoji -- per no-emoji rule)
- Custom SVG/Lottie animations for each reaction type
- Reactions should include poker-themed ones: chip toss, card throw, shark, fish, diamond, etc.
- Optional: tie to diamond economy (premium reactions cost diamonds)
- Rate limit economy:
  - VIP card holders: 200 free emoji throws per month included
  - Non-VIP users: must use diamonds or buy emoji packs (no freebies)
  - When VIP throws are depleted: buy more packs or spend diamonds per throw
- Recipient can mute/block incoming reactions in settings

**Animation Specs:**
- Flight duration: 600-800ms
- Flight path: parabolic arc (ease-in-out)
- Arrival animation: 1000-1500ms (scale bounce + optional particle burst)
- Fade out: 300ms after arrival animation completes

### 10.4 Hand History / Previous Hand Viewer (OBSERVED IN DETAIL)

**Trigger:** Tap card/hand replay icon (bottom-left of table, rounded square icon)

**Scope:** Shows EVERY SINGLE HAND from the current session — not just the last one.
Player can scrub through all hands played at this table in this sitting.

**Display:** Full-screen overlay (table still visible behind on right edge)

**Two View Modes (toggle buttons at bottom):**
1. **"Hand Summary"** (orange button) — condensed overview
2. **"Hand Detail"** (white/outlined button) — full breakdown per player

**HAND DETAIL View (OBSERVED):**

Header:
- "HAND DETAIL" title (bold, top-left)
- **Star icon** — favorite/bookmark this hand for later review
- **Play/Replay icon** — animate this hand as a visual replay on the table
- **Export icon** (spreadsheet/XLS icon, top-right) — export hand history data
  - Exports to CSV/XLS format for external analysis (HUD tools, trackers, etc.)
- Date + time: e.g., "2026-04-13 10:01:47"
- Blinds: e.g., "100 / 200(200)" — blinds + ante in parentheses
- Serial Number: "SN: 2079134336" (unique hand ID)
- "Share" button (green arrow icon)
- "Main Pot: 3,418"

**Three key actions in the header (STAR, REPLAY, EXPORT):**
1. **Star** — saves the hand to a "Starred Hands" collection for quick access later
   (great for reviewing interesting spots, bad beats, or study hands)
2. **Replay** — plays back the hand visually on the table, step by step,
   showing dealing, betting actions, community cards, and showdown animated
3. **Export** — downloads the hand data in a standard format (CSV/XLS/text)
   so players can import into tracking software, study tools, or spreadsheets

Player Rows (one row per player, top to bottom):
- Player name + Position badge (colored pill: CO, BTN, SB, BB, UTG, MP)
- Hole cards: shown as card images (face-up if visible, face-DOWN BACKS if hidden)
- Board cards: community cards shown next to hole cards on each row
- Win/Loss amount: green text for winners (+1,867.20), white/red for losers (-200.00)
- "Main pot" label indicating which pot the amount relates to
- Side pot labels if applicable

**CRITICAL: Showdown vs Non-Showdown Card Visibility:**

SHOWDOWN HAND (hand went to river with 2+ players):
- ALL remaining players' hole cards are shown FACE UP
- Everyone who was in at showdown has visible cards
- Folded players still show face-down card backs

NON-SHOWDOWN HAND (everyone folded before showdown):
- Winner's cards ONLY shown if they manually clicked "Show Cards" during the hand
- If winner did NOT show: their cards are face-down backs too
- All folded players: face-down card backs (cards NEVER revealed)
- Example: Shoeshine123 chose to show 2s 5s, everyone else face-down

**Navigation (bottom of panel):**
- Hand counter: "39/44" (current hand / total hands in session)
- Orange slider bar — DRAG to scrub quickly through all session hands
- Left arrow — go to previous hand
- Right arrow — go to next hand
- Scrubbing is smooth and instant — great for reviewing many hands quickly

**Share Hand Feature:**
- Tap "Share" green arrow icon on any hand
- Generates a UNIQUE URL: e.g., https://s.pokerbros.net/?t=a79s0469002en
- Share popup appears with:
  - Preview text: "Check out the hand I played on #PokerBROS! Click to see the video replay of this hand! [URL]"
  - "Copy" button — copies text + link to clipboard
  - "Quick Share" button — opens OS native share sheet
- The URL opens a WEB-BASED ANIMATED VIDEO REPLAY of the entire hand
- Anyone with the link can watch the hand play out step by step
- **smarter.poker equivalent:** We need to build a web hand replay viewer
  - Generate unique hand URLs: e.g., https://smarter.poker/hand/[handId]
  - Render animated replay in browser (deal, actions, showdown)
  - Shareable on social media, Discord, etc.

**HAND DETAIL — Street-by-Street Action Log (OBSERVED IN FULL):**

The "Hand Detail" view shows a COMPLETE action-by-action log organized by street:

PreFlop Section:
- Header row: "PreFlop" (left) + pot total after street (right, e.g., "6972")
- Each player action is its own row:
  - Position badge (colored pill: BTN, SB, BB, UTG, CO, MP)
  - Player name (truncated if long)
  - Action icon + label: "ante", "call", "fold", "bid" (blind post), "raise"
  - Amount wagered in that action
  - Stack remaining after action (right-aligned)
- Multiple rows per player if they act multiple times (e.g., post ante then call)
- "Pot" summary row at end: "Main(6972)"

Flop Section:
- Header: "Flop" + BOARD CARDS SHOWN INLINE (e.g., 3c 7h 6s) + pot total (e.g., "14324")
- Same row format as preflop
- Action labels include: "c/in" (check), "bid" (bet), "call", "fold", "show" (show cards)
- When a player SHOWS cards: their hole cards appear inline in the action row
- "Pot" summary row: "Main(14324)"

Turn Section:
- Same format, 4th community card added to header

River Section:
- Same format, 5th community card added to header

Showdown Section:
- Header: "Showdown"
- Each player gets a summary row showing:
  - Player name + position badge
  - Their HOLE CARDS (face-up small card images) — only if shown/showdown
  - The FULL BOARD (all 5 community cards) displayed next to hole cards
  - HAND STRENGTH LABEL: e.g., "High Card", "One Pair", "Straight"
  - WIN/LOSS AMOUNT: green for winners (+7,091.60), red for losers (-200.00)
  - "Main pot" or "Side pot" label

Header Icons (OBSERVED):
- Star icon — bookmark/favorite this hand for later review
- Play icon — animate a visual replay of this hand on the table
- XLS/Export icon — export hand history (spreadsheet format)
- Notepad icon — add personal notes to this hand
- Share icon (green arrow) — generate shareable replay link

**HAND DETAIL — Street-by-Street Breakdown (OBSERVED):**

When "Hand Detail" button is tapped, each hand expands to show EVERY action
on EVERY street, broken down as follows:

**PreFlop Section:**
- Header row: "PreFlop" (left) — pot total after preflop (right, e.g., "6972")
- Action rows (one per action, in chronological order):
  - Position badge (colored pill: UTG, CO, BTN, SB, BB, MP)
  - Player name
  - Action icon + label: "ante", "call", "fold", "raise", "check", "all-in"
  - Amount (e.g., 200, 1,824)
  - Stack remaining after action (right column, e.g., 65,732)
- "Pot" summary row at end: "Main(6972)"

**Flop Section:**
- Header row: "Flop" with board cards shown INLINE (e.g., 3c 7h 6s) — pot total
- Action rows continue same format
- Players who "show" cards have their hole cards displayed inline in the action row
- "Pot" summary row: "Main(14324)"

**Turn Section:**
- Header: "Turn" with 4th board card added — pot total
- Action rows continue

**River Section:**
- Header: "River" with 5th board card added — pot total
- Action rows continue

**Showdown Section:**
- Header: "Showdown"
- One row per remaining player showing:
  - Position badge + player name
  - Hole cards (face-up images)
  - Full board (all 5 community cards)
  - Hand strength label (e.g., "High Card", "Two Pair", "Straight")
  - Win/Loss amount: green for winners (+7,091.60), red for losers (-200.00)
  - "Main pot" label (or "Side pot 1", "Side pot 2" etc.)

**Color Coding:**
- Positive amounts (winnings): GREEN text
- Negative amounts (losses): WHITE or RED text
- Position badges: different colors per position (UTG=red, CO=blue, BTN=gold, etc.)

**Close:**
- Back arrow or close button returns to table

---

## 11. GAME VARIANTS SUPPORT

### Core Variants to Implement

**Phase 1 (MVP):**
- No-Limit Hold'em (NLH) - primary focus

**Phase 2:**
- Pot-Limit Omaha (PLO) - 4 hole cards
- Pineapple Hold'em - 3 hole cards, discard 1 after flop

**Phase 3:**
- PLO Hi-Lo (split pot)
- PLO5 (5 hole cards)
- PLO6 (6 hole cards)

### UI Adjustments Per Variant

**NLH (No-Limit Hold'em)**
- 2 hole cards displayed for hero
- Standard action: Fold, Check/Call, Bet/Raise
- No forced discards

**Pineapple Hold'em**
- 3 hole cards displayed face-up for hero
- Additional action step: discard 1 card after flop dealt (before flop betting)
- Discard interface: tap card to select, confirm discard
- Remaining 2 cards used for hand strength calculation

**PLO (Pot-Limit Omaha)**
- 4 hole cards displayed for hero
- Bet sizing: pot-limit max (vs. no-limit)
- Hand calculation: must use exactly 2 hole cards + 3 community cards (enforced)
- Hand strength label: shows best possible hand with 2 hole card requirement

**PLO Hi-Lo**
- Same as PLO, but:
- Pot splits between best high hand and best low hand
- Best low: A-2-3-4-5 (if exists, else winner takes full pot)
- Hand strength shows both high and low options
- Showdown display: split pot notification if both high/low present

**PLO5 / PLO6**
- 5 or 6 hole cards respectively
- Otherwise identical to PLO rules and UI
- Card display: fanned layout to fit more cards
- Responsive sizing: adjust card width on smaller screens

### Game Type Selector (Lobby)

**Location:** Top of lobby screen (tabs or dropdown)

**Options:**
- All Games (default view)
- NLH
- Pineapple
- PLO
- PLO Hi-Lo
- PLO5
- PLO6

**Styling:**
- Horizontal tabs or vertical list
- Active tab: highlighted in brand primary color
- Inactive: muted grey
- Tap: filters table list to matching games

---

## 12. LOBBY

### Lobby Screen Layout

**Header:**
- Game type selector tabs (see 11 above)
- Search/filter options
- Create Table button (brand primary, prominent)

**Main Content:**
- Table list: rows of available tables
- Infinite scroll or pagination
- Sort options: by stakes, by players, by game type

### Table List Item

**Display per table row:**
1. **Game Type Badge** - "NLH", "PLO", "PINEAPPLE" (small badge)
2. **Stakes** - "$0.25/$0.50" or "Blinds: 100/200" (large font, bold)
3. **Player Count** - "4 / 6 players" (medium font)
4. **Average Stack** - "$1,500" (secondary font)
5. **Action Button** - "Join" or "Watch" (CTA button)

**Row Styling:**
- Background: semi-transparent dark card
- Padding: 12-15px
- Border: 1px light border
- Tap feedback: highlight on press

**Sort Options:**
- By Blinds (default, lowest to highest)
- By Players (most active first)
- By Game Type
- By Recent Activity

### Create Table Modal

**Trigger:** "Create Table" button in lobby header

**Form Fields:**
1. **Game Type Selector** - dropdown or radio buttons
2. **Stake Level** - predefined options or custom input
3. **Blinds** - small blind / big blind / ante (if applicable)
4. **Buy-in Range** - min and max allowed buy-ins
5. **Table Name** - optional custom name
6. **Max Players** - 2, 4, 6 (radio or dropdown)
7. **Password** - optional, for private tables
8. **Description** - optional notes (e.g., "Friendly game")

**Actions:**
- Create button: creates table, joins as creator
- Cancel button: closes modal
- Validation: warn on invalid combinations

**Result:**
- Toast notification: "Table created, joining..."
- Redirect: navigates to new table view
- Player joins as dealer/first seat

---

## 13. CONGRATULATIONS POPUP (WIN CELEBRATION)

**Trigger:** When a player wins a significant amount at a cash game or tournament (observed threshold: 3x buy-in or more)

**Layout (Full-Screen Modal Overlay):**
- **Header:** "CONGRATULATIONS!" in large bold gold/red text with sparkle effects
- **Timestamp:** Date and time of win (e.g., "10:28 04-13-2026")
- **Player Avatar:** Large caricature avatar centered with celebratory animation (flying chips, sparkles, confetti)
- **"Total Winnings"** label in muted text
- **Win Amount:** HUGE bold text (e.g., "37845.32") — this is NET winnings, not total pot
- **Table Name:** e.g., "CLASSIC HOLD'EM" with decorative icons
- **Game Type:** e.g., "NLH"
- **Achievement Text:** Dynamic based on win size (e.g., "Won 3x the buy-in on a PokerBROS table!")
- **"Do not show again"** checkbox with X dismiss button
- **"Share"** button (gold CTA) — opens share sheet to post win to social/chat

**Visual Effects:**
- Purple banner/ribbon design behind win amount
- Sparkle particle effects around avatar
- Flying chip animations
- Background dims (dark overlay behind modal)

**smarter.poker Implementation:**
- Trigger on configurable win threshold (default: 2x buy-in for cash, any tournament win)
- Include smarter.poker branding instead of PokerBros
- Share button generates a unique URL to a hand replay or session summary
- "Do not show again" preference saved per user
- Club owners can customize congratulations threshold and messaging

---

## 14. CLUB ENTRY PROMOTIONAL POPUP

**Trigger:** When a player enters a club, a full-screen promotional popup/banner can be displayed

**Purpose:** Club owners and union admins can advertise upcoming tournaments, events, promotions, or announcements

**Observed Example:**
- "Paradise Union — Spring Break Festival"
- "April 10-18, 2026"
- "Over 700,000 Guaranteed"
- Full tournament schedule grid embedded in banner
- Professional graphic design (beach theme, gold text, tournament schedule table)

**Layout:**
- Full-screen modal overlay on club entry
- Custom banner image (uploaded by club owner or union admin)
- Close button (X) to dismiss
- Optional "Do not show again" checkbox
- Tappable — can link to tournament registration or details page

**smarter.poker Implementation:**
- Club owners upload a promotional image (JPEG/PNG) via Club Commander admin panel
- Set display rules: show once per session, once per day, always on entry
- Optional link URL: tapping the banner navigates to a specific page (tournament lobby, registration, etc.)
- Union-level banners: union admins can push banners to ALL clubs in their union
- Priority system: union banners show before club banners
- Analytics: track impressions and click-through rates
- Scheduling: set start/end dates for time-limited promotions

---

## 15. CLUB HOME SCREEN (OBSERVED)

### Header Section
- **Player identity bar:** Username ("KingFish"), player ID, VIP badge icon
- **Quick-access icons:** Friends, notifications, settings, shop
- **Diamond balance:** Display with "+" button to add more

### Club Info Section
- **Club logo:** Circular avatar (custom uploaded image)
- **Club name:** "Club JAQK" (bold text)
- **Club ID:** "ID: 1644889" with copy button and share/link icon
- **Announcement ticker:** Scrolling text from club owner (e.g., "@Johnnyd44 on...")

### Bad Beat Jackpot Display
- **Position:** Top-right of club home
- **Format:** "BAD BEAT JACKPOT" header in red/gold
- **Counter:** Odometer-style number display "000,056,827" — updates in real-time
- **Branding:** "POKER BROS" label below

### Promotional Banner Area
- **Full-width banner:** Takes up most of the screen on first entry
- **Content:** Union/club promotional material (tournaments, events)
- **Dismissible:** X button or tap outside to close

### Game Tabs / Navigation (Bottom)
- **Tournament cards:** Horizontal scrollable cards showing upcoming/active tournaments
- **Each card shows:** Tournament name (e.g., "XMTT NLH"), event number, buy-in, GTD amount, start date/time
- **Card design:** Dark background with gold/white text, moon/star decorative elements

### Bottom Navigation Bar
- **Tabs:** (to be confirmed with further observation)
- Expected: Home, Cash Games, Tournaments, Sit & Go, Club Info

---

## 16. IMPLEMENTATION ROADMAP

### Phase 1: Core Game Loop (Weeks 1-3)

**Deliverables:**
- Basic table layout with 6 seats
- Hero hole cards display
- Community cards dealing
- Action buttons (Fold, Check/Call, Bet/Raise)
- Pot calculation and display
- Basic animations (card dealing, chip movement)
- Realtime updates via Supabase

**Testing:**
- Single-player table flow
- Multi-player simulation (bot opponents)
- Verify all state transitions work

### Phase 2: Polish and Audio (Weeks 3-4)

**Deliverables:**
- Action tags animation
- Timer / countdown display
- Sound effects (Howler.js integration)
- Advance action toggles
- Hamburger menu and sidebar
- Stats card
- Multi-table tabs

**Testing:**
- Audio cross-browser compatibility
- Mobile touch interactions
- Responsive layout on various devices

### Phase 3: Features and Variants (Weeks 5-6)

**Deliverables:**
- Chat system
- Previous hand viewer
- Pineapple variant support
- PLO / PLO Hi-Lo support
- Lobby with game type filters
- Create table functionality
- Left sidebar icons

**Testing:**
- Variant-specific rules validation
- Lobby search and filters
- Table creation and joining

### Phase 4: Polish and Launch (Weeks 6-8)

**Deliverables:**
- Visual refinements (colors, spacing, animations)
- Accessibility audit (a11y)
- Performance optimization
- Accessibility features: high contrast mode, larger fonts
- Bug fixes from QA
- Documentation

**Testing:**
- Full end-to-end QA
- Cross-browser compatibility
- Mobile and tablet optimization
- Load testing (multi-table scenarios)

### Code Organization

**Directory Structure (Club Arena - Vite SPA):**
```
src/
  components/
    Table/
      Table.tsx (main component)
      TableLayout.tsx
      Seat.tsx
      HeroSection.tsx
      ActionButtons.tsx
      CommunityCards.tsx
      PotDisplay.tsx
    UI/
      ActionTag.tsx
      TimerRing.tsx
      AvatarCircle.tsx
      ChatBubble.tsx
    Menu/
      HamburgerMenu.tsx
      SidebarIcons.tsx
      StatsCard.tsx
    Lobby/
      LobbyScreen.tsx
      TableList.tsx
      CreateTableModal.tsx
  hooks/
    useGameState.ts
    useAudio.ts
    useTimer.ts
  lib/
    gameEngine.ts
    pokerHandEval.ts
    animations.ts
    audio.ts (sound effect triggers)
  stores/
    gameStore.ts (Zustand)
    audioStore.ts
  styles/
    table.css
    animations.css
```

### Technologies and Libraries

- **React 18** - UI framework
- **Tailwind CSS** - utility-first CSS
- **DaisyUI** - component library (optional, for quick UI)
- **Zustand** - state management
- **Howler.js** - audio playback
- **Framer Motion** - advanced animations (optional)
- **Pixi.js or Three.js** - 3D/canvas rendering (if needed for table visuals)
- **Supabase Realtime** - multiplayer game state sync
- **TypeScript** - type safety

### File Size and Performance Goals

- Main bundle: < 500KB gzipped
- Table component: < 150KB gzipped
- Audio assets: < 200KB total (MP3 format)
- First meaningful paint: < 2 seconds on 4G
- Realtime latency: < 100ms between players

---

## APPENDIX: Smarter.Poker Integration Notes

### Brand Color Palette

Replace PokerBros blues/golds with smarter.poker brand colors:
- Primary: [Brand primary color - to be provided]
- Secondary: [Brand secondary - to be provided]
- Accent: [Brand accent - to be provided]
- Dark background: [Dark brand tone]
- Text: White / light grey on dark backgrounds

### Avatar System

- Custom cartoon horse and AI opponent avatars
- No user photos (privacy-first)
- Consistent visual style across platform
- Avatar selection from library during account setup

### Training Mode Integration

- GTO score overlay on table (unique feature vs PokerBros)
- Display optimal range / equity in upper corner
- Adjustable transparency (training vs. reality mode)
- Heatmap for position ranges (optional visualization)

### Diamond Economy

- Buy-ins denominated in diamonds or equivalent currency
- Conversion rates displayed clearly
- Cashier integration for diamond purchases
- Real-money equivalent display (optional, compliance-dependent)

### No Emoji Rule

Absolute policy: zero emoji characters in any UI text, labels, or buttons throughout the application. Use plain text, Unicode symbols (arrows, dashes), or custom icon font instead.

---

**End of Specification**

Document prepared for Club Arena development team. For questions or clarifications, refer to the Club Commander skill documentation at `.agent/skills/club-commander/`.
