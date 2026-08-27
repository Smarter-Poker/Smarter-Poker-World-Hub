#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ENSURE THE TRACKED HOOKS RUN (issue #625, closed 2026-08-27)
# ═══════════════════════════════════════════════════════════════════════════
# This script used to be the PROBLEM this issue describes: it UNSET
# core.hooksPath and copied untracked hook files into .git/hooks/, so twelve
# checks written from real production incidents protected exactly one machine
# and died on every fresh clone — and running it by hand put a repaired clone
# BACK on the legacy hooks. The tracked .husky/ hooks are the union of
# everything that ever ran here (see .husky/pre-commit's header); this script
# now has one job: make git use them, idempotently.
#
# Run automatically via `npm install` (postinstall) or manually:
#   bash scripts/install-hooks.sh
# ═══════════════════════════════════════════════════════════════════════════
set -e

# Not a git checkout (Vercel build, tarball install): nothing to do.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git config core.hooksPath .husky

# A hook committed non-executable is silently SKIPPED by git (the estate lost
# months of guard coverage to exactly this — see AGENT-PLAYBOOK.md §5b).
BAD_MODE=0
for f in .husky/pre-commit .husky/pre-push .husky/pre-rebase \
         .husky/commit-msg .husky/post-checkout .husky/reference-transaction; do
    if [ -f "$f" ] && [ ! -x "$f" ]; then
        chmod +x "$f"
        echo "install-hooks: repaired mode on $f (was not executable — git skips those silently)"
        BAD_MODE=1
    fi
done

echo "install-hooks: core.hooksPath -> .husky (tracked hooks active)"
[ "$BAD_MODE" = "1" ] && echo "install-hooks: NOTE — repaired modes are local; commit the fix so every clone gets it."
exit 0
