#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# AUTO-DEPLOY TRAINING MOBILE OPTIMIZATIONS
# ═══════════════════════════════════════════════════════════════════════════

echo "🚀 DEPLOYING TRAINING PAGE MOBILE OPTIMIZATIONS"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

cd /Users/smarter.poker/Documents/hub-vanguard

# Check status
echo "📋 Checking changes..."
git status --short

echo ""
echo "📦 Adding files..."
git add pages/hub/training.js
git add pages/hub/training/category/\[categoryId\].js
git add .gemini/TRAINING_MOBILE_OPTIMIZATION.md

echo ""
echo "💾 Committing..."
git commit -m "feat: Mobile-optimize training page with daily challenges

- Replace NEW FOR YOU with TODAY'S DAILY CHALLENGE (5 games, changes daily)
- Limit lanes to 4 games with View All card for mobile
- Make category headers clickable (navigate to detail page)
- Add category detail page with full game grid
- Optimize for mobile: horizontal scroll, thumb-friendly
- Daily challenges use difficulty 5-10 with 2x rewards badge"

if [ $? -eq 0 ]; then
    echo ""
    echo "🚀 Pushing to production..."
    git push
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo "✅ DEPLOYMENT SUCCESSFUL"
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo ""
        echo "Changes deployed:"
        echo "  ✅ Daily Challenge system (5 games, changes daily)"
        echo "  ✅ Mobile-optimized lanes (4 games each)"
        echo "  ✅ Clickable category headers"
        echo "  ✅ Category detail pages"
        echo ""
        echo "🌐 Vercel will auto-deploy in ~2 minutes"
        echo "📱 Check: https://your-app.vercel.app/hub/training"
    else
        echo ""
        echo "❌ Push failed - check your git configuration"
    fi
else
    echo ""
    echo "⚠️  Nothing to commit or commit failed"
fi
