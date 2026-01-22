#!/bin/bash
# API Testing Utility for Smarter.Poker
# Quick API endpoint testing and validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default config
BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_KEY="${SUPABASE_ANON_KEY:-}"

# ============================================
# HTTP Requests
# ============================================

# GET request
get() {
    local path="$1"
    local url="${BASE_URL}${path}"
    
    echo -e "${CYAN}GET $url${NC}"
    
    if command -v http &> /dev/null; then
        http GET "$url" 2>/dev/null
    else
        curl -s "$url" | jq '.' 2>/dev/null || curl -s "$url"
    fi
}

# POST request
post() {
    local path="$1"
    local data="$2"
    local url="${BASE_URL}${path}"
    
    echo -e "${CYAN}POST $url${NC}"
    
    if command -v http &> /dev/null; then
        echo "$data" | http POST "$url" Content-Type:application/json
    else
        curl -s -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" | jq '.' 2>/dev/null || echo "$data" | curl -s -X POST "$url" -d @-
    fi
}

# PUT request
put() {
    local path="$1"
    local data="$2"
    local url="${BASE_URL}${path}"
    
    echo -e "${CYAN}PUT $url${NC}"
    
    curl -s -X PUT "$url" \
        -H "Content-Type: application/json" \
        -d "$data" | jq '.'
}

# DELETE request
delete() {
    local path="$1"
    local url="${BASE_URL}${path}"
    
    echo -e "${CYAN}DELETE $url${NC}"
    
    curl -s -X DELETE "$url" | jq '.'
}

# ============================================
# Supabase API
# ============================================

# Query Supabase table
supabase_query() {
    local table="$1"
    local query="${2:-}"
    
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
        echo -e "${RED}❌ SUPABASE_URL and SUPABASE_ANON_KEY required${NC}"
        return 1
    fi
    
    local url="${SUPABASE_URL}/rest/v1/${table}${query}"
    
    echo -e "${CYAN}Querying: $table${NC}"
    
    curl -s "$url" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $SUPABASE_KEY" | jq '.'
}

# Insert into Supabase
supabase_insert() {
    local table="$1"
    local data="$2"
    
    curl -s "${SUPABASE_URL}/rest/v1/${table}" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "$data" | jq '.'
}

# ============================================
# Health Checks
# ============================================

# Check endpoint health
health_check() {
    local url="${1:-$BASE_URL/api/health}"
    
    echo -e "${CYAN}🏥 Health check: $url${NC}"
    
    local start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    local end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    local duration=$((end - start))
    
    if [ "$response" -eq 200 ]; then
        echo -e "${GREEN}✓ OK (${response}) - ${duration}ms${NC}"
    else
        echo -e "${RED}✗ FAILED (${response}) - ${duration}ms${NC}"
        return 1
    fi
}

# Check all endpoints
check_all() {
    echo -e "${YELLOW}🔍 Checking all endpoints...${NC}"
    echo ""
    
    local endpoints=(
        "/api/health"
        "/"
        "/training"
        "/api/auth/session"
    )
    
    local failed=0
    
    for endpoint in "${endpoints[@]}"; do
        health_check "${BASE_URL}${endpoint}" || ((failed++))
    done
    
    echo ""
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✅ All endpoints healthy${NC}"
    else
        echo -e "${RED}❌ $failed endpoint(s) failed${NC}"
    fi
}

# ============================================
# Load Testing
# ============================================

# Simple load test
load_test() {
    local url="${1:-$BASE_URL}"
    local requests="${2:-100}"
    local concurrent="${3:-10}"
    
    echo -e "${YELLOW}⚡ Load testing: $url${NC}"
    echo -e "${CYAN}   Requests: $requests, Concurrent: $concurrent${NC}"
    echo ""
    
    if command -v hey &> /dev/null; then
        hey -n "$requests" -c "$concurrent" "$url"
    elif command -v ab &> /dev/null; then
        ab -n "$requests" -c "$concurrent" "$url"
    else
        echo -e "${YELLOW}⚠️  Install 'hey' for load testing: brew install hey${NC}"
        
        # Fallback: simple sequential test
        local start=$(date +%s)
        for i in $(seq 1 "$requests"); do
            curl -s -o /dev/null "$url"
            echo -ne "\r  Progress: $i/$requests"
        done
        local end=$(date +%s)
        echo ""
        echo "  Duration: $((end - start))s"
    fi
}

# ============================================
# Response Validation
# ============================================

# Validate JSON response
validate_json() {
    local url="$1"
    local jq_filter="${2:-.}"
    
    echo -e "${CYAN}🔍 Validating JSON: $url${NC}"
    
    local response=$(curl -s "$url")
    
    if echo "$response" | jq -e '.' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Valid JSON${NC}"
        echo "$response" | jq "$jq_filter"
    else
        echo -e "${RED}✗ Invalid JSON${NC}"
        echo "$response"
        return 1
    fi
}

# Check response contains field
check_field() {
    local url="$1"
    local field="$2"
    
    local response=$(curl -s "$url")
    
    if echo "$response" | jq -e ".$field" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Field '$field' present${NC}"
        echo "$response" | jq ".$field"
    else
        echo -e "${RED}✗ Field '$field' missing${NC}"
        return 1
    fi
}

# ============================================
# Main
# ============================================

case "${1:-help}" in
    get)
        get "$2"
        ;;
    post)
        post "$2" "$3"
        ;;
    put)
        put "$2" "$3"
        ;;
    delete)
        delete "$2"
        ;;
    supabase)
        supabase_query "$2" "$3"
        ;;
    insert)
        supabase_insert "$2" "$3"
        ;;
    health)
        health_check "$2"
        ;;
    check-all)
        check_all
        ;;
    load)
        load_test "$2" "$3" "$4"
        ;;
    validate)
        validate_json "$2" "$3"
        ;;
    field)
        check_field "$2" "$3"
        ;;
    help|*)
        echo "API Testing Utility"
        echo ""
        echo "HTTP Requests:"
        echo "  $0 get <path>                 - GET request"
        echo "  $0 post <path> <json>         - POST request"
        echo "  $0 put <path> <json>          - PUT request"
        echo "  $0 delete <path>              - DELETE request"
        echo ""
        echo "Supabase:"
        echo "  $0 supabase <table> [query]   - Query table"
        echo "  $0 insert <table> <json>      - Insert data"
        echo ""
        echo "Testing:"
        echo "  $0 health [url]               - Health check"
        echo "  $0 check-all                  - Check all endpoints"
        echo "  $0 load <url> [n] [c]         - Load test"
        echo "  $0 validate <url> [filter]    - Validate JSON"
        echo "  $0 field <url> <field>        - Check field exists"
        echo ""
        echo "Environment:"
        echo "  API_BASE_URL=$BASE_URL"
        echo ""
        ;;
esac
