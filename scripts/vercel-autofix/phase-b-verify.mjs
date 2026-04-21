#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// phase-b-verify — post-merge deploy verifier + auto-revert
//
// Closes the Vercel-autofix loop. After a human merges an autofix PR,
// this script:
//
//   1. Finds autofix_attempts rows where status='merged', build_verified_at
//      is null, reverted_at is null, and merged_at is set.
//   2. Locates the post-merge Vercel deployment on main for that repo.
//   3. On READY  → marks build_verified_at = now() (loop closes clean).
//      On ERROR  → opens an auto-revert PR via GitHub Git Data API and
//                  marks reverted_at = now() (loop re-engages next poll).
//      On QUEUED/BUILDING and <VERIFY_TIMEOUT_MIN old → leave for next run.
//      On QUEUED/BUILDING and ≥VERIFY_TIMEOUT_MIN old → slack alert +
//                  mark reverted_at='verify_timeout' so the poller can
//                  retry the same commit instead of ignoring it forever.
//
// Runs on cron-01 via a separate systemd timer (every 5 min). Zero
// overlap with poll.mjs — they query disjoint status buckets.
//
// Required env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                 VERCEL_TOKEN, VERCEL_TEAM_ID, GITHUB_TOKEN
// Optional env:   SLACK_ALERT_WEBHOOK, VERIFY_TIMEOUT_MIN=25, DRY_RUN=1
// ═════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// Mirror of poll.mjs PROJECTS — keep in sync or extract to shared config
// (kept inline to avoid import cycles and to let the file run standalone).
const PROJECTS = [
  {
    projectId: 'prj_op66GkZyZcygXQKm76iyycfVFAQx',
    vercelName: 'hub-vanguard',
    githubRepo: 'Smarter-Poker/Smarter-Poker-World-Hub',
  },
  // Club Arena — fill in when projectId is known
  // { projectId: 'prj_...', vercelName: 'club-arena',      githubRepo: 'Smarter-Poker/club-arena' },
  // { projectId: 'prj_...', vercelName: 'club-commander',  githubRepo: 'Smarter-Poker/club-commander-desktop' },
];

let VERCEL_TOKEN, VERCEL_TEAM_ID, GITHUB_TOKEN;
let SLACK_ALERT_WEBHOOK, VERIFY_TIMEOUT_MIN, FORCE_DRY_RUN;
let sb;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(JSON.stringify({ level: 'fatal', msg: `missing env ${name}` }));
    process.exit(1);
  }
  return v;
}

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

function initRuntime() {
  VERCEL_TOKEN = requireEnv('VERCEL_TOKEN');
  VERCEL_TEAM_ID = requireEnv('VERCEL_TEAM_ID');
  GITHUB_TOKEN = requireEnv('GITHUB_TOKEN');
  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  SLACK_ALERT_WEBHOOK = process.env.SLACK_ALERT_WEBHOOK;
  VERIFY_TIMEOUT_MIN = Number(process.env.VERIFY_TIMEOUT_MIN ?? 25);
  FORCE_DRY_RUN = process.env.DRY_RUN === '1';
  sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Retry wrapper — one exponential-backoff retry on 5xx / network errors
// ---------------------------------------------------------------------------
async function fetchWithRetry(url, opts = {}, { retries = 2, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status < 500 && res.status !== 429) return res;
      lastErr = new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < retries) await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
  }
  throw lastErr;
}

