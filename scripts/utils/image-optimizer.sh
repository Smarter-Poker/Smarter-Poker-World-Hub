#!/bin/bash
# Image Optimization Pipeline for Smarter.Poker
# Optimizes PNG, JPEG, GIF, and WebP images for production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default quality settings
PNG_QUALITY="65-80"
JPEG_QUALITY="85"
WEBP_QUALITY="80"
GIF_COLORS="256"

# Function to get file size in human readable format
get_size() {
    local size=$(stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null)
    if [ "$size" -lt 1024 ]; then
        echo "${size}B"
    elif [ "$size" -lt 1048576 ]; then
        echo "$((size / 1024))KB"
    else
        echo "$((size / 1048576))MB"
    fi
}

# Function to optimize a single PNG file
optimize_png() {
    local file="$1"
    local original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    
    echo -e "${CYAN}🔧 Optimizing PNG: $(basename "$file")${NC}"
    
    # First pass: pngquant (lossy, best compression)
    if command -v pngquant &> /dev/null; then
        pngquant --quality=$PNG_QUALITY --skip-if-larger --force --output "$file" "$file" 2>/dev/null || true
    fi
    
    # Second pass: optipng (lossless)
    if command -v optipng &> /dev/null; then
        optipng -o2 -quiet "$file" 2>/dev/null || true
    fi
    
    local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    local savings=$((original_size - new_size))
    local percent=$((savings * 100 / original_size))
    
    echo -e "  ${GREEN}✓ Saved $percent% ($(get_size "$file"))${NC}"
}

# Function to optimize a single JPEG file
optimize_jpeg() {
    local file="$1"
    local original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    
    echo -e "${CYAN}🔧 Optimizing JPEG: $(basename "$file")${NC}"
    
    if command -v jpegoptim &> /dev/null; then
        jpegoptim --max=$JPEG_QUALITY --strip-all --quiet "$file" 2>/dev/null || true
    fi
    
    local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    local savings=$((original_size - new_size))
    local percent=$((savings * 100 / original_size))
    
    echo -e "  ${GREEN}✓ Saved $percent% ($(get_size "$file"))${NC}"
}

# Function to optimize a single GIF file
optimize_gif() {
    local file="$1"
    local original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    
    echo -e "${CYAN}🔧 Optimizing GIF: $(basename "$file")${NC}"
    
    if command -v gifsicle &> /dev/null; then
        gifsicle -O3 --colors $GIF_COLORS "$file" -o "$file" 2>/dev/null || true
    fi
    
    local new_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    local savings=$((original_size - new_size))
    local percent=$((savings * 100 / original_size))
    
    echo -e "  ${GREEN}✓ Saved $percent% ($(get_size "$file"))${NC}"
}

# Function to convert image to WebP
convert_to_webp() {
    local file="$1"
    local output="${file%.*}.webp"
    
    echo -e "${CYAN}🔄 Converting to WebP: $(basename "$file")${NC}"
    
    if command -v cwebp &> /dev/null; then
        cwebp -q $WEBP_QUALITY "$file" -o "$output" 2>/dev/null
        echo -e "  ${GREEN}✓ Created $(basename "$output") ($(get_size "$output"))${NC}"
    else
        echo -e "  ${RED}✗ cwebp not installed${NC}"
    fi
}

# Function to resize image
resize_image() {
    local file="$1"
    local width="$2"
    local height="$3"
    local output="${4:-${file%.*}_${width}x${height}.${file##*.}}"
    
    echo -e "${CYAN}📐 Resizing: $(basename "$file") to ${width}x${height}${NC}"
    
    sips -z "$height" "$width" "$file" --out "$output" 2>/dev/null
    
    echo -e "  ${GREEN}✓ Created $(basename "$output") ($(get_size "$output"))${NC}"
}

# Function to batch resize for responsive images
create_responsive_set() {
    local file="$1"
    local base="${file%.*}"
    local ext="${file##*.}"
    
    echo -e "${YELLOW}📱 Creating responsive image set for: $(basename "$file")${NC}"
    
    # Common responsive sizes
    local sizes=(320 640 768 1024 1280 1920)
    
    for size in "${sizes[@]}"; do
        resize_image "$file" "$size" "" "${base}_${size}w.${ext}"
    done
}

