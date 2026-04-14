#!/bin/bash
# Club Arena Build + Deploy Script
# Builds Club Arena from source and copies to World Hub for deployment

set -e

CLUB_ARENA_DIR="$HOME/Documents/club-arena"
WORLD_HUB_DIR="$HOME/Documents/Smarter-Poker-World-Hub"
DIST_DIR="/tmp/club-arena-dist"

echo "=== Building Club Arena ==="
cd "$CLUB_ARENA_DIR"

# Build with Vite
npx vite build --outDir "$DIST_DIR" --emptyOutDir

echo "=== Copying to World Hub ==="
# Preserve index.html and copy new assets
cp "$DIST_DIR/index.html" "$WORLD_HUB_DIR/public/hub/club-arena/index.html"
rm -rf "$WORLD_HUB_DIR/public/hub/club-arena/assets"
cp -r "$DIST_DIR/assets" "$WORLD_HUB_DIR/public/hub/club-arena/assets"

echo "=== Pushing to deploy ==="
cd "$WORLD_HUB_DIR"
bash scripts/git-safe-push.sh "feat: PokerBros parity - card animations, chip animations, pre-action buttons CSS"

echo "=== Done! ==="
