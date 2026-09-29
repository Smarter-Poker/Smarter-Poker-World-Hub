#!/usr/bin/env bash
# Safe manual entry point for the canonical immutable deployment workflow.
# This script deliberately performs no SSH, copying, dependency installation,
# or in-place mutation. GitHub Actions deploys the exact remote commit SHA.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_REF=main

die() {
  printf '[deploy-openclaw] ERROR: %s\n' "$*" >&2
  exit 1
}

if [ "$#" -gt 0 ]; then
  die 'usage: bash scripts/deploy-openclaw.sh (merged main only; no ref override)'
fi
command -v git >/dev/null 2>&1 || die 'git is required'
command -v gh >/dev/null 2>&1 || die 'GitHub CLI is required'
test "$(git -C "$REPO_ROOT" branch --show-current)" = main \
  || die 'check out merged main before deploying'

release_paths=(
  .github/workflows/deploy-openclaw.yml
  scripts/openclaw-cron-dispatcher.py
  scripts/video_library_scraper.py
  scripts/video_library_to_reels.py
  scripts/openclaw-requirements.txt
  scripts/openclaw-requirements.lock
  scripts/openclaw.service
)
git -C "$REPO_ROOT" diff --quiet -- "${release_paths[@]}" \
  || die 'release files have uncommitted changes; commit and push them first'
git -C "$REPO_ROOT" diff --cached --quiet -- "${release_paths[@]}" \
  || die 'release files have staged but uncommitted changes; commit and push them first'

local_sha="$(git -C "$REPO_ROOT" rev-parse --verify 'refs/heads/main^{commit}')" \
  || die 'local main does not resolve'
test "$(git -C "$REPO_ROOT" rev-parse HEAD)" = "$local_sha" \
  || die 'HEAD is not the local main tip'
remote_sha="$(git -C "$REPO_ROOT" ls-remote --exit-code origin "refs/heads/$DEPLOY_REF" | awk 'NR == 1 {print $1}')" \
  || die 'origin/main does not exist'
test -n "$remote_sha" || die 'origin/main does not exist'
test "$local_sha" = "$remote_sha" \
  || die 'local main does not match origin/main; pull or push the exact merged release first'

printf '[deploy-openclaw] Dispatching immutable release %s from origin/%s\n' "$local_sha" "$DEPLOY_REF"
gh workflow run deploy-openclaw.yml --repo Smarter-Poker/Smarter-Poker-World-Hub --ref "$DEPLOY_REF"
printf '[deploy-openclaw] Workflow dispatched; GitHub Actions will report promotion or rollback.\n'
