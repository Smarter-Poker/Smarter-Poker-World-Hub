#!/usr/bin/env bash
# Keep Vercel's buildCommand below its 256-character schema limit. This runner
# is the production build contract; do not move these steps back into
# vercel.json.
set -euo pipefail

node scripts/copy-reader-assets.mjs
bash scripts/prune-platform-bins.sh
node scripts/patch-next.js
npm run test:marketplace
npm run test:training:phase6-authority
NODE_OPTIONS='--max-old-space-size=7168' next build --webpack
node scripts/check-horses-phase9-bundles.mjs
