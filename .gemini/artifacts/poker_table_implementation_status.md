# Poker Table Template - Implementation Status

## ✅ COMPLETED (Current Session)

### 1. Character Avatars
- ✅ Generated 6 unique poker character avatars
- ✅ Saved to `/public/images/training/avatars/`:
  - fish.png (Hero - Fish with Crown)
  - shark.png (Shark with Sunglasses)
  - octopus.png (Octopus with Top Hat & Monocle)
  - turtle.png (Turtle with Headphones)
  - crab.png (Pirate Crab)
  - jellyfish.png (Jellyfish with Bow Tie)

### 2. Planning & Documentation
- ✅ Created comprehensive implementation plan
- ✅ Analyzed reference image in detail
- ✅ Documented all player positioning requirements
- ✅ Created player count mapping for all 100 games

### 3. Game Metadata
- ✅ Created `PLAYER_COUNT_MAP.js` with all 100 games mapped
  - 43 games: 9-max
  - 47 games: 6-max
  - 10 games: 3-max
  - 3 games: 2-max (heads up)

### 4. Questions Library  
- ✅ Added `heroStack` and `villainStack` fields (default 20 BB)

---

## 🔨 IN PROGRESS / NEXT STEPS

### Phase 1: Core Template Structure
**Priority: CRITICAL**
- [ ] Update card sizing from 32px to 50px width
- [ ] Implement dynamic player positioning system (2/3/6/9-max)
- [ ] Position hero avatar + gold boxes at bottom center
- [ ] Position villains around table based on player count
- [ ] Add dealer button positioning logic
- [ ] Integrate game title display (replace "NLH")

### Phase 2: Timer Enhancement
**Priority: HIGH**
- [ ] Change timer numbers to white
- [ ] Create/add heartbeat sound effect 
- [ ] Implement progressive heartbeat intervals:
  - \>15s: slow (2s interval)
  - 10-15s: medium (1.5s interval)
  - 5-10s: fast (1s interval)
  - 0-5s: critical (0.5s interval)
- [ ] Add screen pulse animation when ≤5 seconds
- [ ] Sync audio with timer countdown

### Phase 3: Styling & Polish
**Priority: MEDIUM  **
- [ ] Fine-tune player name/stack boxes
- [ ] Adjust POT position to avoid overlap
- [ ] Ensure dealer button visibility
- [ ] Add "EMPTY" labels for unfilled seats
- [ ] Perfect hero centering
- [ ] Card fanning animation for hero holes

### Phase 4: Testing
**Priority: HIGH**
- [ ] Test all 4 formats (2/3/6/9-max)
- [ ] Verify timer heartbeat & pulse
- [ ] Test on multiple games from each category
- [ ] Verify all 100 games load correctly

---

## 📁 FILES THAT NEED MODIFICATION

### Primary Implementation Files
1. **`/pages/hub/training/play/[gameId].js`**
   - Main game template
   - Player positioning system
   - Timer with heartbeat
   - Card sizing updates

2. **`/src/data/TRAINING_LIBRARY.js`**
   - Import player count map
   - Add playerCount to game retrieval

3. **`/public/sounds/heartbeat.mp3`**
   - Add heartbeat audio file

### Supporting Files (Already Created)
4. ✅ `/src/data/PLAYER_COUNT_MAP.js`
5. ✅ `/src/data/QUESTIONS_LIBRARY.js` (already has stacks)
6. ✅ `/public/images/training/avatars/*` (all 6 avatars)

---

## 🎯 CURRENT BLOCKER

**Session Length**: The implementation requires extensive code changes to `[gameId].js`:
- Rewrite player positioning (200+ lines)
- Add timer heartbeat logic (50+ lines)
- Implement animation system (30+ lines)
- Total: ~300 lines of new/modified code

**Recommendation**: Continue implementation in next session with full context preserved.

---

## 💡 IMPLEMENTATION STRATEGY (Next Session)

### Step 1: Card Sizing & Basic Layout (15 min)
- Update card sizes to 50px
- Test that 5 cards fit across felt

### Step 2: Player Positioning (45 min)
- Implement 6-max first (most common - 47 games)
- Add player avatar rendering
- Position around table with names/stacks
- Test with mtt-001

### Step 3: Multi-Format Support (30 min)
- Add 9-max positioning
- Add 3-max positioning
- Add 2-max (heads up) positioning
- Test each format

### Step 4: Timer Enhancement (30 min)
- White timer numbers
- Heartbeat audio integration
- Screen pulse animation
- Test timing sync

### Step 5: Final Polish (15 min)
- Game title integration
- Hero centering perfection
- Dealer button visibility
- Final screenshot verification

**TOTAL: ~2 hours implementation time**

---

## 🔑 KEY COORDINATES (Reference Image)

### Player Positions (6-Max Example)
```javascript
{
  1: { top: '5%', left: '50%' },      // TOP CENTER
  2: { top: '25%', right: '10%' },    // RIGHT UPPER
  3: { top: '50%', right: '10%' },    // RIGHT LOWER
  4: { bottom: '5%', left: '50%' },   // HERO (CENTER BOTTOM)
  5: { top: '50%', left: '10%' },     // LEFT LOWER
  6: { top: '25%', left: '10%' }      // LEFT UPPER
}
```

### Card Dimensions
```javascript
{
  width: '50px',
  height: '70px',
  gap: '4px',
  totalWidth: '266px' // (50*5) + (4*4)
}
```

### Timer
```javascript
{
  position: 'bottom-left',
  bottom: '120px',
  left: '12px',
  color: 'white',  // Changed from green
  size: '18px'
}
```

---

## ✨ SUCCESS CRITERIA

When complete, the table will:
- ✅ Match approved mockup exactly
- ✅ Work for all 100 games automatically
- ✅ Adapt to 2/3/6/9-max formats
- ✅ Feature heartbeat audio with screen pulse
- ✅ Show game titles dynamically
- ✅ Display 6 character avatars
- ✅ Position hero with gold boxes perfectly centered

**Ready for next session implementation!**
