# RoundSummary Component Reference

Quick reference for the `RoundSummary.tsx` post-game victory/defeat modal.

## Location
`/src/components/training/RoundSummary.tsx` — 980 lines

## Usage
```tsx
import RoundSummary from '@/components/training/RoundSummary';

<RoundSummary
  isOpen={true}
  passed={true}
  level={3}
  passingGrade={89}
  stats={{
    handsPlayed: 20,
    correctAnswers: 18,
    accuracy: 90,
    finalHealth: 60,
    xpEarned: 350,
    timeElapsed: 245,
    blunders: [...],
    streakBest: 8,
    perfectHands: 12,
  }}
  gameName="Preflop Master"
  onNextLevel={() => navigateToNextLevel()}
  onRetry={() => restartLevel()}
  onExit={() => goToMenu()}
  onReviewHand={(blunder) => openHandReview(blunder)}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | boolean | Controls modal visibility |
| `passed` | boolean | True if player met passing grade |
| `level` | number | Current level (1-10) |
| `passingGrade` | number | Required % to pass this level |
| `stats` | SessionStats | Complete session statistics |
| `gameName` | string | Display name of the game |
| `onNextLevel` | function | Called when "Next Level" clicked |
| `onRetry` | function | Called when "Try Again" clicked |
| `onExit` | function | Called when "Exit to Menu" clicked |
| `onReviewHand` | function? | Optional callback to review a blunder |

## SessionStats Interface

```typescript
interface SessionStats {
  handsPlayed: number;       // Total hands in session (usually 20)
  correctAnswers: number;    // Number of correct decisions
  accuracy: number;          // Percentage (0-100)
  finalHealth: number;       // Remaining HP (0-100)
  xpEarned: number;          // Base XP from correct answers
  xpBonus?: number;          // Bonus XP (perfect bonus, etc.)
  timeElapsed: number;       // Seconds to complete
  blunders: BlunderData[];   // All mistakes made
  streakBest?: number;       // Longest correct streak
  perfectHands?: number;     // Hands with no damage
}
```

## BlunderData Interface

```typescript
interface BlunderData {
  handNumber: number;    // Which hand (1-20)
  heroHand: string;      // Player's hole cards
  board?: string;        // Community cards if applicable
  userAction: string;    // What player chose
  correctAction: string; // What was correct
  evLoss: number;        // EV loss in BB
  damage: number;        // HP damage taken
}
```

## Animation Phases

The modal reveals content in 5 phases with staggered delays:

| Phase | Delay | Elements Shown |
|-------|-------|----------------|
| 0 | 0ms | Modal container entrance |
| 1 | 300ms | Score circle with ring animation |
| 2 | 1500ms | Stats grid (4 boxes) + XP bar |
| 3 | 2500ms | Top 3 Blunders section |
| 4 | 3500ms | Action buttons |

## Confetti System

On pass, 80 confetti particles animate from top to bottom:

```typescript
const CONFETTI_COLORS = ['#FFD700', '#FF6B35', '#00D4FF', '#4CAF50', '#9C27B0'];
// Gold, Orange, Cyan, Green, Purple

// Each piece has:
// - Random X position (0-100vw)
// - Random delay (0-0.5s)
// - Random duration (2-4s)
// - Random rotation (-360 to +360 degrees)
```

## Visual States

### Passed
- Header: Gold gradient background
- Icon: Trophy (🏆)
- Title: "LEVEL CLEARED!"
- Score ring: Green (#4CAF50)
- Confetti: Active
- Primary button: "Next Level"

### Failed
- Header: Red gradient background
- Icon: Flexed arm (💪)
- Title: "KEEP TRAINING"
- Score ring: Red (#F44336)
- Confetti: None
- Primary button: "Try Again"

## Blunder Cards

Top 3 blunders sorted by damage (highest first):

| Rank | Badge Color | Label |
|------|-------------|-------|
| 1 | #F44336 (Red) | WORST |
| 2 | #FF9800 (Orange) | 2ND |
| 3 | #FFC107 (Yellow) | 3RD |

Each card shows:
- Hand number and cards
- Board (if applicable)
- User's action (red) vs Correct action (green)
- HP damage taken
- Click to review (if `onReviewHand` provided)

## XP Breakdown

```
⭐ XP EARNED
   +350           ← Base XP (animated count)
   PERFECT BONUS  ← Shows if perfectHands > 0
   +60            ← perfectHands * 5

   Total: 410 XP
```

## Streak Badge

If `streakBest > 3`, a floating badge appears:

```
🔥 8 Hand Streak!
```

Positioned at top-right of modal with orange gradient.

## Styling Constants

```typescript
// Pass colors
const PASS_GRADIENT = 'linear-gradient(135deg, #FFD700, #FFA500)';
const PASS_RING = '#4CAF50';
const PASS_BORDER = '#FFD700';

// Fail colors
const FAIL_GRADIENT = 'linear-gradient(135deg, #F44336, #D32F2F)';
const FAIL_RING = '#F44336';
const FAIL_BORDER = '#F44336';

// Stats
const STAT_VALUE_COLOR = '#00D4FF';
const XP_COLOR = '#FFD700';
```

## Button Hierarchy

### On Pass:
1. **Next Level** (Primary) - Green gradient, large
2. **Practice Again** (Secondary) - Ghost style
3. **Exit to Menu** (Tertiary) - Transparent

### On Fail:
1. **Try Again** (Primary) - Cyan gradient, large
2. **Exit to Menu** (Tertiary) - Transparent

## Integration Notes

1. **GameArena calls RoundSummary** when `showComplete` is true
2. **Stats are calculated** via `calculateStats()` which includes blunders sorted by damage
3. **Blunders are collected** during `submitAction()` when `result.isCorrect === false`
4. **Streak tracking** updates on each correct/incorrect answer
5. **Perfect bonus** = `perfectHands * 5` XP
