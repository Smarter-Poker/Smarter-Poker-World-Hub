#!/bin/bash
BRAIN="/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA="/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

echo "=== RESTORING ALL IMAGES FROM ORIGINALS ==="
echo "Strategy: Simple crop to JPG. NO transparency. NO fuzz. NO floodfill."

# Batch 1 - 5 cards from 20:54 upload
magick "$BRAIN/media__1770346406609.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/survival-mode.jpg"
echo "1/13 survival-mode.jpg"

magick "$BRAIN/media__1770346413109.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/rules-quiz.jpg"
echo "2/13 rules-quiz.jpg"

magick "$BRAIN/media__1770346415298.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/pro-knowledge.jpg"
echo "3/13 pro-knowledge.jpg"

magick "$BRAIN/media__1770346417565.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/poker-history.jpg"
echo "4/13 poker-history.jpg"

magick "$BRAIN/media__1770346419994.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/endless-mode.jpg"
echo "5/13 endless-mode.jpg"

# Batch 2 - 5 cards from 21:28 upload
magick "$BRAIN/media__1770348520466.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/tournaments.jpg"
echo "6/13 tournaments.jpg"

magick "$BRAIN/media__1770348522477.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/mtt-scenarios.jpg"
echo "7/13 mtt-scenarios.jpg"

magick "$BRAIN/media__1770348524702.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/mixed-mode.jpg"
echo "8/13 mixed-mode.jpg"

magick "$BRAIN/media__1770348529887.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/icm-chip-ev.jpg"
echo "9/13 icm-chip-ev.jpg"

# Batch 3 - pvp, cash
magick "$BRAIN/media__1770348758855.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/pvp-battle.jpg"
echo "10/13 pvp-battle.jpg"

magick "$BRAIN/media__1770348761265.jpg" -crop 884x884+70+70 +repage -quality 95 "$TRIVIA/cash-game.jpg"
echo "11/13 cash-game.jpg"

# Quick Stakes - wider aspect ratio
magick "$BRAIN/media__1770349622114.jpg" -crop 920x460+52+282 +repage -quality 95 "$TRIVIA/quick-stakes.jpg"
echo "12/13 quick-stakes.jpg"

# GTO Master - resize to fit
magick "$BRAIN/media__1770391740300.jpg" -resize 884x884 -quality 95 "$TRIVIA/gto-master.jpg"
echo "13/13 gto-master.jpg"

echo "=== DONE ==="
ls -la "$TRIVIA"/*.jpg 2>/dev/null | wc -l
echo "JPG files created"
