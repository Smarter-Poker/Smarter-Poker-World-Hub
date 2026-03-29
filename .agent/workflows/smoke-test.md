---
description: Post-deploy smoke test — validate all critical endpoints and hub pages after a Vercel deployment
---

# Deployment Smoke Test

Run this after every deploy to verify critical paths are working.

## Prerequisites
- Deployment URL (production or preview)
- If preview, use the Vercel preview URL

## Step 1: Validate API Endpoints

// turbo
```bash
echo "=== SMARTER.POKER SMOKE TEST ==="
echo ""

SITE="https://smarter.poker"
PASS=0
FAIL=0

check() {
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 10 "$1")
  if [ "$STATUS" = "200" ]; then
    echo "✅ $2 — $STATUS"
    PASS=$((PASS + 1))
  else
    echo "❌ $2 — $STATUS"
    FAIL=$((FAIL + 1))
  fi
}

# API Endpoints
check "$SITE/api/poker/live-tables" "Live Tables API"
check "$SITE/api/poker/scraper-health" "Scraper Health API"
check "$SITE/api/poker/series" "Tournament Series API"
check "$SITE/api/poker/game-trends" "Game Trends API"
check "$SITE/api/poker/peak-activity" "Peak Activity API"

# Hub Pages
check "$SITE/hub/poker-near-me" "Poker Near Me"
check "$SITE/hub/poker-near-me-lobby" "PNM Lobby"
check "$SITE/hub/daily-tournaments" "Daily Tournaments"
check "$SITE/hub/events-calendar" "Events Calendar"
check "$SITE/hub/social-media" "Social Media"
check "$SITE/hub/training" "Training Hub"
check "$SITE/hub/bankroll" "Bankroll Manager"
check "$SITE/hub/trivia" "Trivia Hub"
check "$SITE/hub/video-library" "Video Library"

# Auth Pages
check "$SITE/login" "Login Page"
check "$SITE/signup" "Signup Page"

echo ""
echo "=== RESULTS: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  FAILURES DETECTED — investigate before promoting to production"
else
  echo "✅ ALL CLEAR — deployment is healthy"
fi
```

## Step 2: Check Sentry for Errors (if Sentry MCP available)

After deploy, wait 2-3 minutes then ask the agent:
> "Check Sentry for any new errors in the last 5 minutes on the smarter-poker project"

## Step 3: Verify Live Data Freshness

// turbo
```bash
echo "=== DATA FRESHNESS CHECK ==="
curl -s "https://smarter.poker/api/poker/scraper-health" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(json.dumps(d, indent=2))
except:
    print('⚠️  Could not parse scraper health response')
"
```

## Step 4: Visual Spot Check (Optional)

Use the browser tool to load the homepage and take a screenshot:
1. Open https://smarter.poker
2. Verify header renders correctly
3. Check that the hub grid loads
4. Verify no console errors
