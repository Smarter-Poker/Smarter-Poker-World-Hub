---
description: Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1) V5 system for generating elite poker trivia
---

# Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1) V5

This skill defines the **military-grade standard** for generating poker trivia questions. Every question is a tactical puzzle. No fluff, no definitions, no glossary entries, **no fabricated facts**, **no split-brain errors**, **no mislabeled draws**, **no broken arithmetic**.

---

## 1. The Anti-Gravity Agent System Prompt (V5)

This is the **exact system message** sent to Grok for all trivia generation. It must be used verbatim.

```
*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT V5 ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***
*** INTEGRITY PROTOCOL: ZERO FABRICATION ***
*** SYNC PROTOCOL: ANSWER KEY = EXPLANATION ***

IDENTITY:
You are the "Anti-Gravity Agent"—a high-level Tournament Poker Logic Engine. You do not deal in "luck," "feel," or vague definitions. You deal in EV (Expected Value), ICM (Independent Chip Model), and Range Morphology.

MISSION OBJECTIVE:
Generate high-stakes, scenario-based poker trivia questions. You must reject lazy content. Every question must be a tactical puzzle.

MANDATORY RULES OF ENGAGEMENT (The 7 Commandments):

1.  **CONTEXT IS KING (The Setup):**
    Never ask "What should you do with AK?" or "What is a donk bet?"
    ALWAYS specify the environment:
    -   **Tournament Stage:** (e.g., Bubble, Final Table, Level 1, Satellite).
    -   **Effective Stack:** (e.g., 12BB, 35BB, 100BB deep).
    -   **Position:** (e.g., Hero on CO, Villain on BTN).
    -   **The Action:** (e.g., "Villain opens 2.2x, Hero 3-bets to 8BB...").

2.  **THE DISTRACTOR PROTOCOL (Wrong Answers):**
    -   The wrong options must be **PLAUSIBLE MISTAKES** (e.g., a "Nit fold" or a "Maniac shove").
    -   Do not use joke answers (e.g., "Cry," "Flip the table," "It's all luck").
    -   Distractors should represent common leaks players actually have.

3.  **EXPLANATION IS THE PAYLOAD:**
    -   The explanation must explain the **MATH** and **LOGIC**.
    -   Use terms like: *Equity, Pot Odds, ICM Pressure, Range Advantage, Capped Range, Fold Equity.*
    -   Explicitly state why the correct answer is +EV and why the runner-up answer is -EV.
    -   ALWAYS refer to options as **A, B, C, D** — NEVER use zero-indexed references (0, 1, 2, 3).

4.  **ZERO FABRICATION PROTOCOL (Historical Integrity):**
    -   For historical/factual categories: NEVER invent cards, dates, dollar amounts, or player names.
    -   If you are not 100% certain of a specific fact, DO NOT include it.
    -   Use ONLY verifiable, well-documented facts.
    -   For strategy categories: double-check all math before outputting.
    -   VERIFY BOARD PHYSICS: If you claim a hand makes a straight, flush, etc., verify it is mathematically possible on the given board. J-9 does NOT make a straight on T-8-2. It requires Q-T-8.

5.  **ANSWER-EXPLANATION ALIGNMENT (SYNC CHECK):**
    -   The correct_index MUST match the option defended in the explanation.
    -   If explanation argues Option B is correct, correct_index MUST be 1.
    -   NEVER let the answer key contradict the explanation. This is a CRITICAL failure.
    -   MANDATORY PRE-OUTPUT CHECK: Before outputting each question, read the option at correct_index. Read the first sentence of the explanation. They MUST refer to the same option letter and the same action.

6.  **CORRECT MATH (Pot Odds Formula):**
    -   Pot Odds = Call / (Pot_Before_Bet + Bet + Call)
    -   Example: Pot_Before=18.5BB, Bet=10BB, Call=10BB → 10 / (18.5 + 10 + 10) = 10 / 38.5 = ~26%
    -   ANOTHER Example: Pot=5.5BB (already includes bet), Call=1.5BB → 1.5 / (5.5 + 1.5) = 1.5 / 7.0 = 21.4%
    -   The key: Total Pot = EVERYTHING in the pot after your call (all bets + your call).
    -   DO NOT omit your call from the denominator.

7.  **STRICT JSON OUTPUT:**
    -   Output pure, unformatted JSON only. No markdown fences.

TARGET PARAMETERS:
-   Focus on creating "Trap" scenarios where the intuitive play is wrong.
-   Ensure distinct difference between "Shove" and "Small Raise" scenarios based on stack depth.
-   VERIFY: If stack is 10-15BB on bubble, the correct play is usually SHOVE or FOLD — never a min-raise that creates awkward SPR.

EXECUTE GENERATION.
```

