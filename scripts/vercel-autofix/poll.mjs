#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// vercel-autofix poller — Hetzner cron-01 (systemd timer, every 2 min)
//
// Detects Vercel build-time failures (OOM, SIGKILL, TSC errors, missing
// modules) that never reach Sentry, classifies them, and dispatches the
// GitHub `vercel-autofix` workflow. Mirrors the Sentry runtime-autofix
// loop but for build-time failures.
//
// Env vars (required):
//   VERCEL_TOKEN, VERCEL_TEAM_ID, GITHUB_TOKEN,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Env vars (optional):
//   SLACK_ALERT_WEBHOOK          — posts a message on stale QUEUED
//   DRY_RUN=1                    — force every project to dry-run mode
//   STALE_QUEUED_MINUTES=15
//   LOG_TAIL_LINES=400
//   LOOKBACK_MINUTES=60
// ═════════════════════════════════════════════════════════════════════════

// NOTE: @supabase/supabase-js is loaded lazily inside initRuntime() so that
// classifyBuildFailure() and other pure-logic exports can be imported by the
// unit test suite without forcing the supabase dependency to resolve.

const PROJECTS = [
  {
    projectId: 'prj_op66GkZyZcygXQKm76iyycfVFAQx',
    vercelName: 'hub-vanguard',
    githubRepo: 'Smarter-Poker/Smarter-Poker-World-Hub',
  },
  {
    // Club Arena — Vite 6 + React 19 poker client. Starts in autofix_projects
    // with dry_run=true so the first 24h only classifies; flip dry_run=false
    // after the canary bakes. club-commander-desktop is not on Vercel yet
    // (still lives under pages/commander/ inside the World Hub monolith), so
    // it routes through the hub-vanguard entry above.
    projectId: 'prj_oaCq8RYhExLRUYizLG93li0uX468',
    vercelName: 'club-arena',
    githubRepo: 'Smarter-Poker/club-arena',
  },
];

// Env + Supabase client are initialized lazily inside run() so that
// classifyBuildFailure() can be unit-tested without env vars being set.
let VERCEL_TOKEN, VERCEL_TEAM_ID, GITHUB_TOKEN;
let SLACK_ALERT_WEBHOOK, FORCE_DRY_RUN;
let STALE_QUEUED_MINUTES, LOG_TAIL_LINES, LOOKBACK_MINUTES;
let sb;

async function initRuntime() {
  VERCEL_TOKEN = requireEnv('VERCEL_TOKEN');
  VERCEL_TEAM_ID = requireEnv('VERCEL_TEAM_ID');
  GITHUB_TOKEN = requireEnv('GITHUB_TOKEN');
  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  SLACK_ALERT_WEBHOOK = process.env.SLACK_ALERT_WEBHOOK;
  FORCE_DRY_RUN = process.env.DRY_RUN === '1';
  STALE_QUEUED_MINUTES = Number(process.env.STALE_QUEUED_MINUTES ?? 15);
  LOG_TAIL_LINES = Number(process.env.LOG_TAIL_LINES ?? 400);
  LOOKBACK_MINUTES = Number(process.env.LOOKBACK_MINUTES ?? 60);
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

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

// ---------------------------------------------------------------------------
// Retry wrapper: one exponential-backoff retry on 5xx / network errors
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
    if (i < retries) await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)));
  }
  throw lastErr;
}

// Honor [DO NOT AUTOFIX] / [skip autofix] / [skip vercel-autofix] in commit
// messages. Case-insensitive, whitespace-tolerant. Examples it must catch:
//   "[DO NOT AUTOFIX] fix(build): 6144MB heap"
//   "fix(build): 4096MB heap [DO NOT AUTOFIX] [skip autofix]"
//   "fix(build): bump heap [skip vercel-autofix]"
export const AUTOFIX_SKIP_TAG_RE =
  /\[\s*(?:do\s*not\s*autofix|skip\s+(?:autofix|vercel[-\s]?autofix))\s*\]/i;

