---
name: Online Poker Flow
description: Expert knowledge on online poker hand display, replay systems, and visual UX patterns. Use when building poker table UIs, hand replay features, or training scenarios.
---

# Online Poker Flow — Visual & UX Expert Skill 🎰

> **Master Authority for Poker Hand Display, Replay Systems, and Table Visualization**

---

## 🎯 When to Use This Skill

Use this skill when:
- Building poker table UIs
- Implementing hand replay features
- Designing training scenario displays
- Creating betting/action visualizations
- Implementing card display systems

---

## 📐 Table Layout Standards

### Portrait Oval Table (Mobile-First)
```
┌─────────────────────────────────────┐
│        [Empty] [Opp2] [Empty]       │  ← Top: Opponents
│                                     │
│    [Opp1]    [POT: 367.50]  [Opp3] │  ← Pot centered
│              ════════════          │
│              │ BOARD  │            │  ← Community cards
│              ════════════          │
│    [Active]            [Active]    │  ← Active players
│                                     │
│            ┌───┐ ┌───┐             │
│            │ A │ │ K │             │  ← Hero cards (LARGEST)
│            │ ♠ │ │ ♣ │             │
│            └───┘ └───┘             │
│          [-KingFish-]              │
│           1,242.50                 │
│     ◀◀    ▶/❚❚    ▶▶              │  ← Replay controls
└─────────────────────────────────────┘
```

### Key Layout Rules:
1. **Hero always at bottom center** — largest cards, closest to action buttons
2. **Pot display centered at top** — primary focal point
3. **Community cards in center** — horizontal row
4. **Opponents distributed around perimeter**
5. **Replay controls at bottom footer**

---

## 🎨 Action Tag System (CRITICAL!)

The **color-coded speech bubble** method is the most effective UX pattern for showing actions at a glance.

### Color Coding Standard:

| Color | CSS Value | Actions | Emotional Signal |
|-------|-----------|---------|-----------------|
| 🟢 **Green** | `#22c55e` | Call, Post Blind | Passive - "I'm staying" |
| 🟡 **Yellow** | `#eab308` | Raise, Bet | Aggressive - "I'm attacking" |
| 🟣 **Purple** | `#a855f7` | All-In | Maximum pressure |
| 🔵 **Blue** | `#3b82f6` | Check, BB/SB | Neutral - "Passing action" |
| ⚪ **Gray** | `#6b7280` | Fold | Exit - "I'm out" |

### Implementation Pattern:
```jsx
const ACTION_COLORS = {
  call: { bg: '#22c55e', text: '#fff', label: 'Call' },
  raise: { bg: '#eab308', text: '#000', label: 'Raise' },
  bet: { bg: '#eab308', text: '#000', label: 'Bet' },
  allIn: { bg: '#a855f7', text: '#fff', label: 'All In' },
  check: { bg: '#3b82f6', text: '#fff', label: 'Check' },
  fold: { bg: '#6b7280', text: '#fff', label: 'Fold' },
  post: { bg: '#22c55e', text: '#fff', label: 'Post' },
};

// Action tag component
const ActionTag = ({ action }) => (
  <div style={{
    backgroundColor: ACTION_COLORS[action].bg,
    color: ACTION_COLORS[action].text,
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    position: 'absolute',
    top: '-20px',
    left: '50%',
    transform: 'translateX(-50%)',
  }}>
    {ACTION_COLORS[action].label}
  </div>
);
```

---

## 🎴 4-Color Deck Standard

**ALWAYS use 4-color decks for maximum visual clarity:**

| Suit | Symbol | Color | Hex |
|------|--------|-------|-----|
| Spades | ♠ | **Black** | `#1a1a1a` |
| Hearts | ♥ | **Red** | `#ef4444` |
| Clubs | ♣ | **Green** | `#22c55e` |
| Diamonds | ♦ | **Blue** | `#3b82f6` |

### Implementation:
```jsx
const SUIT_COLORS = {
  s: { color: '#1a1a1a', symbol: '♠' }, // Spades - Black
  h: { color: '#ef4444', symbol: '♥' }, // Hearts - Red
  c: { color: '#22c55e', symbol: '♣' }, // Clubs - Green
  d: { color: '#3b82f6', symbol: '♦' }, // Diamonds - Blue
};
```

---

## 📏 Card Size Hierarchy

### Three Tiers of Card Sizes:

| Tier | Purpose | Relative Size | Position |
|------|---------|---------------|----------|
| **Hero Cards** | Player's hole cards | 100% (largest) | Bottom center, tilted |
| **Community Cards** | Board (flop/turn/river) | 70% | Center of table |
| **Opponent Cards** | Other players' cards | 50% (smallest) | Near their avatars |

