#!/bin/bash
# Sync verified PokerAtlas URLs to Supabase database using curl

set -e

# Load environment
source .env.local 2>/dev/null || true

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://kuklfnapbkmacvwxktbh.supabase.co}"

# No hardcoded key fallback: the committed literal that used to live here was a
# secret and its signing key has since been rotated.
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Export it (or add it to .env.local) before running this script." >&2
  exit 1
fi
SUPABASE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

echo "════════════════════════════════════════════════════════════"
echo "🔄 SYNCING VERIFIED POKERATLAS URLS TO DATABASE"
echo "════════════════════════════════════════════════════════════"

# Get all venues from database
echo "📊 Fetching venues from database..."
DB_VENUES=$(curl -sk "${SUPABASE_URL}/rest/v1/poker_venues?select=id,name,city,state" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

TOTAL_DB=$(echo "$DB_VENUES" | jq length)
echo "   Found ${TOTAL_DB} venues in database"

# Read verified venues
VERIFIED_FILE="data/verified-poker-rooms.json"
TOTAL_VERIFIED=$(jq '.venues | length' "$VERIFIED_FILE")
echo "   Found ${TOTAL_VERIFIED} verified venues in JSON"
echo ""

MATCHED=0
UPDATED=0
NOT_FOUND=0

# Process each verified venue
jq -c '.venues[]' "$VERIFIED_FILE" | while read -r venue; do
    NAME=$(echo "$venue" | jq -r '.name')
    CITY=$(echo "$venue" | jq -r '.city')
    STATE=$(echo "$venue" | jq -r '.state')
    SLUG=$(echo "$venue" | jq -r '.slug')
    URL=$(echo "$venue" | jq -r '.url')

    # Normalize name for matching (lowercase, remove common words)
    SEARCH_NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/hotel.*casino//g; s/casino.*hotel//g; s/resort.*casino//g; s/casino.*resort//g; s/the //g; s/ & / /g; s/[^a-z0-9 ]//g' | xargs)

    # Try to find matching venue in database by state and partial name match
    FIRST_WORD=$(echo "$SEARCH_NAME" | awk '{print $1}')

    # Search for venue by first word and state
    MATCH=$(echo "$DB_VENUES" | jq -r --arg state "$STATE" --arg word "$FIRST_WORD" \
        '[.[] | select(.state == $state) | select(.name | ascii_downcase | contains($word))] | .[0] // empty')

    if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
        DB_ID=$(echo "$MATCH" | jq -r '.id')
        DB_NAME=$(echo "$MATCH" | jq -r '.name')

        # Update the venue with PokerAtlas URL
        RESULT=$(curl -sk -X PATCH "${SUPABASE_URL}/rest/v1/poker_venues?id=eq.${DB_ID}" \
          -H "apikey: ${SUPABASE_KEY}" \
          -H "Authorization: Bearer ${SUPABASE_KEY}" \
          -H "Content-Type: application/json" \
          -H "Prefer: return=minimal" \
          -d "{\"pokeratlas_url\": \"${URL}\", \"pokeratlas_slug\": \"${SLUG}\", \"scrape_url\": \"${URL}\", \"scrape_source\": \"pokeratlas\", \"scrape_status\": \"ready\"}" \
          -w "%{http_code}" -o /dev/null)

        if [ "$RESULT" = "204" ]; then
            echo "✅ ${NAME} -> ${DB_NAME} (${SLUG})"
            UPDATED=$((UPDATED + 1))
        else
            echo "❌ Failed to update ${NAME} (HTTP ${RESULT})"
        fi
    else
        echo "⚠️  Not found: ${NAME} (${CITY}, ${STATE})"
        NOT_FOUND=$((NOT_FOUND + 1))
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 SYNC COMPLETE"
echo "════════════════════════════════════════════════════════════"

# Get updated counts
WITH_URLS=$(curl -sk "${SUPABASE_URL}/rest/v1/poker_venues?pokeratlas_url=not.is.null&select=id" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range | sed 's/.*\///')

READY=$(curl -sk "${SUPABASE_URL}/rest/v1/poker_venues?scrape_status=eq.ready&select=id" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range | sed 's/.*\///')

echo "📈 Database Status:"
echo "   Venues with PokerAtlas URLs: ${WITH_URLS:-unknown}"
echo "   Venues ready to scrape: ${READY:-unknown}"
echo "════════════════════════════════════════════════════════════"
