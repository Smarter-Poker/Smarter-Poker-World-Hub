---
description: Performance audit — run Lighthouse against critical hub pages to measure Core Web Vitals, SEO, and accessibility scores
---

# Performance Audit (Lighthouse)

Run periodic performance audits to catch regressions and track improvements.

## Prerequisites
- Chrome/Chromium installed (Playwright installs this)
- Internet access to reach the production site

## Step 1: Install Lighthouse CLI (one-time)

// turbo
```bash
npm list -g lighthouse 2>/dev/null | grep lighthouse || npm install -g lighthouse
```

## Step 2: Run Lighthouse on Critical Pages

Run audits against the most important user-facing pages:

```bash
SITE="https://smarter.poker"
OUTDIR="/tmp/lighthouse-reports"
mkdir -p "$OUTDIR"

echo "=== LIGHTHOUSE PERFORMANCE AUDIT ==="
echo ""

# Define critical pages
PAGES=(
  "/" "Homepage"
  "/hub/poker-near-me" "Poker Near Me"
  "/hub/daily-tournaments" "Daily Tournaments"
  "/hub/training" "Training Hub"
  "/hub/social-media" "Social Media"
  "/hub/trivia" "Trivia Hub"
  "/login" "Login Page"
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
```

## Step 3: Analyze Results

After running, the agent should:
1. Flag any score below 50 as **critical**
2. Flag any score below 70 as **needs improvement**
3. Compare against previous run if available
4. Create a summary table with all scores

## Score Targets

| Category | Target | Critical Threshold |
|----------|--------|--------------------|
| Performance | 80+ | Below 50 |
| Accessibility | 90+ | Below 70 |
| Best Practices | 90+ | Below 70 |
| SEO | 90+ | Below 70 |

## Step 4: Generate Report Artifact

Create a markdown artifact with:
- Score table for all pages
- Top 5 improvement opportunities per page
- Comparison to previous audit (if available)
- Recommended fixes prioritized by impact
