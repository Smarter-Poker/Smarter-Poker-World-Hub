---
description: Trivia Q&A Pipeline — How to generate, audit, and manage trivia questions across all 10 categories
---

# Trivia Q&A Pipeline

This skill defines the standard for generating high-quality poker trivia questions and answers for Smarter.Poker Trivia Hub. Every question must follow this formula.

---

## 1. Question Format Standard

Every question MUST be a **specific, scenario-based question** — never a generic definition or vague concept question.

### ❌ BAD Question Examples (Do NOT generate these)
- "What does being on the bubble mean?" → **Definition, not a scenario**
- "How should your opening range change as antes are introduced?" → **No stack depth, no position, no context**
- "What is the resteal in tournament poker?" → **Glossary entry, not trivia**
- "What is push-fold strategy and when should you use it?" → **Textbook question, not a game situation**

### ✅ GOOD Question Examples (Follow this format)
- "You're in a $200 MTT, 45 players left, 40 get paid. You hold A♠J♦ on the BTN with 25 BB. A tight player opens 2.2x from MP. Two short stacks (6-8 BB) are in the blinds. What's the best play?"
- "$500 MTT final table, 6 players remain. Payouts jump from $2,800 (6th) to $4,200 (5th). You have 18 BB in the CO with K♠Q♠. The chip leader (65 BB) opens to 2.5x from EP. Two players behind you have 8-10 BB. What should you do?"
- "You're heads-up for the title. You have 35 BB, your opponent has 25 BB. You hold J♠8♦ on the BTN/SB. What should you do?"

### Required Elements in Every Question
1. **Specific stack sizes** (in BB or dollar amounts)
2. **Exact position** (UTG, MP, CO, BTN, SB, BB)
3. **Tournament/game context** (buy-in, stage, players remaining, payout info when relevant)
4. **Specific hand** (use card symbols: ♠♥♦♣ or Ah, Kd, etc.)
5. **Clear action prompt** ("What's the best play?", "What should you do?", "What's the correct action?")

---

## 2. Answer Format Standard

### Answer Options (4 choices: A, B, C, D)
- Each option must be a **distinct, plausible action** — not obviously wrong filler
- Options should represent genuine strategic alternatives players might consider
- The correct answer must be **clearly defensible** by established poker theory, solver output, or ICM calculations
- **Randomize the correct answer position** — don't always make it B or C

### Explanation Standard
Every explanation must include:
1. **WHY the correct answer is right** — the strategic reasoning, not just restating the answer
2. **WHY at least one wrong answer is wrong** — help the player learn from the wrong choices
3. **Specific reasoning** — mention equity percentages, pot odds, ICM implications, or strategic principles where applicable
4. **2-4 sentences minimum** — never a one-liner like "Shoving maximizes fold equity"

### ❌ BAD Explanation
> "With 15 BB and AKo, shoving maximizes fold equity."

### ✅ GOOD Explanation
> "Near the bubble with short stacks in the blinds who will likely bust soon, you have a strong enough hand to play but you don't want to risk your tournament. Calling keeps the pot manageable and preserves your stack while the short stacks face elimination pressure. 3-betting or shoving puts your entire tournament at risk with a hand that's often dominated by the tight MP opener's range."

---

## 3. Category Definitions & Prompt Templates

There are **10 trivia categories**. Each has a specific prompt template for Grok AI generation.

### Category 1: `poker_history`
**Focus:** Historical events, dates, records, evolution of the game
**Prompt Template:**
```
Generate a poker history trivia question about a SPECIFIC historical event, record, or milestone.
The question must reference specific names, dates, dollar amounts, or tournament details.
Example: "In what year did the WSOP Main Event first exceed 1,000 entrants, and who won that year?"
DO NOT ask vague questions like "What is the history of poker?"
```

### Category 2: `famous_hands`
**Focus:** Televised or documented poker hands with specific details
**Prompt Template:**
```
Generate a trivia question about a specific famous poker hand from television or documented play.
Include the players' names, the event name, the cards involved, and what made the hand significant.
Example: "In the 2003 WSOP Main Event, Chris Moneymaker held 5♠4♠ against Sam Farha's Q♥9♠ on the final hand. What was the community board that gave Moneymaker the winning full house?"
DO NOT ask generic questions like "What makes a poker hand famous?"
```

### Category 3: `player_profiles`
**Focus:** Specific facts about named professional players
**Prompt Template:**
```
Generate a trivia question about a specific, verifiable fact about a named professional poker player.
Reference their tournament results, career earnings, playing style, or notable achievements.
Example: "Phil Ivey has won 10 WSOP bracelets. In which year did he win his first bracelet, and in what event?"
DO NOT ask opinion-based questions or questions without a single verifiable correct answer.
```

