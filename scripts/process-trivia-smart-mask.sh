#!/bin/bash
BRAIN="/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

# Exit on error
set -e

echo "=== BATCH PROCESSING: Method F.6 Hybrid (Smart Mask + Geometric) ==="
echo "Strategy: Smart Mask (F.5.4) for Color Cards. Geometric Mask for Grey Cards."

# Function 1: Smart Mask (F.5.4 Logic - High Quality for Color Cards)
process_image_smart() {
    NAME=$1
    SOURCE=$2
    ARGS=$3
    
    echo "Processing $NAME (Smart Mask)..."
    magick "$SOURCE" $ARGS +repage "temp_${NAME}_base.png"

    # Multi-Point Sample
    SAMPLES=""
    for x in 0 20 40 60 80; do
        COLOR=$(magick "temp_${NAME}_base.png" -crop 1x1+$x+0 +repage -depth 8 txt: | tail -n 1 | grep -o '#[0-9A-F]\{6\}' || true)
        if [ ! -z "$COLOR" ]; then SAMPLES="$SAMPLES $COLOR"; fi
    done
    UNIQUE_SAMPLES=$(echo "$SAMPLES" | tr ' ' '\n' | sort | uniq | tr '\n' ' ')
    
    # Build Mask (Fuzz 10%)
    MASK_CMD="\( +clone -fuzz 10% "
    for color in $UNIQUE_SAMPLES; do MASK_CMD="$MASK_CMD -fill black -opaque \"$color\" "; done
    MASK_CMD="$MASK_CMD -fill black -opaque \"#FFFFFF\" -fill black -opaque \"#C6C7C2\" -fill black -opaque \"#7F807B\" -fill black -opaque \"#808080\" "
    MASK_CMD="$MASK_CMD -fill white +opaque black -bordercolor black -border 1x1 -fill red -draw \"color 0,0 floodfill\" -fill black -opaque red -fill white +opaque black -shave 1x1 -morphology Dilate Diamond:1 -blur 0x1 \)"

    eval magick "temp_${NAME}_base.png" $MASK_CMD -alpha off -compose CopyOpacity -composite "$TRIVIA/${NAME}.png"
    rm "temp_${NAME}_base.png"
}

# Function 2: Geometric Mask (Safe logic for Grey Cards)
process_image_geo() {
    NAME=$1
    SOURCE=$2
    ARGS=$3
    
    echo "Processing $NAME (Geometric Mask)..."
    magick "$SOURCE" $ARGS +repage "temp_${NAME}_base.png"
    
    # Get Dimensions
    W=$(magick "temp_${NAME}_base.png" -format "%w" info:)
    H=$(magick "temp_${NAME}_base.png" -format "%h" info:)
    
    # Create Rounded Rect Mask
    # Inset by 10px to cut off checkerboard edge safely.
    # Radius 40px estimated from visuals.
    magick -size ${W}x${H} xc:black -fill white \
        -draw "roundrectangle 10,10 $(($W-10)),$(($H-10)) 40,40" \
        -blur 0x1 \
        "temp_${NAME}_mask.png"
        
    # Apply Mask
    magick "temp_${NAME}_base.png" "temp_${NAME}_mask.png" -alpha off -compose CopyOpacity -composite "$TRIVIA/${NAME}.png"
    
    rm "temp_${NAME}_base.png" "temp_${NAME}_mask.png"
}

# GROUP A: Color Cards (Smart Mask F.5.4)
# GTO Master, Quick Stakes, MTT Scenarios, Poker History (Use Smart, verified good transparency)
process_image_smart "gto-master" "$BRAIN/media__1770391740300.jpg" "-resize 884x884"
process_image_smart "mtt-scenarios" "$BRAIN/media__1770348522477.jpg" "-crop 884x884+70+70"
process_image_smart "poker-history" "$BRAIN/media__1770346417565.jpg" "-crop 884x884+70+70"
# Quick Stakes is rectangle, use Smart
process_image_smart "quick-stakes" "$BRAIN/media__1770349622114.jpg" "-crop 920x460+52+282"
# Cash Game, PvP, Tournaments, Pro Knowledge (Colorful enough for Smart)
process_image_smart "tournaments" "$BRAIN/media__1770348520466.jpg" "-crop 884x884+70+70"
process_image_smart "pvp-battle" "$BRAIN/media__1770348758855.jpg" "-crop 884x884+70+70"
process_image_smart "cash-game" "$BRAIN/media__1770348761265.jpg" "-crop 884x884+70+70"
process_image_smart "pro-knowledge" "$BRAIN/media__1770346415298.jpg" "-crop 884x884+70+70"
process_image_smart "icm-chip-ev" "$BRAIN/media__1770348529887.jpg" "-crop 884x884+70+70"

# GROUP B: Grey Cards (Geometric Mask F.6)
# Survival, Rules, Endless, Mixed. These failed Semantic.
process_image_geo "survival-mode" "$BRAIN/media__1770346406609.jpg" "-crop 884x884+70+70"
process_image_geo "rules-quiz" "$BRAIN/media__1770346413109.jpg" "-crop 884x884+70+70"
process_image_geo "endless-mode" "$BRAIN/media__1770346419994.jpg" "-crop 884x884+70+70"
process_image_geo "mixed-mode" "$BRAIN/media__1770348524702.jpg" "-crop 884x884+70+70"

echo "=== DONE: Method F.6 Hybrid Complete ==="
