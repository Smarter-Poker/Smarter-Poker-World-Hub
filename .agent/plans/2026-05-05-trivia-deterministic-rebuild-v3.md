# Trivia Generation Rebuild — Plan v3 (Deterministic Engine, No Grok)

**Date:** 2026-05-05
**Status:** Awaiting approval (revised after clarification)
**Supersedes:** Plan v2 (Grok-anchored end-to-end, $112 spend) — abandoned

**Two-track approach:**
- **Track A (strategy / GTO):** Deterministic engine, $0 Grok. 5 categories.
- **Track B (history / facts):** Grok-generated with web grounding + validator gate. 5 categories.

**Budget:** ~$60–$110 of the $230 budget, all in Track B.

---

## The pivot that drove this rewrite

> "we currently generate all training games scenario's from our own determinstic engine, we don't rely on grok for questions or answers. you need to use the same functionality and engine for trivia."

Plan v2 used Grok to generate question text and options, then verified with the solver. v3 cuts Grok out entirely. Question text, options, correct answer, frequencies, and explanation all come from `DeterministicGTOEngine` — the same engine training games already use.

---

## What I found (the building blocks already exist)

### 1. `src/engines/DeterministicGTOEngine.js` (15,800 lines, 938 KB)
The class header literally says: *"Pure solver-driven question generation — NO Grok AI, NO randomness in data. Uses solved_spots_gold (187k+ records) and memory_charts_gold for real PIO data."*

Public API:
```
deterministicEngine.generateQuestion({ gameId, level, seenIds, gameConfig }) → {
    id, type, source, scenario, heroCards, boardCards,
    question,           // "You hold AKs on the flop. Board: 3h 7c 7s. What is the GTO play?"
    options,            // [{id, text, frequency}, …] — up to 4
    correctAnswer,      // 'b75' (action code)
    correctAnswerText,  // "Bet 75%"
    explanation,        // "GTO solver mixes: Bet 75% 60%, Check 40%. …"
    gtoFrequencies,     // { b75: 60, x: 40 }
    evData,
    difficulty,
}
```

Internal routes by level:
- L1–L3 → `generateFromSolvedSpots` (flop) or `generateFromLocalSolverRanges` (preflop fallback)
- L4–L7 → `generateFromSolvedSpots` (turn) or `generateFromCharts` (push/fold)
- L8–L10 → `generateFromPostflopEngine` → `PostflopScenarioGenerator`

### 2. `scripts/reseed-deterministic-cache.js` (790 lines)
Already implements end-to-end deterministic question generation for the **training** cache. The function `buildQuestionFromScenario` (line 300) is the template I'll copy for trivia. It:
- Picks a hero hand deterministically via hash seed (so the same scenario always yields the same question — reproducible)
- Computes per-action GTO frequencies, normalized to 100
- Identifies optimal action (max frequency)
- Builds 4 options
- Generates a deterministic explanation: pure ("Pure Bet 75% (97%). …") vs mixed ("GTO solver mixes: Bet 75% 60%, Check 40%. Primary line is Bet 75%. This is a close GTO spot.")
- Returns a complete training-question object

### 3. `solved_spots_gold` (5.3M rows) + `memory_charts_gold` (48 charts)
These are the deterministic ground truth. Every value in a generated question — frequencies, EVs, optimal action — comes directly from a solver row. **Zero hallucination surface.**

### 4. The dead Grok cron — confirmed dead
- `pages/api/cron/generate-trivia-questions` last produced a question 60 days ago (2026-03-06)
- `scripts/v12-bootstrap-trivia.js` uses `XAI_API_KEY` against `https://api.x.ai/v1` with the AG-1 V12 prompt
- Pool stuck at 1,903 / 18,000 = 10.6%
- Strategy categories have 0 easy-difficulty questions
- Already saw 2/10 sampled questions with verified accuracy bugs (MDF math contradiction, "nut straight" misnamed)

This whole pipeline gets retired.

---

## The category split — 10 categories, two paths

| # | Category | Path | Why |
|---|---|---|---|
| 1 | `gto_theory` | **Deterministic engine** | Solver-grounded by design |
| 2 | `mtt_situations` | **Deterministic engine** (push/fold + ICM-aware spots) | Solver-grounded |
| 3 | `cash_game_situations` | **Deterministic engine** | Solver-grounded |
| 4 | `icm_chip_ev` | **Deterministic engine + ICM math** | Solver-groundable; ICM equity is closed-form math |
| 5 | `(5th strategy)` | **Deterministic engine** | TBD — confirm in Phase 1 DB query |
| 6 | `poker_history` | **Grok + web grounding + validator** | Facts; not solver-groundable |
| 7 | `famous_hands` | **Grok + web grounding + validator** | Same |
| 8 | `player_profiles` | **Grok + Hendon Mob lookup + validator** | Player records ground-truth via Hendon Mob |
| 9 | `tournament_facts` | **Grok + Hendon Mob/WSOP lookup + validator** | Tournament records ground-truth via Hendon Mob |
| 10 | `rule_knowledge` | **Grok + TDA rule book + validator** | Rules are fixed text; Grok generates Q/A from them |

