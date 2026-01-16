#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# GOD MODE MIGRATION FIX
# Syncs local migrations with remote and applies God Mode schema
# ═══════════════════════════════════════════════════════════════════════════

echo "🔧 FIXING MIGRATION SYNC..."
echo ""

cd /Users/smarter.poker/Documents/hub-vanguard

# Step 1: Pull existing remote migrations
echo "📥 Step 1: Pulling remote migrations to local..."
supabase db pull

if [ $? -eq 0 ]; then
    echo "   ✅ Remote migrations synced!"
else
    echo "   ⚠️  Pull failed. Trying repair method..."
    
    # Alternative: Repair migration history
    echo "   Marking remote migrations as reverted..."
    supabase migration repair --status reverted 001 002 003
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Migration history repaired!"
    else
        echo "   ❌ Repair failed. Will apply manually."
    fi
fi

echo ""

# Step 2: Now try to push God Mode migration
echo "🚀 Step 2: Applying God Mode migration..."
supabase db push

if [ $? -eq 0 ]; then
    echo "   ✅ God Mode migration applied!"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "✅ DATABASE MIGRATION COMPLETE"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Tables created:"
    echo "  • solved_spots_gold (Postflop engine)"
    echo "  • memory_charts_gold (Preflop engine)"
    echo ""
else
    echo "   ⚠️  Auto-push failed."
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "📋 MANUAL MIGRATION REQUIRED"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql"
    echo "2. Copy the contents of: supabase/migrations/004_build_god_mode_library.sql"
    echo "3. Paste and run in SQL Editor"
    echo ""
    echo "Or use Supabase CLI:"
    echo "  supabase db push --include-all"
    echo ""
fi

echo "🔥 Ready for ingestion once migration is applied!"
