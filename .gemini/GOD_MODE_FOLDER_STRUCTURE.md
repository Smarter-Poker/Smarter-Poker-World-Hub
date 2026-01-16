# 🗺️ GOD MODE FOLDER STRUCTURE MAP
## Windows Solver Output Organization

This is the **exact folder structure** you need to create on your Windows machine.
The `ingest_god_mode.py` script will automatically detect all variables from the path.

---

## **ROOT STRUCTURE**

```
C:\PokerSolver\Raw\
├── Cash\
│   ├── ChipEV\
│   │   ├── 20bb\
│   │   │   ├── Flop\
│   │   │   │   ├── Board_AsKs2d.csv
│   │   │   │   ├── Board_Ah7h2c.csv
│   │   │   │   └── ... (all flop boards)
│   │   │   ├── Turn\
│   │   │   │   ├── Board_AsKs2d3c.csv
│   │   │   │   ├── Board_Ah7h2c8d.csv
│   │   │   │   └── ... (all turn boards)
│   │   │   └── River\
│   │   │       ├── Board_AsKs2d3c7h.csv
│   │   │       └── ... (all river boards)
│   │   ├── 40bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   ├── 60bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   ├── 80bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   ├── 100bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   └── 200bb\
│   │       ├── Flop\
│   │       ├── Turn\
│   │       └── River\
│   └── (No other modes for Cash - only ChipEV)
│
├── MTT\
│   ├── ChipEV\
│   │   ├── 20bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   ├── 40bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   └── ... (all stack sizes)
│   ├── ICM\
│   │   ├── 20bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   ├── 40bb\
│   │   │   ├── Flop\
│   │   │   ├── Turn\
│   │   │   └── River\
│   │   └── ... (all stack sizes)
│   └── PKO\
│       ├── 20bb\
│       │   ├── Flop\
│       │   ├── Turn\
│       │   └── River\
│       └── ... (all stack sizes)
│
└── Spin\
    └── ChipEV\
        ├── 20bb\
        │   ├── Flop\
        │   ├── Turn\
        │   └── River\
        ├── 40bb\
        │   ├── Flop\
        │   ├── Turn\
        │   └── River\
        └── ... (all stack sizes)
```

---

## **NAMING CONVENTIONS**

### **Folder Names (EXACT case matters)**

| Level | Valid Values | Example |
|-------|--------------|---------|
| **Game Type** | `Cash`, `MTT`, `Spin` | `/Cash/` |
| **Mode** | `ChipEV`, `ICM`, `PKO` | `/ICM/` |
| **Stack** | `20bb`, `40bb`, `60bb`, `80bb`, `100bb`, `200bb` | `/40bb/` |
| **Street** | `Flop`, `Turn`, `River` | `/Turn/` |

### **File Names**

**Format**: `Board_[cards].csv`

**Examples**:
- Flop (3 cards): `Board_AsKs2d.csv`
- Turn (4 cards): `Board_AsKs2d3c.csv`
- River (5 cards): `Board_AsKs2d3c7h.csv`

**Card Format**:
- Rank: `A`, `K`, `Q`, `J`, `T`, `9`, `8`, `7`, `6`, `5`, `4`, `3`, `2`
- Suit: `s` (spades), `h` (hearts), `d` (diamonds), `c` (clubs)

---

## **CSV FILE FORMAT**

Each CSV should have these columns (header row required):

```csv
Hand,Fold_EV,Call_EV,Raise_EV,Fold_Freq,Call_Freq,Raise_Freq,Raise_Size
AhKd,0.0,8.2,10.5,0.0,0.0,1.0,66%
AhKs,0.0,8.1,10.4,0.0,0.0,1.0,66%
QsJh,0.0,5.2,5.3,0.0,0.55,0.45,75%
72o,-2.5,0.0,0.0,1.0,0.0,0.0,
```

