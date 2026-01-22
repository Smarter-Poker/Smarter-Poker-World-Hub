# Graphics Components Reference

Quick reference for the Card and Chip visual components.

## Card Component

### Location
`/src/components/training/Card.tsx` — 320 lines

### Basic Usage
```tsx
import Card, { CardGroup, parseCards } from '@/components/training/Card';

// Single card
<Card rank="A" suit="h" />

// Card with animation
<Card rank="K" suit="s" animate="deal" delay={0.2} />

// Highlighted card
<Card rank="Q" suit="d" highlighted />

// Face down
<Card rank="A" suit="c" faceDown />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rank` | string | required | A, K, Q, J, T, 9-2 |
| `suit` | string | required | h, d, s, c (or full name) |
| `faceDown` | boolean | false | Show card back |
| `size` | string | 'medium' | small, medium, large |
| `delay` | number | 0 | Animation delay in seconds |
| `animate` | string | 'slide' | flip, slide, deal, none |
| `highlighted` | boolean | false | Gold border highlight |
| `dimmed` | boolean | false | Reduce brightness |
| `onClick` | function | - | Click handler |

### Size Dimensions

| Size | Width | Height | Font |
|------|-------|--------|------|
| small | 45px | 63px | 12px |
| medium | 60px | 84px | 16px |
| large | 80px | 112px | 20px |

### CardGroup Component
```tsx
const cards = parseCards("AhKd");

<CardGroup
  cards={cards}
  size="medium"
  gap={8}
  stagger={0.1}
  animate="slide"
/>
```

### Utility Functions
```typescript
// Parse single card string
parseCardString("Ah") // → { rank: "A", suit: "h" }

// Parse multiple cards (handles various formats)
parseCards("AhKd")      // → [{ rank: "A", suit: "h" }, { rank: "K", suit: "d" }]
parseCards("Ah Kd Qc")  // → spaced format
parseCards("Ah,Kd,Qc")  // → comma format
```

---

## Chip Component

### Location
`/src/components/training/Chip.tsx` — 350 lines

### Basic Usage
```tsx
import Chip, { ChipStack, PotDisplay, BetIndicator } from '@/components/training/Chip';

// Single chip
<Chip amount={100} />

// Chip with size
<Chip amount={500} size="large" />

// Without amount display
<Chip amount={25} showAmount={false} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `amount` | number | required | Chip value (determines color) |
| `size` | string | 'medium' | small, medium, large |
| `showAmount` | boolean | true | Show amount in center |
| `animate` | boolean | true | Enable entrance animation |
| `delay` | number | 0 | Animation delay |
| `onClick` | function | - | Click handler |

### Chip Denominations

| Value | Color | Hex Code |
|-------|-------|----------|
| 1 | White | #FFFFFF |
| 5 | Red | #E53935 |
| 25 | Green | #43A047 |
| 100 | Black | #212121 |
| 500 | Purple | #7B1FA2 |
| 1000 | Orange | #FF8F00 |
| 5000 | Pink | #F06292 |
| 10000 | Gold | #FFD700 |

### ChipStack Component
```tsx
<ChipStack
  amount={5000}
  size="medium"
  maxChips={5}
  animate={true}
/>
```

Shows stacked chips with count based on amount:
- 500+: 2 chips
- 1000+: 3 chips
- 5000+: 4 chips
- 10000+: 5 chips

### PotDisplay Component
```tsx
<PotDisplay
  amount={1250}
  label="POT"
  size="medium"
  animate={true}
/>
```

Shows overlapping chips with pot label and amount below.

### BetIndicator Component
```tsx
<BetIndicator
  amount={300}
  position="bottom"  // top, bottom, left, right
  size="small"
  animate={true}
/>
```

Compact chip + amount for showing player bets.

### Size Dimensions

| Size | Diameter | Font | Stack Offset |
|------|----------|------|--------------|
| small | 32px | 10px | 2px |
| medium | 48px | 14px | 3px |
| large | 64px | 18px | 4px |

---

## Animation Types

### Card Animations
```typescript
// Slide in from top
animate="slide"  // opacity: 0→1, y: -50→0

// Deal from deck
animate="deal"   // x: 100→0, y: -100→0, rotate: -20→0

// Flip reveal
animate="flip"   // rotateY: 180→0

// No animation
animate="none"
```

### Chip Animations
- Spring-based entrance (scale 0.5→1, y: 20→0)
- Stagger delay for stacks (0.05s per chip)
- Hover: scale 1.1, y: -5
- Tap: scale 0.95

---

## Integration Examples

### Hole Cards Display
```tsx
const holeCards = parseCards(handData.heroCards);

<div style={{ display: 'flex', gap: 8 }}>
  {holeCards.map((card, i) => (
    <Card
      key={i}
      rank={card.rank}
      suit={card.suit}
      size="large"
      animate="deal"
      delay={i * 0.15}
    />
  ))}
</div>
```

### Board Display
```tsx
const boardCards = parseCards(handData.board);

<CardGroup
  cards={boardCards}
  size="medium"
  gap={4}
  stagger={0.2}
  animate="slide"
/>
```

### Player Stack
```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
  <ChipStack amount={playerStack} size="small" />
  <span>{formatAmount(playerStack)} BB</span>
</div>
```

### Pot in Center
```tsx
<PotDisplay
  amount={potSize}
  label="POT"
  size="medium"
/>
```
