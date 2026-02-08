#!/bin/bash
BRAIN="/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

# Exit on error
set -e

echo "=== TESTING METHOD F.5: Smart Mask (Global Color + Topological Floodfill) ==="

test_smart_mask() {
    NAME=$1
    SOURCE=$2
    ARGS=$3
    
    echo "Processing $NAME..."
    
    # Logic:
    # 1. Start with original image (opaque).
    # 2. Create Binary Map: Turn Background Colors -> BLACK. Turn Everything Else -> WHITE.
    # 3. Add Black Border to ensure connectivity of background.
    # 4. Floodfill 0,0 (Black) with RED. This identifies the "True Background".
    #    - Internal highlights (which were turned Black) are NOT connected to edge, so they stay Black.
    # 5. Convert Mask: 
    #    - RED (True Background) -> BLACK (Transparent)
    #    - Everything Else (White Foreground + Black Internal) -> WHITE (Opaque)
    # 6. Apply Mask to Original Image.

    magick "$SOURCE" $ARGS +repage \
        \( +clone \
           -fuzz 15% \
           -fill black -opaque "#FFFFFF" \
           -fill black -opaque "#C6C7C2" \
           -fill black -opaque "#7F807B" \
           -fill black -opaque "#808080" \
           -fill white +opaque black \
           -bordercolor black -border 1x1 \
           -fill red -draw "color 0,0 floodfill" \
           -fill black -opaque red \
           -fill white +opaque black \
           -shave 1x1 \
        \) \
        -alpha off -compose CopyOpacity -composite \
        "$TRIVIA/${NAME}_smart.png"
}

# Test 1: GTO Master (Has internal white highlights)
test_smart_mask "gto-master" "$BRAIN/media__1770391740300.jpg" "-resize 884x884"

# Test 2: MTT Scenarios (Has metal frame)
test_smart_mask "mtt-scenarios" "$BRAIN/media__1770348522477.jpg" "-crop 884x884+70+70"

ls -la "$TRIVIA/gto-master_smart.png" "$TRIVIA/mtt-scenarios_smart.png"