**Column Definitions**:
- `Hand`: 4-char hand (e.g., `AhKd`, `QsJh`)
- `Fold_EV`: Expected value of folding
- `Call_EV`: Expected value of calling
- `Raise_EV`: Expected value of raising
- `Fold_Freq`: Frequency to fold (0.0 to 1.0)
- `Call_Freq`: Frequency to call (0.0 to 1.0)
- `Raise_Freq`: Frequency to raise (0.0 to 1.0)
- `Raise_Size`: Raise sizing (e.g., `66%`, `75%`, `3bb`)

**Note**: Frequencies must sum to 1.0 for each hand.

---

## **AUTOMATION STRATEGIES**

### **Option 1: Manual Organization**
1. Configure PioSOLVER to output one file at a time
2. Manually move each CSV to the correct folder
3. Use batch scripts to automate renaming

### **Option 2: Batch Export Script**
Create a Windows batch script that:
1. Runs PioSOLVER with specific parameters
2. Captures output CSV
3. Auto-moves to correct folder based on parameters

### **Option 3: Round Robin Script**
1. Create a queue of all combinations (Game Type × Mode × Stack × Street × Board)
2. Process queue sequentially
3. Auto-organize output into folder structure

---

## **VALIDATION CHECKLIST**

Before running `ingest_god_mode.py`, verify:

- [ ] All folder names match EXACT case (`Cash` not `cash`)
- [ ] Stack folders use `bb` suffix (`40bb` not `40` or `40BB`)
- [ ] Street folders are capitalized (`Flop` not `flop`)
- [ ] CSV files follow `Board_[cards].csv` pattern
- [ ] Board cards use lowercase suits (`As` not `AS`)
- [ ] Each CSV has all required columns
- [ ] No duplicate files in same path

---

## **EXAMPLE PATHS**

```
✅ CORRECT:
C:\PokerSolver\Raw\MTT\ICM\40bb\Turn\Board_AsKs2d3c.csv

❌ INCORRECT:
C:\PokerSolver\Raw\mtt\icm\40\turn\board_AsKs2d3c.csv
  (wrong case, missing 'bb', wrong file naming)
```

---

## **SCRIPT USAGE**

Once folder structure is ready:

```bash
# Install dependencies
pip install supabase-py

# Set environment variables
export SUPABASE_URL="your_supabase_url"
export SUPABASE_KEY="your_supabase_key"

# Run ingestion
python scripts/ingest_god_mode.py C:\PokerSolver\Raw
```

The script will:
1. Scan all subdirectories
2. Auto-detect variables from paths
3. Parse CSV files
4. Calculate EV loss for all hands
5. Detect mixed strategies
6. Insert into `solved_spots_gold` table
7. Skip duplicates automatically

---

## **ESTIMATED SCOPE**

**Total Scenarios** (rough estimate):

```
Game Types: 3 (Cash, MTT, Spin)
Modes per Type:
  - Cash: 1 (ChipEV)
  - MTT: 3 (ChipEV, ICM, PKO)
  - Spin: 1 (ChipEV)
Stack Depths: 6 (20, 40, 60, 80, 100, 200)
Streets: 3 (Flop, Turn, River)
Boards per Street:
  - Flop: ~100 representative boards
  - Turn: ~50 representative boards  
  - River: ~25 representative boards

Total Files ≈ 10,000 - 50,000 scenarios
```

---

## **TROUBLESHOOTING**

### **If ingestion fails:**

1. **Check file path**: Ensure no spaces or special characters
2. **Verify CSV format**: Open file, check headers match exactly
3. **Check database**: Run migration first (`004_build_god_mode_library.sql`)
4. **Check permissions**: Ensure Supabase key has INSERT access
5. **Check logs**: Script outputs detailed error messages

### **Common Issues:**

| Error | Solution |
|-------|----------|
| "scenario_hash already exists" | Duplicate file - safe to skip |
| "Missing required variables" | Check folder structure matches map |
| "Invalid board card count" | File name doesn't match Flop/Turn/River |
| "Database connection failed" | Check SUPABASE_URL and SUPABASE_KEY |

---

**Structure created. Ready for God Mode ingestion.** 🚀
