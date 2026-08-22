#!/usr/bin/env bash
# IS PRODUCTION SERVING main?
#
# Every other gate in this repo answers "did it merge". None answered "did it
# deploy", and those are different questions with the same green tick. World
# Hub deploys through Vercel's git integration - there is no workflow to watch,
# so a build that errors, gets stuck queued, or is superseded and never retried
# leaves main moving while smarter.poker serves something older. Nothing said
# so.
#
# `/api/health` reports the short sha it was built from. That is the only
# authoritative answer to "what is live", and this compares it to main.
#
# IT DOES NOT DEPLOY ANYTHING. CLAUDE.md 1.3 forbids `vercel deploy`, `vercel
# --prod` and calling any deploy hook, and that rule exists because those paths
# have produced duplicate and out-of-order deployments before. So this
# diagnoses precisely - it asks the Vercel API what happened to the deployment
# for THIS sha - and then says so out loud. Deciding what to do about a failed
# production build is not a thing to automate here.
#
# Env: GH_TOKEN, GITHUB_REPOSITORY. Optional: GH_TOKEN_ISSUES, VERCEL_TOKEN,
#      VERCEL_PROJECT_ID, VERCEL_ORG_ID, LAG_BUDGET_MIN (default 20).
set -uo pipefail

REPO="${GITHUB_REPOSITORY:?}"
HEALTH_URL="${HEALTH_URL:-https://smarter.poker/api/health}"
LAG_BUDGET_MIN="${LAG_BUDGET_MIN:-20}"
ISSUE_TITLE="Publish watchdog: production is not serving main"

say() { echo "$@"; }
summary() { echo "$@" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }

# The read and the write use the SAME token. They did not once, and the result
# was six duplicate issues across two repos: the write succeeded under
# GITHUB_TOKEN while the read came back empty under an App token with no issues
# scope, so every run concluded no issue existed and filed another.
find_issue() {
  GH_TOKEN="${GH_TOKEN_ISSUES:-${GH_TOKEN:-}}" \
  gh issue list --repo "$REPO" --state open --limit 100 --json number,title \
    --jq "[.[] | select(.title == \"$1\")] | .[0].number // empty" 2>/dev/null
}
gh_write() {
  local what="$1"; shift
  local out
  if out=$(GH_TOKEN="${GH_TOKEN_ISSUES:-${GH_TOKEN:-}}" gh "$@" 2>&1); then
    say "  $what"; return 0
  fi
  say "::error::publish-watchdog could not $what -- production is behind and nobody was told."
  printf '%s\n' "$out" | sed 's/^/    /'
  return 1
}

HEAD_SHA=$(git rev-parse HEAD)
HEAD_SHORT=${HEAD_SHA:0:8}
HEAD_TIME=$(git show -s --format=%cI "$HEAD_SHA")
NOW=$(date -u +%s)
AGE_MIN=$(( (NOW - $(git show -s --format=%ct "$HEAD_SHA")) / 60 ))

