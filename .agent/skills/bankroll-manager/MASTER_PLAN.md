# BANKROLL MANAGER — FULL CANONICAL BLUEPRINT (MILITARY-GRADE)

## SYSTEM PHILOSOPHY

The Bankroll Manager is the financial truth engine for gamblers.
It exists to eliminate self-deception, surface hidden leaks, enforce discipline awareness, and protect long-term EV.
The Personal Assistant serves the bankroll, not the user's ego.
All money movement is tracked, contextualized, and remembered permanently.

**NO data is smoothed.**
**NO category is silently merged.**
**NO losses are allowed to hide behind wins.**

---

## I. GLOBAL DATA TRACKING (IMMUTABLE LEDGER)

### A. UNIVERSAL FIELDS (ALL ENTRIES)
| Field | Description |
|-------|-------------|
| entry_id | Unique identifier |
| user_id | Owner reference |
| category | Poker Cash / Poker Tournament / Casino Table / Slots / Sports / Expense |
| location_id | GPS + venue |
| date | Entry date |
| start_time | Session start (if applicable) |
| end_time | Session end (if applicable) |
| gross_in | Money put in |
| gross_out | Money taken out |
| net_result | Calculated result |
| notes | Optional, non-financial |
| emotional_tag | Optional but logged |
| assistant_flaggable | true/false |

**Ledger entries are append-only.**
**Edits create revision records; originals are never deleted.**

---

## II. POKER TRACKING

### A. CASH GAMES
**Tracked per session:**
- Stakes
- Game type
- Table count
- Buy-ins (multiple)
- Cash-outs
- Time played
- Net result
- $/hour
- Seat type (optional)
- Table texture tag (soft/tough)

**Derived:**
- Winrate by stake
- Winrate by location
- Winrate by time-of-day
- Winrate by session length
- Leak classification per stake/location

### B. TOURNAMENTS
**Tracked per event:**
- Buy-in (incl rake)
- Re-entries
- Add-ons
- Finish position
- Field size
- Cash amount
- Net result
- ROI
- Format tags (turbo, bounty, etc)

**Derived:**
- ROI by buy-in tier
- Re-entry abuse detection
- Travel-adjusted ROI
- Late-reg EV decay tracking

---

## III. NON-POKER GAMBLING (HARD-SEPARATED)

### A. CASINO TABLE GAMES
**Tracked explicitly:**
- Game type
- Buy-in(s)
- Cash-out
- Time played
- Net result
- Betting style tag
- Emotional trigger tag

### B. SLOTS
**Tracked with enhanced scrutiny:**
- Total money in
- Total money out
- Net loss
- Time spent
- Machine/theme
- Session clustering

**SLOTS ARE NEVER MERGED WITH POKER RESULTS.**

### C. SPORTS BETTING
**Tracked per wager:**
- Sport
- Bet type
- Odds
- Stake
- Result
- Net profit/loss
- Parlay depth
- Live vs pre-game

**Derived:**
- Parlay leak detection
- Emotional betting clusters
- Losing streak amplification detection

---

## IV. EXPENSE & LIFE COST TRACKING

**Tracked expenses:**
- Flights
- Hotels
- Airbnb
- Gas
- Rental cars
- Ride share
- Meals
- Tips
- Tournament fees
- Series fees
- Entry visas / paperwork

**Each expense can be linked to:**
- Trip_id
- Casino/location
- Tournament series
- Cash grind trip

**Derived:**
- True trip ROI
- Location net profitability
- Cost-per-hour of play
- "Winning trip illusion" detection

---

## V. BANKROLL STRUCTURE

### A. LOGICAL BANKROLL SEGMENTATION
- Poker bankroll
- Casino bankroll
- Sports bankroll
- Life bankroll (optional read-only)

**Transfers between bankrolls:**
- Explicit
- Logged
- Assistant-flagged

### B. RISK RULES (USER-DEFINED, ASSISTANT-ENFORCED)
- Max buy-in %
- Max tournament buy-in %
- Stop-loss per session
- Stop-loss per day
- Monthly loss caps
- Shot-taking thresholds

**Rules are advisory unless strict mode enabled.**
**Violations are permanently logged.**

---

## VI. LOCATION & GAME-BASED LEAK DETECTION

### A. GEO-FENCING
**System activates upon:**
- Casino entry
- Card room entry
- Sportsbook entry

**Assistant pulls:**
- Lifetime results at location
- Results by stake at location
- Non-poker losses at location
- Time-of-day loss clusters

### B. REAL-TIME WARNINGS
**Examples:**
- "This location is -$X lifetime."
- "This stake is a losing configuration here."
- "Slots represent X% of your losses at this venue."
- "This session qualifies as a leak event."

**No blocking unless strict mode enabled.**

---

## VII. PERSONAL ASSISTANT BEHAVIOR ENGINE

### A. MEMORY
**Assistant remembers:**
- User goals
- Past warnings
- Promises to self
- Repeated leak patterns
- Historical justifications

### B. INTERVENTION LEVELS
| Level | Behavior |
|-------|----------|
| 0 | Silent logging |
| 1 | Context reminders |
| 2 | Explicit warnings |
| 3 | Pattern confrontation |
| 4 | Hard stop recommendation (strict mode) |

**Tone escalates ONLY with repeated evidence.**

### C. POST-SESSION TRUTH DELIVERY
**Assistant reframes results honestly:**
- Poker win + casino loss = net truth
- Travel-adjusted outcomes
- Leak acknowledgment summaries

---

## VIII. REPORTING LAYERS

### A. STANDARD REPORTS
- Lifetime bankroll graph
- Poker vs non-poker net
- Location profitability
- Game-type profitability
- Hourly efficiency
- Expense-adjusted EV

### B. BRUTAL TRUTH REPORTS (OPT-IN)
- "If you removed X, bankroll would be Y"
- Top 5 money leaks
- Highest EV decisions
- Lowest EV habits
- Emotional loss correlation

---

## IX. PSYCHOLOGICAL SAFEGUARDS

- Categories cannot be silently disabled
- Disabling tracking is logged
- Historical data is immutable
- Notes do not override results
- Assistant never lies or reframes to protect ego

---

## X. SYSTEM INVARIANTS (HARD LAWS)

1. **All money must be categorized.**
2. **Poker profits cannot subsidize hidden gambling.**
3. **Expenses count as losses until offset.**
4. **Location memory is permanent.**
5. **Assistant loyalty is to bankroll EV.**
6. **Truth is always available, even if user avoids it.**
7. **No "clean slate" resets.**
8. **Silence is data.**

---

## IMPLEMENTATION STATUS

| Phase | Status |
|-------|--------|
| Blueprint | COMPLETE |
| Database Schema | PENDING |
| Core Page | PENDING |
| Entry Forms | PENDING |
| Ledger System | PENDING |
| Personal Assistant | PENDING |
| Reporting Layer | PENDING |
| Geo-fencing | PENDING |

---

**SEAL: ANTIGRAVITY_PROJECT_MANAGER**
**STATUS: BLUEPRINT_LOCKED**
**TIMESTAMP: 2026-01-24**
