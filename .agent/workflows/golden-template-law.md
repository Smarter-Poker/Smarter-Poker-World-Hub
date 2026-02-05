---
description: MANDATORY - Only use GoldenTemplateTable for all poker table UIs
---

# Golden Template Table Law

## ABSOLUTE RULE

**The `GoldenTemplateTable.jsx` component is the ONLY authorized poker table UI component.**

Location: `src/components/poker/GoldenTemplateTable.jsx`

## What This Means

1. **DO NOT** create new poker table components from scratch
2. **DO NOT** use SceneSeat, SceneCards, or other scene components for table layout
3. **ALWAYS** use `GoldenTemplateTable` as the base for any poker table display
4. **ONLY** modify and improve `GoldenTemplateTable.jsx` directly

## When Building Training/Scenario Players

```jsx
// CORRECT - Use GoldenTemplateTable
import GoldenTemplateTable from '@/components/poker/GoldenTemplateTable';

<GoldenTemplateTable
    players={players}
    heroCards={heroCards}
    communityCards={board}
    pot={potBB}
    dealerPosition={dealerSeatId}
    gameTitle={gameTitle}
/>
```

## Features of GoldenTemplateTable

- Large illustrated avatars (Wolf, Ninja, Wizard, Spartan, Pharaoh, Viking, Pirate, Cowboy, Fox)
- Racetrack table with layered gold rails
- Dark felt
- Gold name badges with stack sizes
- Community cards in center
- Hero cards on table
- Action buttons (Fold, Check, Call, Raise, All-In)
- Timer display
- Question counter

## Improvements Go HERE

All improvements to poker table UI go directly into:
- `src/components/poker/GoldenTemplateTable.jsx`

DO NOT create alternative implementations.
