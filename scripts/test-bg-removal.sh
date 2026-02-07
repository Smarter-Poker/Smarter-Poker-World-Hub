#!/bin/bash
BRAIN="/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

echo "=== TESTING SAFE BACKGROUND REMOVAL (TWO-PASS FLOODFILL) ==="

process_test() {
    NAME=$1
    SOURCE=$2
    ARGS=$3
    
    echo "Processing $NAME..."
    
    # 1. Create base PNG
    magick "$SOURCE" $ARGS +repage "temp_${NAME}_base.png"
    
    # 2. Border + Floodfill 1 (Top Left)
    # The border ensures the "ocean" is connected
    magick "temp_${NAME}_base.png" \
        -bordercolor white -border 1x1 \
        -fuzz 20% -fill none -draw "color 0,0 floodfill" \
        -shave 1x1 \
        "temp_${NAME}_step1.png"
        
    # 3. Floodfill 2 (Top Left again)
    # In case the first pass hit one checker color but left isolated islands of the other
    magick "temp_${NAME}_step1.png" \
        -bordercolor white -border 1x1 \
        -fuzz 20% -fill none -draw "color 0,0 floodfill" \
        -shave 1x1 \
        "$TRIVIA/${NAME}_test.png"
        
    rm "temp_${NAME}_base.png" "temp_${NAME}_step1.png"
}

# Test 1: MTT Scenarios
process_test "mtt-scenarios" "$BRAIN/media__1770348522477.jpg" "-crop 884x884+70+70"

# Test 2: GTO Master
process_test "gto-master" "$BRAIN/media__1770391740300.jpg" "-resize 884x884"

ls -la "$TRIVIA/mtt-scenarios_test.png" "$TRIVIA/gto-master_test.png"
