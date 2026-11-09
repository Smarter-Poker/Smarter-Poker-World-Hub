#!/usr/bin/env node
/**
 * scripts/check-branch-protection.mjs
 *
 * Guardrail: assert that branch protection on `main` is in the
 * agent-friendly canonical state and AUTO-CORRECT if it has regressed.
 *
 * Why this exists: see .agent/audits/2026-05-10-branch-protection-and-push-cascade.md
 *
 * NOTE (2026-11-09): main is gated by a repository RULESET ("main: no
 * rewinds"), not by classic branch protection, so the API this script reads
 * answers 404 "Branch not protected". The list below is still the canonical
 * record of which checks must gate main, and this script still auto-corrects
 * if classic protection is ever switched back on — but the live gate is the
 * ruleset, and a new required check has to be added there too.
 *
 * Canonical state for this repo:
 *   - required_status_checks.contexts: ["Audit-marker registry vs. tree",
 *                                        "Top bars own their safe-area inset"]
 *   - required_pull_request_reviews: null  (no review requirement)
 *   - enforce_admins: false  (admins can push directly when checks pass)
 *   - allow_force_pushes: false
 *   - allow_deletions: false
 *   - lock_branch: false
 *
 * Run modes:
 *   `node scripts/check-branch-protection.mjs`         → check + report only
 *   `node scripts/check-branch-protection.mjs --fix`   → check + auto-correct
 *
 * Exit codes:
 *   0 — protection is correct (or was successfully corrected with --fix)
 *   1 — protection is wrong AND --fix was not passed (or --fix failed)
 *   2 — environment misconfigured (missing GITHUB_TOKEN, API errored, etc.)
 */

const REPO_OWNER = 'Smarter-Poker';
const REPO_NAME = 'Smarter-Poker-World-Hub';
const BRANCH = 'main';
// Checks that MUST gate main. Both are pure static scans with no network and
// no install, so neither can flake main shut.
//   Audit-marker ........ a registered token vanished from the source tree
//   Safe-area top ....... a top bar lost (or never got) its status-bar inset,
//                         or <body> grew one back. Added 2026-11-09, after the
//                         landing page shipped untappable Sign Up / Sign In
//                         buttons under the iPhone status bar.
// A required check that never reports blocks every PR, so neither workflow may
// ever carry a paths filter on `pull_request`.
const REQUIRED_CHECKS = [
  'Audit-marker registry vs. tree',
  'Top bars own their safe-area inset',
];

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const FIX_MODE = process.argv.includes('--fix');

if (!TOKEN) {
  console.error('[check-branch-protection] GITHUB_TOKEN env not set');
  process.exit(2);
}

const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`;
const ghHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const CANONICAL_PROTECTION = {
  required_status_checks: { strict: false, contexts: [...REQUIRED_CHECKS] },
  enforce_admins: false,
  required_pull_request_reviews: null,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: false,
  lock_branch: false,
  allow_fork_syncing: false,
};

async function getProtection() {
  const res = await fetch(apiBase, { headers: ghHeaders });
  if (!res.ok) throw new Error(`GET protection: ${res.status} ${await res.text()}`);
  return res.json();
}

async function setProtection() {
  const res = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(CANONICAL_PROTECTION),
  });
  if (!res.ok) throw new Error(`PUT protection: ${res.status} ${await res.text()}`);
  return res.json();
}

function findRegressions(actual) {
  const issues = [];
  if (actual.required_pull_request_reviews) {
    issues.push(
      `required_pull_request_reviews is set (count=${actual.required_pull_request_reviews.required_approving_review_count}); should be null`
    );
  }
  if (actual.enforce_admins?.enabled) issues.push(`enforce_admins is true; should be false`);
  const contexts = actual.required_status_checks?.contexts || [];
  const missing = REQUIRED_CHECKS.filter((c) => !contexts.includes(c));
  if (missing.length > 0) {
    issues.push(`required_status_checks.contexts is missing ${JSON.stringify(missing)} (got: ${JSON.stringify(contexts)})`);
  }
  if (actual.lock_branch?.enabled) issues.push(`lock_branch is true; should be false`);
  return issues;
}

(async () => {
  let actual;
  try {
    actual = await getProtection();
  } catch (err) {
    console.error('[check-branch-protection] API error reading protection:', err.message);
    process.exit(2);
  }
  const issues = findRegressions(actual);
  if (issues.length === 0) {
    console.log('[check-branch-protection] OK — main protection is canonical.');
    process.exit(0);
  }
  console.error(`[check-branch-protection] REGRESSION DETECTED on ${REPO_OWNER}/${REPO_NAME}:${BRANCH}:`);
  for (const issue of issues) console.error(`  - ${issue}`);
  if (!FIX_MODE) {
    console.error(`\nRun with --fix to auto-correct, or fix manually at https://github.com/${REPO_OWNER}/${REPO_NAME}/settings/branches`);
    process.exit(1);
  }
  console.error('\n[check-branch-protection] --fix passed; restoring canonical protection...');
  try {
    await setProtection();
  } catch (err) {
    console.error('[check-branch-protection] PUT failed:', err.message);
    process.exit(1);
  }
  const after = await getProtection();
  const remaining = findRegressions(after);
  if (remaining.length === 0) {
    console.log('[check-branch-protection] FIXED — main protection is now canonical.');
    process.exit(0);
  }
  console.error('[check-branch-protection] PUT returned but issues remain:');
  for (const r of remaining) console.error(`  - ${r}`);
  process.exit(1);
})();
