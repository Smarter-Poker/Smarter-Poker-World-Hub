# Poker Table Template - Complete Implementation Plan

## Overview
Implement the approved poker table design across all 100 training games with dynamic player positioning, enhanced timer with heartbeat audio, and screen pulse effects.

## Design Reference
Based on approved mockup showing 6 character avatars positioned around vertical poker table with gold boxes for names/stacks.

---

## 1. PLAYER POSITIONING SYSTEM

### Positioning by Format

#### **9-Max (Full Ring) - 43 games**
Positions around oval table (clockwise from top):
- TOP CENTER: Player 1
- TOP RIGHT: Player 2  
- RIGHT UPPER: Player 3
- RIGHT LOWER: Player 4
- BOTTOM RIGHT: Player 5
- BOTTOM CENTER: HERO (Player 6)
- BOTTOM LEFT: Player 7
- LEFT LOWER: Player 8
- LEFT UPPER: Player 9

#### **6-Max - 47 games**
Positions (clockwise from top):
- TOP CENTER: Player 1
- RIGHT UPPER: Player 2
- RIGHT LOWER: Player 3 ("EMPTY" if not in hand)
- BOTTOM CENTER: HERO (Player 4)
- LEFT LOWER: Player 5
- LEFT UPPER: Player 6 (with dealer button)

#### **3-Max (Spins) - 10 games**
Positions:
- TOP CENTER: Player 1
- LEFT SIDE: Player 2
- BOTTOM CENTER: HERO (Player 3)
- RIGHT positions show "EMPTY"

#### **2-Max (Heads Up) - 3 games**
Positions:
- TOP CENTER: Villain
- BOTTOM CENTER: HERO
- All side positions show "EMPTY"

### Avatar Assignments
- **Hero**: Fish with Crown (fish.png) - ALWAYS 100px
- **Villains**: Rotate through shark, octopus, turtle, crab, jellyfish - 70px each
- **Dealer Button**: White "D" circle positioned near dealer

---

## 2. CARD SYSTEM

### Card Sizing
- **Width**: 50px (ensures 5 cards span full felt width)
- **Height**: 70px (maintaining poker card aspect ratio)
- **Gap**: 4px between cards
- **Total Width**: (50px × 5) + (4px × 4) = 266px

### Card Positioning
- **Board**: Centered horizontally at 32% from top
- **Hero Cards**: Fanned to right of hero avatar at bottom
- **Card Animation**: Stagger delay 0.1s per card

---

## 3. TIMER ENHANCEMENTS

### Visual Design
- **Numbers**: White countdown text (18px font, 900 weight)
- **Border**: Glowing green circle (same as current, but numbers white)
- **Position**: Bottom left corner, 120px from bottom

### Audio System - Heartbeat
```javascript
// Heartbeat sound intervals based on time remaining
if (timeLeft > 15) {
  // Slow heartbeat: 1 beat per 2 seconds
  playHeartbeat(interval: 2000ms, volume: 0.3)
}
else if (timeLeft > 10) {
  // Medium heartbeat: 1 beat per 1.5 seconds  
  playHeartbeat(interval: 1500ms, volume: 0.5)
}
else if (timeLeft > 5) {
  // Fast heartbeat: 1 beat per second
  playHeartbeat(interval: 1000ms, volume: 0.7)
}
else if (timeLeft > 0) {
  // Critical heartbeat: 2 beats per second
  playHeartbeat(interval: 500ms, volume: 1.0)
  // TRIGGER SCREEN PULSE
}
```

### Screen Pulse Animation (≤5 seconds)
```css
@keyframes screenPulse {
  0%, 100% { 
    transform: scale(1);
    opacity: 1;
  }
  50% { 
    transform: scale(1.02);
    opacity: 0.95;
  }
}

.pulse-active {
  animation: screenPulse 0.5s ease-in-out infinite;
}
```

---

## 4. GAME TITLE DISPLAY

### Data Structure
Each game needs metadata:
```javascript
{
  id: 'mtt-001',
  title: 'Push/Fold Mastery',
  playerCount: 9,
  category: 'MTT'
}
```

