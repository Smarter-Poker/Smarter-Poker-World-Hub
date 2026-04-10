# HUD Horse Brain Integration Plan

## Core Principle
**ZERO changes to the Horse Brain** (`src/lib/poker-engine/brain/*`). The Brain is a black box.
It receives a profileId, runs its full 32-module pipeline, and returns `{ action, delayMs }`.
All adaptation happens in three wrapper layers:

1. **API Route** (`pages/api/poker-brain/decide.js`) — server-side adapter
2. **Decision Bridge** (`src/lib/poker-brain/decision-bridge.js`) — client-side async caller
3. **HUD Component** (`src/components/poker-brain/HUD.jsx`) — async consumer + UI

## Architecture

```
[HUD OCR Detection] → cards, pot, stacks, position (client-side)
        ↓
[Decision Bridge] → confidence filtering, card format conversion (client-side)
        ↓ POST /api/poker-brain/decide
[API Route] → builds engineState, synthesizes legalActions (server-side)
        ↓ calls router.getDecision(userId, engineState, legalActions, tableConfig)
[Horse Brain] → FULL 32-module pipeline, GTO solver, personality (server-side, UNTOUCHED)
        ↓ returns { action: { type, amount? }, delayMs }
[API Route] → strips delayMs, maps action to HUD format, returns JSON
        ↓
[Decision Bridge] → adds client-side metadata (hand strength, texture, outs, SPR)
        ↓
[HUD Component] → displays recommendation popup, user clicks buttons
```

## How the Horse Brain Handles a Human Player

The Brain doesn't know or care if the profileId belongs to a horse or human:
- `router.getDecision(profileId, ...)` runs the SAME pipeline for everyone
- Module 8 (counter-exploit): queries `horse_opponent_reads` — returns empty for new human player, uses defaults
- Module 9 (threat intel): queries `horse_threat_intel` — returns null for unknown opponents, skips threat adjustments
- GTO solver: runs normally, no opponent dependency
- Personality overlay: applies based on profileId hash — works for any UUID
- Guardrails: position/equity-based, no identity dependency
- Tournament brain: ICM math only, no identity dependency

**Result**: The Brain gracefully degrades when tables are empty. GTO + guardrails + position-based modules still fire.
As the human plays more sessions, opponent data accumulates naturally and modules light up.

## What delayMs Means and Why We Ignore It

The Horse Brain returns `delayMs` so automated horses appear human-like (random pauses before acting).
For HUD mode, the human IS human — they create their own natural timing. We strip delayMs entirely.

## Phase 1: API Route Enhancement (decide.js) [DONE]

Already created. Translates OCR state to engineState, calls router.getDecision(), returns clean JSON.

**Enhancement needed**: Pass through more Horse Brain metadata (the Brain returns `{ action, delayMs }` 
but the action object may contain amount — ensure all fields pass through cleanly).

## Phase 2: Decision Bridge Async (decision-bridge.js) [DONE]

Already rewired to:
1. Get auth token from Supabase session
2. POST OCR state to /api/poker-brain/decide
3. Use Horse Brain result as PRIMARY decision
4. Fall back to local engine.js ONLY if API unreachable
5. Compute client-side metadata (hand strength, texture, outs, SPR, M-ratio)

## Phase 3: HUD.jsx Async Decision Flow [NEXT]

The decision computation (lines 1118-1188) currently calls `getBridgedDecision()` synchronously.
Now that it's async, the useEffect must handle:

1. **Await the Promise** — use an async IIFE inside the setTimeout
2. **Stale decision guard** — if the decision key changed while awaiting, discard the result
3. **Loading state** — show "Computing..." while Horse Brain is processing
4. **Error state** — if API fails, the bridge falls back to local engine (transparent to HUD)
5. **Race condition prevention** — use a generation counter so older responses don't overwrite newer ones

**Critical: The state machine `recordDecision()` and `setDecision()` calls happen AFTER await.**

## Phase 4: NOT NEEDED

The Horse Brain queries tables using the human player's profileId. If those tables are empty
(new player, no prior opponent reads), the Brain defaults gracefully. No seeding required.
Data accumulates naturally as the player uses the HUD across sessions.

## Phase 5: UI Enhancements (Optional, After Core Works)

- Show `source: 'horse_brain'` vs `'local_fallback'` indicator
- Show `engineMs` response time
- Show confidence level based on data availability