### Category 4: `rule_knowledge`
**Focus:** Official poker rules with specific scenario applications
**Prompt Template:**
```
Generate a poker rules trivia question based on a SPECIFIC table scenario.
Present a situation that requires knowledge of official TDA, WSOP, or Robert's Rules.
Example: "In a $2/$5 No-Limit game, Player A bets $50. Player B throws in a single $100 chip without saying anything. Under TDA rules, is this a call or a raise?"
DO NOT ask questions that can be answered with common sense.
```

### Category 5: `gto_theory`
**Focus:** Game Theory Optimal concepts with numerical/mathematical specifics
**Prompt Template:**
```
Generate a GTO theory trivia question that involves a specific mathematical concept or solver principle.
Include specific frequencies, equity thresholds, or strategic ratios.
Example: "According to the Minimum Defense Frequency (MDF) formula, if your opponent bets 75% of the pot on the river, what percentage of your range must you defend to prevent them from profiting with any bluff?"
Include the actual calculation in the explanation.
```

### Category 6: `tournament_facts`
**Focus:** Specific tournament records, statistics, and milestones
**Prompt Template:**
```
Generate a trivia question about a specific poker tournament fact — prize pools, field sizes, records, format details, or notable occurrences.
Example: "The 2006 WSOP Main Event set a record for largest field size at 8,773 entrants. Who won that year and what was the first-place prize?"
Every answer must be a verifiable fact.
```

### Category 7: `mtt_situations`
**Focus:** Multi-table tournament strategic scenarios
**Prompt Template:**
```
Generate a multi-table tournament SCENARIO question. The question MUST include:
- Specific stack sizes in BB (e.g., "you have 22 BB")
- Your exact position (UTG, MP, CO, BTN, SB, BB)
- Your exact hand with suit symbols (e.g., A♠K♥)
- Tournament context (buy-in, players left, payout details, bubble status)
- Other relevant player stack sizes
- A clear action question ("What should you do?")

Topics: bubble play, ICM pressure, short stack strategy, final table dynamics, pay jumps, satellite strategy, blind defense, ante stealing, re-entry decisions, multi-way pots.

Example: "You're in a $200 MTT, 45 left, 40 get paid. You hold A♠J♦ on BTN with 25 BB. A tight player opens 2.2x from MP. Two short stacks (6-8 BB) are in the blinds. What's the best play?"
```

### Category 8: `cash_game_situations`
**Focus:** Cash game strategic scenarios
**Prompt Template:**
```
Generate a cash game SCENARIO question. The question MUST include:
- Specific stack sizes (in BB or dollar amounts)
- Your exact position
- Your exact hand with suits
- Opponent's playing style or relevant reads
- The game stakes (e.g., "$1/$2 No-Limit")
- Board texture if postflop (e.g., "Flop: K♥ 8♦ 3♠")

Topics: deep stack play, implied odds, float betting, 3-bet pots, multi-way pots, exploiting recreational players, set mining, donk betting, check-raising, live vs online adjustments.

Example: "You're playing $2/$5 NL with $1,000 effective. You open A♦K♦ to $15 from MP. A loose-passive player calls from the BB. Flop: K♠ 8♥ 4♣ (Pot: $32). BB checks. What's the best bet sizing?"
```

### Category 9: `icm_chip_ev`
**Focus:** ICM and Chip EV calculations and scenarios
**Prompt Template:**
```
Generate an ICM or Chip EV SCENARIO question. The question MUST include:
- Exact stack sizes for all relevant players
- Prize pool or payout structure details
- The specific hand and position
- Tournament stage context

Topics: risk premium, bubble factor, Nash push/fold ranges, final table ICM, satellite ICM, chip EV vs dollar EV, deal-making, ICM chops, short stack survival.

Example: "Final table of a $1,000 MTT. Payouts: 1st $45K, 2nd $28K, 3rd $18K, 4th $12K. You have 20 BB in the CO. Chip leader (55 BB) is in the BB. You hold A♥K♥. Is shoving +cEV (chip EV) but -$EV (ICM), +$EV, or neutral?"
```

### Category 10: `gto_scenarios`
**Focus:** Solver-based decisions with specific board textures and ranges
**Prompt Template:**
```
Generate a GTO solver-based SCENARIO question. The question MUST include:
- Preflop action sequence
- Exact board texture
- Your specific hand
- Stack depth and pot size
- Position of all players involved

Topics: minimum defense frequency, polarized vs linear ranges, board texture analysis, c-bet strategy, blocker effects, check-raise frequency, overbetting, river decisions, mixed strategies.

Example: "You open A♦Q♣ from the CO, BB calls. Flop: J♥ 8♠ 3♦ (Pot: 6.5 BB). According to solver output, should you c-bet this flop at high frequency, low frequency, or check your entire range?"
```

---

## 4. Difficulty Distribution

