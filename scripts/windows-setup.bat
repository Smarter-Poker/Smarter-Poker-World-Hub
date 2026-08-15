@echo off
REM ════════════════════════════════════════════════════════════════════════════
REM GOD MODE WINDOWS SETUP SCRIPT
REM Run this on your Windows machine to set up the ingestion environment
REM ════════════════════════════════════════════════════════════════════════════

echo ════════════════════════════════════════════════════════════════════════════
echo 🔥 GOD MODE WINDOWS SETUP
echo ════════════════════════════════════════════════════════════════════════════
echo.

REM Step 1: Check Python
echo 📦 Step 1: Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python not found!
    echo    Download from: https://www.python.org/downloads/
    echo    During install CHECK "Add Python to PATH"
    pause
    exit /b 1
)
python --version
echo ✅ Python found!
echo.

REM Step 2: Install dependencies
echo 📦 Step 2: Installing Python dependencies...
pip install supabase-py pandas python-dotenv
echo ✅ Dependencies installed!
echo.

REM Step 3: Set environment variables
echo 🔑 Step 3: Setting environment variables...
setx SUPABASE_URL "https://kuklfnapbkmacvwxktbh.supabase.co"
setx SUPABASE_KEY "<SET-FROM-YOUR-PASSWORD-MANAGER>"

REM Set for current session too
set SUPABASE_URL=https://kuklfnapbkmacvwxktbh.supabase.co
set SUPABASE_KEY=<SET-FROM-YOUR-PASSWORD-MANAGER>

echo ✅ Environment variables set!
echo.

REM Step 4: Test connection
echo 🔌 Step 4: Testing Supabase connection...
python -c "from supabase import create_client; import os; client = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY')); print('✅ Connection successful!')"
if %errorlevel% neq 0 (
    echo ⚠️  Connection test failed - check credentials
) else (
    echo ✅ Database connection working!
)
echo.

REM Step 5: Instructions
echo ════════════════════════════════════════════════════════════════════════════
echo ✅ SETUP COMPLETE
echo ════════════════════════════════════════════════════════════════════════════
echo.
echo 📋 NEXT STEPS:
echo.
echo 1. Create folder structure:
echo    C:\PokerSolver\Raw\MTT\ICM\40bb\Turn\
echo    (See GOD_MODE_FOLDER_STRUCTURE.md for details)
echo.
echo 2. Export solver data to folders
echo.
echo 3. Run ingestion:
echo    python ingest_god_mode.py C:\PokerSolver\Raw
echo.
echo 🔥 System ready for God Mode ingestion!
echo.
pause
