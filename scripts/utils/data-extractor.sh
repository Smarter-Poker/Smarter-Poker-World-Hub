#!/bin/bash
# Data Extraction & Processing Utility for Smarter.Poker
# Combines jq, tesseract, and other tools for data extraction

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# JSON Processing (jq)
# ============================================

# Pretty print JSON
json_pretty() {
    local input="$1"
    if [ -f "$input" ]; then
        jq '.' "$input"
    else
        echo "$input" | jq '.'
    fi
}

# Extract specific field from JSON
json_get() {
    local input="$1"
    local path="$2"
    
    if [ -f "$input" ]; then
        jq -r "$path" "$input"
    else
        echo "$input" | jq -r "$path"
    fi
}

# Transform JSON (map, filter, etc)
json_transform() {
    local input="$1"
    local transform="$2"
    
    if [ -f "$input" ]; then
        jq "$transform" "$input"
    else
        echo "$input" | jq "$transform"
    fi
}

# Count JSON array items
json_count() {
    local input="$1"
    local path="${2:-.}"
    
    if [ -f "$input" ]; then
        jq "$path | length" "$input"
    else
        echo "$input" | jq "$path | length"
    fi
}

# Convert JSON to CSV
json_to_csv() {
    local input="$1"
    local output="${2:-output.csv}"
    local keys="${3:-}"
    
    echo -e "${CYAN}📊 Converting JSON to CSV${NC}"
    
    if [ -n "$keys" ]; then
        jq -r "[$keys] | @csv" "$input" > "$output"
    else
        # Auto-detect keys from first object
        jq -r '(.[0] | keys_unsorted) as $keys | $keys, (.[] | [.[$keys[]]] | @csv) | @csv' "$input" > "$output"
    fi
    
    echo -e "${GREEN}✓ Created $output${NC}"
}

# Merge multiple JSON files
json_merge() {
    local output="$1"
    shift
    local files=("$@")
    
    echo -e "${CYAN}🔗 Merging JSON files${NC}"
    
    jq -s 'add' "${files[@]}" > "$output"
    
    echo -e "${GREEN}✓ Merged to $output${NC}"
}

# ============================================
# OCR Text Extraction (tesseract)
# ============================================

# Extract text from image
ocr_image() {
    local input="$1"
    local output="${2:-}"
    local lang="${3:-eng}"
    
    echo -e "${CYAN}🔍 Extracting text from image: $(basename "$input")${NC}"
    
    if [ -n "$output" ]; then
        tesseract "$input" "${output%.txt}" -l "$lang"
        echo -e "${GREEN}✓ Text saved to ${output%.txt}.txt${NC}"
    else
        tesseract "$input" stdout -l "$lang"
    fi
}

# Extract text from PDF
ocr_pdf() {
    local input="$1"
    local output="${2:-${input%.pdf}.txt}"
    local lang="${3:-eng}"
    
    echo -e "${CYAN}📄 Extracting text from PDF: $(basename "$input")${NC}"
    
    # Convert PDF to images first
    local temp_dir=$(mktemp -d)
    pdftoppm -png "$input" "$temp_dir/page"
    
    # OCR each page
    rm -f "$output"
    for page in "$temp_dir"/page-*.png; do
        tesseract "$page" stdout -l "$lang" >> "$output"
        echo "" >> "$output"  # Page separator
    done
    
    rm -rf "$temp_dir"
    
    echo -e "${GREEN}✓ Text saved to $output${NC}"
}

# Extract poker tournament data from screenshot
ocr_poker_tournament() {
    local input="$1"
    local output="${2:-tournament_data.json}"
    
    echo -e "${CYAN}🎰 Extracting poker tournament data${NC}"
    
    # OCR the image
    local raw_text=$(tesseract "$input" stdout -l eng)
    
    # Parse common tournament formats
    # This is a template - customize based on actual data formats
    echo "{
  \"raw_text\": $(echo "$raw_text" | jq -Rs '.'),
  \"extracted_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"source_file\": \"$input\"
}" > "$output"
    
    echo -e "${GREEN}✓ Data saved to $output${NC}"
    echo -e "${YELLOW}Note: Review and parse raw_text field for structured data${NC}"
}

# ============================================
# Web Scraping Helpers
# ============================================

# Download URL content
fetch_url() {
    local url="$1"
    local output="${2:-}"
    
    echo -e "${CYAN}🌐 Fetching: $url${NC}"
    
    if [ -n "$output" ]; then
        curl -sL "$url" -o "$output"
        echo -e "${GREEN}✓ Saved to $output${NC}"
    else
        curl -sL "$url"
    fi
}

# Download multiple URLs in parallel
fetch_urls() {
    local output_dir="${1:-.}"
    shift
    local urls=("$@")
    
    echo -e "${CYAN}🌐 Downloading ${#urls[@]} URLs in parallel${NC}"
    
    mkdir -p "$output_dir"
    
    # Use aria2 for parallel downloads
    if command -v aria2c &> /dev/null; then
        local url_file=$(mktemp)
        printf '%s\n' "${urls[@]}" > "$url_file"
        aria2c -d "$output_dir" -i "$url_file" -j 5 -x 5
        rm -f "$url_file"
    else
        # Fallback to sequential curl
        for url in "${urls[@]}"; do
            local filename=$(basename "$url")
            curl -sL "$url" -o "$output_dir/$filename"
        done
    fi
    
    echo -e "${GREEN}✓ Downloaded to $output_dir${NC}"
}

