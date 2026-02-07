#!/bin/bash
BRAIN="/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

echo "=== BATCH PROCESSING: 3-Pass Targeted Floodfill (White, LightGrey, DarkGrey) ==="
echo "Strategy: Attack background from edge using specific checkerboard colors."

process_image() {
    NAME=$1
    SOURCE=$2
    ARGS=$3
    
    echo "Processing $NAME..."
    
    # 1. Create base PNG
    magick "$SOURCE" $ARGS +repage "temp_${NAME}_base.png"
    
    # 2. Pass 1: Border White -> Floodfill White
    magick "temp_${NAME}_base.png" \
        -bordercolor "#FFFFFF" -border 1x1 \
        -fuzz 10% -fill none -draw "color 0,0 floodfill" \
        -shave 1x1 \
        "temp_${NAME}_step1.png"

    # 3. Pass 2: Border Light Grey (#C0C0C0) -> Floodfill Light Grey
    magick "temp_${NAME}_step1.png" \
        -bordercolor "#C0C0C0" -border 1x1 \
        -fuzz 10% -fill none -draw "color 0,0 floodfill" \
        -shave 1x1 \
        "temp_${NAME}_step2.png"

    # 4. Pass 3: Border Dark Grey (#808080) -> Floodfill Dark Grey
    magick "temp_${NAME}_step2.png" \
        -bordercolor "#808080" -border 1x1 \
        -fuzz 10% -fill none -draw "color 0,0 floodfill" \
        -shave 1x1 \
        "$TRIVIA/${NAME}.png"
        
    rm "temp_${NAME}_base.png" "temp_${NAME}_step1.png" "temp_${NAME}_step2.png"
}

# Batch 1
process_image "survival-mode" "$BRAIN/media__1770346406609.jpg" "-crop 884x884+70+70"
process_image "rules-quiz" "$BRAIN/media__1770346413109.jpg" "-crop 884x884+70+70"
process_image "pro-knowledge" "$BRAIN/media__1770346415298.jpg" "-crop 884x884+70+70"
process_image "poker-history" "$BRAIN/media__1770346417565.jpg" "-crop 884x884+70+70"
process_image "endless-mode" "$BRAIN/media__1770346419994.jpg" "-crop 884x884+70+70"

# Batch 2
process_image "tournaments" "$BRAIN/media__1770348520466.jpg" "-crop 884x884+70+70"
process_image "mtt-scenarios" "$BRAIN/media__1770348522477.jpg" "-crop 884x884+70+70"
process_image "mixed-mode" "$BRAIN/media__1770348524702.jpg" "-crop 884x884+70+70"
process_image "icm-chip-ev" "$BRAIN/media__1770348529887.jpg" "-crop 884x884+70+70"

# Batch 3
process_image "pvp-battle" "$BRAIN/media__1770348758855.jpg" "-crop 884x884+70+70"
process_image "cash-game" "$BRAIN/media__1770348761265.jpg" "-crop 884x884+70+70"

# Quick Stakes
process_image "quick-stakes" "$BRAIN/media__1770349622114.jpg" "-crop 920x460+52+282"

# GTO Master
process_image "gto-master" "$BRAIN/media__1770391740300.jpg" "-resize 884x884"

echo "=== DONE: 3-Pass Floodfill Complete ==="
