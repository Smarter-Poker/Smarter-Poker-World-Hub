---
name: Poker Table UI - Golden Smarter Table Law
description: MANDATORY - The GoldenTemplateTable is the ONLY authorized poker table UI. No exceptions.
---

# 🔒 GOLDEN SMARTER TABLE LAW (LOCKED)

## ABSOLUTE UNCHANGEABLE RULE

**The `GoldenTemplateTable.jsx` component is the ONE AND ONLY authorized poker table UI for ALL training pages, scenario players, and poker table displays.**

**Location:** `src/components/poker/GoldenTemplateTable.jsx`

---

## ⛔ PROHIBITED ACTIONS

1. **NEVER** create new poker table components from scratch
2. **NEVER** use SceneSeat, SceneCards, or other custom scene components for table layouts
3. **NEVER** implement alternative poker table designs
4. **NEVER** modify card positions without loading the Golden Template first
5. **NEVER** build training table UIs without importing GoldenTemplateTable

---

## ✅ MANDATORY BEFORE ANY TABLE WORK

Before editing ANY poker table or training page:

1. **VERIFY** the GoldenTemplateTable is imported and used
2. **LOAD** the page and confirm it matches the Golden Template design
3. **ONLY THEN** make adjustments to the GoldenTemplateTable.jsx itself

---

## GOLDEN TEMPLATE FEATURES (CANONICAL DESIGN)

The Golden Template includes these LOCKED features:

### Visual Elements
- **Large illustrated avatars** (Wolf, Ninja, Wizard, Spartan, Pharaoh, Viking, Pirate, Cowboy, Fox)
- **Racetrack table shape** with layered gold rails
- **Dark felt** with subtle gradient
- **Gold name badges** with player names and stack sizes
- **POT display** at top of felt

### Card Positions
- **Community cards** — Center of felt when dealt
- **Hero cards** — Bottom of table, attached to Hero position
- **Game title** — Center of felt when no community cards

### UI Elements
- **Action buttons** at bottom (Fold, Check, Call, Raise, All-In)
- **Timer** — Red square, bottom left
- **Question counter** — Bottom right

---

## CORRECT USAGE PATTERN

```jsx
// ✅ CORRECT — Always use GoldenTemplateTable
import GoldenTemplateTable from '@/components/poker/GoldenTemplateTable';

export default function MyTrainingPage() {
    return (
        <GoldenTemplateTable
            players={players}
            heroCards={heroCards}
            communityCards={board}
            pot={potBB}
            dealerPosition={dealerSeatId}
            gameTitle="ICM Fundamentals"
            timer={15}
            questionNumber={1}
            totalQuestions={20}
        />
    );
}
```

```jsx
// ❌ WRONG — Never create custom table components
import SceneSeat from './SceneSeat';  // PROHIBITED
import SceneCards from './SceneCards';  // PROHIBITED
// Building custom table layout... // PROHIBITED
```

---

## IMPROVEMENTS GO HERE

All poker table improvements MUST be made directly to:

**`src/components/poker/GoldenTemplateTable.jsx`**

DO NOT create alternative implementations. DO NOT build from scratch.

---

## ENFORCEMENT

This skill is **LOCKED** and **UNCHANGEABLE**. Any agent must follow this law before touching any poker table UI code.

**Violation of this law = Invalid work product**
