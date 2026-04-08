# PLO5 & PLO6 Optimal Strategy Plan for Horse AI Players

## Research Summary

Based on deep research from PLO Genius, Run It Once, CardQuant, PLO Mastermind, KKPoker (Jon Kyte), and other expert sources, PLO5 and PLO6 play FUNDAMENTALLY differently from PLO4. The current engine treats them as "PLO4 with more cards" — this is wrong and must be fixed.

---

## PART 1: PLO5 (5-Card Omaha) Strategy

### 1.1 Preflop — Hand Selection

**Core Principle:** Every PLO5 starting hand should be a strictly IMPROVED version of a PLO4 hand. The 5th card must ADD value (connectivity, suit, nut potential), not just exist.

**Key Stats:**
- PLO4 has ~270,000 starting combos; PLO5 has ~2.8 MILLION
- KK can profitably open UTG ~64% of combos in PLO4, but only ~30% in PLO5
- AA preflop equity vs random drops from ~66% (PLO4) to ~57% (PLO5)

**Premium Hands (Open/3-Bet Any Position):**
- Double-suited Aces with connectivity: AAKKx ds, AAJTx ds, AAQJ ds + connector
- Broadway rundowns double-suited: AKQJT ds, KQJT9 ds
- High pair + rundown: KKQJx ds, QQJTx ds

**Playable Hands (Open MP+, Call 3-Bets IP):**
- Single-suited Aces with 3+ connected: AAxx9 ss + connectors
- Medium rundowns double-suited: JT987 ds, T9876 ds
- Double-paired + suited: KKJJx ds, QQTTx ds

