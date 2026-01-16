# 🎲 Player Position Layouts - Visual Reference

## **All Table Formats**

Hero is ALWAYS at bottom center (⭐). Villains are numbered 1-8.

---

## **2-MAX (Heads Up)**
*Used by: mtt-015, adv-007*

```
         1️⃣ Villain 1
          (Top)







         ⭐ HERO
         (Bottom)
```

---

## **3-MAX (Spins)**
*Used by: All 10 Spins games + mtt-014*

```
         1️⃣ Villain 1
          (Top)





                        2️⃣ Villain 2
                         (Right)



         ⭐ HERO
         (Bottom)
```

---

## **6-MAX (Cash - APPROVED DESIGN)**
*Used by: All 25 Cash games + Most Psychology/Advanced*

```
         1️⃣ Villain 1
          (Top Center)


  4️⃣                         2️⃣
  Villain 4                Villain 2
  (Left Upper)             (Right Upper)





  3️⃣
  Villain 3
  (Left Lower)




         ⭐ HERO
         (Bottom Center)
```

**Exact Positions (CSS)**:
```javascript
[
  { top: '5%',  left: '50%', name: 'Villain 1 (Top Center)' },
  { top: '20%', left: '85%', name: 'Villain 2 (Right Upper)' },
  { top: '55%', left: '15%', name: 'Villain 3 (Left Lower)' },
  { top: '20%', left: '15%', name: 'Villain 4 (Left Upper)' }
]
```

---

## **9-MAX (MTT Full Ring)**
*Used by: 23 MTT games + 3 Psychology live games*

```
         1️⃣ Villain 1
          (Top Center)

  8️⃣                 2️⃣
  Villain 8         Villain 2
  (Left Upper)      (Top Right)


  7️⃣                   3️⃣
  Villain 7           Villain 3
  (Left Middle)       (Right Upper)


  6️⃣                   4️⃣
  Villain 6           Villain 4
  (Left Lower)        (Right Lower)


      5️⃣
      Villain 5
      (Bottom Right)


         ⭐ HERO
         (Bottom Center)
```

**Exact Positions (CSS)**:
```javascript
[
  { top: '5%',  left: '50%', name: 'Villain 1 (Top Center)' },
  { top: '10%', left: '75%', name: 'Villain 2 (Top Right)' },
  { top: '30%', left: '85%', name: 'Villain 3 (Right Upper)' },
  { top: '50%', left: '85%', name: 'Villain 4 (Right Lower)' },
  { top: '70%', left: '75%', name: 'Villain 5 (Bottom Right)' },
  { top: '70%', left: '25%', name: 'Villain 6 (Bottom Left)' },
  { top: '50%', left: '15%', name: 'Villain 7 (Left Lower)' },
  { top: '30%', left: '15%', name: 'Villain 8 (Left Upper)' }
]
```

---

## **Avatar Cycling Pattern**

Villains cycle through these characters in order:

```
Villain 1 → 🦈 Shark
Villain 2 → 🐙 Octopus  
Villain 3 → 🐢 Turtle
Villain 4 → 🦀 Crab
Villain 5 → 🪼 Jellyfish
Villain 6 → 🦈 Shark (repeats)
Villain 7 → 🐙 Octopus
Villain 8 → 🐢 Turtle
```

**Hero is always**: 🐟 Fish (100px, gold border)

---

## **Size Reference**

```
┌──────────────┐
│              │
│   VILLAIN    │  70px × 70px
│   (Shark)    │  2px white border
│              │
└──────────────┘


┌─────────────────────┐
│                     │
│                     │
│       HERO          │  100px × 100px
│       (Fish)        │  3px gold border
│                     │
│                     │
└─────────────────────┘
```

---

## **Game Format Distribution**

### **By Player Count**
```
2-max: ██ (2 games)
3-max: ███████████ (11 games)
6-max: ████████████████████████████████ (64 games) ← Most common
9-max: ███████████████████ (23 games)
```

### **By Category**
```
Cash (25):          All 6-max ✅
MTT (25):           Mostly 9-max (23), plus 1×3-max, 1×2-max
Spins (10):         All 3-max ✅
Psychology (20):    Mostly 6-max (17), plus 3×9-max for live games
Advanced (20):      Mostly 6-max (19), plus 1×2-max for theory
```

---

## **Stack & Name Display**

Each player shows:
```
┌────────────┐
│   Avatar   │
├────────────┤
│ Villain 1  │ ← Name (10px font)
├────────────┤
│   20 BB    │ ← Stack (12px font, green)
└────────────┘
```

**Hero shows**:
```
┌────────────┐
│   Avatar   │
├────────────┤
│    Hero    │ ← Name in gold box
├────────────┤
│  ?? BB     │ ← Stack from scenario (gold box)
└────────────┘
```

---

## **Responsive Behavior**

All positions use **percentage positioning**:
- Container scales with screen size
- Player positions maintain relative placement
- Works on mobile, tablet, desktop
- No hardcoded pixel positions (except avatar sizes)

---

## **Testing Each Layout**

### **Quick Test URLs**
```bash
# 2-max
/hub/training/play/mtt-015

# 3-max  
/hub/training/play/spins-001

# 6-max
/hub/training/play/cash-001

# 9-max
/hub/training/play/mtt-001
```

### **Expected Behavior**
1. Players fade in sequentially (0.1s delay each)
2. Avatars cycle correctly (shark → octopus → etc.)
3. Names display as "Villain 1", "Villain 2"
4. Stacks show "20 BB" (placeholder)
5. Hero fish avatar at bottom (100px)

---

## **Customization**

Want to adjust positions? Edit `getPlayerPositions()` function:

```javascript
// Example: Move Villain 1 slightly lower in 6-max
if (playerCount === 6) {
  return [
    { top: '8%', left: '50%', ... }, // Changed from 5% to 8%
    // ... rest unchanged
  ];
}
```

---

**Reference**: Lines 59-104 in `/pages/hub/training/play/[gameId].js`
