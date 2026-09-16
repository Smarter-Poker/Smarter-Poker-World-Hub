#!/usr/bin/env bash
# Submit the current owned worktree through the existing protected PR route.
# Uses the host's Git/gh authentication; never reads project environment files.
set -euo pipefail
if [[ $# -lt 2 ]]; then
  echo 'usage: bash scripts/agent-push.sh "commit message" path1 [path2 ...]' >&2
  exit 2
fi
message="$1"; shift
repo=Smarter-Poker/Smarter-Poker-World-Hub
root="$(git rev-parse --show-toplevel)"
cd "$root"
case "$(pwd -P)/" in
  */.agent-trees/*/) ;;
  *) echo 'Submit from your owned .agent-trees worktree; shared clones are refused.' >&2; exit 2 ;;
esac
branch="$(git symbolic-ref --quiet --short HEAD)" || { echo 'Detached HEAD cannot be submitted.' >&2; exit 2; }
case "$branch" in main|master) echo 'Use an owned feature branch.' >&2; exit 2 ;; esac
case "$(git remote get-url origin)" in
  git@github.com:Smarter-Poker/Smarter-Poker-World-Hub.git|https://github.com/Smarter-Poker/Smarter-Poker-World-Hub.git) ;;
  *) echo 'origin must be the canonical World Hub repository without URL credentials.' >&2; exit 2 ;;
esac
# Refuse an existing index rather than including someone else's staged work.
git diff --cached --quiet || { echo 'Existing staged changes: preserve/review the index before submitting.' >&2; exit 2; }
for path in "$@"; do
  case "$path" in
    ''|/*|..|../*|*/../*|*/..|:*|.env|.env.*|*/.env|*/.env.*)
      echo 'Only explicit repository-relative, non-secret file paths are accepted.' >&2; exit 2 ;;
  esac
  if [[ -d "$path" ]]; then echo 'Name individual files, not directories.' >&2; exit 2; fi
  if [[ ! -f "$path" ]] && ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    echo "Unknown file: $path" >&2; exit 2
  fi
done
# Confirm existing host authentication before making a local commit.
gh auth status --hostname github.com >/dev/null 2>&1 || {
  echo 'The host gh login is unavailable; use its existing authenticated host session. Do not read a .env token.' >&2
  exit 2
}
git fetch origin main
# Merge/review conflicts deliberately in this same owned tree; never copy stale
# whole files onto current main, rewrite tested commits, or silently discard work.
git add -- "$@"
if ! git diff --cached --quiet; then git commit -m "$message"; fi
head="$(git rev-parse HEAD)"
git push --set-upstream origin "$branch"
pr="$(gh pr list --repo "$repo" --head "$branch" --base main --state open --json number --jq '.[0].number // empty')"
if [[ -z "$pr" ]]; then
  gh pr create --repo "$repo" --base main --head "$branch" --title "$message" \
    --body 'Submitted from the existing owned worktree. Required checks and protected merge remain enforced. Publication is a separate stage; see docs/runbooks/local-production-build-env.md.'
  pr="$(gh pr list --repo "$repo" --head "$branch" --base main --state open --json number --jq '.[0].number // empty')"
fi
[[ "$pr" =~ ^[0-9]+$ ]] || { echo 'No confirmed PR number; local work and branch are preserved.' >&2; exit 1; }
# Respect producer holds and confirm the PR still names the exact submitted head.
allowed="$(gh pr view "$pr" --repo "$repo" --json state,isDraft,baseRefName,headRefOid,labels \
  --jq 'select(.state == "OPEN" and .isDraft == false and .baseRefName == "main" and (any(.labels[]; .name == "hold" or .name == "do-not-merge" or .name == "wip") | not)) | .headRefOid')"
[[ "$allowed" == "$head" ]] || { echo 'PR is held, a draft, closed, or changed; leaving it unqueued.' >&2; exit 1; }
gh pr merge "$pr" --repo "$repo" --auto --squash --match-head-commit "$head"
printf 'SUBMITTED: https://github.com/%s/pull/%s\nHEAD: %s\n' "$repo" "$pr" "$head"
echo 'Protected auto-merge requested. This does not certify merge or publication.'
echo 'World Hub currently requires the existing local prebuilt publisher after merge; no automatic World Hub publisher is installed.'
