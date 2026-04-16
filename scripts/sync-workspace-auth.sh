#!/bin/bash
# Syncs a known working GitHub auth token across all repositories in the workspace
# Resolves the "Authentication failed / Invalid token" deployment blockers

set -euo pipefail

# Find the working token currently configured in World Hub or club-arena
get_current_token() {
  local token=$(git config --get remote.origin.url | grep -o 'ghp_[A-Za-z0-9]*' | head -n 1)
  if [ -z "$token" ]; then
    echo "❌ Could not find a valid ghp_ token in the current repository to copy from."
    exit 1
  fi
  echo "$token"
}

WORKING_TOKEN=$(get_current_token)
echo "✅ Using known working token: $WORKING_TOKEN"

echo "🔄 Sweeping all Smarter Poker repositories..."
for dir in /Users/smarter.poker/Documents/*/; do
  if [ -d "$dir/.git" ]; then
    name=$(basename "$dir")
    current_url=$(cd "$dir" && git config remote.origin.url || true)
    
    # If the URL contains an auth token that is NOT the current working token
    if echo "$current_url" | grep -q "ghp_" && ! echo "$current_url" | grep -q "$WORKING_TOKEN"; then
      repo_path=$(echo "$current_url" | sed 's|.*github.com/||')
      new_url="https://${WORKING_TOKEN}@github.com/${repo_path}"
      cd "$dir" && git remote set-url origin "$new_url"
      echo "  👉 Updated stale auth token in: $name"
    fi
  fi
done

echo "✅ All workspace authentication tokens are in sync!"
