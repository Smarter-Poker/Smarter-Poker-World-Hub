#!/bin/bash
# Vercel Ignored Build Step — scripts/vercel-should-build.sh
# Exit 0 = SKIP build | Exit 1 = PROCEED with build
#
# Skips the build when only non-code files changed (docs, tests, CI configs,
# markdown, references). Any change to app code, config files, or package
# dependencies triggers a full build.
#
# Added 2026-05-18 to reduce $207/mo Vercel build cost.
# The 952-page Next.js app was rebuilding on every single push to main.

# ═══════════════════════════════════════════════════════════════════════════
#  GATE 1 — AN AGENT BRANCH'S PREVIEW MUST NOT QUEUE AHEAD OF PRODUCTION
#  (Dan 2026-08-30)
# ═══════════════════════════════════════════════════════════════════════════
#
# Measured on 2026-08-29/30: a Club Arena fix merged to main, synced to this
# repo at 03:55, and did not reach smarter.poker until ~04:20 — because the
# build concurrency pool was full of PREVIEW builds for `agent/*` branches
# pushed by other agents in the same minutes. Worse than slow: the production
# deploy for the sync commit was CANCELED outright while queued, and the
# change only shipped by riding a later commit's build.
#
# Those previews are pure waste here. An `agent/*` branch is created by
# scripts/agent-workspace.sh, exists to be squash-merged, and is deleted after.
# NOBODY OPENS ITS PREVIEW URL. And nothing depends on one: the required
# checks on this repo are GitHub Actions (see AGENT-PLAYBOOK.md §3) — no
# Vercel deployment is a required status, so skipping these cannot block a
# merge.
#
# This gate runs BEFORE the file-diff gate below, because the question "is
# this a throwaway preview" is answered without any diff at all — and the diff
# is exactly what is unreliable on a shallow preview clone.
#
# Production (`VERCEL_ENV=production`, i.e. main) is NEVER skipped here; it
# falls through to the file-diff gate that has always governed it.
if [ "$VERCEL_ENV" = "preview" ]; then
  case "$VERCEL_GIT_COMMIT_REF" in
    agent/*)
      echo "[should-build] Preview for agent branch '$VERCEL_GIT_COMMIT_REF' — SKIPPED."
      echo "[should-build] Agent branches are squash-merged, never browsed; their"
      echo "[should-build] previews only queue ahead of production deploys."
      exit 0
      ;;
    ci-marker/*|backup/*|build/*)
      # ── AN ORPHAN BRANCH IS NOT AN APPLICATION (2026-09-03) ──────────────
      #
      # `agent-open-pr.yml` publishes its outcome to `ci-marker/agent-open-pr-
      # result`: `git checkout --orphan`, `git rm -rf .`, one text file, force
      # push. There is no package.json on that branch, so a build cannot do
      # anything but fail — and it did, on EVERY agent pull request, in every
      # Vercel-connected repo in the estate. Measured 2026-09-03: every single
      # ERROR deployment on hub-vanguard, pepnationlab and smarter-poker-
      # commander was this one ref.
      #
      # The commit message carries `[skip ci]` and Vercel builds it regardless:
      # that convention is honoured by Vercel's own CI detection, not by the
      # GitHub App deployment path these arrive through (`githubDeployment: 1`).
      #
      # `git.deploymentEnabled` in vercel.json now refuses these refs before a
      # deployment is created at all, which is the real fix. This case stays as
      # the belt: an ignoreCommand runs even when someone re-enables the ref,
      # and the gate below CANNOT catch these — `git diff HEAD~1 HEAD` on an
      # orphan's first commit has no HEAD~1, returns empty, and the "cannot
      # determine diff, build to be safe" fallback then builds the very thing
      # that has nothing to build.
      echo "[should-build] '$VERCEL_GIT_COMMIT_REF' is a marker/backup ref, not an app — SKIPPED."
      exit 0
      ;;
  esac
fi

CHANGED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "[should-build] Cannot determine diff — building to be safe"
  exit 1
fi

echo "[should-build] Changed files:"
echo "$CHANGED"
echo ""

# Find any file that falls OUTSIDE the skip list — those require a rebuild
NEEDS_BUILD=$(echo "$CHANGED" | grep -vE "^(docs/|references/|__tests__/|playwright/|e2e/|tests/|\.github/)|(README|CHANGELOG|CONTRIBUTING|\.md)$" | head -1)

if [ -n "$NEEDS_BUILD" ]; then
  echo "[should-build] App code changed (e.g. $NEEDS_BUILD) — proceeding with build"
  exit 1
fi

echo "[should-build] Only docs/tests changed — skipping build (saves ~\$8-12 in Vercel build costs)"
exit 0
