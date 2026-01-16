#!/bin/bash
# Copy new transparent avatars from brain to public folder

BRAIN_DIR="/Users/smarter.poker/.gemini/antigravity/brain/8b0ff841-1309-4278-9ded-8a22bab32825"
PUBLIC_DIR="/Users/smarter.poker/Documents/hub-vanguard/public/images/training/avatars"

echo "Copying transparent avatars..."

# Find and copy each avatar
cp "$BRAIN_DIR/fish_avatar_transparent_1768557406653.png" "$PUBLIC_DIR/fish.png"
cp "$BRAIN_DIR/shark_avatar_transparent_1768557470699.png" "$PUBLIC_DIR/shark.png"
cp "$BRAIN_DIR/octopus_avatar_transparent_1768557486126.png" "$PUBLIC_DIR/octopus.png"
cp "$BRAIN_DIR/turtle_avatar_transparent_1768557499503.png" "$PUBLIC_DIR/turtle.png"
cp "$BRAIN_DIR/crab_avatar_transparent_1768557696597.png" "$PUBLIC_DIR/crab.png"
cp "$BRAIN_DIR/jellyfish_avatar_transparent_1768557672846.png" "$PUBLIC_DIR/jellyfish.png"

echo "✅ All 6 transparent avatars copied!"
echo "   Fish, Shark, Octopus, Turtle, Crab, Jellyfish"
