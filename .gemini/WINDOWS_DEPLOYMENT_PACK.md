# 🚀 WINDOWS DEPLOYMENT PACK - READY

## **✅ YOUR CREDENTIALS**

### **Supabase URL:**
```
https://kuklfnapbkmacvwxktbh.supabase.co
```

### **Supabase Service Role Key (ADMIN ACCESS):**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0
```

### **Supabase Anon Key (Public):**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo
```

---

## **📦 FILES TO COPY TO WINDOWS**

Transfer these files from `/scripts/` folder:

1. ✅ **ingest_god_mode.py** - Main ingestion script
2. ✅ **requirements.txt** - Python dependencies
3. ✅ **windows-setup.bat** - Automated setup script
4. ✅ **WINDOWS_DEPLOYMENT.txt** - Full instructions
5. ✅ **GOD_MODE_FOLDER_STRUCTURE.md** - Folder organization guide

---

## **⚡ QUICK START (On Windows)**

### **Option 1: Automated Setup** (Easiest)
```cmd
1. Copy all 5 files above to Windows
2. Double-click: windows-setup.bat
3. Follow on-screen instructions
```

### **Option 2: Manual Setup**
```cmd
# Step 1: Install Python dependencies
pip install supabase-py pandas python-dotenv

# Step 2: Set environment variables (PowerShell)
$env:SUPABASE_URL="https://kuklfnapbkmacvwxktbh.supabase.co"
$env:SUPABASE_KEY="eyJhbGciOiJIU...bYc0"  # Use full key above

# Step 3: Test connection
python -c "from supabase import create_client; import os; client = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY')); print('Connected!')"

# Step 4: Run ingestion
python ingest_god_mode.py C:\PokerSolver\Raw
```

---

## **🗂️ FOLDER STRUCTURE (Windows)**

Create this exact structure:

```
C:\PokerSolver\Raw\
├── Cash\
│   └── ChipEV\
│       ├── 20bb\
│       │   ├── Flop\
│       │   ├── Turn\
│       │   └── River\
│       ├── 40bb\
│       │   ├── Flop\
│       │   ├── Turn\
│       │   └── River\
│       └── (... all stack sizes)
├── MTT\
│   ├── ChipEV\
│   ├── ICM\
│   └── PKO\
│       └── (same structure)
└── Spin\
    └── ChipEV\
        └── (same structure)
```

**File Naming**: `Board_AsKs2d.csv` (flop), `Board_AsKs2d3c.csv` (turn), etc.

---

## **🔑 ENVIRONMENT VARIABLES**

### **PowerShell** (Temporary - current session only):
```powershell
$env:SUPABASE_URL="https://kuklfnapbkmacvwxktbh.supabase.co"
$env:SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0"
```

### **CMD** (Temporary - current session only):
```cmd
set SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
set SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0
```

### **Permanent** (System-wide - requires admin):
```powershell
# PowerShell as Administrator
[Environment]::SetEnvironmentVariable("SUPABASE_URL", "https://kuklfnapbkmacvwxktbh.supabase.co", "User")
[Environment]::SetEnvironmentVariable("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0", "User")
```

---

## **📝 PIP INSTALL COMMAND**

```cmd
pip install supabase-py pandas python-dotenv
```

**OR** use requirements.txt:
```cmd
pip install -r requirements.txt
```

---

## **🧪 TEST CONNECTION**

```cmd
python -c "from supabase import create_client; import os; client = create_client('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.oZxe_-RYdGvfPHxg7EhSJx-E3Tl6nYG3YZGP8Q7bYc0'); print('✅ Connected!')"
```

Expected output: `✅ Connected!`

---

## **🚀 RUN INGESTION**

```cmd
# Basic usage
python ingest_god_mode.py C:\PokerSolver\Raw

# With progress output
python ingest_god_mode.py C:\PokerSolver\Raw 2>&1 | tee ingestion.log
```

---

## **📊 EXPECTED OUTPUT**

```
═══════════════════════════════════════════════════
GOD MODE OMNI-INGEST SCRIPT
═══════════════════════════════════════════════════
📁 Scanning: C:\PokerSolver\Raw
📊 Found 1,247 CSV files
─────────────────────────────────────────────────
[1/1247] Processing: Board_AsKs2d.csv
✅ Inserted: AsKs2d_BTN_vs_BB_40bb_Cash_ChipEV_Flop
[2/1247] Processing: Board_AsKs2d3c.csv
✅ Inserted: AsKs2d3c_BTN_vs_BB_40bb_Cash_ChipEV_Turn
...
[100/1247] Progress: 100/1247 (95 inserted, 3 skipped, 2 failed)
...
─────────────────────────────────────────────────
✅ INGESTION COMPLETE
   Total files: 1,247
   ✅ Inserted: 1,180
   ⏭️  Skipped: 65 (duplicates)
   ❌ Failed: 2
═══════════════════════════════════════════════════
```

---

## **⚠️ SECURITY NOTES**

1. **SERVICE_ROLE_KEY** = Full admin access to database
2. **Keep this key SECRET** - never commit to git or share publicly
3. **Use environment variables** instead of hardcoding in scripts
4. **Rotate keys** if compromised (regenerate in Supabase dashboard)

---

## **🐛 TROUBLESHOOTING**

| Issue | Solution |
|-------|----------|
| "Python not found" | Install Python 3.10+ and check "Add to PATH" during install |
| "pip not found" | Reinstall Python with pip enabled |
| "Module not found" | Run `pip install supabase-py` |
| "Connection refused" | Check SUPABASE_URL is correct |
| "Invalid API key" | Verify SERVICE_ROLE_KEY copied correctly (no line breaks) |
| "Permission denied" | Using anon key instead of service_role key |
| "scenario_hash exists" | Duplicate file - safe to skip |

---

## **✅ DEPLOYMENT CHECKLIST**

- [ ] Python 3.10+ installed on Windows
- [ ] Files copied to Windows machine
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] Environment variables set
- [ ] Connection tested successfully
- [ ] Folder structure created
- [ ] Sample CSV tested
- [ ] Ready for full ingestion

---

**You're ready to deploy on Windows!** 🚀

Copy the 5 files listed at the top, run `windows-setup.bat`, and start ingesting! 🔥
