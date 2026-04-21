#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Common final step for every strategy. Reads the title/body files the
// strategy wrote to /tmp, creates a branch, commits any working-tree
// changes, pushes, opens a draft PR, and updates autofix_attempts.
//
// Expected preconditions (set by the strategy that ran before us):
//   - /tmp/vercel-autofix-commit-title.txt — single-line PR title
//   - /tmp/vercel-autofix-commit-body.txt  — multi-line PR body
//   - git working tree has the fix staged as unstaged modifications
//     (oom → package.json; missing-dep → package.json + lockfile; claude
//      → one or two source files inside the allowlist).
//
// Environment (from the workflow env block):
//   GH_TOKEN, COMMIT_SHA, DEPLOYMENT_ID, STRATEGY, ATTEMPT_ID, CONFIDENCE,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_REPOSITORY (injected
//   by GH Actions as owner/repo).
// ═════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const COMMIT_SHA = process.env.COMMIT_SHA;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const STRATEGY = process.env.STRATEGY || 'generic';
const ATTEMPT_ID = process.env.ATTEMPT_ID;
const CONFIDENCE = process.env.CONFIDENCE || 'medium';
const GH_TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // e.g. "Smarter-Poker/Smarter-Poker-World-Hub"

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}
function fail(reason, extra = {}) {
  log({ level: 'error', reason, ...extra });
  process.exit(2);
}

if (!COMMIT_SHA || !REPO || !GH_TOKEN) {
  fail('missing_env', { have: { COMMIT_SHA: !!COMMIT_SHA, REPO: !!REPO, GH_TOKEN: !!GH_TOKEN } });
}

// ---------------------------------------------------------------------------
// 1. Read strategy outputs
// ---------------------------------------------------------------------------
let title, body;
try {
  title = fs.readFileSync('/tmp/vercel-autofix-commit-title.txt', 'utf8').trim();
  body = fs.readFileSync('/tmp/vercel-autofix-commit-body.txt', 'utf8');
} catch (e) {
  fail('commit_msg_files_missing', { err: String(e) });
}
if (!title) fail('empty_commit_title');

// ---------------------------------------------------------------------------
// 2. Confirm the strategy actually changed something
// ---------------------------------------------------------------------------
const diffStat = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (!diffStat) {
  log({ level: 'info', reason: 'no_changes_staged_by_strategy', strategy: STRATEGY });
  // Mark attempt as skipped_unfixable (strategy ran but produced no diff)
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await sb
    .from('autofix_attempts')
    .update({ status: 'skipped_unfixable', error_message: 'no_diff_after_strategy' })
    .eq('id', ATTEMPT_ID);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Create branch, commit, push
// ---------------------------------------------------------------------------
const sha7 = COMMIT_SHA.slice(0, 7);
const branch = `vercel-autofix/${STRATEGY}/${sha7}-${Date.now().toString(36)}`;

try {
  execSync(`git config user.name "vercel-autofix-bot"`, { stdio: 'inherit' });
  execSync(`git config user.email "vercel-autofix-bot@users.noreply.github.com"`, { stdio: 'inherit' });
  execSync(`git checkout -b ${branch}`, { stdio: 'inherit' });
  execSync(`git add -A`, { stdio: 'inherit' });
  execSync(`git commit -m ${JSON.stringify(title)} -m ${JSON.stringify(body)}`, { stdio: 'inherit' });
  execSync(`git push origin ${branch}`, { stdio: 'inherit' });
} catch (e) {
  fail('git_push_failed', { err: String(e) });
}

// ---------------------------------------------------------------------------
// 4. Open draft PR via GitHub API
// ---------------------------------------------------------------------------
const prRes = await fetch(`https://api.github.com/repos/${REPO}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    title,
    head: branch,
    base: 'main',
    body,
    draft: true,
    maintainer_can_modify: true,
  }),
});

if (!prRes.ok) {
  const errBody = await prRes.text();
  fail('pr_open_failed', { status: prRes.status, body: errBody.slice(0, 500) });
}

const pr = await prRes.json();
log({ level: 'info', action: 'pr_opened', url: pr.html_url, number: pr.number });

// ---------------------------------------------------------------------------
// 5. Label + comment for discoverability
// ---------------------------------------------------------------------------
try {
  await fetch(`https://api.github.com/repos/${REPO}/issues/${pr.number}/labels`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ labels: ['autofix', `autofix:${STRATEGY}`, `confidence:${CONFIDENCE}`] }),
  });
} catch (e) {
  log({ level: 'warn', msg: 'label_set_failed', err: String(e) });
}

// ---------------------------------------------------------------------------
// 6. Update autofix_attempts row
// ---------------------------------------------------------------------------
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
try {
  await sb
    .from('autofix_attempts')
    .update({
      status: 'pr_opened',
      pr_url: pr.html_url,
      pr_number: pr.number,
      branch_name: branch,
    })
    .eq('id', ATTEMPT_ID);
} catch (e) {
  log({ level: 'warn', msg: 'supabase_update_failed', err: String(e) });
}

log({ level: 'info', action: 'done', pr: pr.html_url });