**Trash (Fold Preflop):**
- Gapped hands: AK-T-6-4 (the 5th card doesn't connect)
- Single-suited dangler: AAxxx with one suit and a disconnected low card
- Low uncoordinated: 87543 rainbow

**Implementation Rules:**
1. Score each 4-card subset via `classifyPLOPreflop` (C(5,4)=5 combos)
2. BONUS: +15 if 5th card adds a 2nd suit (double-suited potential)
3. BONUS: +10 if 5th card extends a rundown (e.g., KQJT + 9 = 5-card rundown)
4. BONUS: +8 if 5th card pairs a high card (full house potential)
5. PENALTY: -20 if 5th card is a dangler (unconnected, off-suit, rank gap > 4)
6. Tighten ALL position ranges by 15% vs PLO4

### 1.2 Postflop — Equity & Nut Advantage

**Core Principle:** Equities run MUCH closer in PLO5. Two-pair is trash. Draws are everywhere. Only commit with nuts or nut draws.

**Key Adjustments:**
- **Two-pair value drops 30%** — opponents have more combos to beat you
- **Sets without redraws are vulnerable** — must have flush/straight backup
- **Non-nut flushes devalued by 25%** — K-high flush is marginal, Q-high is fold-worthy
- **Wrap draws are 15% more common** — adjust draw equity upward
- **Semi-bluff more aggressively** with combo draws (wrap + flush = monster)
- **Value bet thinner** — opponents call wider (they also have more combos)
- **Check-raise frequency UP** — stronger hands hit more often on both sides

**Equity Realization Adjustments:**
- IP: PLO5 realizes ~8% more equity than PLO4 (more draw combos hit)
- OOP: PLO5 realizes ~5% more equity than PLO4
- 3-bet pots: equity realization COLLAPSES vs tight ranges (rarely have nuts when called)

### 1.3 Bet Sizing

**Preflop Open Sizing:**
- 2.5x-3x BB (same as PLO4 — pot-limit controls sizing)
- 3-bet to pot (same structure)

**Postflop Sizing Adjustments:**
- C-bet: 50-60% pot (smaller than PLO4 — ranges connect more)
- Turn barrel: 60-75% pot on dynamic boards
- River value: 65-85% pot (opponents call wider with more combos)
- Overbet: LESS frequent than PLO4 (opponents have wider calling range)

---

## PART 2: PLO6 (6-Card Omaha) Strategy

### 2.1 Preflop — Hand Selection

**Core Principle:** In PLO6, EVERYONE has a good hand. You need a GREAT hand. Nuttiness is everything.

**Key Stats:**
- PLO6 has ~20 MILLION starting combos
- AA equity vs random drops to ~52% (barely better than a coin flip)
- C(6,2) = 15 possible 2-card combos per hand (vs 6 in PLO4)
- Triple-suited hands occur 9.3% of the time
- Most hands have multiple draws to the nuts

**Premium Hands (Open/3-Bet Any Position):**
- Double-suited AAKKxx: AAKKQJ ds, AAKKJT ds
- Triple-suited with Ace: AKQJTx with 3 suits
- Monster rundowns double-suited: AKQJT9 ds, KQJT98 ds
- Double-paired broadway: AAKKQQ, KKQQJJ double-suited

**Playable Hands (Open CO+, Call 3-Bets on BTN):**
- Double-suited with connectivity: KQJTxx ds with connected 5th/6th
- Suited Aces + rundown: AAxxxx with suit + 4-card run
- Medium rundowns triple-suited: JT9876 with 3 suits

**Trash (Fold Preflop — even more than PLO5):**
- ANY hand without double-suited: single-suited = marginal at best
- Danglers: hands where 2+ cards don't connect to anything
- Low cards without connectivity: anything dominated by 8-high

**Implementation Rules:**
1. Score each 4-card subset via `classifyPLOPreflop` (C(6,4)=15 combos)
2. BONUS: +20 if triple-suited (3 different suits with 2+ cards each)
3. BONUS: +15 if 5th+6th cards extend the rundown to 6 consecutive
4. BONUS: +12 if double-paired (full house potential on 2 different boards)
5. PENALTY: -30 if any card is a dangler (much harsher than PLO5)
6. PENALTY: -15 if single-suited only
7. Tighten ALL position ranges by 25% vs PLO4

### 2.2 Postflop — Nut-or-Nothing

**Core Principle:** In PLO6, if you don't have the nuts or a draw to the nuts, GET OUT. Non-nut hands are death.

**Key Adjustments:**
- **Flush hierarchy collapses:**
  - Ace-high flush = strong (commit)
  - King-high flush = marginal (call one street max)
  - Queen-high flush = FOLD FACING AGGRESSION
  - Anything below = pure trash
- **Straights require nut status:** bottom/middle straight = folding to aggression
- **Sets need redraws:** top set alone is NOT enough to stack off
  - Top set + flush draw = commit
  - Top set + no redraw on wet board = check-call at best
- **Two-pair is WORTHLESS** — never commit significant chips with two pair
- **Blocker strategy is critical:**
  - Holding A of a suit = can bluff when flush possible (opponent can't have nuts)
  - Holding key straight blockers = bluff opportunities on straight boards

**Equity Realization Adjustments:**
- IP: PLO6 realizes ~12% more equity than PLO4
- OOP: PLO6 realizes ~8% more equity than PLO4
- Everyone hits draws — position is PARAMOUNT
- 3-bet OOP = extremely tight (hard to realize equity)

### 2.3 Bet Sizing

**Preflop:**
- Open 2.5x BB (smaller — ranges are so strong that big opens get called anyway)
- 3-bet to pot (standard pot-limit)

**Postflop Sizing Adjustments:**
- C-bet: 40-50% pot (SMALLER than PLO4/PLO5 — everyone has something)
- Turn barrel: 55-70% pot (polarize more — either nuts or bluff)
- River: Polarized sizing — 80-100% pot for value, small for thin value
- Overbet: Almost NEVER (opponents have too many nut combos to call with)
- Check-raise: MORE frequent (you hit strong more often)

### 2.4 Bluffing in PLO6

**Core Principle:** Bluffs must be blocker-based, not hand-strength-based.

**When to Bluff:**
- Hold the nut flush blocker (A of suit) on flush boards
- Hold top straight card blockers on straight boards
- On paired boards when you block full houses

**When NOT to Bluff:**
- Multiway pots (someone almost always has it)
- Without relevant blockers (your bluff will get called)
- On boards with multiple draw completions (too many nuts possible)

---

## PART 3: Tournament vs Cash Adjustments (Both PLO5 & PLO6)

### Cash Game:
- Standard ranges and aggression
- Deep stack play emphasized
- Full exploitation allowed

### Tournament:
- Tighten ranges by additional 10% across all positions
- ICM pressure near bubble: fold marginal spots
- Short stack (<15BB): push/fold with nut potential hands only
- Chip accumulation mode (early): can widen slightly in position
- Variance protection: avoid marginal all-in spots (can't rebuy)

---

## PART 4: Implementation Architecture

### Files to Modify:
1. `plo5-brain.js` — Full rewrite with PLO5-specific preflop scorer, postflop adjustments, and draw recalibration
2. `plo6-brain.js` — Full rewrite with PLO6 nut-or-nothing postflop, blocker-based bluffing, flush hierarchy
3. `plo-core.js` — Add variant parameter to `makePLOFallbackDecision` for PLO5/PLO6 specific thresholds
4. `router.js` — Route PLO5/PLO6 to their specific brain modules instead of generic PLO

### Key Functions to Implement:

**plo5-brain.js:**
- `scorePLO5Hand(holeCards)` — 5th-card bonus/penalty scoring
- `getPLO5PreflopAction(score, position, facing, numPlayers)` — position-based action
- `adjustPLO5PostflopStrength(madeHand, draws, street)` — devalue two-pair, boost combo draws
- `getPLO5DrawValue(draws, street, potSize, toCall)` — recalibrated draw equity
- `makePLO5Decision(profileId, gameState, legalActions)` — main entry point

**plo6-brain.js:**
- `scorePLO6Hand(holeCards)` — 5th+6th card scoring, triple-suit bonus
- `getPLO6PreflopAction(score, position, facing, numPlayers)` — tightest ranges
- `evaluatePLO6FlushHierarchy(flushRank, numPlayers)` — nut flush or fold
- `evaluatePLO6NutDistance(madeHand, board)` — how far from the nuts
- `getPLO6BlockerValue(holeCards, board)` — blocker-based bluff decisions
- `shouldPLO6Bluff(holeCards, board, action, potSize)` — blocker bluff logic
- `makePLO6Decision(profileId, gameState, legalActions)` — main entry point

### Router Changes:
```javascript
// In router.js getDecision():
if (variant === 'plo5' || variant === 'omaha5') {
    return makePLO5Decision(profileId, gameState, legalActions);
} else if (variant === 'plo6' || variant === 'omaha6') {
    return makePLO6Decision(profileId, gameState, legalActions);
} else if (isPLO) {
    return makePLOFallbackDecision(...); // PLO4 (existing)
}
```
