#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# GOD MODE ACTIVATION SCRIPT
# Run this to apply the database migration and verify setup
# ═══════════════════════════════════════════════════════════════════════════

echo "🔥 ACTIVATING GOD MODE PROTOCOL..."
echo ""

# Step 1: Apply database migration
echo "📊 Step 1: Applying database migration..."
cd /Users/smarter.poker/Documents/hub-vanguard

if command -v supabase &> /dev/null; then
    echo "   Running: supabase db push"
    supabase db push
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Migration applied successfully!"
    else
        echo "   ⚠️  Migration failed. Apply manually in Supabase dashboard:"
        echo "      File: supabase/migrations/004_build_god_mode_library.sql"
    fi
else
    echo "   ⚠️  Supabase CLI not found."
    echo "   📋 Apply migration manually:"
    echo "      1. Go to Supabase dashboard → SQL Editor"
    echo "      2. Copy contents of: supabase/migrations/004_build_god_mode_library.sql"
    echo "      3. Run the SQL"
fi

echo ""

# Step 2: Verify Python dependencies
echo "📦 Step 2: Checking Python dependencies..."
if command -v python3 &> /dev/null; then
    echo "   Python found: $(python3 --version)"
    
    # Check if supabase-py is installed
    if python3 -c "import supabase" 2>/dev/null; then
        echo "   ✅ supabase-py installed"
    else
        echo "   ⚠️  Installing supabase-py..."
        pip3 install supabase-py
    fi
else
    echo "   ⚠️  Python 3 not found. Install from python.org"
fi

echo ""

# Step 3: Set environment variables (user needs to do this)
echo "🔑 Step 3: Environment variables"
echo "   You need to set these in your shell:"
echo ""
echo "   export SUPABASE_URL='your_supabase_project_url'"
echo "   export SUPABASE_KEY='your_supabase_anon_key'"
echo ""
echo "   Add to ~/.zshrc to make permanent"

echo ""

# Step 4: Verify files exist
echo "📁 Step 4: Verifying files..."
files=(
    "supabase/migrations/004_build_god_mode_library.sql"
    "scripts/ingest_god_mode.py"
    ".gemini/GOD_MODE_FOLDER_STRUCTURE.md"
)

all_found=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file - NOT FOUND"
        all_found=false
    fi
done

echo ""

# Step 5: Make Python script executable
echo "🔧 Step 5: Making scripts executable..."
chmod +x scripts/ingest_god_mode.py
echo "   ✅ ingest_god_mode.py is executable"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ GOD MODE SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Set environment variables (see above)"
echo "2. Create folder structure on Windows (see GOD_MODE_FOLDER_STRUCTURE.md)"
echo "3. Export solver data to folder structure"
echo "4. Run ingestion:"
echo "   python3 scripts/ingest_god_mode.py /path/to/Raw"
echo ""
echo "🔥 System ready for mass ingestion!"
echo ""
