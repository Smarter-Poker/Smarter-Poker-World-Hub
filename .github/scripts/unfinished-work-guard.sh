#!/usr/bin/env bash
# Decide whether a branch is finished enough for automation to propose or merge.
#
# Usage: unfinished-work-guard.sh <branch> <head-commit-subject> [is-draft]
#   exit 0  - automation may open the PR / arm protected squash auto-merge
#   exit 10 - unfinished work; the reason is printed and nothing may be armed
#   other   - usage error; callers fail closed
#
# Added 2026-11-27 after PR #3170: a handoff bookmark pushed as
# `bookmark/video-library-smarterdesign-2026-11-27`, head commit
# "wip(video-library): bookmark ... unfinished, see handoff", was opened by
# Agent Open PR and squash auto-merged by Agent Autopilot into production.
# A bookmark is a place to resume from, never a release. Both workflows call
# this one script so the two halves cannot disagree.
set -euo pipefail

BRANCH="${1-}"
SUBJECT="${2-}"
DRAFT="${3:-false}"

[ -n "$BRANCH" ] || { echo "usage: unfinished-work-guard.sh <branch> <subject> [is-draft]" >&2; exit 2; }

if [ "$DRAFT" = "true" ]; then
  echo "the pull request is a draft; a draft is never auto-merged"
  exit 10
fi

# Any path segment named bookmark, wip or handoff (or starting with one of them
# followed by - _ or .), so `agent/x/bookmark/...` is held as well as
# `bookmark/...`.
IFS='/' read -r -a SEGMENTS <<<"$BRANCH"
for SEG in "${SEGMENTS[@]}"; do
  LOWER=$(tr '[:upper:]' '[:lower:]' <<<"$SEG")
  if [[ "$LOWER" =~ ^(bookmark|wip|handoff)([-_.].*)?$ ]]; then
    echo "branch $BRANCH is a ${BASH_REMATCH[1]} branch, not a release"
    exit 10
  fi
done

LOWER_SUBJECT=$(tr '[:upper:]' '[:lower:]' <<<"$SUBJECT")
# "wip", "WIP:", "wip(scope):", "[WIP] ..." - but not "wipe".
if [[ "$LOWER_SUBJECT" =~ ^[[:space:]]*\[?wip([^a-z0-9]|$) ]]; then
  echo "head commit subject starts with wip: $SUBJECT"
  exit 10
fi
for WORD in bookmark unfinished; do
  if [[ "$LOWER_SUBJECT" == *"$WORD"* ]]; then
    echo "head commit subject says $WORD: $SUBJECT"
    exit 10
  fi
done

exit 0
