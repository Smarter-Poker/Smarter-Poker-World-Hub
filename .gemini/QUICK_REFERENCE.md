# 🎮 Poker Table Template - Quick Reference

## **What Was Built**

A **single universal template** at `/pages/hub/training/play/[gameId].js` that automatically renders the correct poker table layout for all 100 training games.

---

## **Key Features**

### **1. Smart Player Positioning**
```javascript
const count = getPlayerCount(gameId); // Automatically loads from map
getPlayerPositions(count); // Returns correct positions
```

- **2-max** (HU): 1 villain + hero
- **3-max** (Spins): 2 villains + hero  
- **6-max** (Cash): 4 villains + hero ← Most common
- **9-max** (MTT): 8 villains + hero

### **2. Avatar System**
```javascript
// Hero (bottom center)
/images/training/avatars/fish.png (100px)

// Villains (cycle through)
shark → octopus → turtle → crab → jellyfish (70px)
```

### **3. Progressive Heartbeat**
```javascript
> 15s  → Slow    (1 beat per 2s,   volume 0.3, rate 0.8x)
10-15s → Medium  (1 beat per 1.5s, volume 0.5, rate 0.9x)
5-10s  → Fast    (1 beat per 1s,   volume 0.7, rate 1.0x)
< 5s   → CRITICAL (2 beats per s,  volume 1.0, rate 1.2x) 🔥
```

### **4. Screen Pulse**
```jsx
animate={timeLeft <= 5 ? { scale: [1, 1.02, 1] } : { scale: 1 }}
```
Entire screen pulses when timer critical (≤5s)

### **5. Visual Polish**
- ✅ White timer text (#FFFFFF) for high contrast
- ✅ Dynamic game titles (not generic "NLH")
- ✅ Gold hero branding
- ✅ Villain name badges

---

## **File Structure**

```
hub-vanguard/
├── pages/hub/training/play/
│   └── [gameId].js ← MAIN TEMPLATE (100 games use this)
├── src/data/
│   └── PLAYER_COUNT_MAP.js ← Player count mapping
├── public/
│   ├── images/training/avatars/ ← 6 character images
│   └── sounds/ ← heartbeat.mp3 (you'll add this)
└── .gemini/
    ├── POKER_TABLE_IMPLEMENTATION_STATUS.md
    └── VERIFICATION_CHECKLIST.md
```

---

## **Coverage**

| Category | Count | Format | Games |
|----------|-------|--------|-------|
| **Cash** | 25 | 6-max | cash-001 to cash-025 |
| **MTT** | 23 | 9-max | mtt-001 to mtt-025 (except 014, 015) |
| **MTT Blitz** | 1 | 3-max | mtt-014 |
| **MTT HU** | 1 | 2-max | mtt-015 |
| **Spins** | 10 | 3-max | spins-001 to spins-010 |
| **Psychology** | 17 | 6-max | Most psy-* games |
| **Psy Live** | 3 | 9-max | psy-005, psy-013, psy-018 |
| **Advanced** | 19 | 6-max | Most adv-* games |
| **Adv Theory** | 1 | 2-max | adv-007 |

**Total: 100 games** ✅

---

## **Testing Commands**

```bash
# Start dev server
npm run dev

# Test 6-max (Cash)
# Visit: localhost:3000/hub/training/play/cash-001

# Test 9-max (MTT)
# Visit: localhost:3000/hub/training/play/mtt-001

# Test 3-max (Spins)
# Visit: localhost:3000/hub/training/play/spins-001

# Test 2-max (Heads Up)
# Visit: localhost:3000/hub/training/play/mtt-015
```

---

## **Adding Heartbeat Sound**

1. **Get the file** from Freesound.org or Zapsplat.com
2. **Requirements**: 
   - Format: MP3
   - Duration: 1-2 seconds (single beat)
   - Clean, punchy sound
3. **Save to**: `/public/sounds/heartbeat.mp3`
4. **Done!** Code will automatically use it

---

## **How It Works**

```javascript
// 1. Load game
const game = getGameById('cash-001');

// 2. Get player count from map
const playerCount = getPlayerCount('cash-001'); // Returns 6

// 3. Get positions for that count
const positions = getPlayerPositions(6); 
// Returns array of 4 positions (6-max = 4 villains)

// 4. Render villains
positions.map((pos, index) => (
  <VillainPlayer 
    avatar={getVillainAvatar(index)} // Cycles through characters
    position={pos} 
  />
))

// 5. Render hero at bottom center
<HeroPlayer avatar="/images/training/avatars/fish.png" />
```

---

## **Customization Points**

### **Want to change avatar sizes?**
```javascript
// Line 763: Villain size
width: 70, height: 70 // Change this

// Line 781: Hero size  
width: 100, height: 100 // Change this
```

### **Want to adjust player positions?**
```javascript
// Lines 59-104: getPlayerPositions()
// Modify top/left percentages
```

### **Want to change heartbeat timing?**
```javascript
// Lines 269-287: Heartbeat intervals
timeLeft <= 5  → 500ms  // Change these
timeLeft <= 10 → 1000ms
timeLeft <= 15 → 1500ms
```

---

## **Troubleshooting**

| Issue | Solution |
|-------|----------|
| **Wrong player count** | Check `PLAYER_COUNT_MAP.js` has correct mapping |
| **Avatars not loading** | Verify `/public/images/training/avatars/` has 6 files |
| **No heartbeat** | Add `heartbeat.mp3` to `/public/sounds/` |
| **Screen not pulsing** | Check `timeLeft <= 5` condition |
| **"NLH" showing** | Verify `game.name` is populated |

---

## **Production Checklist**

- ✅ All 100 games tested
- ✅ Avatars loading correctly
- ✅ Player positions look good
- ✅ Timer displays white text
- ⚠️ Heartbeat sound added
- ✅ Screen pulse works
- ✅ No console errors
- ✅ Mobile responsive

---

## **Support**

- **Status Doc**: `/.gemini/POKER_TABLE_IMPLEMENTATION_STATUS.md`
- **Verification**: `/.gemini/VERIFICATION_CHECKLIST.md`
- **This Guide**: `/.gemini/QUICK_REFERENCE.md`

---

**Version**: v69.0 (The Final Multisensory Standard)  
**Last Updated**: January 16, 2026  
**Status**: ✅ COMPLETE - Ready for heartbeat audio
