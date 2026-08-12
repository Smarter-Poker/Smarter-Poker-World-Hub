#!/bin/bash
mkdir -p public/images/trivia/processed
for f in public/images/trivia/*.webp; do
  # skip the ones that aren't the 12 cards
  if [[ "$f" == *"daily-trivia"* || "$f" == *"diamond-entry"* || "$f" == *"quick-stakes"* || "$f" == *"trivia-bg"* ]]; then
    continue
  fi
  filename=$(basename "$f")
  
  echo "Processing $filename..."
  
  # Trim the black background to get the true metal frame
  magick "$f" -fuzz 5% -trim +repage /tmp/trimmed.png
  
  # Get dimensions of trimmed image
  W=$(magick /tmp/trimmed.png -format "%w" info:)
  H=$(magick /tmp/trimmed.png -format "%h" info:)
  
  # We want a 3:4 aspect ratio. Target height = W * 4 / 3
  TARGET_H=$(( W * 4 / 3 ))
  DIFF=$(( TARGET_H - H ))
  
  # If it's already taller than 3:4, skip stretching (shouldn't happen)
  if [ "$DIFF" -le 0 ]; then
    cp /tmp/trimmed.png /tmp/stretched.png
  else
    ADD_TOP=$(( DIFF / 2 ))
    ADD_BOT=$(( DIFF - ADD_TOP ))
    
    # Slice heights (220px from top and bottom to avoid hitting text/icons)
    SLICE_TOP=220
    SLICE_BOT=220
    SLICE_MID=$(( H - SLICE_TOP - SLICE_BOT ))
    
    # Crop the 3 slices
    magick /tmp/trimmed.png -crop ${W}x${SLICE_TOP}+0+0 /tmp/top.png
    magick /tmp/trimmed.png -crop ${W}x${SLICE_MID}+0+${SLICE_TOP} /tmp/mid.png
    magick /tmp/trimmed.png -crop ${W}x${SLICE_BOT}+0+$(( SLICE_TOP + SLICE_MID )) /tmp/bot.png
    
    # Stretch top and bot vertically
    NEW_TOP=$(( SLICE_TOP + ADD_TOP ))
    NEW_BOT=$(( SLICE_BOT + ADD_BOT ))
    magick /tmp/top.png -resize ${W}x${NEW_TOP}\! /tmp/top_s.png
    magick /tmp/bot.png -resize ${W}x${NEW_BOT}\! /tmp/bot_s.png
    
    # Reassemble vertically
    magick /tmp/top_s.png /tmp/mid.png /tmp/bot_s.png -append /tmp/stretched.png
  fi
  
  # Now resize perfectly to 896x1200
  magick /tmp/stretched.png -resize 896x1200\! /tmp/resized.png
  
  # Apply 80px transparent rounded corners and save back to original file
  magick /tmp/resized.png \
    \( +clone -alpha transparent -background none -fill white -draw "roundrectangle 0,0 %[fx:w],%[fx:h] 80,80" \) \
    -compose copy_opacity -composite \
    "public/images/trivia/${filename}"
done
