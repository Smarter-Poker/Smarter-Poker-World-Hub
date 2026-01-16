# 🛠️ MIGRATION FIX GUIDE

## **Issue**: Remote/Local Migration Mismatch

Your Supabase project has migrations 001-003 remotely, but they're not in your local `supabase/migrations/` folder.

---

## **QUICK FIX OPTIONS**

### **Option 1: Auto-Fix Script** (Recommended)
```bash
chmod +x fix-migration.sh
./fix-migration.sh
```

This will:
1. Pull remote migrations to local
2. Apply God Mode migration (004)

---

### **Option 2: Manual Supabase Dashboard** (Guaranteed)

1. **Open Supabase SQL Editor**:
   - Go to: https://supabase.com/dashboard
   - Select your project
   - Click "SQL Editor" in left sidebar

2. **Copy Migration File**:
   ```bash
   cat supabase/migrations/004_build_god_mode_library.sql
   ```

3. **Paste into SQL Editor**:
   - Select all contents
   - Paste into editor
   - Click "Run"

4. **Verify**:
   - Go to "Table Editor"
   - You should see:
     - `solved_spots_gold`
     - `memory_charts_gold`

---

### **Option 3: Force Push with Include-All**
```bash
supabase db push --include-all
```

This forces all migrations to apply regardless of history.

---

## **After Migration Applied**

### **Verify Tables Exist**:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('solved_spots_gold', 'memory_charts_gold');
```

Should return both tables.

### **Check Indexes**:
```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('solved_spots_gold', 'memory_charts_gold');
```

Should show multiple indexes on each table.

---

## **Environment Setup** (After Migration)

### **Get Your Supabase Credentials**:

1. Go to Supabase Dashboard → Project Settings → API
2. Copy:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### **Set Environment Variables**:
```bash
export SUPABASE_URL='https://xxxxx.supabase.co'
export SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

# Test connection:
python3 -c "
from supabase import create_client
import os
client = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
print('✅ Connection successful!')
"
```

### **Make Permanent** (add to ~/.zshrc):
```bash
echo "export SUPABASE_URL='https://xxxxx.supabase.co'" >> ~/.zshrc
echo "export SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'" >> ~/.zshrc
source ~/.zshrc
```

---

## **What the Migration Does**

### **Drops Legacy Tables**:
- `solved_hands`
- `solved_hands_v2`
- `solved_hands_final`
- `gto_solutions`
- `preflop_charts`

### **Creates New Tables**:

#### **`solved_spots_gold`**:
- `id`: UUID primary key
- `scenario_hash`: Unique identifier (e.g., "As7d2h_BTN_vs_BB_40bb_MTT_ICM_Turn")
- `street`: Flop/Turn/River
- `stack_depth`: 20/40/60/80/100/200
- `game_type`: Cash/MTT/Spin
- `topology`: HU/3-Max/6-Max/9-Max
- `mode`: ChipEV/ICM/PKO
- `board_cards`: Array of cards
- `macro_metrics`: JSONB (range advantage, SPR, etc.)
- `strategy_matrix`: JSONB (all 1,326 hands)

#### **`memory_charts_gold`**:
- `id`: UUID primary key
- `chart_name`: Unique chart identifier
- `category`: Preflop/PushFold/Nash
- `chart_grid`: JSONB (opening ranges)

### **Adds Indexes**:
- Street, stack, game type, topology, mode
- Board cards (GIN index)
- Macro metrics (GIN index)
- Composite index for common queries

---

## **Test Ingestion** (After Setup)

### **Create Test CSV**:
```bash
mkdir -p ~/test-ingest/MTT/ICM/40bb/Turn
cat > ~/test-ingest/MTT/ICM/40bb/Turn/Board_AsKs2d3c.csv << 'EOF'
Hand,Fold_EV,Call_EV,Raise_EV,Fold_Freq,Call_Freq,Raise_Freq,Raise_Size
AhKd,0.0,8.2,10.5,0.0,0.0,1.0,66%
AhKs,0.0,8.1,10.4,0.0,0.0,1.0,66%
QsJh,0.0,5.2,5.3,0.0,0.55,0.45,75%
72o,-2.5,0.0,0.0,1.0,0.0,0.0,
EOF
```

### **Run Test Ingest**:
```bash
python3 scripts/ingest_god_mode.py ~/test-ingest
```

### **Expected Output**:
```
═════════════════════════════════════════════════
GOD MODE OMNI-INGEST SCRIPT
═════════════════════════════════════════════════
📁 Scanning: /Users/you/test-ingest
📊 Found 1 CSV files
─────────────────────────────────────────────────
[1/1] Processing: Board_AsKs2d3c.csv
✅ Inserted: As7d2h3c_BTN_vs_BB_40bb_MTT_ICM_Turn
─────────────────────────────────────────────────
✅ INGESTION COMPLETE
   Total files: 1
   ✅ Inserted: 1
   ⏭️  Skipped: 0
   ❌ Failed: 0
═════════════════════════════════════════════════
```

### **Verify in Database**:
```sql
SELECT 
    scenario_hash, 
    street, 
    stack_depth, 
    game_type, 
    mode,
    board_cards,
    macro_metrics->>'hand_count' as hands
FROM solved_spots_gold
LIMIT 1;
```

---

## **Troubleshooting**

| Error | Solution |
|-------|----------|
| "Migration version already exists" | Use `supabase migration repair` |
| "Permission denied" | Check Supabase API key has correct permissions |
| "Table already exists" | Drop tables manually or skip migration |
| "Connection refused" | Verify SUPABASE_URL is correct |
| "Invalid API key" | Regenerate anon key in dashboard |

---

## **Ready Status**

✅ **Setup Complete When**:
- [ ] Migration applied (tables exist)
- [ ] Environment variables set
- [ ] Test ingestion successful
- [ ] No connection errors

✅ **Ready for Production When**:
- [ ] Windows folder structure created
- [ ] PioSOLVER configured for export
- [ ] Sample batch tested (10-100 files)
- [ ] Monitoring script running

---

**Choose your fix method above and proceed!** 🚀
