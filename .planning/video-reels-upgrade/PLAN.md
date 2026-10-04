# Phase 8 Plan: Search, Personalization, And Learning Loop

## Confirmed Baseline

Phase 7 is protected-merged and live through `c0203a75fffece1a40626a9bdf2afb2154d2c171`. Its shared player, card, cursor, feedback, accessibility, and mobile budgets remain the delivery foundation. Phase 8 owns UX-05 and SRCH-01 through SRCH-05 only.

## Wave 1: Search And Ranking Authority

1. Index only approved, currently playable titles, creators, concepts, chapters, and approved transcripts.
2. Support weighted full-text search with a durable optional vector embedding contract.
3. Rank by relevance, freshness, completion, saves, learning goals, explicit feedback, and bounded creator/topic diversity.
4. Always expose recommendation reasons and a chronological alternative.

## Wave 2: Study Continuity

1. Add owner-scoped study lists and items.
2. Persist timestamp continuation and completion through an authenticated RPC.
3. Connect each eligible Reel or Library video to its full lesson, related lessons, Geeves explanation, quiz, and verified training sandbox action.
4. Preserve the existing Watch Later and saved-Reel experience during the compatibility transition.

## Wave 3: Trustworthy Learning Measurement

1. Accept learning events only through the service boundary.
2. Reject anonymous, unverified-human, automated-profile, high-bot-score, stale, future, and duplicate-window events from organic ranking measurements.
3. Store bounded enumerated events without raw payloads, IP addresses, user agents, or URLs.

## Wave 4: Verification And Release

1. Run focused migration, API, client, hostile-state, migration-runner, lint, and connected Video/Reels tests.
2. Complete the exact production build and required protected checks.
3. Install the exact migration once and read back schema, grants, RLS, functions, trigger, indexes, and migration identity.
4. Protected-merge, wait for the Vercel Git deployment, verify exact live identity, public routes, semantic discovery, chronological fallback, and signed-out study-list refusal.

## Phase 8 Acceptance Gates

- Search never indexes rejected, unapproved, stale, restricted, private, or unavailable media.
- Semantic discovery is server authoritative and the Library client actually calls it.
- Study and continuation state are owner-scoped and use the new Phase 8 tables/RPC.
- Recommendation reasons and newest-first fallback are visible on mobile and desktop.
- Session seen state is bounded and ranking enforces source/topic diversity.
- Horse/automated profiles cannot influence organic ranking analytics.
- Focused tests, full connected suite, production build, required CI, protected merge, migration installation/readback, Vercel READY identity, and live behavior proof all pass.
