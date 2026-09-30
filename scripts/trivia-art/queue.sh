#!/bin/bash
# usage: queue.sh "<id> <id> ..." "<seed> <seed> ..."
# Generates gen/<id>-s<seed>.png (+ .json metadata) at 1536x1024 with default
# Z-Image-Turbo settings. Skips outputs that already exist (re-launch safe).
set -u
T=/Volumes/SmarterArchives/agent-evidence/trivia-program-20260929
A=$T/evidence/p4-art/art
TOOLS=$T/tools/p4-art
export HF_HOME=$TOOLS/hf-home PIP_CACHE_DIR=$TOOLS/pip-cache TMPDIR=$T/tmp
GEN=$TOOLS/mflux-venv/bin/mflux-generate-z-image-turbo
for id in $1; do
  todo=""
  for s in $2; do [ -f "$A/gen/$id-s$s.png" ] || todo="$todo $s"; done
  [ -z "$todo" ] && { echo "skip $id"; continue; }
  echo "=== $id seeds:$todo $(date +%H:%M:%S)"
  "$GEN" --model z-image-turbo --prompt-file "$A/prompts/$id.txt" --seed $todo \
    --width 1536 --height 1024 --metadata --output "$A/gen/$id-s{seed}.png" 2>&1 | grep -v -E '^\s*[0-9]+%|it/s\]$' | tail -5
  # mflux appends _seed_<n> when given several seeds: normalise to <id>-s<n>.*
  for s in $todo; do
    for ext in png metadata.json; do
      [ -f "$A/gen/$id-s${s}_seed_${s}.$ext" ] && mv "$A/gen/$id-s${s}_seed_${s}.$ext" "$A/gen/$id-s$s.$ext"
    done
  done
  echo "=== done $id $(date +%H:%M:%S)"
done
echo QUEUE-COMPLETE
