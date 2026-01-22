#!/bin/bash
# Visual Regression Testing Utility for Smarter.Poker
# Uses ImageMagick to compare screenshots against golden templates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
GOLDEN_DIR="$PROJECT_ROOT/.agent/skills/poker-table-ui"
SCREENSHOTS_DIR="$PROJECT_ROOT/test-screenshots"
DIFF_DIR="$PROJECT_ROOT/test-screenshots/diffs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create directories if they don't exist
mkdir -p "$SCREENSHOTS_DIR"
mkdir -p "$DIFF_DIR"

# Function to take a screenshot of a URL
take_screenshot() {
    local url="$1"
    local output="$2"
    local width="${3:-1920}"
    local height="${4:-1080}"
    
    echo -e "${YELLOW}📸 Taking screenshot of $url${NC}"
    
    # Use screencapture with proper window selection
    # For web pages, we'll use a headless approach
    osascript -e "
        tell application \"Safari\"
            make new document with properties {URL:\"$url\"}
            delay 3
        end tell
    "
    
    screencapture -l$(osascript -e 'tell app "Safari" to id of window 1') "$output"
    
    osascript -e 'tell application "Safari" to close window 1'
    
    echo -e "${GREEN}✅ Screenshot saved to $output${NC}"
}

# Function to compare two images
compare_images() {
    local golden="$1"
    local current="$2"
    local diff_output="$3"
    local threshold="${4:-0.1}"
    
    echo -e "${YELLOW}🔍 Comparing images...${NC}"
    
    if [ ! -f "$golden" ]; then
        echo -e "${RED}❌ Golden template not found: $golden${NC}"
        return 1
    fi
    
    if [ ! -f "$current" ]; then
        echo -e "${RED}❌ Current screenshot not found: $current${NC}"
        return 1
    fi
    
    # Get image dimensions
    golden_size=$(identify -format "%wx%h" "$golden")
    current_size=$(identify -format "%wx%h" "$current")
    
    echo "  Golden:  $golden_size"
    echo "  Current: $current_size"
    
    # Create diff image and get comparison metric
    result=$(compare -metric PHASH "$golden" "$current" "$diff_output" 2>&1 || true)
    
    echo "  PHASH Difference: $result"
    
    # Also create a visual diff overlay
    composite -blend 50% "$golden" "$current" "${diff_output%.png}_overlay.png"
    
    # Create side-by-side comparison
    convert +append "$golden" "$current" "${diff_output%.png}_sidebyside.png"
    
    # Create animated GIF flip between images
    convert -delay 100 "$golden" "$current" "${diff_output%.png}_animated.gif"
    
    echo -e "${GREEN}✅ Comparison complete${NC}"
    echo "  Diff image:    $diff_output"
    echo "  Overlay:       ${diff_output%.png}_overlay.png"
    echo "  Side-by-side:  ${diff_output%.png}_sidebyside.png"
    echo "  Animated:      ${diff_output%.png}_animated.gif"
    
    # Return comparison result
    if (( $(echo "$result < $threshold" | bc -l) )); then
        echo -e "${GREEN}✅ PASS: Images match within threshold${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL: Images differ beyond threshold${NC}"
        return 1
    fi
}

# Function to compare poker table against golden template
compare_poker_table() {
    local screenshot="$1"
    local golden="${2:-$GOLDEN_DIR/golden-table-reference.png}"
    local diff_output="$DIFF_DIR/poker-table-diff-$(date +%Y%m%d_%H%M%S).png"
    
    compare_images "$golden" "$screenshot" "$diff_output"
}

# Function to generate a report
generate_report() {
    local report_file="$SCREENSHOTS_DIR/regression-report-$(date +%Y%m%d_%H%M%S).html"
    
    echo "<!DOCTYPE html>
<html>
<head>
    <title>Visual Regression Report - $(date)</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #1a1a2e; color: white; }
        h1 { color: #ffd700; }
        .comparison { display: flex; gap: 20px; margin: 20px 0; }
        .image-container { flex: 1; }
        .image-container img { max-width: 100%; border: 2px solid #333; }
        .pass { color: #4CAF50; }
        .fail { color: #f44336; }
    </style>
</head>
<body>
    <h1>🎰 Visual Regression Report</h1>
    <p>Generated: $(date)</p>
    <h2>Comparisons</h2>" > "$report_file"
    
    for diff in "$DIFF_DIR"/*_sidebyside.png; do
        if [ -f "$diff" ]; then
            echo "    <div class='comparison'>
        <img src='file://$diff' alt='Comparison'>
    </div>" >> "$report_file"
        fi
    done
    
    echo "</body></html>" >> "$report_file"
    
    echo -e "${GREEN}📊 Report generated: $report_file${NC}"
    open "$report_file"
}

# Main command handler
case "${1:-help}" in
    screenshot)
        take_screenshot "$2" "${3:-$SCREENSHOTS_DIR/screenshot-$(date +%Y%m%d_%H%M%S).png}"
        ;;
    compare)
        compare_images "$2" "$3" "${4:-$DIFF_DIR/diff-$(date +%Y%m%d_%H%M%S).png}"
        ;;
    poker-table)
        compare_poker_table "$2" "$3"
        ;;
    report)
        generate_report
        ;;
    help|*)
        echo "Visual Regression Testing Utility"
        echo ""
        echo "Usage:"
        echo "  $0 screenshot <url> [output.png]     - Take a screenshot of a URL"
        echo "  $0 compare <golden.png> <current.png> [diff.png] - Compare two images"
        echo "  $0 poker-table <screenshot.png>      - Compare against golden poker table"
        echo "  $0 report                            - Generate HTML report"
        echo ""
        ;;
esac
