#!/bin/bash
# v3 — land the Club Arena Player Stats SOURCE commit (add0cd2f0) on CA main.
# WH is already pushed (d06a1d7d44). CA origin keeps moving, so this
# cherry-picks the commit onto the CURRENT origin/main at push time,
# retrying up to 3 times. Self-deletes on success.
set -uo pipefail

REPO="$HOME/Documents/Smarter-Poker-Club-Arena"
PICK="add0cd2f084f4de8ea2814655edad9a8bd9580e7"

cd "$REPO" || { echo "FATAL: cannot cd $REPO"; read -r -p "enter to close"; exit 1; }
for l in .git/HEAD.lock .git/index.lock; do [ -f "$l" ] && rm -f "$l"; done
rm -f .git/*.lock.stale* 2>/dev/null
git worktree prune 2>/dev/null

OK=0
for attempt in 1 2 3; do
  echo ""
  echo "=== attempt $attempt: cherry-pick $PICK onto current origin/main ==="
  git fetch origin main || continue
  TMPWT="$(mktemp -d /tmp/ca-stats-push.XXXXXX)"
  rmdir "$TMPWT"
  if ! git worktree add --detach "$TMPWT" refs/remotes/origin/main; then
    echo "worktree add failed"; continue
  fi
  (
    cd "$TMPWT" || exit 1
    git cherry-pick "$PICK" || { git cherry-pick --abort 2>/dev/null; exit 1; }
    git push origin HEAD:main || exit 1
  )
  RC=$?
  git worktree remove --force "$TMPWT" 2>/dev/null
  if [ "$RC" = "0" ]; then OK=1; break; fi
  sleep 5
done

if [ "$OK" = "1" ]; then
  echo ""
  echo "CA SOURCE PUSHED OK."
  rm -- "$0"
  sleep 3
else
  echo ""
  echo "CA PUSH FAILED after 3 attempts — window left open; see errors above."
  read -r -p "Press enter to close"
fi
