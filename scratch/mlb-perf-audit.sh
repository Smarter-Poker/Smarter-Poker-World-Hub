#!/bin/bash
SITE="https://smarter.poker"
OUTDIR="/tmp/lighthouse-mlb-reports"
mkdir -p "$OUTDIR"

echo "=== LIGHTHOUSE PERFORMANCE AUDIT (MLB ANALYTICS) ==="
echo ""

# Define MLB critical pages
PAGES=(
  "/hub/MLB-ANALYTICS" "MLB Hub Dashboard"
  "/hub/MLB-ANALYTICS/players" "MLB Players"
  "/hub/MLB-ANALYTICS/teams" "MLB Teams"
  "/hub/MLB-ANALYTICS/accuracy" "MLB Accuracy"
  "/hub/MLB-ANALYTICS/backtest" "MLB Backtest"
  "/hub/MLB-ANALYTICS/status" "MLB Status"
  "/hub/MLB-ANALYTICS/portfolio" "MLB Portfolio"
)

# Run lighthouse for each page
for ((i=0; i<${#PAGES[@]}; i+=2)); do
  PATH_SLUG="${PAGES[i]}"
  NAME="${PAGES[i+1]}"
  SAFE_NAME=$(echo "$NAME" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')

  echo "📊 Auditing: $NAME ($SITE$PATH_SLUG)"
  lighthouse "$SITE$PATH_SLUG" \
    --output=json \
    --output-path="$OUTDIR/$SAFE_NAME.json" \
    --chrome-flags="--headless --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo \
    --quiet 2>/dev/null

  # Extract scores
  if [ -f "$OUTDIR/$SAFE_NAME.json" ]; then
    python3 -c "
import json
with open('$OUTDIR/$SAFE_NAME.json') as f:
    r = json.load(f)
    cats = r.get('categories', {})
    perf = int(cats.get('performance', {}).get('score', 0) * 100)
    a11y = int(cats.get('accessibility', {}).get('score', 0) * 100)
    bp = int(cats.get('best-practices', {}).get('score', 0) * 100)
    seo = int(cats.get('seo', {}).get('score', 0) * 100)
    print(f'  Perf: {perf} | A11y: {a11y} | BP: {bp} | SEO: {seo}')
"
  fi
  echo ""
done

echo "Reports saved to: $OUTDIR/"