### Card States:
- **Face Down**: Show card backs (blue pattern)
- **Face Up**: Show rank + suit with 4-color system
- **Mucked**: Slide-away animation when folding
- **Winner Highlight**: Glow effect on winning hand

---

## 💰 Betting Display System

### Pot Display:
```jsx
// Pot at top center
<div className="pot-display">
  <span className="pot-label">POT</span>
  <span className="pot-amount">367.50</span>
</div>
```
- Label: White "POT" text
- Amount: Large gold/amber numbers (`#f59e0b`)
- Position: Top-center of table

### Stack Sizes:
- Color: Gold (`#f59e0b`) for prominence
- Format options: Actual chips or Big Blinds (BB)
- Position: Below player name

### Chip Animations:
1. Betting: Chips appear in front of player
2. Street complete: Chips slide to center pot
3. Winner: Chips animate from pot to winner's stack

---

## 🎬 Hand Replay Controls

### Standard Control Bar:
```
┌──────────────────────────────────────────┐
│  🔗      ◀◀       ▶/❚❚      ▶▶          │
│ Share   Back     Play/     Forward      │
│         Step     Pause     Step         │
└──────────────────────────────────────────┘
```

### Control Functions:
| Icon | Action | Function |
|------|--------|----------|
| 🔗 | Share | Copy replay URL |
| ◀◀ | Back | Step back one action |
| ▶ | Play | Auto-play through hand |
| ❚❚ | Pause | Pause auto-play |
| ▶▶ | Forward | Step forward one action |

### Street Timeline:
1. **Preflop** → Blinds posted, hole cards dealt
2. **Flop** → 3 community cards (animate deal)
3. **Turn** → 4th card (animate deal)
4. **River** → 5th card (animate deal)
5. **Showdown** → Winner determination

---

## 👤 Player Avatar Display

### Component Structure:
```jsx
<div className="player-seat">
  {/* Avatar image */}
  <img src={avatar} className="avatar-circle" />
  
  {/* Action tag (appears above) */}
  <ActionTag action={currentAction} />
  
  {/* Position badge (D, SB, BB) */}
  <PositionBadge position={seatPosition} />
  
  {/* Info box below avatar */}
  <div className="player-info">
    <span className="player-name">{name}</span>
    <span className="stack-size">{stack}</span>
  </div>
  
  {/* Bet amount in front of player */}
  {currentBet > 0 && <BetChips amount={currentBet} />}
</div>
```

### Position Badges:
| Badge | Meaning | Style |
|-------|---------|-------|
| **D** | Dealer | White circle |
| **SB** | Small Blind | Blue badge |
| **BB** | Big Blind | Blue badge |

---

## 🏆 Winner Determination Display

### Showdown Animation Sequence:
1. Final betting completes
2. Remaining players' cards flip face-up
3. Winning hand highlighted (glow effect)
4. Losing hands dimmed
5. Chips animate from pot to winner
6. "Winner" banner displays

### Winner Visual Effects:
```css
.winning-cards {
  filter: brightness(1.2);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
  animation: winner-pulse 1s ease-in-out;
}

.losing-cards {
  filter: brightness(0.5);
  opacity: 0.6;
}

@keyframes winner-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

---

## 📱 Mobile-First Principles

### Layout Priority (Top to Bottom):
1. **Top**: Opponent avatars, empty seats
2. **Center-Top**: Pot display
3. **Center**: Community cards (board)
4. **Center-Bottom**: Active players with action tags
5. **Bottom**: Hero cards + controls

### Touch Optimization:
- Action buttons within thumb reach (bottom 1/3)
- Minimum touch target: 44x44px
- Swipe gestures for navigation

---

## 🔧 Quick Reference: CSS Variables

```css
:root {
  /* Action Colors */
  --action-call: #22c55e;
  --action-raise: #eab308;
  --action-allin: #a855f7;
  --action-check: #3b82f6;
  --action-fold: #6b7280;
  
  /* Suit Colors (4-color deck) */
  --suit-spades: #1a1a1a;
  --suit-hearts: #ef4444;
  --suit-clubs: #22c55e;
  --suit-diamonds: #3b82f6;
  
  /* Stack/Pot Colors */
  --stack-gold: #f59e0b;
  --pot-label: #ffffff;
  
  /* Table Colors */
  --felt-green: #0d4d2c;
  --felt-blue: #1e3a5f;
  --table-rim: #d4af37;
}
```

---

## 📚 Reference Materials

- **Source Study**: PokerBros hand replay (`https://s.pokerbros.net/`)
- **Related Skills**: Poker Table UI, Training Games Engine, Futuristic Metal UI
- **Industry Standards**: PokerStars, GGPoker, PokerBros visual patterns

---

*Skill Created: February 3, 2026*
*Based on live analysis of PokerBros hand replay system*