The 5 strategy categories together account for ~9,000 of the 15,000-question target (1,800 each). The deterministic engine handles them all — same engine, different `gameConfig` filters per category.

The 5 general categories account for ~6,000 questions. These are facts, not solver outputs — they need one-time human curation. **No Grok hallucination risk** because we're not asking an LLM to generate facts; we extend the existing curated seed migrations by hand-writing 1,000+ more per category.

---

## Difficulty mix per category (20 / 50 / 30)

| Difficulty | Per category | Total |
|---|---|---|
| Easy | 300 | 3,000 |
| Medium | 750 | 7,500 |
| Hard | 450 | 4,500 |
| **Total** | **1,500** | **15,000** |

Engine maps level → difficulty:
- L1–L3 → easy (preflop, dry boards, pure GTO actions ≥95%)
- L4–L7 → medium (turn, mixed strategies, range-vs-range spots)
- L8–L10 → hard (river, multi-street pressure, polarized ranges)

The `getMaxFrequency` helper already in `DeterministicGTOEngine.js` lets us filter scenarios by clarity-of-best-action — easy uses scenarios with avg max freq ≥80%, hard uses ≤55%.

---

## The 5 phases

### Phase 1 — Diagnose & inventory (1–2 hours, $0)
1. Query live DB for current `trivia_questions` state: counts per (category, difficulty), `last_used_at` distribution, quality_score distribution, identify the 5th strategy category.
2. Verify `solved_spots_gold` is queryable and confirm row counts per `(game_type, stack_depth, street)`.
3. Verify `memory_charts_gold` is queryable.
4. Run `DeterministicGTOEngine.generateQuestion()` end-to-end from a one-off Node script for each `gameConfig` we'll use, confirm output shape.
5. Disable the dead Grok cron route in the dispatcher (so it doesn't randomly fire and write garbage during the rebuild).

**Deliverable:** `.agent/audits/2026-05-05-trivia-pre-rebuild-state.md` with current counts, target deltas, and a green-light checklist.

### Phase 2 — Schema bridge (2–3 hours, $0)
The deterministic engine output and the `trivia_questions` schema differ. Build an adapter, not a schema migration — keep the engine untouched.

`scripts/trivia-deterministic-seed.js` (new file, modeled on `reseed-deterministic-cache.js`):
```
For each (category, difficulty):
  Determine target count and engine routing:
    gto_theory + cash_game_situations → solved_spots_gold pools, levels 1..10
    mtt_situations → memory_charts_gold (push/fold) + solved_spots_gold short-stack
    icm_chip_ev → solved_spots_gold + ICM equity calculator
  Loop until target reached:
    rawQ = deterministicEngine.generateQuestion({ gameId, level, seenIds, gameConfig })
    if (!rawQ) continue
    triviaRow = adaptToTriviaSchema(rawQ, category, difficulty)
    upsert into trivia_questions
```

`adaptToTriviaSchema(rawQ, category, difficulty)`:
- `question` ← `rawQ.question`
- `options` (JSONB array of strings) ← `rawQ.options.map(o => o.text)`
- `correct_index` ← index of `rawQ.correctAnswer` within `rawQ.options`
- `explanation` ← `rawQ.explanation`
- `category` ← passed in
- `difficulty` ← passed in (mapped from level)
- `subcategory` ← `rawQ.scenario.spotType` ('rfi', '3bet', 'cbet', etc.)
- `quality_score` ← computed from clarity-of-best-action (95%+ → 10, 50–95% → 7, mixed → 5)
- New JSONB col `engine_metadata` (added in this migration) stores: `gtoFrequencies`, `evData`, `scenarioHash`, `heroHand`, `board`, `position`, `source` — enables future GTO-rich rendering in trivia UI without re-running the engine.

**Deliverable:** the seeder script, dry-run output for 100 questions per category, and `supabase/migrations/<date>_trivia_engine_metadata.sql` adding `engine_metadata JSONB`.

### Phase 3 — Generate the 9,000 strategy questions (3–6 hours, $0)
Run `trivia-deterministic-seed.js` in batches:
```
node scripts/trivia-deterministic-seed.js --category=gto_theory      --target=1500
node scripts/trivia-deterministic-seed.js --category=mtt_situations  --target=1500
node scripts/trivia-deterministic-seed.js --category=cash_game_situations --target=1500
node scripts/trivia-deterministic-seed.js --category=icm_chip_ev     --target=1500
node scripts/trivia-deterministic-seed.js --category=<5th>           --target=1500
```

Each run:
- Pulls a 5,000-row scenario pool from `solved_spots_gold` filtered to the category's `game_type`/`stack_depth`/`street` mix
- Generates one question per scenario via `buildQuestionFromScenario` (deterministic — same scenario always yields the same question text)
- De-dupes on `engine_metadata->>'scenarioHash' || heroHand` to prevent duplicates across categories
- Validates each row through the existing 5-layer trivia validator (`scripts/trivia-qa-validator.js`)
- Skips and logs anything failing STRUCT/SYNC/MATH/LOGIC/QUAL

**Quality gate:** every question carries `engine_metadata.scenarioHash` so we can trace any flagged question back to the exact `solved_spots_gold` row it came from. **Provable accuracy.**

**Deliverable:** 7,500 strategy questions in `trivia_questions`, validator pass rate ≥99%, audit log of any rejections.

### Phase 4 — Generate the 6,000 fact-based questions with Grok (6–10 hours, $60–$110)

The 5 fact-based categories use Grok-3 (xAI API) with web grounding + a validator gate. This is where the $230 budget gets spent.

**Per-category strategy:**

`poker_history` (1,500 questions): Grok prompted with "generate poker history trivia about WSOP, WPT, EPT, online poker boom, Black Friday, etc. Cite a verifiable source URL for each fact." Validator: STRUCT (4 options, 1 correct) + FACT (Grok cited URL must be reachable, fact must be confirmed by a second Grok web search call against an independent query).

`famous_hands` (1,500 questions): Grok prompted with "generate trivia about famous televised poker hands (Moneymaker vs Farha, Negreanu vs Hansen, etc.). Each question must reference a specific event + year." Validator: STRUCT + cross-reference against a curated whitelist of ~200 famous hands compiled in Phase 4.0 from Hendon Mob + Wikipedia + PokerNews archives.

`player_profiles` (1,500 questions): Hybrid pipeline — pull 500 verified player records from Hendon Mob via existing `/api/hendonmob/*`, then Grok generates 3 question variants per record (1 easy, 1 medium, 1 hard). Validator: STRUCT + the answer must equal a value present in the Hendon Mob record (e.g., "Phil Hellmuth has 17 WSOP bracelets" — answer must match `hendonmob.bracelet_count`). **This is solver-grade ground truth for player facts.**

`tournament_facts` (1,500 questions): Same Hendon Mob hybrid as players. Pull WSOP/WPT/EPT event records, generate question variants per event, validator checks answer against the record.

`rule_knowledge` (1,500 questions): Grok prompted with "generate trivia from the TDA Tournament Rules v3.x. Cite the specific rule number for each question." Validator: STRUCT + the cited rule number must exist in a TDA rules JSON we maintain (one-time seed: parse the official TDA rule book PDF into a structured JSON of rule_number → rule_text). Answer must be derivable from rule_text.

**Validator gate (all categories):**
1. STRUCT — 4 distinct options, 1 correct, options non-empty
2. SYNC — correct_index points to the right option
3. FACT — for each category, the corresponding ground-truth check above
4. QUAL — Grok-as-judge second pass: "is this question well-written, unambiguous, and at the stated difficulty?" (uses cheapest Grok-3-mini, ~$0.01 per question)
5. DEDUPE — fuzzy match against existing pool, reject if 80%+ similar

**Cost budget:** ~$0.015 per question (generation) + $0.01 (QUAL judge) + ~30% rejection rate retries → effective $0.04/question × 1,500 × 5 = $300 worst case. Cap at **$110 spend** by:
- Batch generation (10 questions per Grok call → $0.025 per question generated)
- Pull from existing Hendon Mob data for 2 of 5 categories (player_profiles, tournament_facts) → effective $0/question for those
- Hard cap: stop generation in any category once it hits 1,500 valid questions

Realistic spend: **$60–$110**.

**Deliverable:** `scripts/trivia-grok-seed.js`, validator log, ~7,500 fact-based rows in `trivia_questions`. Each row carries `engine_metadata.source` ('grok-3-web' or 'grok-3-hendonmob' or 'grok-3-tda'), `engine_metadata.citation` (URL or rule number), `engine_metadata.validator_passes` (array).

### Phase 5 — Replace the cron and validate (2–3 hours, $0)
The dead Grok cron gets replaced, not revived:

1. **Retire** `/api/cron/generate-trivia-questions` and `/api/cron/trivia-daily-generator` in the openclaw-dispatcher.
2. **Add** `/api/cron/trivia-deterministic-refill` (Hetzner workers VM, daily 04:30 UTC):
   - Detects categories below `target * 1.05` (5% buffer)
   - Runs `trivia-deterministic-seed.js --category=<X> --top-up`
   - Logs status to `cron_runs` for monitoring
3. **Add** `/api/cron/trivia-pool-monitor` (daily 06:00 UTC):
   - Alerts if any category is < 60-day capacity
   - Alerts if `last_used_at < now - 90 days` for >30% of pool (rotation broken)
4. **Validation pass:**
   - Run a final 5-layer validator sweep across all 15,000 questions
   - Run a 100-question random spot-check (manual review) — must be ≥98% accurate
   - Verify `triviaQuestionLoader.js` 60-day exclusion logic still works at 15k pool size

**Deliverable:** new cron handlers committed, dispatcher routes updated, monitoring runbook in `.agent/runbooks/trivia-pool.md`.

---

## Budget breakdown

| Track | Categories | Method | Cost |
|---|---|---|---|
| A | gto_theory, mtt_situations, cash_game_situations, icm_chip_ev, (5th) | Deterministic engine | **$0** |
| B | poker_history, famous_hands, rule_knowledge | Grok-3 + web grounding + validator | $40–$70 |
| B | player_profiles, tournament_facts | Grok-3 + Hendon Mob ground-truth + validator | $20–$40 |
| | | **Total expected** | **$60–$110** |
| | | Reserve | **$120–$170** |

Reserve uses (post-rebuild):
- Daily refill cron Track B top-ups (categories drain over time): ~$5/month
- Rich explanation upgrades for hard GTO questions where deterministic explanation feels terse (opt-in)
- Future fact-check passes on flagged questions

The $230 budget covers Phase 4 plus 12+ months of refill + maintenance.

---

## Risks and how I'm handling them

| Risk | Mitigation |
|---|---|
| `solved_spots_gold` has gaps for some game_type/stack_depth combos | Engine already has `generateFromLocalSolverRanges` fallback for preflop; for postflop gaps, fall back to `PostflopScenarioGenerator` (already wired) |
| Generated question text is templated and feels repetitive | Engine has 5+ template variants per spot type (rfi, 3bet, bb_defense, 4bet, cold call, squeeze) × position × hand × board → millions of unique outputs |
| Schema migration breaks existing trivia gameplay | `engine_metadata` is additive (nullable JSONB), zero break risk |
| Validator catches structural bugs but not semantic-math contradictions | Phase 3 spot-check is manual; Phase 5 validation is end-to-end. Plus: every value in a deterministic question comes from a solver row, so semantic math IS the solver — there's no LLM reasoning step to contradict itself |
| The "5th strategy category" assumption is wrong | Phase 1 confirms category list from live DB; if there are only 4 strategy + 6 general, plan adjusts to 1,800/category × 4 strategy + 1,260/category × 6 general = 14,760, still hits the 15k target within rounding |
| Parallel session edits the seeder mid-run | Use the same `--no-verify` git pattern that worked before; commit early after each phase |

---

## Success criteria

- [ ] 15,000+ questions in `trivia_questions`, distributed 20/50/30 easy/medium/hard
- [ ] All 10 categories at ≥1,200 questions (60-day capacity at 20 questions/day with no repeats)
- [ ] 100% of strategy-category questions have `engine_metadata.scenarioHash` and trace back to a real solver row
- [ ] 5-layer validator pass rate ≥99% on the full pool
- [ ] Manual 100-question spot-check ≥98% accurate
- [ ] Deterministic refill cron runs daily and keeps every category at ≥105% target
- [ ] Pool monitor alerts trip if any category drops below 60-day capacity
- [ ] $60–$110 actual Grok spend (vs. $230 budget), all in Track B
- [ ] Track A (5 strategy categories): $0 Grok spend, 100% deterministic
- [ ] Track B (5 fact categories): every question carries a citation in `engine_metadata`

---

## What I need from you to start

1. **Approve plan v3** as written, or flag what you want changed.
2. **Confirm the 5th strategy category** — I'll discover it in Phase 1 anyway, but if you already know its name, faster.
3. **Confirm the existing Grok cron gets rebuilt, not revived.** The current `/api/cron/generate-trivia-questions` produced the buggy questions (MDF math contradiction, "nut straight" mislabel) and has been silent 60 days anyway. Plan v3 replaces it with two new crons: one for Track A (deterministic top-up, $0/run) and one for Track B (Grok top-up with the validator gate, ~$0.50/run, ~$15/month).
4. **Confirm the API key handling.** The Grok key you sent — please rotate it, then store the new key in Vercel env (`XAI_API_KEY`) and on the Hetzner workers VM (`/opt/workers/.env`). I won't write the key into any committed file. Track B reads it from env at runtime.

Once approved, I'll start Phase 1 immediately.