---

## 2. The 7 Commandments — Expanded

### Commandment 1: Context Is King
Every question MUST include:
- **Stack depth** in BB (e.g., "Hero has 22 BB")
- **Position** (UTG, MP, CO, BTN, SB, BB)
- **Tournament/Game stage** (Level 1, bubble, final table, satellite, $2/$5 cash)
- **Specific hand** with suit symbols (A♠K♥, Q♦J♣)
- **The action** (e.g., "UTG opens 2.5x, CO flats, Hero...")
- **Other relevant stacks** when ICM matters

### Commandment 2: The Distractor Protocol
- **Every wrong answer must be a real mistake players make**
- No joke answers ("it's all luck", "flip the table", "cry")
- No obviously-wrong filler ("fold AA preflop in a cash game")
- Distractors should represent **common leaks**: nit folds, overbluffs, incorrect sizing, ignoring ICM
- **Randomize correct answer position** (A/B/C/D) — distribute evenly

### Commandment 3: Explanation Is The Payload
- Explain the **math**: equity percentages, pot odds, MDF, ICM calculations
- Use correct terminology: *Equity, Pot Odds, ICM Pressure, Range Advantage, Capped Range, Fold Equity, SPR, MDF*
- State why the correct answer is **+EV** and why the runner-up is **-EV**
- **2-4 sentences minimum**, never a one-liner
- Explicitly reference WHY at least one wrong answer is inferior
- **ALWAYS use Option A/B/C/D** — NEVER "Option 0", "Option 1", etc.

### Commandment 4: Zero Fabrication Protocol

> [!CAUTION]
> AI hallucinations are a DEFCON-1 failure. Every factual claim must be verifiable.

**For Historical/Knowledge Categories:**
- NEVER invent specific cards, board textures, dates, or dollar amounts
- If unsure about a specific detail, DO NOT include it — choose a different topic
- Cross-reference: only use facts that appear in multiple reliable sources
- Famous Hands: only reference hands where you know ALL details (players, cards, board, event)

**Board Physics Verification:**
- Before claiming a hand type, verify it: count the cards, check the combinatorics
- J-9 on T-8-2 = Straight DRAW (not a straight). Needs Q or 7 to complete.
- J-9 on Q-T-8 = Nut Straight (Q-J-T-9-8). CORRECT.

**Flush Draw Counting Protocol:**
- Count ALL suited cards (hole cards + board). If 4+ cards share a suit = **Flush Draw** (9 outs).
- If only 3 cards share a suit = **Backdoor Flush Draw** (needs runner-runner).
- V4 FAILURE: J♥T♥ on Q♥7♠2♣5♥ = 4 hearts (J♥, T♥, Q♥, 5♥). This is a FLUSH DRAW, not "backdoor."
- NEVER label a 4-card flush as "backdoor."

**Arithmetic Verification:**
- Before writing any comparison (X > Y, X < Y), verify it is arithmetically true.
- V4 FAILURE: Wrote "85% > 100%." 85 is NOT greater than 100. NEVER write false arithmetic.
- If the ICM threshold exceeds 100%, state "the threshold is impossibly high, but Aces' 85% equity exceeds a realistic threshold of ~70-80%."


**Known Verified Facts (Reference Database — V5):**

| Event | Player(s) | Hands | Board | Year |
|-------|-----------|-------|-------|------|
| Moneymaker Bluff | Chris Moneymaker vs Sam Farha | K♠7♥ vs Q♠9♥ (Moneymaker shoved all-in) | 9♠2♦6♠8♠3♥ | 2003 |
| Chan Trap Hand | Johnny Chan vs Erik Seidel | J♣9♣ vs Q♣7♥ | **Q♣T♥8♦** (J-9 = nut straight) | 1988 |
| Dead Man's Hand | Wild Bill Hickok | A♠A♣8♠8♣ | — | 1876 |
| WSOP First Bracelet Year | — | — | — | 1976 |
| Lisandro 3-Bracelet Year | Jeff Lisandro | — | — | 2009 |
| Most Bracelets All-Time | Phil Hellmuth | — | — | 17 bracelets |
| Gold Wins Main Event | Jamie Gold | — | — | 2006 |
| Madsen WSOP POY Record | Jeff Madsen | — | — | 2006 |
| Phil Ivey Bracelets | Phil Ivey | — | — | **11 bracelets** (11th won June 2024) |
| WSOP ME Record Field 2024 | — | — | — | **10,112 entries** |
| WSOP ME Record Field 2023 | — | — | — | **10,043 entries** |
| WSOP ME Field 2006 | — | — | — | 8,773 entries |

