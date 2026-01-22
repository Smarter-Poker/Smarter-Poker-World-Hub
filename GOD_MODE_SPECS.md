# SMARTER.POKER "GOD MODE" SPECIFICATIONS

## 1. GAMEPLAY OBJECTIVE
We are building a Poker Training RPG with 100 Levels ("Games").
- **Session:** User plays a "Round" of 20 hands.
- **Progression:** Level 1 (85% passing grade) -> Level 10 (100% passing grade).
- **Core Loop:** Pre-Hand Animation -> User Decision -> Active Villain (Simulated) -> Health Bar Update.

## 2. THE 3-ENGINE ARCHITECTURE
The system routes every Game Title to one of three engines:

### ENGINE A: 'PIO' (Postflop Solver)
- **Use for:** Cash, MTT Postflop, C-Betting, 3-Bet Pots.
- **Source:** Supabase table `solved_spots_gold`.
- **CRITICAL:** ISOMORPHISM. The engine must randomly rotate suits (e.g., Spades -> Hearts) so users never see the same visual hand twice.
- **Constraint:** Track `(file_id + suit_hash)` to prevent duplicate questions.

### ENGINE B: 'CHART' (Preflop & ICM)
- **Use for:** Push/Fold, Bubble Pressure, Preflop Blueprint.
- **Source:** Static JSON files (HRC/Monker Exports) in `/data/charts`.
- **Logic:** Compare user input against static Range Charts. DO NOT query Pio.

### ENGINE C: 'SCENARIO' (Mental Game)
- **Use for:** Tilt Control, Variance Zen.
- **Source:** Hardcoded Scripts in `/data/scenarios`.
- **Logic:** "Rigged" hands (e.g., force a Bad Beat) to measure psychology/tilt.

## 3. TECH CONSTRAINTS
- **Frontend:** React / TypeScript.
- **Backend:** Python.
- **Database:** Supabase (PostgreSQL).