# Function to optimize all images in a directory
optimize_directory() {
    local dir="${1:-.}"
    local total_before=0
    local total_after=0
    
    echo -e "${YELLOW}🚀 Optimizing all images in: $dir${NC}"
    echo ""
    
    # Find and optimize PNGs
    while IFS= read -r -d '' file; do
        local before=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_before=$((total_before + before))
        optimize_png "$file"
        local after=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_after=$((total_after + after))
    done < <(find "$dir" -type f -name "*.png" -print0)
    
    # Find and optimize JPEGs
    while IFS= read -r -d '' file; do
        local before=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_before=$((total_before + before))
        optimize_jpeg "$file"
        local after=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_after=$((total_after + after))
    done < <(find "$dir" -type f \( -name "*.jpg" -o -name "*.jpeg" \) -print0)
    
    # Find and optimize GIFs
    while IFS= read -r -d '' file; do
        local before=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_before=$((total_before + before))
        optimize_gif "$file"
        local after=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        total_after=$((total_after + after))
    done < <(find "$dir" -type f -name "*.gif" -print0)
    
    echo ""
    local total_saved=$((total_before - total_after))
    local percent=0
    if [ "$total_before" -gt 0 ]; then
        percent=$((total_saved * 100 / total_before))
    fi
    echo -e "${GREEN}✅ Total saved: ${percent}% ($((total_saved / 1024))KB)${NC}"
}

# Function to optimize cards specifically
optimize_cards() {
    local cards_dir="${1:-$PROJECT_ROOT/public/cards}"
    
    echo -e "${YELLOW}🃏 Optimizing poker card images in: $cards_dir${NC}"
    echo ""
    
    optimize_directory "$cards_dir"
}

# Function to optimize avatars specifically  
optimize_avatars() {
    local avatars_dir="${1:-$PROJECT_ROOT/public/avatars}"
    
    echo -e "${YELLOW}👤 Optimizing avatar images in: $avatars_dir${NC}"
    echo ""
    
    optimize_directory "$avatars_dir"
}

# Main command handler
case "${1:-help}" in
    png)
        optimize_png "$2"
        ;;
    jpeg|jpg)
        optimize_jpeg "$2"
        ;;
    gif)
        optimize_gif "$2"
        ;;
    webp)
        convert_to_webp "$2"
        ;;
    resize)
        resize_image "$2" "$3" "$4" "$5"
        ;;
    responsive)
        create_responsive_set "$2"
        ;;
    directory|dir)
        optimize_directory "$2"
        ;;
    cards)
        optimize_cards "$2"
        ;;
    avatars)
        optimize_avatars "$2"
        ;;
    all)
        optimize_cards
        optimize_avatars
        optimize_directory "$PROJECT_ROOT/public"
        ;;
    help|*)
        echo "Image Optimization Pipeline for Smarter.Poker"
        echo ""
        echo "Usage:"
        echo "  $0 png <file>                    - Optimize a PNG file"
        echo "  $0 jpeg <file>                   - Optimize a JPEG file"
        echo "  $0 gif <file>                    - Optimize a GIF file"
        echo "  $0 webp <file>                   - Convert to WebP format"
        echo "  $0 resize <file> <w> <h> [out]   - Resize an image"
        echo "  $0 responsive <file>             - Create responsive image set"
        echo "  $0 directory <dir>               - Optimize all images in directory"
        echo "  $0 cards [dir]                   - Optimize poker cards"
        echo "  $0 avatars [dir]                 - Optimize avatar images"
        echo "  $0 all                           - Optimize everything"
        echo ""
        echo "Quality Settings (environment variables):"
        echo "  PNG_QUALITY=$PNG_QUALITY"
        echo "  JPEG_QUALITY=$JPEG_QUALITY"
        echo "  WEBP_QUALITY=$WEBP_QUALITY"
        echo "  GIF_COLORS=$GIF_COLORS"
        echo ""
        ;;
esac
