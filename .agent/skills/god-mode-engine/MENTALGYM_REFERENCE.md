# MentalGym Component Reference

Quick reference for the `MentalGym.tsx` SCENARIO engine component.

## Location
`/src/components/training/MentalGym.tsx` — 520 lines

## Usage
```tsx
import MentalGym from '@/components/training/MentalGym';

<MentalGym
  scenarioId="tilt-control-001"
  scriptName="bad_beats"
  scenarioText="You just lost 3 buy-ins to coolers. What do you do?"
  situationContext="Session: -5 buy-ins. Time at table: 4 hours."
  choices={[
    { id: 'TILT', label: 'Express Frustration', icon: '😤', emotionalType: 'impulsive' },
    { id: 'BREATHE', label: 'Take a Deep Breath', icon: '🧘', emotionalType: 'rational' },
    { id: 'LEAVE', label: 'Leave the Table', icon: '🚪', emotionalType: 'passive' },
  ]}
  correctChoice="BREATHE"
  timeLimit={15}
  emotionalTrigger="tilt"
  phase={scenarioPhase}
  resultFeedback={scenarioFeedback}
  onChoice={(choiceId, timeRemaining) => handleChoice(choiceId, timeRemaining)}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `scenarioId` | string | Unique ID for tracking |
| `scriptName` | string | Script category (e.g., `bad_beats`, `big_pot`, `downswing`) |
| `scenarioText` | string | Main scenario narrative (displays as quote) |
| `situationContext` | string | Optional context line |
| `choices` | Choice[] | Array of choice options |
| `correctChoice` | string | ID of the correct choice |
| `timeLimit` | number | Seconds for decision (0 = no limit) |
| `riggedOutcome` | string | Optional warning text for rigged scenarios |
| `emotionalTrigger` | string | `tilt`, `fear`, `greed`, `impatience` |
| `phase` | string | `READING`, `DECIDING`, `SHOWING_RESULT` |
| `resultFeedback` | object | `{ choiceId, isCorrect, explanation, emotionalLesson }` |
| `onChoice` | function | `(choiceId: string, timeRemaining: number) => void` |

## Choice Object

```typescript
interface Choice {
  id: string;           // Unique identifier
  label: string;        // Button text
  icon: string;         // Emoji icon
  description?: string; // Optional subtext
  emotionalType?: 'impulsive' | 'rational' | 'passive' | 'aggressive';
}
```

## Emotional Triggers

| Trigger | Badge | Color |
|---------|-------|-------|
| `tilt` | TILT ALERT | #FF5722 |
| `fear` | FEAR TEST | #9C27B0 |
| `greed` | GREED CHECK | #FFD700 |
| `impatience` | PATIENCE TEST | #FF9800 |

## Timer Behavior

- Visual countdown bar with color transition
- **Urgent** (≤5s): Orange color
- **Critical** (≤3s): Red + pulsing animation
- **Expired** (0s): Auto-selects worst (impulsive) choice

## Feedback Structure

```typescript
interface ResultFeedback {
  choiceId: string;
  isCorrect: boolean;
  explanation: string;      // Why this was right/wrong
  emotionalLesson?: string; // Mental game takeaway
}
```

## Script Categories

| Script Name | Focus |
|-------------|-------|
| `bad_beats` | Handling coolers |
| `big_pot` | Large pot pressure |
| `downswing` | Extended losing streaks |
| `tilt_recovery` | Returning from tilt |
| `fear_of_loss` | Scared money situations |
| `greed_trap` | Overplaying winners |