# Extract links from HTML
extract_links() {
    local input="$1"
    local pattern="${2:-}"
    
    if [ -f "$input" ]; then
        grep -oE 'href="[^"]+"' "$input" | sed 's/href="//;s/"$//'
    else
        curl -sL "$input" | grep -oE 'href="[^"]+"' | sed 's/href="//;s/"$//'
    fi
    
    if [ -n "$pattern" ]; then
        grep -E "$pattern"
    fi
}

# ============================================
# YAML Processing (yq)
# ============================================

yaml_to_json() {
    local input="$1"
    yq -o=json "$input"
}

json_to_yaml() {
    local input="$1"
    yq -P "$input"
}

yaml_get() {
    local input="$1"
    local path="$2"
    yq "$path" "$input"
}

# ============================================
# Database Helpers (SQLite)
# ============================================

# Execute SQL on SQLite database
sqlite_query() {
    local db="$1"
    local query="$2"
    
    sqlite3 -header -column "$db" "$query"
}

# Export SQLite table to JSON
sqlite_to_json() {
    local db="$1"
    local table="$2"
    local output="${3:-$table.json}"
    
    echo -e "${CYAN}📊 Exporting $table to JSON${NC}"
    
    sqlite3 "$db" ".mode json" "SELECT * FROM $table;" > "$output"
    
    echo -e "${GREEN}✓ Exported to $output${NC}"
}

# ============================================
# Clipboard Operations
# ============================================

# Copy to clipboard
clip_copy() {
    local input="$1"
    
    if [ -f "$input" ]; then
        cat "$input" | pbcopy
    else
        echo "$input" | pbcopy
    fi
    
    echo -e "${GREEN}✓ Copied to clipboard${NC}"
}

# Paste from clipboard
clip_paste() {
    pbpaste
}

# Copy JSON field to clipboard
clip_json() {
    local input="$1"
    local path="$2"
    
    json_get "$input" "$path" | pbcopy
    echo -e "${GREEN}✓ Copied '$path' to clipboard${NC}"
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # JSON commands
    json-pretty)
        json_pretty "$2"
        ;;
    json-get)
        json_get "$2" "$3"
        ;;
    json-transform)
        json_transform "$2" "$3"
        ;;
    json-count)
        json_count "$2" "$3"
        ;;
    json-to-csv)
        json_to_csv "$2" "$3" "$4"
        ;;
    json-merge)
        json_merge "${@:2}"
        ;;
    
    # OCR commands
    ocr)
        ocr_image "$2" "$3" "$4"
        ;;
    ocr-pdf)
        ocr_pdf "$2" "$3" "$4"
        ;;
    ocr-tournament)
        ocr_poker_tournament "$2" "$3"
        ;;
    
    # Web commands
    fetch)
        fetch_url "$2" "$3"
        ;;
    fetch-all)
        fetch_urls "${@:2}"
        ;;
    extract-links)
        extract_links "$2" "$3"
        ;;
    
    # YAML commands
    yaml-to-json)
        yaml_to_json "$2"
        ;;
    json-to-yaml)
        json_to_yaml "$2"
        ;;
    yaml-get)
        yaml_get "$2" "$3"
        ;;
    
    # SQLite commands
    sql)
        sqlite_query "$2" "$3"
        ;;
    sql-to-json)
        sqlite_to_json "$2" "$3" "$4"
        ;;
    
    # Clipboard commands
    copy)
        clip_copy "$2"
        ;;
    paste)
        clip_paste
        ;;
    clip-json)
        clip_json "$2" "$3"
        ;;
    
    help|*)
        echo "Data Extraction & Processing Utility"
        echo ""
        echo "JSON Processing:"
        echo "  $0 json-pretty <file|string>          - Pretty print JSON"
        echo "  $0 json-get <file> <path>             - Extract field (.key.subkey)"
        echo "  $0 json-transform <file> <jq-expr>    - Transform with jq"
        echo "  $0 json-count <file> [path]           - Count array items"
        echo "  $0 json-to-csv <file> [output]        - Convert to CSV"
        echo "  $0 json-merge <output> <files...>     - Merge JSON files"
        echo ""
        echo "OCR (Text Extraction):"
        echo "  $0 ocr <image> [output] [lang]        - OCR image"
        echo "  $0 ocr-pdf <pdf> [output] [lang]      - OCR PDF"
        echo "  $0 ocr-tournament <image> [output]    - Extract tournament data"
        echo ""
        echo "Web/HTTP:"
        echo "  $0 fetch <url> [output]               - Download URL"
        echo "  $0 fetch-all <dir> <urls...>          - Parallel downloads"
        echo "  $0 extract-links <url|file> [pattern] - Extract links"
        echo ""
        echo "YAML:"
        echo "  $0 yaml-to-json <file>                - Convert to JSON"
        echo "  $0 json-to-yaml <file>                - Convert to YAML"
        echo "  $0 yaml-get <file> <path>             - Get YAML value"
        echo ""
        echo "SQLite:"
        echo "  $0 sql <db> <query>                   - Run SQL query"
        echo "  $0 sql-to-json <db> <table> [output]  - Export to JSON"
        echo ""
        echo "Clipboard:"
        echo "  $0 copy <file|text>                   - Copy to clipboard"
        echo "  $0 paste                              - Paste from clipboard"
        echo "  $0 clip-json <file> <path>            - Copy JSON field"
        echo ""
        ;;
esac
