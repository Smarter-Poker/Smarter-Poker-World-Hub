# GameArena Component Reference

Quick reference for the `GameArena.tsx` HUD wrapper component.

## Location
`/src/components/training/GameArena.tsx` — 850 lines

## Usage
```tsx
import GameArena from '@/components/training/GameArena';

<GameArena
  userId={currentUser.id}
  gameId="push-fold-mastery"
  gameName="Push/Fold Mastery"
  level={3}
  sessionId={session.id}
  onExit={() => router.back()}
  onLevelComplete={(stats) => handleComplete(stats)}
  onLevelFailed={() => handleFailed()}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | string | Current user ID |
| `gameId` | string | Game slug from registry |
| `gameName` | string | Display name |
| `level` | number | Current level (1-10) |
| `sessionId` | string | Optional session tracking ID |
| `onExit` | () => void | Called when user quits |
| `onLevelComplete` | (stats) => void | Called on successful completion |
| `onLevelFailed` | () => void | Called when HP reaches 0 |

## HUD Components

### HealthBar
```tsx
<HealthBar
  current={health}        // Current HP (0-100)
  max={STARTING_HEALTH}   // Max HP (100)
  showDamage={damage}     // Triggers floating indicator
  onDamageComplete={fn}   // Called after animation
/>
```

### HandCounter
```tsx
<HandCounter
  current={handNumber}    // Current hand (1-20)
  total={TOTAL_HANDS}     // Total hands (20)
  correctCount={correct}  // For accuracy display
/>
```

### XPDisplay
```tsx
<XPDisplay
  totalXP={totalXP}       // Running total
  recentXP={recentXP}     // For "+X" animation
/>
```

## Modals

### LevelFailedModal
Shown when `health <= 0`
- Retry button → resets session
- Exit button → returns to level selector

### SessionCompleteModal
Shown when `handNumber >= TOTAL_HANDS`
- Shows pass/fail based on accuracy vs passing grade
- Continue button (if passed)
- Retry button (if failed)

## Engine Routing

```tsx
{engineType === 'PIO' && <PIOEngine handData={currentHand} ... />}
{engineType === 'CHART' && <ChartGrid ... />}
{engineType === 'SCENARIO' && <MentalGym ... />}
```

## API Integration

### Fetch Hand
```javascript
POST /api/god-mode/fetch-hand
Body: { userId, gameId, level, sessionId }
Response: { engineType, handData, ... }
```

### Submit Action
```javascript
POST /api/god-mode/submit-action
Body: { userId, gameId, action, sizing?, selectedHand?, handData, engineType, level }
Response: { isCorrect, damage, feedback, xpEarned, ... }
```

## State Management

| State | Type | Purpose |
|-------|------|---------|
| `health` | number | Current HP (0-100) |
| `handNumber` | number | Current hand (1-20) |
| `correctCount` | number | Correct answers |
| `totalXP` | number | XP earned this session |
| `engineType` | string | Current engine (PIO/CHART/SCENARIO) |
| `currentHand` | object | Hand data from API |
| `chartPhase` | string | CHART engine state |
| `scenarioPhase` | string | SCENARIO engine state |

## Passing Grades

```javascript
const PASSING_GRADES = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100];
// Index 0 = Level 1, Index 9 = Level 10
```

## Health Color Thresholds

| HP % | Color |
|------|-------|
| > 60% | Green (#4CAF50) |
| 30-60% | Yellow (#FF9800) |
| < 30% | Red (#F44336) |