# Cache-bust: a CDN-cached answer is a stale fact wearing a fresh timestamp,
# which is the exact thing this exists to catch.
SERVED=$(curl -fsSL -H 'Cache-Control: no-cache' "${HEALTH_URL}?cb=${NOW}" 2>/dev/null \
         | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

say "main HEAD : $HEAD_SHORT ($HEAD_TIME, ${AGE_MIN}m ago)"
say "production: ${SERVED:-<unreadable>}"

if [ -n "$SERVED" ] && [ "${SERVED:0:8}" = "$HEAD_SHORT" ]; then
  say "OK — production is serving main."
  summary "### Publish watchdog: OK"
  summary ""
  summary "smarter.poker is serving \`$HEAD_SHORT\`, which is main's HEAD."
  N=$(find_issue "$ISSUE_TITLE")
  if [ -n "${N:-}" ]; then
    gh_write "comment on #$N" issue comment "$N" --repo "$REPO" \
      --body "Recovered. Production is serving \`$HEAD_SHORT\`, which is main's HEAD. Closing." || true
    gh_write "close #$N" issue close "$N" --repo "$REPO" || true
  fi
  exit 0
fi

# A Vercel build takes 3-5 minutes and rapid pushes queue, so a young HEAD is
# not evidence of anything. Alarming on it is how a watchdog becomes noise.
if [ "$AGE_MIN" -lt "$LAG_BUDGET_MIN" ]; then
  say "main's HEAD is only ${AGE_MIN}m old (budget ${LAG_BUDGET_MIN}m) — a deploy is probably still running."
  summary "### Publish watchdog: in flight"
  summary ""
  summary "main \`$HEAD_SHORT\` is ${AGE_MIN}m old; production serves \`${SERVED:-?}\`."
  exit 0
fi

# ── Over budget. Ask Vercel what actually happened to this sha. ────────────
DIAG="Vercel was not queried: VERCEL_TOKEN or VERCEL_PROJECT_ID is not set on this job."
if [ -n "${VERCEL_TOKEN:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  Q="https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=20"
  [ -n "${VERCEL_ORG_ID:-}" ] && Q="${Q}&teamId=${VERCEL_ORG_ID}"
  DEPS=$(curl -fsS -H "Authorization: Bearer ${VERCEL_TOKEN}" "$Q" 2>/dev/null || echo '')
  if [ -n "$DEPS" ]; then
    MINE=$(printf '%s' "$DEPS" | jq -r --arg s "$HEAD_SHA" \
      '[.deployments[] | select(.meta.githubCommitSha == $s)] | .[0] | if . == null then "none" else "\(.state) \(.url)" end' 2>/dev/null || echo none)
    LATEST=$(printf '%s' "$DEPS" | jq -r \
      '[.deployments[] | select(.target == "production")] | .[0] | "\(.state) \(.meta.githubCommitSha[0:8] // "?") \(.url)"' 2>/dev/null || echo '?')
    if [ "$MINE" = "none" ]; then
      DIAG="**Vercel has no deployment for \`$HEAD_SHORT\` at all.** The git integration did not fire for this commit. The most recent production deployment is \`$LATEST\`.

A commit that Vercel never saw does not retry itself. Check the Vercel project's git connection, and check whether the commit author resolves to a team member — a commit Vercel cannot attribute goes to **BLOCKED** with no build logs at all (CLAUDE.md 2.2, CHECK 15)."
    else
      DIAG="Vercel's deployment for \`$HEAD_SHORT\` is **$MINE**. The most recent production deployment is \`$LATEST\`."
    fi
  fi
fi

BODY="Production is not serving main, and it is past the ${LAG_BUDGET_MIN}-minute budget.

| | |
|---|---|
| main HEAD | \`$HEAD_SHORT\` — $HEAD_TIME (${AGE_MIN}m ago) |
| \`/api/health\` reports | \`${SERVED:-unreadable}\` |

${DIAG}

A merge that does not deploy is indistinguishable from a regression: main moves, agents report success, and users keep seeing the previous build. That is the failure this watchdog exists to name.

**This watchdog deliberately does not deploy anything.** CLAUDE.md 1.3 forbids \`vercel deploy\`, \`vercel --prod\` and calling any deploy hook, because those paths have produced duplicate and out-of-order deployments before. Decide what to do, then do it through the normal push.

_Raised automatically by \`.github/workflows/publish-watchdog.yml\`. It closes itself when production catches up._"

EXISTING=$(find_issue "$ISSUE_TITLE")
if [ -n "${EXISTING:-}" ]; then
  gh_write "update issue #$EXISTING" issue comment "$EXISTING" --repo "$REPO" --body "$BODY" || true
else
  gh_write "open an issue" issue create --repo "$REPO" --title "$ISSUE_TITLE" --body "$BODY" || true
fi

summary "### Publish watchdog: PRODUCTION IS BEHIND"
summary ""
summary "main \`$HEAD_SHORT\` (${AGE_MIN}m old) vs production \`${SERVED:-?}\`."
exit 1
