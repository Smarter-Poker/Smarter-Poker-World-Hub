# ChartGrid Component Reference

Quick reference for the `ChartGrid.tsx` CHART engine component.

## Location
`/src/components/training/ChartGrid.tsx` — 580 lines

## Usage
```tsx
import ChartGrid from '@/components/training/ChartGrid';

<ChartGrid
  chartType="push_fold"
  heroPosition="BTN"
  stackBB={15}
  villainPosition="BB"
  highlightHand="AKs"
  phase={chartPhase}
  resultFeedback={chartFeedback}
  onAction={(action, hand) => handleChartAction(action, hand)}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `chartType` | string | `push_fold`, `call_shove`, `open_raise`, `3bet_or_fold` |
| `heroPosition` | string | `BTN`, `CO`, `HJ`, `SB`, `BB`, etc. |
| `stackBB` | number | Stack size in big blinds |
| `villainPosition` | string | Optional - for vs-specific charts |
| `highlightHand` | string | Hand to highlight as the question (e.g., `AKs`) |
| `phase` | string | `SELECT_HAND`, `SELECT_ACTION`, `SHOWING_RESULT` |
| `resultFeedback` | object | `{ hand, isCorrect, correctAction }` |
| `onAction` | function | `(action: string, hand: string) => void` |

## Grid Layout

```
    A  K  Q  J  T  9  8  7  6  5  4  3  2
A  [AA][AKs]...                          ← Suited (above diagonal)
K  [AKo][KK]...                          ← Offsuit (below diagonal)
Q  ...      [QQ]
...              ↘ Pairs (diagonal)
```

## Chart Types & Actions

| chartType | Available Actions |
|-----------|-------------------|
| `push_fold` | PUSH, FOLD |
| `call_shove` | CALL, FOLD |
| `open_raise` | RAISE, FOLD |
| `3bet_or_fold` | 3BET, CALL, FOLD |

## Visual States

| State | Appearance |
|-------|------------|
| Neutral | Hand type gradient (pairs=purple, suited=blue, offsuit=dark) |
| Highlight | Gold border + glow + 1.15x scale |
| Selected | Cyan border |
| Correct | Green background + checkmark |
| Wrong | Red background + X mark |

## Position Colors

```javascript
const POSITION_COLORS = {
  'BTN': '#00D4FF',
  'CO': '#4CAF50',
  'HJ': '#8BC34A',
  'SB': '#FF9800',
  'BB': '#FF5722',
  'UTG': '#9C27B0',
};
```