### Display Logic
- Replace "NLH" with `game.title`
- Keep "Smarter.Poker" branding below
- Position: Center of table at 45% from top
- Styling: 
  - Title: 14px, 800 weight, gold (#FFD700)
  - Branding: 11px, 600 weight, rgba(255,255,255,0.5)

---

## 5. PLAYER DATA STRUCTURE

### Default Player Names
```javascript
const DEFAULT_PLAYERS = {
  2: ['Villain'],
  3: ['Player1', 'Player2'],
  6: ['Thedon3323', 'Meek_n_Mild', 'riskynino', 'Player4', 'Player5'],
  9: ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6', 'Player7', 'Player8']
}
```

### Dynamic Rendering
- Loop through playerCount
- Position each using calculated angles/percentages
- Assign avatar from pool (cycling through available avatars)
- Hero always gets fish avatar at bottom center

---

## 6. STYLING SPECIFICATIONS

### Player Info Boxes

#### Non-Hero Players
```css
.player-container {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.player-avatar {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
}

.player-name {
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.player-stack {
  color: #FFD700;
  font-size: 11px;
  font-weight: 700;
}
```

#### Hero (Bottom Center)
```css
.hero-container {
  position: absolute;
  bottom: 5%;
  left: 50%;
  transform: translateX(-50%);
}

.hero-avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 3px solid gold;
}

.hero-name-box {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: 1px solid #FFD700;
  border-radius: 8px;
  padding: 4px 12px;
  margin-top: 4px;
}

.hero-stack-box {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: 1px solid #FFD700;
  border-radius: 8px;
  padding: 2px 10px;
  margin-top: 2px;
}
```

---

## 7. IMPLEMENTATION PHASES

### Phase 1: Core Template (Current Session)
1. ✅ Generate 6 character avatars
2. ✅ Save avatars to `/public/images/training/avatars/`
3. ⏳ Implement player positioning system
4. ⏳ Update card sizing to 50px
5. ⏳ Add game title integration

### Phase 2: Timer Enhancement
1. Create heartbeat sound effect (or use audio API)
2. Implement progressive heartbeat intervals
3. Add screen pulse animation at ≤5 seconds
4. Change timer numbers to white

### Phase 3: Game Metadata
1. Add playerCount to all 100 games in GAMES_LIBRARY.js
2. Add title field for each game
3. Create default player name pools

### Phase 4: Testing & Refinement
1. Test each format (2-max, 3-max, 6-max, 9-max)
2. Verify all 100 games load correctly
3. Test timer heartbeat and pulse
4. Fine-tune positioning

---

## 8. FILES TO MODIFY

### Primary Files
1. `/pages/hub/training/play/[gameId].js` - Main template
2. `/src/data/GAMES_LIBRARY.js` - Add playerCount & title metadata
3. `/src/data/QUESTIONS_LIBRARY.js` - Ensure all questions have stack data
4. `/public/sounds/heartbeat.mp3` - Add heartbeat sound effect

### Supporting Files
5. `/public/images/training/avatars/` - Character images (✅ Done)

---

## 9. SUCCESS CRITERIA

✅ **Visual**
- Player avatars positioned exactly as mockup
- Cards span full felt width (5 cards visible)
- Hero avatar large and centered
- Gold boxes for hero name/stack
- Timer white with green circle

✅ **Audio**
- Heartbeat starts slow, accelerates to critical
- Sound syncs with timer countdown
- Volume increases with urgency

✅ **Animation**
- Screen pulses when ≤5 seconds
- Cards deal with stagger animation
- Player entrance animations smooth

✅ **Data**
- All 100 games have correct playerCount
- Game titles display correctly
- Default 20 BB stacks for all players

---

## 10. DEPLOYMENT

Once tested on `mtt-001`, the template automatically applies to all 100 games because they all use the same `[gameId].js` dynamic route.

**Verification Plan:**
- Test mtt-001 (9-max)
- Test cash-001 (6-max)
- Test spins-001 (3-max)
- Test any HU game (2-max)

If all 4 formats work correctly, all 100 games will work.

---

## READY TO BUILD

This plan is approved and ready for implementation. All specifications match the approved mockup design.
