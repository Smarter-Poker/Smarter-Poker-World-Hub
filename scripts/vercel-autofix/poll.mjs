#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// vercel-autofix poller — Hetzner cron-01 (systemd timer, every 2 min)
//
// Closes the blind spot the Sentry poller has: Vercel *build-time* failures
// (OOM, SIGKILL, TSC errors, missing modules) never reach Sentry, so they
// were detected + fixed only by humans watching the dashboard.
//
// This poller:
//   1. Lists recent production deployments for each configured Vercel project
//   2. For ERROR / long-QUEUED deploys on `main`, fetches the tail of build
//      logs and pattern-matches against known failure classes.
//   3. Dedupes via Supabase `autofix_attempts` keyed on commit SHA (a given
//      failed commit is attempted once).
//   4. Dispatches GitHub `repository_dispatch` with event_type=`vercel-autofix`
//      and a `strategy` payload ∈ { oom | missing-dep | tsc | generic }.
//   5. Reuses the Supabase `autofix_budget_exhausted()` circuit-breaker
//      (same $/day cap as Sentry autofix).
//
// Env vars (required):
//   VERCEL_TOKEN            — personal access token, scope: full access
//   VERCEL_TEAM_ID          — team_SVD8r7AOPH065G3usBxVvrBc
//   GITHUB_TOKEN            — PAT with repo + workflow scope
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Config (edit PROJECTS to add/remove Vercel projects):
// ═════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const PROJECTS = [
  {
    projectId: 'prj_op66GkZyZcygXQKm76iyycfVFAQx',
    vercelName: 'hub-vanguard',
    githubRepo: 'Smarter-Poker/Smarter-Poker-World-Hub',
  },
  // Club Arena — fill in real IDs before first run
  // { projectId: 'prj_...', vercelName: 'club-arena',      githubRepo: 'Smarter-Poker/club-arena' },
  // { projectId: 'prj_...', vercelName: 'club-commander',  githubRepo: 'Smarter-Poker/club-commander-desktop' },
];

const VERCEL_TOKEN = requireEnv('VERCEL_TOKEN');
const VERCEL_TEAM_ID = requireEnv('VERCEL_TEAM_ID');
const GITHUB_TOKEN = requireEnv('GITHUB_TOKEN');
const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const STALE_QUEUED_MINUTES = 15;
const LOG_TAIL_LINES = 400;
const LOOKBACK_MINUTES = 60; // scan the last hour of deploys

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

async function vercelFetch(path) {
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set('teamId', VERCEL_TEAM_ID);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`vercel ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function listRecentDeploys(projectId) {
  // Vercel paginates newest-first; grab the last 20 and filter client-side.
  const { deployments } = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=20`
  );
  const cutoff = Date.now() - LOOKBACK_MINUTES * 60 * 1000;
  return deployments.filter((d) => d.created >= cutoff);
}

async function getBuildLogTail(deployId) {
  // Vercel returns build events as an array; take the tail N and join text fields.
  const events = await vercelFetch(
    `/v2/deployments/${deployId}/events?builds=1&limit=${LOG_TAIL_LINES}`
  );
  // events may be an array or { events: [] } depending on API version
  const arr = Array.isArray(events) ? events : events.events || [];
  return arr.map((e) => e.text ?? e.payload?.text ?? '').join('\n');
}

/**
 * Classify a build-log tail into a known failure class.
 * Order matters — more specific patterns first.
 */
function classifyBuildFailure(logTail) {
  if (!logTail) return null;

  // OOM — SIGKILL during build, or Vercel's own "OOM detected" line
  if (
    /Out of Memory|OOM event was detected|JavaScript heap out of memory|exited with SIGKILL/i.test(
      logTail
    )
  ) {
    return {
      strategy: 'oom',
      confidence: 'high',
      snippet: extractSnippet(logTail, /Out of Memory|SIGKILL|heap out of memory/i),
    };
  }

  // Missing module — deterministic, no Claude needed
  const missingModule = logTail.match(
    /(?:Module not found: Error: Can't resolve|Cannot find module) ['"]([^'"]+)['"]/i
  );
  if (missingModule) {
    return {
      strategy: 'missing-dep',
      confidence: 'high',
      module: missingModule[1],
      snippet: extractSnippet(logTail, /Module not found|Cannot find module/i),
    };
  }

  // TypeScript type errors (Next.js emits these during build)
  const tsError = logTail.match(/(?:^|\n)[^\n]*Type error:[^\n]*/);
  if (tsError) {
    return {
      strategy: 'tsc',
      confidence: 'medium',
      snippet: extractSnippet(logTail, /Type error:/),
    };
  }

  // Next.js build compile errors (syntax, lint blocking)
  if (/Failed to compile|SyntaxError|Unexpected token/i.test(logTail)) {
    return {
      strategy: 'generic',
      confidence: 'low',
      snippet: extractSnippet(logTail, /Failed to compile|SyntaxError/i),
    };
  }

  // Any other "Build failed" — give Claude the tail and hope
  if (/Build failed|npm ERR!|exit code 1/i.test(logTail)) {
    return {
      strategy: 'generic',
      confidence: 'low',
      snippet: extractSnippet(logTail, /Build failed|npm ERR!|exit code/i),
    };
  }

  return null;
}