async function vercelFetch(path) {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set('teamId', VERCEL_TEAM_ID);
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`vercel ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function ghFetch(path, init = {}) {
  const res = await fetchWithRetry(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  let json = null;
  try { json = body ? JSON.parse(body) : null; } catch { /* non-json response, rare */ }
  if (!res.ok) throw new Error(`gh ${init.method || 'GET'} ${path} → ${res.status} ${body.slice(0, 200)}`);
  return json;
}

async function slackAlert(text) {
  if (!SLACK_ALERT_WEBHOOK) return;
  try {
    await fetchWithRetry(SLACK_ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    log({ level: 'warn', msg: 'slack alert failed', err: String(e) });
  }
}

// ---------------------------------------------------------------------------
// Supabase: pending-verify rows
// ---------------------------------------------------------------------------
async function listPendingVerify() {
  const { data, error } = await sb
    .from('autofix_attempts')
    .select('id, source, repo, commit_sha, pr_number, branch_name, merged_at, metadata')
    .eq('source', 'vercel')
    .eq('status', 'merged')
    .is('build_verified_at', null)
    .is('reverted_at', null)
    .not('merged_at', 'is', null)
    .order('merged_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`pending verify query: ${error.message}`);
  return data ?? [];
}

// Merge a patch into the existing metadata jsonb column. autofix_attempts
// has a jsonb `metadata` column (see poll.mjs#recordAttempt) — we stash
// verify/revert breadcrumbs in it so we don't need schema changes for
// every new Phase B field.
async function mergeMetadata(id, patch) {
  const { data, error: readErr } = await sb
    .from('autofix_attempts')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(`metadata read: ${readErr.message}`);
  const merged = { ...(data?.metadata ?? {}), ...patch };
  return merged;
}

async function markVerified(id, deploymentId) {
  const metadata = await mergeMetadata(id, {
    phase_b_verified_deploy: deploymentId,
    phase_b_verified_at: new Date().toISOString(),
  });
  const { error } = await sb
    .from('autofix_attempts')
    .update({ build_verified_at: new Date().toISOString(), metadata })
    .eq('id', id);
  if (error) throw new Error(`mark verified: ${error.message}`);
}

async function markReverted(id, reason, revertPrNumber) {
  const metadata = await mergeMetadata(id, {
    phase_b_revert_reason: reason,
    phase_b_revert_pr_number: revertPrNumber ?? null,
    phase_b_reverted_at: new Date().toISOString(),
  });
  const { error } = await sb
    .from('autofix_attempts')
    .update({
      reverted_at: new Date().toISOString(),
      error_message: `${reason.slice(0, 400)}${revertPrNumber ? ` | revert_pr=#${revertPrNumber}` : ''}`,
      metadata,
    })
    .eq('id', id);
  if (error) throw new Error(`mark reverted: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Vercel: find the post-merge deployment for this repo / mergedAt
// ---------------------------------------------------------------------------
function projectForRepo(repo) {
  return PROJECTS.find((p) => p.githubRepo === repo);
}

async function findPostMergeDeploy(projectId, mergedAtIso) {
  const mergedAtMs = Date.parse(mergedAtIso);
  const { deployments } = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=40`
  );
  // Filter to main branch deploys whose creation falls within the merge
  // window. Vercel creates deploys within seconds of a merge push; give a
  // 60s backlash for clock skew.
  const SKEW_MS = 60 * 1000;
  const candidates = deployments
    .filter((d) => d.meta?.githubCommitRef === 'main')
    .filter((d) => d.created >= mergedAtMs - SKEW_MS)
    .sort((a, b) => a.created - b.created);
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// GitHub: auto-revert a merged PR via Git Data API
// ---------------------------------------------------------------------------
// Works for both merge commits and squash merges:
//   merge commits    → parents[0] = main-before-merge; its .tree is what we want
//   squash merges    → only one parent, again main-before-merge
// Revert strategy: create a new commit on top of current main HEAD whose
// tree equals the pre-merge tree. This reverses all changes the PR
// introduced, even across multiple commits.
async function openAutoRevertPr({ repo, prNumber, originalCommitSha, failedDeployId }) {
  const [owner, name] = repo.split('/');

  // 1. Fetch the merged PR to get its merge_commit_sha
  const pr = await ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`);
  if (!pr.merged || !pr.merge_commit_sha) {
    throw new Error(`PR #${prNumber} not merged or missing merge_commit_sha`);
  }
  const mergeSha = pr.merge_commit_sha;

  // 2. Get the merge commit → its parent tree is the pre-merge state
  const mergeCommit = await ghFetch(`/repos/${owner}/${name}/git/commits/${mergeSha}`);
  if (!mergeCommit.parents?.length) {
    throw new Error(`merge commit ${mergeSha} has no parents`);
  }
  const preMergeSha = mergeCommit.parents[0].sha;
  const preMergeCommit = await ghFetch(`/repos/${owner}/${name}/git/commits/${preMergeSha}`);
  const revertTreeSha = preMergeCommit.tree.sha;

  // 3. Anchor the revert to current main HEAD
  const mainRef = await ghFetch(`/repos/${owner}/${name}/git/refs/heads/main`);
  const mainHeadSha = mainRef.object.sha;

  // 4. Create the revert commit
  const revertTitle = `Revert "${(pr.title || '').slice(0, 80)}"`;
  const revertBody = [
    revertTitle,
    '',
    `This reverts PR #${prNumber} (commit ${mergeSha.slice(0, 7)}).`,
    '',
    'Auto-revert by vercel-autofix phase-b-verify: the post-merge deploy',
    `(${failedDeployId || 'unknown'}) errored. Original failing commit was`,
    `${originalCommitSha.slice(0, 7)}.`,
  ].join('\n');
  const revertCommit = await ghFetch(`/repos/${owner}/${name}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: revertBody,
      tree: revertTreeSha,
      parents: [mainHeadSha],
    }),
  });

  // 5. Create a branch pointing at the revert commit
  const branch = `autofix-revert-pr${prNumber}-${Date.now()}`;
  await ghFetch(`/repos/${owner}/${name}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: revertCommit.sha }),
  });

  // 6. Open a draft PR — humans decide whether to merge
  const revertPr = await ghFetch(`/repos/${owner}/${name}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: revertTitle,
      head: branch,
      base: 'main',
      body: revertBody + '\n\n_Autogenerated by `phase-b-verify.mjs`._',
      draft: true,
    }),
  });

  return { revertPrNumber: revertPr.number, revertPrUrl: revertPr.html_url, branch };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  initRuntime();

  const attempts = await listPendingVerify();
  if (attempts.length === 0) {
    log({ level: 'debug', msg: 'no pending-verify rows' });
    return;
  }
  log({ level: 'info', msg: 'pending verify', count: attempts.length });

  for (const a of attempts) {
    try {
      const project = projectForRepo(a.repo);
      if (!project) {
        log({ level: 'warn', msg: 'no projectId for repo — skipping', repo: a.repo, attempt: a.id });
        continue;
      }

      const deploy = await findPostMergeDeploy(project.projectId, a.merged_at);
      if (!deploy) {
        const ageMin = (Date.now() - Date.parse(a.merged_at)) / 60000;
        if (ageMin >= VERIFY_TIMEOUT_MIN) {
          await slackAlert(
            `:warning: phase-b-verify: no post-merge deploy found for ${a.repo} ` +
            `PR #${a.pr_number ?? '?'} after ${ageMin.toFixed(1)} min (attempt ${a.id})`
          );
          log({ level: 'alert', msg: 'no post-merge deploy', attempt: a.id, ageMin: ageMin.toFixed(1) });
        } else {
          log({ level: 'debug', msg: 'no post-merge deploy yet', attempt: a.id, ageMin: ageMin.toFixed(1) });
        }
        continue;
      }

      if (deploy.state === 'READY') {
        if (FORCE_DRY_RUN) {
          log({ level: 'info', msg: 'DRY-RUN: would mark verified', attempt: a.id, deploy: deploy.id });
          continue;
        }
        await markVerified(a.id, deploy.id);
        log({
          level: 'info',
          msg: 'build verified — loop closed clean',
          attempt: a.id,
          pr: a.pr_number,
          deploy: deploy.id,
        });
        continue;
      }

      if (deploy.state === 'ERROR') {
        const ageMin = (Date.now() - deploy.created) / 60000;
        log({
          level: 'warn',
          msg: 'post-merge deploy ERROR → auto-revert',
          attempt: a.id,
          pr: a.pr_number,
          deploy: deploy.id,
          deployAgeMin: ageMin.toFixed(1),
        });

        if (!a.pr_number) {
          // Can't revert what we don't know. Still mark reverted so the
          // poller can retry. Alert a human.
          await markReverted(a.id, 'post_merge_error_no_pr_number', null);
          await slackAlert(
            `:rotating_light: phase-b-verify: ${a.repo} post-merge deploy ${deploy.id} errored ` +
            `but attempt ${a.id} has no pr_number — cannot auto-revert. Human required.`
          );
          continue;
        }

        if (FORCE_DRY_RUN) {
          log({ level: 'info', msg: 'DRY-RUN: would open revert PR', attempt: a.id, pr: a.pr_number });
          continue;
        }

        let revert = null;
        try {
          revert = await openAutoRevertPr({
            repo: a.repo,
            prNumber: a.pr_number,
            originalCommitSha: a.commit_sha,
            failedDeployId: deploy.id,
          });
        } catch (e) {
          log({ level: 'error', msg: 'auto-revert PR open failed', attempt: a.id, err: String(e) });
          await markReverted(a.id, `revert_pr_open_failed: ${String(e).slice(0, 300)}`, null);
          await slackAlert(
            `:rotating_light: phase-b-verify: auto-revert PR open FAILED for ${a.repo} ` +
            `PR #${a.pr_number} → deploy ${deploy.id} stays broken. Err: ${String(e).slice(0, 200)}`
          );
          continue;
        }

        await markReverted(a.id, `post_merge_deploy_error:${deploy.id}`, revert.revertPrNumber);
        await slackAlert(
          `:leftwards_arrow_with_hook: phase-b-verify: opened revert draft PR ` +
          `#${revert.revertPrNumber} for ${a.repo} (original PR #${a.pr_number}, failed deploy ${deploy.id}). ` +
          `Review & merge: ${revert.revertPrUrl}`
        );
        log({
          level: 'info',
          msg: 'revert PR opened',
          attempt: a.id,
          originalPr: a.pr_number,
          revertPr: revert.revertPrNumber,
          url: revert.revertPrUrl,
        });
        continue;
      }

      // QUEUED / BUILDING / INITIALIZING / etc.
      const ageMin = (Date.now() - deploy.created) / 60000;
      if (ageMin >= VERIFY_TIMEOUT_MIN) {
        await markReverted(a.id, `verify_timeout_after_${VERIFY_TIMEOUT_MIN}m:${deploy.state}`, null);
        await slackAlert(
          `:hourglass_flowing_sand: phase-b-verify: ${a.repo} post-merge deploy ${deploy.id} ` +
          `stuck in ${deploy.state} for ${ageMin.toFixed(1)} min. Marked verify_timeout.`
        );
        log({ level: 'alert', msg: 'verify timeout', attempt: a.id, state: deploy.state, ageMin: ageMin.toFixed(1) });
      } else {
        log({ level: 'debug', msg: 'deploy still running', attempt: a.id, state: deploy.state, ageMin: ageMin.toFixed(1) });
      }
    } catch (e) {
      log({ level: 'error', msg: 'attempt verify failed', attempt: a.id, err: String(e), stack: e.stack });
    }
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run().catch((e) => {
    log({ level: 'fatal', err: String(e), stack: e.stack });
    process.exit(1);
  });
}

// Exports for unit testing
export { findPostMergeDeploy, openAutoRevertPr, projectForRepo, PROJECTS };
