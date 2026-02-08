---
description: Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1) system for generating elite poker trivia
---

# Trivia Q&A Pipeline — Anti-Gravity Agent (AG-1)

This skill defines the **military-grade standard** for generating poker trivia questions. Every question is a tactical puzzle. No fluff, no definitions, no glossary entries.

---

## 1. The Anti-Gravity Agent System Prompt

This is the **exact system message** sent to Grok for all trivia generation. It must be used verbatim in all cron generators and bootstrap scripts.

```
*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***

IDENTITY:
You are the "Anti-Gravity Agent"—a high-level Tournament Poker Logic Engine. You do not deal in "luck," "feel," or vague definitions. You deal in EV (Expected Value), ICM (Independent Chip Model), and Range Morphology.

MISSION OBJECTIVE:
Generate high-stakes, scenario-based poker trivia questions. You must reject lazy content. Every question must be a tactical puzzle.

MANDATORY RULES OF ENGAGEMENT (The 4 Commandments):

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

4.  **STRICT JSON OUTPUT:**
    -   Output pure, unformatted JSON only.
    -   No markdown fences, no extra text.

TARGET PARAMETERS:
-   Focus on creating "Trap" scenarios where the intuitive play is wrong (e.g., Folding strong hands due to ICM).
-   Ensure distinct difference between "Shove" and "Small Raise" scenarios based on stack depth.

EXECUTE GENERATION.
```

---

## 2. The 4 Commandments — Expanded

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

### Commandment 4: No Ambiguity
- **Never** make the correct answer "It depends" or "Either could be right"
- Every question must have **one clearly defensible correct answer**
- If a spot is genuinely debatable among solvers/high-level pros, don't use it
- The correct answer should be defensible by solver output, Nash ranges, or established theory

---

## 3. Topic Focus Rotation

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
4. indifference and mixed strategy concepts

---

## 4. Difficulty Distribution

Each category maintains:
- **Easy (25%)**: The correct play is well-established. Tests foundational strategy.
- **Medium (50%)**: Multiple options are plausible but one is clearly best. Tests intermediate concepts.
- **Hard (25%)**: "Trap" scenarios where the intuitive play is wrong. Expert-level decisions requiring ICM, solver output, or deep range analysis.

---

## 5. Daily Generation Targets

**200 questions/day** (20 per category × 10 categories)

### Batch Structure Per Category
- 5 easy (across 2-3 different topic focuses)
- 10 medium (across 3-4 different topic focuses)
- 5 hard (across 2-3 different topic focuses)

### Target Pool Size
- **3,000 per category** = **30,000 total**
- At 200/day → pool fills in ~150 days
- Bootstrap scripts can accelerate

---

## 6. Database Schema

### `trivia_questions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `category` | text | One of the 10 category IDs |
| `question` | text | The scenario-based question |
| `options` | text[] | Array of exactly 4 options |
| `correct_index` | integer | 0-3 |
| `explanation` | text | 2-4 sentence strategic reasoning |
| `difficulty` | text | easy / medium / hard |
| `daily_date` | date | If assigned as daily challenge |
| `subcategory` | text | Topic focus tag |
| `created_at` | timestamptz | Generation timestamp |
| `last_used_at` | timestamptz | Auto-updated by trigger |
| `use_count` | integer | Auto-incremented by trigger |
| `quality_score` | integer | Default 5 |

### `trivia_user_question_history`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | FK to profiles |
| `question_id` | UUID | FK to trivia_questions |
| `was_correct` | boolean | Did user answer correctly |
| `seen_at` | timestamptz | When question was served |
| `mode` | text | Which game mode |

- Unique constraint on `(user_id, question_id)` → upsert updates `seen_at`
- **60-day exclusion**: questions seen in last 60 days filtered out

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

## 8. Running the Pipeline

### Automated Crons
| Cron | Schedule | Output |
|------|----------|--------|
| `trivia-daily-generator` | 11:59 PM CST | 200 questions (20 × 10) |
| `generate-trivia-questions` | Hourly | Up to 90 from lowest categories |

### Manual Bootstrap
- `POST /api/admin/trivia-bootstrap` — Bulk seeds legacy categories
- `POST /api/admin/trivia-bootstrap-strategy` — Bulk seeds strategy categories
- `GET /api/admin/trivia-pool-status` — Pool stats and recommendations

---

## 9. Quality Audit Checklist

- [ ] **Scenario-based**: Specific game situation, not a definition
- [ ] **Full context**: Stack sizes, position, hand, stage, action sequence
- [ ] **4 plausible distractors**: No jokes, no obviously wrong filler
- [ ] **No ambiguity**: One clearly correct answer, defensible by theory
- [ ] **Payload explanation**: 2-4 sentences with math/logic terms
- [ ] **Difficulty appropriate**: Easy=foundational, Medium=solid strategy, Hard=trap/counter-intuitive
- [ ] **Correct answer randomized**: Distributed across A/B/C/D
- [ ] **Factually accurate**: All stats, names, dates correct
