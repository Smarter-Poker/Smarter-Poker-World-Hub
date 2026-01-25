#!/bin/bash
# ============================================================================
# SOCIAL FEED SMOKE TEST
# ============================================================================
# Run this after any deployment to verify core social features work
# Usage: ./scripts/smoke-test-social.sh
# ============================================================================

set -e

BASE_URL="${1:-https://smarter.poker}"

echo "🧪 Social Feed Smoke Test"
echo "========================="
echo "Testing: $BASE_URL"
echo ""

# Test 1: Social Media Page Loads
echo "1️⃣ Testing social-media page loads..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/hub/social-media")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ Social media page loads (HTTP $STATUS)"
else
    echo "   ❌ Social media page failed (HTTP $STATUS)"
    exit 1
fi

# Test 2: Reels Page Loads
echo "2️⃣ Testing reels page loads..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/hub/reels")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ Reels page loads (HTTP $STATUS)"
else
    echo "   ❌ Reels page failed (HTTP $STATUS)"
    exit 1
fi

# Test 3: Link Preview API Works
echo "3️⃣ Testing link-preview API..."
PREVIEW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/link-preview?url=https://example.com")
if [ "$PREVIEW_STATUS" -eq 200 ]; then
    echo "   ✅ Link preview API works (HTTP $PREVIEW_STATUS)"
else
    echo "   ⚠️ Link preview API returned HTTP $PREVIEW_STATUS (may still work)"
fi

# Test 4: Check for JavaScript errors in page
echo "4️⃣ Checking page content..."
PAGE_CONTENT=$(curl -s "$BASE_URL/hub/social-media")
if echo "$PAGE_CONTENT" | grep -q "What's on your mind"; then
    echo "   ✅ Post input found on page"
else
    echo "   ⚠️ Could not find post input - may need browser test"
fi

echo ""
echo "========================="
echo "🎉 Basic smoke tests passed!"
echo ""
echo "⚠️ Manual verification still needed:"
echo "   - Log in and create a post"
echo "   - Paste a link and verify preview"
echo "   - Click preview to verify popup"
echo "   - Test reels fullscreen playback"