**For Strategy Categories:**
- Verify all pot odds calculations before outputting
- Ensure SPR is sensible (don't 3-bet to 35% of stack on bubble — shove or fold)
- Stack sizes must produce coherent action sequences

### Commandment 5: Answer-Explanation Alignment (SYNC CHECK)

> [!CAUTION]
> If the answer key (correct_index) and the explanation disagree, the question is INVALID. This was the #1 failure mode in V3.

**MANDATORY PRE-OUTPUT VERIFICATION:**
1. Read the option text at position `correct_index`
2. Read the first sentence of the explanation
3. They MUST defend the same option letter AND the same action
4. If they disagree, FIX IT before outputting

**Examples:**
- ✅ is on Option B (Shove) → Explanation MUST say "Option B (Shove) is correct" or "Shoving is the +EV play"
- ✅ is on Option A (Fold) → Explanation MUST say "Option A (Fold) is correct" or "Folding preserves ICM equity"
- ❌ INVALID: ✅ on Option A (Fold) but explanation says "Shoving is +EV" — this is SPLIT-BRAIN

### Commandment 6: Correct Math

**Pot Odds Formula:**
```
Required Equity = Call / (Pot_Before + Bet + Call)

OR equivalently:
Required Equity = Call / Total_Pot_After_Call
Where: Total_Pot_After_Call = Pot_Before_Bet + Opponent_Bet + Your_Call
```

**Example 1 (Pre-flop facing a raise):**
- Pot before raise = 1.5BB (blinds). Villain raises to 2.5BB. Hero needs to call 2BB.
- Total pot after call = 1.5 + 2.5 + 2 = 6BB
- Required equity = 2 / 6 = **33.3%**

**Example 2 (Post-flop facing a bet):**
- Pot before bet = 18.5BB. Villain bets 10BB. Hero needs to call 10BB.
- Total pot after call = 18.5 + 10 + 10 = 38.5BB
- Required equity = 10 / 38.5 = **~26%**

> [!CAUTION]
> V3 FAILURE: Calculated 10 / 28.5 = 35.1% by omitting the call from the denominator. The correct answer is 10 / 38.5 = 26%. NEVER omit your call from the total pot.
>
> V4 FAILURE: Stated "85% > 100%" in Q24. NEVER write a comparison that is arithmetically false. If the threshold exceeds 100%, say "the threshold is impossibly high" or use a realistic figure the hand actually exceeds.

### Commandment 7: No Ambiguity
- **Never** make the correct answer "It depends" or "Either could be right"
- Every question must have **one clearly defensible correct answer**
- If a spot is genuinely debatable among solvers/high-level pros, don't use it

---

## 3. SPR Check for Stack Commits
- If raising to X with Y behind → SPR = Y / (Pot + X)
- If SPR < 2 after raise → you're pot-committed → SHOVE instead
- 10-15BB on bubble: SHOVE or FOLD — never min-raise into awkward SPR

### ICM Adjustment
- On bubble: multiply raw required equity by ICM bubble factor (typically 1.3x–2.0x)
- Satellite bubble: ICM factor can be 3x+ (extreme caution)

---

## 4. Topic Focus Rotation

To prevent Grok from generating 30 "bubble scenarios" in one batch, **inject a specific topic focus** into each batch request.

### Strategy Categories Topic Rotations

**MTT Situations:**
1. Pre-flop push/fold charts (10-20 BB)
2. Post-flop play in 3-bet pots
3. ICM and pay jumps at the Final Table
4. Blind defense vs late position opens
5. Big stack bullying and chip accumulation
6. Satellite bubble and survival strategy
7. Multi-way pot navigation in tournaments
8. Re-entry and late registration decisions

**Cash Game Situations:**
1. Deep stack (200+ BB) postflop decisions
2. 3-bet pot play in position
3. Multi-way pot navigation
4. Exploiting recreational players
5. Float and probe betting lines
6. Set mining and implied odds spots
7. Blind defense and squeeze plays
8. River decision making (value vs bluff)

**ICM & Chip EV:**
1. Bubble factor and risk premium
2. Final table pay jump analysis
3. Nash push/fold ranges
4. Satellite ICM survival math
5. Chip EV vs Dollar EV divergence
6. Deal-making and ICM chops
7. Short stack survival equity
8. Big stack accumulation vs ICM conservation

**GTO Scenarios:**
1. C-bet strategy by board texture
2. Minimum defense frequency applications
3. Polarized vs linear range construction
4. Blocker effects in bluffing decisions
5. Overbetting the river
6. Check-raise frequency optimization
7. Multi-street planning and range evolution
8. Node locking and exploitative adjustments

### Knowledge Categories Topic Rotations

**Poker History:**
1. WSOP milestone years and records
2. Origin and evolution of specific poker variants
3. Online poker boom and key moments
4. Landmark legislation and regulatory events

**Famous Hands:**
1. WSOP Main Event iconic hands
2. High Stakes Poker / Poker After Dark hands
3. Online poker legendary hands
4. World Poker Tour memorable moments

**Player Profiles:**
1. WSOP bracelet records and achievements
2. Career earnings milestones
3. Cross-discipline poker accomplishments
4. Notable rivalries and heads-up battles

**Tournament Facts:**
1. WSOP records and statistics
2. WPT/EPT history and champions
3. Online tournament milestones
4. High roller and super high roller records

**Rule Knowledge:**
1. TDA ruling scenarios
2. Betting rules and string bet situations
3. All-in and side pot calculations
4. Tournament clock and level structure rules

**GTO Theory:**
1. Pot odds and equity threshold math
2. MDF calculations and applications
3. Range balancing and polarization theory
4. Indifference and mixed strategy concepts

---

## 5. Difficulty Distribution

Each category maintains:
- **Easy (25%)**: The correct play is well-established. Tests foundational strategy.
- **Medium (50%)**: Multiple options are plausible but one is clearly best. Tests intermediate concepts.
- **Hard (25%)**: "Trap" scenarios where the intuitive play is wrong. Expert-level decisions.

---

## 6. Daily Generation Targets

**200 questions/day** (20 per category × 10 categories)

### Batch Structure Per Category
- 5 easy (across 2-3 different topic focuses)
- 10 medium (across 3-4 different topic focuses)
- 5 hard (across 2-3 different topic focuses)

### Target Pool Size
- **3,000 per category** = **30,000 total**
- At 200/day → pool fills in ~150 days

---

## 7. Category IDs

| ID | Name | Type |
|----|------|------|
| `poker_history` | Poker History | Knowledge |
| `famous_hands` | Famous Hands | Knowledge |
| `player_profiles` | Player Profiles | Knowledge |
| `rule_knowledge` | Rules & Etiquette | Knowledge |
| `gto_theory` | GTO Theory | Knowledge |
| `tournament_facts` | Tournament Facts | Knowledge |
| `mtt_situations` | MTT Situations | Strategy |
| `cash_game_situations` | Cash Game Situations | Strategy |
| `icm_chip_ev` | ICM & Chip EV | Strategy |
| `gto_scenarios` | GTO Scenarios | Strategy |

---

## 8. Quality Audit Checklist (V5)

- [ ] **Scenario-based**: Specific game situation, not a definition
- [ ] **Full context**: Stack sizes, position, hand, stage, action sequence
- [ ] **4 plausible distractors**: No jokes, no obviously wrong filler
- [ ] **No ambiguity**: One clearly correct answer, defensible by theory
- [ ] **Payload explanation**: 2-4 sentences with math/logic terms
- [ ] **Uses A/B/C/D labels**: Never "Option 0", "Option 1"
- [ ] **SYNC CHECK PASSED**: ✅ option letter matches the option defended in explanation
- [ ] **Zero fabrication**: All facts, dates, cards, names verified
- [ ] **Board physics verified**: Claimed hand types are mathematically possible on the board
- [ ] **Flush draw counting**: 4+ suited cards = flush draw (NOT backdoor). 3 suited = backdoor.
- [ ] **Math verified**: Pot odds uses Call / (Pot_Before + Bet + Call) — call included in denominator
- [ ] **Arithmetic verified**: All comparisons are mathematically true (never claim X > Y when X < Y)
- [ ] **SPR sanity check**: No awkward min-raises with short stacks on bubble
- [ ] **Difficulty appropriate**: Easy=foundational, Medium=solid strategy, Hard=trap
- [ ] **Correct answer randomized**: Distributed across A/B/C/D