Each category should maintain this distribution:
- **Easy (25%)**: Clear-cut situations where the correct play is well-established. Tests foundational knowledge. Most players with basic strategy knowledge should get these right.
- **Medium (50%)**: Requires solid strategic understanding. Multiple options are plausible but one is clearly best. Tests intermediate concepts.
- **Hard (25%)**: Expert-level decisions requiring ICM awareness, solver knowledge, or nuanced strategic reasoning. Only strong, studied players will consistently answer correctly.

---

## 5. Daily Generation Targets

The system should generate **20 new questions per category per day** = **200 total questions/day**.

### Target Pool Size
- **3,000 questions per category** = **30,000 total**
- At 200/day from cron, the pool fills in **~150 days** (assuming no failures)
- Bootstrap scripts can accelerate this with bulk generation

### Database Table
Questions are stored in `trivia_questions` with columns:
- `id` (UUID, primary key)
- `category` (text — one of the 10 category IDs above)
- `question` (text)
- `options` (text[] array of 4 options)
- `correct_index` (integer 0-3)
- `explanation` (text)
- `difficulty` (text — easy/medium/hard)
- `daily_date` (date — if assigned as a daily question)
- `created_at` (timestamptz)
- `subcategory` (text — optional, for topic tracking)
- `last_used_at` (timestamptz — auto-updated by trigger when served)
- `use_count` (integer — auto-incremented by trigger)
- `quality_score` (integer — default 5)

### History Tracking
When a player sees a question, it's recorded in `trivia_user_question_history`:
- `user_id`, `question_id`, `was_correct`, `seen_at`, `mode`
- Unique constraint on `(user_id, question_id)` — upserts update `seen_at`
- 60-day exclusion: questions seen by a user in the last 60 days are filtered out

---

## 6. Grok AI Generation Configuration

### Model: `grok-3`
### Temperature: `0.85` (high creativity, low repetition)
### Response Format: Raw JSON only (no markdown)

### System Prompt for All Categories:
```
You are a world-class poker expert and trivia question writer. You create scenario-based trivia questions for serious poker players.

ABSOLUTE RULES:
1. Every question must present a SPECIFIC game scenario — never a definition or textbook concept
2. Include specific stack sizes, positions, hand cards, and game context
3. All 4 answer options must be plausible actions a player might consider
4. The correct answer must be defensible by established poker theory, solver output, or ICM calculations
5. Explanations must be 2-4 sentences explaining WHY the answer is correct and why alternatives are wrong
6. Randomize which option (A/B/C/D) is correct — do NOT always put it in the same position
7. Use card suit symbols (♠♥♦♣) for hands
8. All facts must be verifiable and accurate

Return your response as a JSON array (no markdown, no code fences):
[
  {
    "question": "The complete question text with scenario details",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "2-4 sentence explanation of why this is correct",
    "difficulty": "easy|medium|hard",
    "subcategory": "specific topic within category"
  }
]
```

---

## 7. Running the Pipeline

### Automated (Cron Jobs — `vercel.json`)

1. **Daily Generator** (`/api/cron/trivia-daily-generator`) — runs at 11:59 PM CST
   - Generates 20 questions per category (200 total)
   - Selects 1 question as the next day's "Daily Challenge" question
   
2. **Bulk Pool Manager** (`/api/cron/generate-trivia-questions`) — runs every hour
   - Checks pool stats per category
   - Generates batches for the lowest categories to maintain balance
   - Target: 3,000 per category

### Manual Bootstrap (Admin Endpoints)

1. **`POST /api/admin/trivia-bootstrap`** — Seeds 250 questions per legacy category
2. **`POST /api/admin/trivia-bootstrap-strategy`** — Seeds 250 questions per strategy category
3. **`GET /api/admin/trivia-pool-status`** — Returns current pool stats and recommendations

### Manual Agent-Assisted Generation

When an agent needs to manually generate and insert questions:

// turbo
1. Run the bootstrap endpoint:
```bash
curl -X POST "https://smarter.poker/api/admin/trivia-bootstrap" \
  -H "Authorization: Bearer $CRON_SECRET"
```

// turbo
2. Check pool status:
```bash
curl "https://smarter.poker/api/admin/trivia-pool-status"
```

---

## 8. Quality Audit Checklist

When auditing generated questions, verify each one passes:

- [ ] **Scenario-based**: Question presents a specific game situation, not a definition
- [ ] **Complete context**: Stack sizes, position, hand, and game stage are all specified
- [ ] **4 plausible options**: No obviously wrong filler answers
- [ ] **Clear correct answer**: Defensible by theory/solver, not opinion
- [ ] **Strong explanation**: 2-4 sentences with strategic reasoning
- [ ] **Correct answer randomized**: Not always the same position (A/B/C/D)
- [ ] **Factually accurate**: All facts, names, dates, and rules are correct
- [ ] **Appropriate difficulty**: Matches the assigned easy/medium/hard label
