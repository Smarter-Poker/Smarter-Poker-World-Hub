#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# GOD MODE MIGRATION DEPLOYMENT
# Apply all game engine migrations to Supabase
# ═══════════════════════════════════════════════════════════════════════════

echo "🔥 GOD MODE MIGRATION DEPLOYMENT"
echo "═════════════════════════════════════════════════════════════════════════"
echo ""

cd /Users/smarter.poker/Documents/hub-vanguard

# Check if in correct directory
if [ ! -d "supabase/migrations" ]; then
    echo "❌ Error: Not in correct directory"
    echo "   Expected: /Users/smarter.poker/Documents/hub-vanguard"
    echo "   Current: $(pwd)"
    exit 1
fi

echo "📂 Current directory: $(pwd)"
echo ""

# List migrations
echo "📋 Migrations to apply:"
ls -1 supabase/migrations/ | grep -E '\.sql$'
echo ""

# Apply migrations
echo "🚀 Applying migrations..."
supabase db push

if [ $? -eq 0 ]; then
    echo ""
    echo "═════════════════════════════════════════════════════════════════════════"
    echo "✅ MIGRATIONS APPLIED SUCCESSFULLY"
    echo "═════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "🎯 Next steps:"
    echo ""
    echo "1. Verify tables exist:"
    echo "   SELECT table_name FROM information_schema.tables"
    echo "   WHERE table_schema = 'public'"
    echo "   AND table_name IN ('solved_spots_gold', 'training_levels', 'user_question_history');"
    echo ""
    echo "2. Check levels seeded:"
    echo "   SELECT level_id, level_name, game_mode FROM training_levels ORDER BY level_id;"
    echo ""
    echo "3. Test quiz generation:"
    echo "   See TRAINING_UI_INTEGRATION_GUIDE.md"
    echo ""
else
    echo ""
    echo "═════════════════════════════════════════════════════════════════════════"
    echo "⚠️  MIGRATION FAILED"
    echo "═════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Alternative: Apply manually in Supabase Dashboard"
    echo ""
    echo "1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql"
    echo "2. Copy contents of: supabase/migrations/004_build_god_mode_library.sql"
    echo "3. Run in SQL Editor"
    echo "4. Repeat for: supabase/migrations/005_game_engine.sql"
    echo ""
fi
