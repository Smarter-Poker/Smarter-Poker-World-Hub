#!/usr/bin/env bash
# scripts/agent-push.sh — worktree-isolated push for agents.
# See .agent/audits/2026-05-10-branch-protection-and-push-cascade.md
#
# Usage:
#   bash scripts/agent-push.sh "commit message" path/to/file1 path/to/file2 ...
#
# Files must already be edited in your local working tree. Script copies
# their current content into a fresh worktree off origin/main, commits ONLY
# those paths, opens a PR, and squash-merges.
#
# Required env (one of):
#   GITHUB_TOKEN | GH_TOKEN — PAT with repo + admin scope
#
# Exit codes: 0=landed, 1=push/merge failed, 2=env/arg error.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 \"commit message\" path1 [path2 ...]" >&2
  exit 2
fi
COMMIT_MSG="$1"; shift
FILES=("$@")

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$TOKEN" ]] && command -v security >/dev/null 2>&1; then
  TOKEN="$(security find-generic-password -a smarter-poker -s github-pat -w 2>/dev/null || true)"
fi
if [[ -z "$TOKEN" ]]; then
  echo "[agent-push] no GITHUB_TOKEN/GH_TOKEN env, no Keychain entry 'github-pat'" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_OWNER="Smarter-Poker"
REPO_NAME="$(basename "$REPO_ROOT")"
BRANCH="agent/${USER:-cowork}-$(date +%s)"
WT_PARENT="$(mktemp -d -t agent-push-XXXXXX)"
WT="$WT_PARENT/wt"
SNAP_DIR="$(mktemp -d -t agent-push-snap-XXXXXX)"

echo "[agent-push] repo=$REPO_OWNER/$REPO_NAME branch=$BRANCH"
echo "[agent-push] files: ${FILES[*]}"

for f in "${FILES[@]}"; do
  if [[ ! -f "$REPO_ROOT/$f" ]]; then
    echo "[agent-push] file not found: $f" >&2; exit 2
  fi
  mkdir -p "$SNAP_DIR/$(dirname "$f")"
  cp -a "$REPO_ROOT/$f" "$SNAP_DIR/$f"
done

cd "$REPO_ROOT"
git fetch origin main --quiet
ORIGIN_TIP="$(git rev-parse origin/main)"
echo "[agent-push] origin/main: $ORIGIN_TIP"

git worktree add -b "$BRANCH" "$WT" "$ORIGIN_TIP" >/dev/null
trap 'cd "$REPO_ROOT" 2>/dev/null; git worktree remove --force "$WT" 2>/dev/null || true; rm -rf "$SNAP_DIR" "$WT_PARENT"' EXIT

cd "$WT"
for f in "${FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  cp -a "$SNAP_DIR/$f" "$f"
done

git add -- "${FILES[@]}"

DIFF_FILES="$(git diff --cached --name-only)"
EXPECTED_FILES="$(printf "%s\n" "${FILES[@]}" | sort -u)"
if [[ "$(printf "%s\n" "$DIFF_FILES" | sort -u)" != "$EXPECTED_FILES" ]]; then
  echo "[agent-push] staged diff != expected files; aborting" >&2
  echo "  staged:   $DIFF_FILES" >&2
  echo "  expected: $EXPECTED_FILES" >&2
  exit 1
fi

git -c user.name="Smarter-Poker" -c user.email="254329056+Smarter-Poker@users.noreply.github.com" \
  commit -m "$COMMIT_MSG"
echo "[agent-push] commit: $(git rev-parse HEAD)"

git push -u "https://x-access-token:${TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git" "$BRANCH" 2>&1 | sed "s|${TOKEN}|REDACTED|g"

PR_TITLE="$(printf "%s" "$COMMIT_MSG" | head -1)"
PR_BODY="$(printf "%s\n\nAutomated push via scripts/agent-push.sh (worktree-isolation pattern).\n" "$COMMIT_MSG")"
PR_PAYLOAD="$(node -e "console.log(JSON.stringify({title:process.argv[1],head:process.argv[2],base:'main',body:process.argv[3]}))" "$PR_TITLE" "$BRANCH" "$PR_BODY")"

PR_RESP="$(curl -sS -X POST "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls" \
  -H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" -d "$PR_PAYLOAD")"
PR_NUM="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).number||'')}catch(e){}" <<<"$PR_RESP")"
if [[ -z "$PR_NUM" ]]; then
  echo "[agent-push] PR creation failed:" >&2; echo "$PR_RESP" >&2; exit 1
fi
echo "[agent-push] PR #$PR_NUM"

for i in $(seq 1 30); do
  sleep 3
  STATUS_RESP="$(curl -sS "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUM}" -H "Authorization: Bearer ${TOKEN}")"
  MS="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).mergeable_state||'')}catch(e){}" <<<"$STATUS_RESP")"
  if [[ "$MS" == "clean" || "$MS" == "unstable" ]]; then echo "[agent-push] mergeable_state=$MS"; break; fi
done

MERGE_RESP="$(curl -sS -X PUT "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${PR_NUM}/merge" \
  -H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "{\"merge_method\":\"squash\",\"commit_title\":\"$PR_TITLE (#${PR_NUM})\"}")"
MERGED="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).merged||'')}catch(e){}" <<<"$MERGE_RESP")"
if [[ "$MERGED" != "true" ]]; then
  echo "[agent-push] merge failed:" >&2; echo "$MERGE_RESP" >&2
  echo "  PR is open at https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${PR_NUM}" >&2
  echo "  If branch protection regressed: node scripts/check-branch-protection.mjs --fix" >&2
  exit 1
fi
echo "[agent-push] merged $(node -e "try{console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).sha||'')}catch(e){}" <<<"$MERGE_RESP")"
curl -sS -X DELETE "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
echo "[agent-push] DONE"
