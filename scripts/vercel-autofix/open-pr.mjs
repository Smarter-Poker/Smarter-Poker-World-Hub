#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Common final step for every strategy. Reads the title/body/paths files
// the strategy wrote to /tmp, creates a branch, commits ONLY the paths
// the strategy declared, pushes, opens a draft PR, updates autofix_attempts.
//
// Per-strategy path allowlist prevents `git add -A` from catching stray
// files that might contain secrets or unintended changes.
//
// Preconditions from strategy:
//   - /tmp/vercel-autofix-commit-title.txt
//   - /tmp/vercel-autofix-commit-body.txt
//   - /tmp/vercel-autofix-paths.txt   (newline-separated path allowlist)
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
const REPO = process.env.GITHUB_REPOSITORY;
const SLACK_WEBHOOK = process.env.SLACK_PR_WEBHOOK;

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }
function fail(reason, extra = {}) { log({ level: 'error', reason, ...extra }); process.exit(2); }

if (!COMMIT_SHA || !REPO || !GH_TOKEN) {
  fail('missing_env', { have: { COMMIT_SHA: !!COMMIT_SHA, REPO: !!REPO, GH_TOKEN: !!GH_TOKEN } });
}

// --- 1. Read strategy outputs ---------------------------------------------
let title, body, allowedPaths;
try {
  title = fs.readFileSync('/tmp/vercel-autofix-commit-title.txt', 'utf8').trim();
  body = fs.readFileSync('/tmp/vercel-autofix-commit-body.txt', 'utf8');
  allowedPaths = fs.readFileSync('/tmp/vercel-autofix-paths.txt', 'utf8')
    .split('\n').map(s => s.trim()).filter(Boolean);
} catch (e) {
  fail('strategy_output_files_missing', { err: String(e) });
}
if (!title) fail('empty_commit_title');
if (allowedPaths.length === 0) fail('empty_path_allowlist');

// --- 2. Verify the ONLY changed files are in the allowlist ----------------
const diff = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (!diff) {
  log({ level: 'info', reason: 'no_changes_staged_by_strategy', strategy: STRATEGY });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await sb.from('autofix_attempts')
    .update({ status: 'skipped_unfixable', error_message: 'no_diff_after_strategy' })
    .eq('id', ATTEMPT_ID);
  process.exit(0);
}

const changedFiles = diff.split('\n').map(l => l.trim().replace(/^\S+\s+/, ''));
const unexpected = changedFiles.filter(p => !allowedPaths.includes(p));
if (unexpected.length > 0) {
  fail('strategy_changed_unexpected_files', { expected: allowedPaths, actual: changedFiles, unexpected });
}

// --- 3. Create branch, commit (add ONLY allowlisted paths), push ----------
const sha7 = COMMIT_SHA.slice(0, 7);
const branch = `vercel-autofix/${STRATEGY}/${sha7}-${Date.now().toString(36)}`;

try {
  execSync(`git config user.name "vercel-autofix-bot"`, { stdio: 'inherit' });
  execSync(`git config user.email "vercel-autofix-bot@users.noreply.github.com"`, { stdio: 'inherit' });
  execSync(`git checkout -b ${branch}`, { stdio: 'inherit' });
  // Explicit paths only — NOT git add -A
  for (const p of allowedPaths) {
    execSync(`git add -- ${JSON.stringify(p)}`, { stdio: 'inherit' });
  }
  execSync(`git commit -m ${JSON.stringify(title)} -m ${JSON.stringify(body)}`, { stdio: 'inherit' });
  execSync(`git push origin ${branch}`, { stdio: 'inherit' });
} catch (e) {
  fail('git_push_failed', { err: String(e) });
}

// --- 4. Open draft PR ------------------------------------------------------
const prRes = await fetch(`https://api.github.com/repos/${REPO}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    title, head: branch, base: 'main', body, draft: true, maintainer_can_modify: true,
  }),
});
if (!prRes.ok) {
  const errBody = await prRes.text();
  fail('pr_open_failed', { status: prRes.status, body: errBody.slice(0, 500) });
}
const pr = await prRes.json();
log({ level: 'info', action: 'pr_opened', url: pr.html_url, number: pr.number });

// --- 5. Labels -------------------------------------------------------------
try {
  await fetch(`https://api.github.com/repos/${REPO}/issues/${pr.number}/labels`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ labels: ['autofix', `autofix:${STRATEGY}`, `confidence:${CONFIDENCE}`] }),
  });
} catch (e) {
  log({ level: 'warn', msg: 'label_set_failed', err: String(e) });
}

// --- 6. Slack ping so the PR doesn't sit unseen ---------------------------
if (SLACK_WEBHOOK) {
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:robot_face: Autofix PR opened: <${pr.html_url}|${REPO}#${pr.number}> — ${STRATEGY} / ${CONFIDENCE}`,
      }),
    });
  } catch (e) {
    log({ level: 'warn', msg: 'slack_ping_failed', err: String(e) });
  }
}

// --- 7. Update autofix_attempts -------------------------------------------
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
try {
  await sb.from('autofix_attempts').update({
    status: 'pr_opened',
    pr_url: pr.html_url,
    pr_number: pr.number,
    branch_name: branch,
    pr_opened_at: new Date().toISOString(),
  }).eq('id', ATTEMPT_ID);
} catch (e) {
  log({ level: 'warn', msg: 'supabase_update_failed', err: String(e) });
}

log({ level: 'info', action: 'done', pr: pr.html_url });
