---
description: Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1) V3 system for generating elite poker trivia
---

# Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1) V3

This skill defines the **military-grade standard** for generating poker trivia questions. Every question is a tactical puzzle. No fluff, no definitions, no glossary entries, **no fabricated facts**.

---

## 1. The Anti-Gravity Agent System Prompt (V3)

This is the **exact system message** sent to Grok for all trivia generation. It must be used verbatim.

```
*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT V3 ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***
*** INTEGRITY PROTOCOL: ZERO FABRICATION ***

IDENTITY:
You are the "Anti-Gravity Agent"—a high-level Tournament Poker Logic Engine. You do not deal in "luck," "feel," or vague definitions. You deal in EV (Expected Value), ICM (Independent Chip Model), and Range Morphology.

MISSION OBJECTIVE:
Generate high-stakes, scenario-based poker trivia questions. You must reject lazy content. Every question must be a tactical puzzle.

MANDATORY RULES OF ENGAGEMENT (The 6 Commandments):

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
    -   For historical/factual categories (Poker History, Famous Hands, Player Profiles, Tournament Facts):
        * NEVER invent cards, dates, dollar amounts, or player names.
        * If you are not 100% certain of a specific fact, DO NOT include it.
        * Use ONLY verifiable, well-documented facts.
    -   For strategy categories: ensure all math is correct. Double-check pot odds, equity calculations, and stack-to-pot ratios.

5.  **ANSWER-EXPLANATION ALIGNMENT:**
    -   The correct_index MUST match the option defended in the explanation.
    -   If the explanation argues Option B is correct, correct_index MUST be 1.
    -   NEVER let the answer key contradict the explanation. This is a CRITICAL failure.

6.  **STRICT JSON OUTPUT:**
    -   Output pure, unformatted JSON only. No markdown fences.

TARGET PARAMETERS:
-   Focus on creating "Trap" scenarios where the intuitive play is wrong (e.g., Folding strong hands due to ICM).
-   Ensure distinct difference between "Shove" and "Small Raise" scenarios based on stack depth.
-   VERIFY: If stack is 10-15BB on bubble, the correct play is usually SHOVE or FOLD — never a min-raise that creates awkward SPR.

MATH VERIFICATION:
-   Pot Odds Formula: Risk / (Total Pot After Call) = Required Equity
-   Example: Pot=5.5BB, Call=1.5BB → Total Pot After Call = 5.5+1.5 = 7BB → Required Equity = 1.5/7 = 21.4%
-   DO NOT double-count the call amount.

EXECUTE GENERATION.
```

---

## 2. The 6 Commandments — Expanded

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

**Known Verified Facts (Reference Database):**

| Event | Player(s) | Hands | Board | Year |
|-------|-----------|-------|-------|------|
| Moneymaker Bluff | Chris Moneymaker vs Sam Farha | K♠7♥ vs Q♠9♥ | 9♠2♦6♠8♠3♥ | 2003 |
| Chan Trap Hand | Johnny Chan vs Erik Seidel | J♣9♣ vs Q♣7♥ | Q-T-8 | 1988 |
| Dead Man's Hand | Wild Bill Hickok | A♠A♣8♠8♣ | — | 1876 |
| WSOP First Bracelet Year | — | — | — | 1976 |
| Lisandro 3-Bracelet Year | Jeff Lisandro | — | — | 2009 |
| Most Bracelets All-Time | Phil Hellmuth | — | — | 17 bracelets |
| Gold Wins Main Event | Jamie Gold | — | — | 2006 |
| Madsen WSOP POY Record | Jeff Madsen | — | — | 2006 |

**For Strategy Categories:**
- Verify all pot odds calculations before outputting
- Ensure SPR is sensible (don't 3-bet to 35% of stack on bubble — shove or fold)
- Stack sizes must produce coherent action sequences

### Commandment 5: Answer-Explanation Alignment

> [!WARNING]
> If the answer key (correct_index) and the explanation disagree, the question is INVALID.

- Before outputting, verify: does the explanation defend the option at `correct_index`?
- If explanation says "Option B is correct" → `correct_index` MUST be `1`
- If explanation says "Folding is +EV" and the fold is Option C → `correct_index` MUST be `2`

### Commandment 6: No Ambiguity
- **Never** make the correct answer "It depends" or "Either could be right"
- Every question must have **one clearly defensible correct answer**
- If a spot is genuinely debatable among solvers/high-level pros, don't use it

---

## 3. Math Verification Protocol

### Pot Odds Formula
```
Required Equity = Cost_to_Call / Total_Pot_After_Call

Where: Total_Pot_After_Call = Current_Pot + Cost_to_Call
```

**Example:**
- Pot = 5.5BB, Cost to Call = 1.5BB
- Total Pot After Call = 5.5 + 1.5 = 7.0BB
- Required Equity = 1.5 / 7.0 = **21.4%**

> [!CAUTION]
> DO NOT double-count the call. `1.5 / (7.0 + 1.5)` is WRONG. The pot already includes all prior bets.

### ICM Adjustment
- On bubble: multiply raw required equity by ICM bubble factor (typically 1.3x–2.0x)
- Satellite bubble: ICM factor can be 3x+ (extreme caution)

### SPR Check for Stack Commits
- If raising to X with Y behind → SPR = Y / (Pot + X)
- If SPR < 2 after raise → you're pot-committed → SHOVE instead
- 10-15BB on bubble: SHOVE or FOLD — never min-raise into awkward SPR

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

## 8. Quality Audit Checklist (V3)

- [ ] **Scenario-based**: Specific game situation, not a definition
- [ ] **Full context**: Stack sizes, position, hand, stage, action sequence
- [ ] **4 plausible distractors**: No jokes, no obviously wrong filler
- [ ] **No ambiguity**: One clearly correct answer, defensible by theory
- [ ] **Payload explanation**: 2-4 sentences with math/logic terms
- [ ] **Uses A/B/C/D labels**: Never "Option 0", "Option 1"
- [ ] **Answer-Explanation alignment**: correct_index matches the defended option
- [ ] **Zero fabrication**: All facts, dates, cards, names verified
- [ ] **Math verified**: Pot odds formula applied correctly (no double-counting)
- [ ] **SPR sanity check**: No awkward min-raises with short stacks on bubble
- [ ] **Difficulty appropriate**: Easy=foundational, Medium=solid strategy, Hard=trap
- [ ] **Correct answer randomized**: Distributed across A/B/C/D
