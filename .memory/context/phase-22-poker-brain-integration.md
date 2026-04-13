# Phase 22: Poker Brain Integration — Heads-Up Training with AI Opponents

**Type:** CONTEXT
**Date Captured:** 2026-04-13
**Phase:** 22
**Related:** Phases 11-21 (GTO Wizard Parity), Horse System, Poker Brain Engine

---

## Summary

Integrated the poker brain decision engine into the heads-up PvP training system. When a player starts a heads-up match and no real opponent joins within 7 seconds, one of 300+ horse AI personalities seamlessly fills the seat. **The player never knows the opponent is AI** — the horse's existing profile (name, avatar, rating) is presented identically to a real player.

## What Was Built

### `/api/training/horse-opponent` (New File)
- **GET** — Selects a random active horse from `content_authors` + `horse_personality` tables
- Returns player-looking profile (name, avatar, rating, tier) + internal `_engine` personality config
- **POST** — Accepts game state, returns GTO-informed decision modulated by horse personality
- Personality modulation: aggression → wider raise ranges + bigger bets, risk profile → fold/raise thresholds, GTO philosophy → balance vs exploitation, contrarian → surprise plays
- Human-like think time: 1-6 second range with natural jitter, confidence-based speed variation
- LRU-cached preflop/postflop ranges, fallback pool if DB unavailable

### `pvp-lobby.js` (Modified)
- 7-second `MATCHMAKING_TIMEOUT_MS` constant
- Countdown timer visible during search ("SEARCHING (5s)")
- On timeout: fetches horse opponent from API, brief entrance delay, presents as "MATCH FOUND"
- No UI element reveals opponent is AI — same PlayerCard, same READY UP flow

### `PvPArena.tsx` (Modified)
- Accepts `matchedOpponent` + `opponentEngine` props
- When pre-matched from lobby, skips LOBBY view → starts IN_MATCH immediately
- All opponent display is neutral — no horse/AI styling or indicators

### `PvPMatchEngine.js` (Modified)
- Stores `_opponentEngine` internally for AI-driven decisions
- Returned in match results for backend analytics without client exposure

## Architecture Decision

**Why invisible AI opponents:**
The user explicitly requires that players never know they're playing against AI. The horses already have real-sounding names and full profiles in the database. The decision engine personality (aggression, GTO philosophy, risk tolerance) creates distinct playing styles that feel like different human opponents. Think time jitter prevents mechanical timing tells.

## Key Technical Details

- Horse profiles come from `content_authors` table (300+ active)
- Personality traits from `horse_personality` table (aggression_level, gto_philosophy, risk_tolerance, contrarian_tendency)
- Decision engine uses hand-tier classification (premium/strong/medium/speculative/weak) + equity-based postflop play
- Internal fields prefixed with `_` (e.g., `_engine`, `_opponentEngine`) — convention for "never render"
- Session saves include opponent ID for analytics but no AI flag in client-facing data

## Files Changed

- `pages/api/training/horse-opponent.js` — **CREATED**
- `pages/hub/training/pvp-lobby.js` — Modified
- `src/components/training/PvPArena.tsx` — Modified
- `src/engines/PvPMatchEngine.js` — Modified
- `SMARTER-POKER-BUILD-TRACKER.md` — Updated with Phase 22

## What's Next

- Complete remaining 34 partial/stub training pages
- Wire poker brain POST decisions into the actual PvPArena game loop (currently MatchView uses simulated scoring — needs real hand-by-hand decision calls)
- Add Supabase Realtime listener for actual real-player matchmaking (so the 7s timeout only fires when truly nobody joins)
