# Heartbeat Audio File Needed

## Path: /public/sounds/heartbeat.mp3

This file is referenced by the training game timer to provide progressive heartbeat audio feedback as time decreases.

## Requirements:
- Short, single heartbeat sound (1-2 seconds max)
- Clean, punchy audio
- Works when played at different playback rates (0.8x to 1.2x)
- Should loop naturally without gaps

## Recommended Sources:
1. Freesound.org - Search "heartbeat single"
2. Zapsplat.com - Free heartbeat sound effects
3. Generate using sound editing software (Audacity, etc.)

## Implementation Status:
✅ Code integrated in [gameId].js
⚠️ Sound file needs to be added manually

## Temporary Workaround:
The code will gracefully fail if the sound file is missing (using .catch() on audio.play()). The visual features will still work perfectly.
