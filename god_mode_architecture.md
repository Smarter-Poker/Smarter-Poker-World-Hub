# SMARTER.POKER "GOD MODE" ENGINE SPECS

## 1. THE OBJECTIVE
We are building a playable Poker RPG with 100 Levels ("Games").
- **Structure:** User plays a "Round" of 20 hands.
- **Progression:** Level 1 (85% passing grade) -> Level 10 (100% passing grade).
- **Core Loop:** Pre-Hand Animation -> User Decision -> Active Villain (Simulated) -> Health Bar Update.

---

## 2. THE 3-ENGINE ARCHITECTURE (CRITICAL)

The app must route requests to 1 of 3 engines based on the Game Title:

### ENGINE A: 'PIO' (Postflop)
- **Source:** Supabase table `solved_spots_gold` (PioSolver files).
- **Isomorphism:** MUST randomly rotate suits (e.g., Spades -> Hearts) so the visual hand is unique.
- **Active Villain:** If hand continues, use Weighted RNG to determine Villain action.

### ENGINE B: 'CHART' (Preflop/ICM)
- **Source:** Static JSON Files (`charts.json`).
- **Logic:** Compare user input to static ranges. NO Solver calls.

### ENGINE C: 'SCENARIO' (Mental Game)
- **Source:** Hardcoded Scripts.
- **Logic:** Rigged RNG (e.g., Force Bad Beat) to measure Tilt.

---

## 3. DATA REQUIREMENTS

### User History Tracking
- Track `(file_id + suit_rotation_hash)`.
- A user must NEVER play the exact same visual hand twice.

### Health Bar System
- Start with 100 Chips.
- Blunders reduce chips based on EV Loss.

---

## 4. GAMIFICATION RULES

1. **Health Bar:** Users have a "Stack" (HP). Blunders reduce the stack based on EV Loss.
2. **Progression:** 20 Hands per Round. If score > Threshold, unlock next Level.
3. **Indifference:** If Solver strategy is Mixed (50/50), accept BOTH answers as correct.

---

## 5. GAME TITLE EXAMPLES (100 Total)

| # | Title | Engine | Focus |
|---|-------|--------|-------|
| 1 | Short Stack Ninja | CHART | Preflop push/fold |
| 2 | Tilt Control | SCENARIO | Mental game |
| 3 | Flop Texture Master | PIO | Postflop c-betting |
| ... | ... | ... | ... |

---

## 6. TECHNICAL IMPLEMENTATION

### Engine Router
```javascript
function routeToEngine(gameTitle) {
  const game = GAME_LIBRARY[gameTitle];
  switch (game.engine) {
    case 'PIO': return engineA_Postflop(game);
    case 'CHART': return engineB_Preflop(game);
    case 'SCENARIO': return engineC_Mental(game);
  }
}
```

### Suit Isomorphism (Engine A)
```javascript
function rotateSuits(hand, board, rotationKey) {
  const SUIT_MAP = {
    0: { s: 's', h: 'h', d: 'd', c: 'c' }, // No rotation
    1: { s: 'h', h: 'd', d: 'c', c: 's' }, // Rotate +1
    2: { s: 'd', h: 'c', d: 's', c: 'h' }, // Rotate +2
    3: { s: 'c', h: 's', d: 'h', c: 'd' }, // Rotate +3
  };
  // Apply rotation to ensure visual uniqueness
}
```

### Health Bar EV Loss
```javascript
function calculateChipLoss(evLoss, potSize) {
  // Scale EV loss to chip penalty
  const penalty = Math.ceil((evLoss / potSize) * 10);
  return Math.min(penalty, 25); // Max 25 chip loss per hand
}
```

---

> **READ THIS FILE FIRST** before working on the God Mode training system.