async function getCommitMessage(repo, sha, fallback) {
  if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  // Vercel's list endpoint sometimes omits githubCommitMessage. Fall back to
  // the GitHub commits API. Returns null on failure (caller treats as
  // fail-closed and skips the dispatch).
  try {
    const [owner, name] = repo.split('/');
    const res = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${name}/commits/${sha}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.commit?.message ?? null;
  } catch {
    return null;
  }
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

async function listRecentDeploys(projectId) {
  const { deployments } = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=20`
  );
  const cutoff = Date.now() - LOOKBACK_MINUTES * 60 * 1000;
  // Vercel's list endpoint returns `uid` while the single-deployment endpoint
  // returns `id`. Normalize so downstream code can use `d.id` uniformly.
  return deployments
    .filter((d) => d.created >= cutoff)
    .map((d) => ({ ...d, id: d.uid ?? d.id }));
}

async function getBuildLogTail(deployId) {
  const events = await vercelFetch(
    `/v2/deployments/${deployId}/events?builds=1&limit=${LOG_TAIL_LINES}`
  );
  const arr = Array.isArray(events) ? events : events.events || [];
  return arr.map((e) => e.text ?? e.payload?.text ?? '').join('\n');
}

/**
 * Classify a build-log tail into a known failure class.
 * Order matters — more specific patterns first.
 * Covered by classify.test.mjs fixtures.
 */
export function classifyBuildFailure(logTail) {
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
  // - "Type error:" is anchored to start-of-line (Next.js formatted output).
  // - "TS####:" is a unique tsc error code; it's fine to match mid-line
  //   because it appears in the `foo.ts(12,5): TS2339: ...` CLI format.
  const tsError = logTail.match(/(?:(?:^|\n)[ \t]*Type error:|\bTS\d{4,5}:)[^\n]*/);
  if (tsError) {
    return {
      strategy: 'tsc',
      confidence: 'medium',
      snippet: extractSnippet(logTail, /Type error:|TS\d{4,5}:/),
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

  // Any other build failure
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

// ---------------------------------------------------------------------------
// Supabase gates (kill-switch, per-loop budget, per-project dry-run, dedupe)
// ---------------------------------------------------------------------------
async function isPaused() {
  const { data, error } = await sb.rpc('autofix_is_paused');
  if (error) {
    log({ level: 'warn', msg: 'pause check failed — proceeding', err: error.message });
    return false;
  }
  return data === true;
}

async function budgetExhausted(source = 'vercel') {
  // Check global cap first, then per-loop
  for (const src of ['_global', source]) {
    const { data, error } = await sb.rpc('autofix_budget_exhausted', { p_source: src });
    if (error) {
      log({ level: 'warn', msg: 'budget check failed — proceeding', src, err: error.message });
      continue;
    }
    if (data === true) return { exhausted: true, bucket: src };
  }
  return { exhausted: false };
}

async function getProjectOverride(projectId) {
  const { data } = await sb
    .from('autofix_projects')
    .select('dry_run, enabled')
    .eq('id', projectId)
    .eq('source', 'vercel')
    .maybeSingle();
  return data; // null → project not in table → default: enabled=true, dry_run=false
}

async function alreadyAttempted(commitSha) {
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

async function recordAttempt({ deployId, commitSha, repo, strategy, confidence, snippet, dryRun }) {
  const attemptId = crypto.randomUUID();
  const { error } = await sb.from('autofix_attempts').insert({
    id: attemptId,
    source: 'vercel',
    deployment_id: deployId,
    commit_sha: commitSha,
    repo,
    strategy,
    confidence,
    status: dryRun ? 'skipped_unfixable' : 'running',
    error_message: dryRun ? 'dry_run_mode' : null,
    metadata: { snippet: snippet?.slice(0, 2000), dryRun },
  });
  if (error) throw new Error(`insert autofix_attempts: ${error.message}`);
  return attemptId;
}

async function dispatchWorkflow({ repo, attemptId, classified, commitSha, deployId }) {
  const [owner, name] = repo.split('/');
  const res = await fetchWithRetry(
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
          module: classified.module,
        },
      }),
    }
  );
  if (res.status !== 204) {
    const body = await res.text().catch(() => '');
    throw new Error(`dispatch ${repo} → ${res.status} ${body}`);
  }
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
// Main
// ---------------------------------------------------------------------------
async function run() {
  await initRuntime();
  if (await isPaused()) {
    log({ level: 'info', msg: 'autofix globally paused — exiting' });
    return;
  }

  const b = await budgetExhausted('vercel');
  if (b.exhausted) {
    log({ level: 'info', msg: 'budget cap hit — exiting', bucket: b.bucket });
    return;
  }

  for (const proj of PROJECTS) {
    const override = await getProjectOverride(proj.projectId);
    if (override && override.enabled === false) {
      log({ level: 'debug', msg: 'project disabled', project: proj.vercelName });
      continue;
    }
    const dryRun = FORCE_DRY_RUN || override?.dry_run === true;

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

      const ageMin = (Date.now() - d.created) / 60000;
      const isError = d.state === 'ERROR';
      const isStaleQueued = d.state === 'QUEUED' && ageMin >= STALE_QUEUED_MINUTES;
      if (!isError && !isStaleQueued) continue;

      // Dedupe BEFORE fetching logs (saves a Vercel API call)
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

      // Honor [DO NOT AUTOFIX] / [skip autofix] / [skip vercel-autofix] tags
      // in the commit message. The human has explicitly told us this commit
      // should NOT be reverted or rewritten (e.g. a NODE_OPTIONS heap bump
      // that must stick). Fail-closed: if we can't read the commit message,
      // skip dispatch rather than risk fighting the user.
      const commitMsg = await getCommitMessage(proj.githubRepo, commitSha, d.meta?.githubCommitMessage);
      if (commitMsg == null) {
        log({
          level: 'warn',
          msg: 'commit message unavailable — skipping autofix (fail-closed)',
          project: proj.vercelName,
          deploy: d.id,
          commitSha,
        });
        continue;
      }
      if (AUTOFIX_SKIP_TAG_RE.test(commitMsg)) {
        log({
          level: 'info',
          msg: 'commit has skip-autofix tag — not dispatching',
          project: proj.vercelName,
          deploy: d.id,
          commitSha,
          tagPreview: commitMsg.slice(0, 120),
        });
        continue;
      }

      if (isStaleQueued) {
        // Not a code bug — page humans instead
        const msg =
          `:warning: Vercel main-branch deploy stuck QUEUED for ${ageMin.toFixed(1)} min\n` +
          `Project: ${proj.vercelName}\n` +
          `Deploy:  ${d.id}\n` +
          `Commit:  ${commitSha.slice(0, 7)}\n` +
          `Likely: Vercel capacity issue. No autofix will be attempted.`;
        log({ level: 'alert', msg: 'main stuck QUEUED', project: proj.vercelName, deploy: d.id, ageMin: ageMin.toFixed(1) });
        await slackAlert(msg);
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
          confidence: classified.confidence,
          snippet: classified.snippet,
          dryRun,
        });

        if (dryRun) {
          log({
            level: 'info',
            msg: 'DRY-RUN: would dispatch vercel-autofix',
            project: proj.vercelName,
            deploy: d.id,
            strategy: classified.strategy,
            attemptId,
          });
          continue;
        }

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

// Only auto-run when invoked as a script, not when imported for testing
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run().catch((e) => {
    log({ level: 'fatal', err: String(e), stack: e.stack });
    process.exit(1);
  });
}