function extractSnippet(log, anchor, ctx = 30) {
  const lines = log.split('\n');
  const idx = lines.findIndex((l) => anchor.test(l));
  if (idx < 0) return lines.slice(-ctx).join('\n');
  const start = Math.max(0, idx - Math.floor(ctx / 2));
  return lines.slice(start, start + ctx).join('\n');
}

async function alreadyAttempted(commitSha) {
  // Dedupe by (source, commit_sha). Any active or terminal-non-retry status
  // blocks a new dispatch. The partial unique index in the DB acts as a
  // belt-and-suspenders against race conditions here.
  const { data, error } = await sb
    .from('autofix_attempts')
    .select('id, status')
    .eq('source', 'vercel')
    .eq('commit_sha', commitSha)
    .in('status', ['running', 'pr_opened', 'merged', 'skipped_unfixable'])
    .limit(1);
  if (error) {
    log({ level: 'warn', msg: 'dedupe check failed — proceeding', err: error.message });
    return false;
  }
  return (data ?? []).length > 0;
}

async function budgetExhausted() {
  const { data, error } = await sb.rpc('autofix_budget_exhausted');
  if (error) {
    log({ level: 'warn', msg: 'budget check failed — proceeding', err: error.message });
    return false;
  }
  return data === true;
}

async function recordAttempt({ deployId, commitSha, repo, strategy, snippet }) {
  const attemptId = crypto.randomUUID();
  const { error } = await sb.from('autofix_attempts').insert({
    id: attemptId,
    source: 'vercel',
    deployment_id: deployId,
    commit_sha: commitSha,
    repo,
    status: 'running',
    metadata: { strategy, snippet: snippet?.slice(0, 2000) },
  });
  if (error) throw new Error(`insert autofix_attempts: ${error.message}`);
  return attemptId;
}

async function dispatchWorkflow({ repo, attemptId, classified, commitSha, deployId }) {
  const [owner, name] = repo.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'vercel-autofix',
        client_payload: {
          attempt_id: attemptId,
          deployment_id: deployId,
          commit_sha: commitSha,
          strategy: classified.strategy,
          confidence: classified.confidence,
          snippet: classified.snippet,
          module: classified.module, // missing-dep only
        },
      }),
    }
  );
  if (res.status !== 204) {
    const body = await res.text().catch(() => '');
    throw new Error(`dispatch ${repo} → ${res.status} ${body}`);
  }
}

async function run() {
  if (await budgetExhausted()) {
    log({ level: 'info', msg: 'daily budget cap hit — exiting' });
    return;
  }

  for (const proj of PROJECTS) {
    let deploys;
    try {
      deploys = await listRecentDeploys(proj.projectId);
    } catch (e) {
      log({ level: 'warn', project: proj.vercelName, err: String(e) });
      continue;
    }

    for (const d of deploys) {
      const branch = d.meta?.githubCommitRef;
      if (branch !== 'main') continue;

      const commitSha = d.meta?.githubCommitSha;
      if (!commitSha) continue;

      // State gate: ERROR, or main stuck QUEUED > N minutes
      const ageMin = (Date.now() - d.created) / 60000;
      const isError = d.state === 'ERROR';
      const isStaleQueued = d.state === 'QUEUED' && ageMin >= STALE_QUEUED_MINUTES;
      if (!isError && !isStaleQueued) continue;

      if (await alreadyAttempted(commitSha)) {
        log({
          level: 'debug',
          msg: 'already attempted — skipping',
          project: proj.vercelName,
          deploy: d.id,
          commitSha,
        });
        continue;
      }

      if (isStaleQueued) {
        // Stuck queue isn't a code bug — page instead of autofix
        log({
          level: 'alert',
          msg: 'main-branch deploy QUEUED > threshold',
          project: proj.vercelName,
          deploy: d.id,
          ageMin: ageMin.toFixed(1),
        });
        // TODO: wire to PostHog alert / Slack webhook
        continue;
      }

      let logTail;
      try {
        logTail = await getBuildLogTail(d.id);
      } catch (e) {
        log({ level: 'warn', msg: 'log fetch failed', deploy: d.id, err: String(e) });
        continue;
      }

      const classified = classifyBuildFailure(logTail);
      if (!classified) {
        log({
          level: 'info',
          msg: 'build failed but no known class matched — leaving for humans',
          project: proj.vercelName,
          deploy: d.id,
        });
        continue;
      }

      try {
        const attemptId = await recordAttempt({
          deployId: d.id,
          commitSha,
          repo: proj.githubRepo,
          strategy: classified.strategy,
          snippet: classified.snippet,
        });

        await dispatchWorkflow({
          repo: proj.githubRepo,
          attemptId,
          classified,
          commitSha,
          deployId: d.id,
        });

        log({
          level: 'info',
          msg: 'dispatched vercel-autofix',
          project: proj.vercelName,
          deploy: d.id,
          strategy: classified.strategy,
          confidence: classified.confidence,
          attemptId,
        });
      } catch (e) {
        log({ level: 'error', msg: 'dispatch failed', deploy: d.id, err: String(e) });
      }
    }
  }
}

run().catch((e) => {
  log({ level: 'fatal', err: String(e), stack: e.stack });
  process.exit(1);
});
