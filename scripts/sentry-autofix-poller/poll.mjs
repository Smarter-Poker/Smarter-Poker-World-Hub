#!/usr/bin/env node
/**
 * Sentry autofix poller — v2 (2026-04-20).
 *
 * Zero-intervention design:
 *   1. Sees EVERY unresolved Sentry issue across the 3 tracked projects
 *      (statsPeriod=14d + Link: rel="next" paging) — not the 60-minute
 *      window v1 was stuck in.
 *   2. Automatically retries rejected/errored attempts once a cooldown
 *      elapses, up to MAX_RETRIES_PER_ISSUE.
 *   3. Never exits non-zero unless every project fetch failed.
 *
 * State machine per sentry_issue_id (latest row decides):
 *   none                    → insert row (retry_count=0) + dispatch
 *   queued / running        → skip (in flight)
 *   pr_opened / merged      → skip (handled)
 *   rejected / errored      → if retry_count < MAX_RETRIES
 *                               and now >= next_retry_at → dispatch (row with retry_count+1)
 *                             else skip
 * Backoff: next_retry_at = now + BASE_COOLDOWN_MIN * 2^retry_count, capped at MAX_COOLDOWN_MIN.
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_TO_REPO = {
  'javascript-nextjsmarter-poker-world-hubs': { owner: 'Smarter-Poker', repo: 'Smarter-Poker-World-Hub' },
  'javascript-react':                           { owner: 'Smarter-Poker', repo: 'Smarter-Poker-Club-Arena' },
  'javascript-react-3h':                        { owner: 'Smarter-Poker', repo: 'club-commander-desktop' },
};
const DISPATCH_EVENT = 'sentry-autofix';
const TERMINAL_HANDLED   = new Set(['pr_opened', 'merged', 'pr_created', 'skipped_unfixable']);
const IN_FLIGHT          = new Set(['queued', 'running']);
const RETRIABLE_TERMINAL = new Set(['rejected', 'errored']);

function readEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
readEnvFile(path.join(path.dirname(new URL(import.meta.url).pathname), '.env'));

const args = new Map();
for (const a of process.argv.slice(2)) {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  args.set(k, v);
}
const STATS_PERIOD       = args.get('stats-period') || process.env.POLL_STATS_PERIOD || '14d';
const MAX_PAGES          = Number(args.get('max-pages') || process.env.POLL_MAX_PAGES || 5);
const MAX_DISPATCHES     = Number(args.get('max')       || process.env.POLL_MAX_DISPATCHES || 20);
const MAX_RETRIES        = Number(args.get('max-retries') || process.env.POLL_MAX_RETRIES || 5);
const BASE_COOLDOWN_MIN  = Number(args.get('base-cooldown') || process.env.POLL_BASE_COOLDOWN_MIN || 30);
const MAX_COOLDOWN_MIN   = Number(args.get('max-cooldown')  || process.env.POLL_MAX_COOLDOWN_MIN  || 480);
const DRY_RUN            = (args.get('dry-run') || process.env.POLL_DRY_RUN) === 'true';
const ENABLED            = (process.env.POLL_ENABLED ?? 'true') !== 'false';

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG_SLUG   = process.env.SENTRY_ORG_SLUG || 'smarter-software-inc';
const GH_TOKEN          = process.env.GITHUB_DISPATCH_TOKEN;
const SB_URL            = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY            = process.env.SUPABASE_SERVICE_ROLE_KEY;

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }
function fail(msg, extra = {}) { log({ level: 'error', msg, ...extra }); process.exit(1); }

if (!ENABLED)           { log({ level: 'info', msg: 'POLL_ENABLED=false → no-op exit' }); process.exit(0); }
if (!SENTRY_AUTH_TOKEN) fail('SENTRY_AUTH_TOKEN missing');
if (!GH_TOKEN)          fail('GITHUB_DISPATCH_TOKEN missing');
if (!SB_URL || !SB_KEY) fail('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');

async function fetchSentryIssues(projectSlug) {
  const base = `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${projectSlug}/issues/`;
  let url = new URL(base);
  url.searchParams.set('statsPeriod', STATS_PERIOD);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('limit', '100');
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        'User-Agent': 'smarter-poker-autofix-poller/2.1',
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`sentry ${projectSlug} ${res.status}: ${t.slice(0, 300)}`);
    }
    const batch = await res.json();
    out.push(...batch);
    const link = res.headers.get('link') || '';
    const m = link.match(/<([^>]+)>;\s*rel="next";\s*results="true"/);
    if (!m) break;
    url = new URL(m[1]);
  }
  return out;
}

function sbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function latestAttempt(sentryIssueId) {
  const u = new URL(`${SB_URL}/rest/v1/autofix_attempts`);
  u.searchParams.set('sentry_issue_id', `eq.${sentryIssueId}`);
  u.searchParams.set('select', 'id,status,retry_count,next_retry_at,updated_at,created_at');
  u.searchParams.set('order', 'created_at.desc');
  u.searchParams.set('limit', '1');
  const res = await fetch(u, { headers: sbHeaders() });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`supabase select ${res.status}: ${t.slice(0, 200)}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

function cooldownAt(retryCount) {
  const mins = Math.min(BASE_COOLDOWN_MIN * Math.pow(2, retryCount), MAX_COOLDOWN_MIN);
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function classify(latest) {
  if (!latest) return { action: 'dispatch', retryCount: 0, previous: null };
  if (IN_FLIGHT.has(latest.status))        return { action: 'skip', reason: `in-flight (${latest.status})` };
  if (TERMINAL_HANDLED.has(latest.status)) return { action: 'skip', reason: `handled (${latest.status})` };
  if (RETRIABLE_TERMINAL.has(latest.status)) {
    const rc = latest.retry_count || 0;
    if (rc >= MAX_RETRIES) return { action: 'skip', reason: `retries exhausted (${rc})` };
    const nextAt = latest.next_retry_at ? Date.parse(latest.next_retry_at) : 0;
    if (nextAt && Date.now() < nextAt) {
      return { action: 'skip', reason: `cooldown until ${latest.next_retry_at}` };
    }
    return { action: 'dispatch', retryCount: rc + 1, previous: latest };
  }
  return { action: 'skip', reason: `unknown status (${latest.status})` };
}



// --- v2.1: filter unfixable Sentry issue types (perf insights, feedback, etc) ---
// These have no code frames we can patch. Recording them as 'skipped_unfixable'
// keeps them out of the retry loop forever (TERMINAL_HANDLED).
function isFixableIssueType(issue) {
  const t  = (issue.type         || '').toLowerCase();
  const c  = (issue.issueCategory|| '').toLowerCase();
  const it = (issue.issueType    || '').toLowerCase();
  if (t === 'transaction') return false;
  if (c === 'performance' || c === 'http_client' || c === 'feedback' || c === 'replay') return false;
  if (it.startsWith('performance_')) return false;
  if (it === 'feedback') return false;
  return true;
}
async function recordSkippedUnfixable({ issueId, shortId, projectSlug, repo, title, level, reason }) {
  const body = {
    sentry_issue_id:     String(issueId),
    short_id:            shortId || null,
    sentry_project_slug: projectSlug,
    repo,
    title:               (title || '').slice(0, 500),
    level:               level || 'error',
    status:              'skipped_unfixable',
    fingerprint:         `unfixable-${projectSlug}-${issueId}`,
    retry_count:         0,
    next_retry_at:       null,
    error_message:       reason.slice(0, 500),
  };
  const res = await fetch(`${SB_URL}/rest/v1/autofix_attempts`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    log({ level: 'warn', msg: 'supabase skipped_unfixable insert failed', status: res.status, err: t.slice(0, 200) });
    return null;
  }
  const rows = await res.json().catch(() => []);
  return rows?.[0]?.id || null;
}

async function recordAttempt({ issueId, shortId, projectSlug, repo, title, level, retryCount }) {
  const body = {
    sentry_issue_id:     String(issueId),
    short_id:            shortId || null,
    sentry_project_slug: projectSlug,
    repo,
    title:               (title || '').slice(0, 500),
    level:               level || 'error',
    status:              'queued',
    fingerprint:         `poll-${projectSlug}-${issueId}-r${retryCount}`,
    retry_count:         retryCount,
    next_retry_at:       cooldownAt(retryCount),
  };
  const res = await fetch(`${SB_URL}/rest/v1/autofix_attempts`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    log({ level: 'warn', msg: 'supabase insert failed', status: res.status, err: t.slice(0, 200) });
    return null;
  }
  const rows = await res.json().catch(() => []);
  return rows?.[0]?.id || null;
}

async function fireDispatch({ owner, repo, issueId, shortId, projectSlug, title, level, attemptId, retryCount }) {
  if (DRY_RUN) {
    log({ level: 'info', msg: 'DRY_RUN — would dispatch', repo: `${owner}/${repo}`, issueId, retryCount });
    return { status: 200, dryRun: true };
  }
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'smarter-poker-autofix-poller/2.1',
    },
    body: JSON.stringify({
      event_type: DISPATCH_EVENT,
      client_payload: {
        issue_id: String(issueId), short_id: shortId || '',
        sentry_project: projectSlug, sentry_org: SENTRY_ORG_SLUG,
        issue_title: (title || '').slice(0, 200), issue_level: level || 'error',
        attempt_id: attemptId || '', retry_count: retryCount,
        source: retryCount > 0 ? 'cron-poll-retry' : 'cron-poll',
      },
    }),
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    throw new Error(`github dispatch ${res.status}: ${t.slice(0, 300)}`);
  }
  return { status: res.status };
}

async function main() {
  const runId = `poll-${Date.now()}`;
  log({
    level: 'info', msg: 'poll v2.1 start', runId,
    statsPeriod: STATS_PERIOD, maxPages: MAX_PAGES, maxDispatches: MAX_DISPATCHES,
    maxRetries: MAX_RETRIES, baseCooldownMin: BASE_COOLDOWN_MIN, dryRun: DRY_RUN,
  });

  const projects = Object.keys(PROJECT_TO_REPO);
  let totalSeen = 0, totalDispatched = 0, totalRetried = 0;
  let skipInFlight = 0, skipHandled = 0, skipCooldown = 0, skipExhausted = 0;
  let totalErrors = 0, totalProjectErrors = 0;

  outer: for (const projectSlug of projects) {
    const route = PROJECT_TO_REPO[projectSlug];
    let issues;
    try { issues = await fetchSentryIssues(projectSlug); }
    catch (err) {
      log({ level: 'error', msg: 'sentry fetch failed', projectSlug, err: String(err).slice(0, 300) });
      totalProjectErrors++;
      continue;
    }
    log({ level: 'info', msg: 'sentry issues fetched', projectSlug, count: issues.length });
    totalSeen += issues.length;

    for (const issue of issues) {
      if (totalDispatched >= MAX_DISPATCHES) {
        log({ level: 'info', msg: 'dispatch cap hit — pausing until next tick', cap: MAX_DISPATCHES });
        break outer;
      }
      const { id: issueId, shortId, level } = issue;
      const title = issue.title || issue.culprit || '';
      if (!isFixableIssueType(issue)) {
        const reason = `unfixable issue type: type=${issue.type} cat=${issue.issueCategory} it=${issue.issueType}`;
        // Idempotent: only insert the first time we see it.
        let already;
        try { already = await latestAttempt(issueId); } catch (_) { already = null; }
        if (!already) {
          if (!DRY_RUN) {
            await recordSkippedUnfixable({
              issueId, shortId, projectSlug,
              repo: `${route.owner}/${route.repo}`,
              title, level, reason,
            });
          }
          log({ level: 'info', msg: 'skip (unfixable type)', issueId, shortId, type: issue.type, issueType: issue.issueType });
        } else {
          log({ level: 'debug', msg: 'skip (unfixable, already recorded)', issueId, shortId });
        }
        skipHandled++;
        continue;
      }
      let latest;
      try { latest = await latestAttempt(issueId); }
      catch (err) {
        log({ level: 'error', msg: 'supabase lookup failed', issueId, err: String(err).slice(0, 300) });
        totalErrors++;
        continue;
      }
      const decision = classify(latest);
      if (decision.action === 'skip') {
        if (decision.reason.startsWith('in-flight'))     skipInFlight++;
        else if (decision.reason.startsWith('handled'))  skipHandled++;
        else if (decision.reason.startsWith('cooldown')) skipCooldown++;
        else if (decision.reason.startsWith('retries'))  skipExhausted++;
        log({ level: 'debug', msg: 'skip', issueId, shortId, reason: decision.reason });
        continue;
      }
      const attemptId = DRY_RUN ? null : await recordAttempt({
        issueId, shortId, projectSlug, repo: `${route.owner}/${route.repo}`,
        title, level, retryCount: decision.retryCount,
      });
      try {
        const r = await fireDispatch({
          owner: route.owner, repo: route.repo,
          issueId, shortId, projectSlug, title, level,
          attemptId, retryCount: decision.retryCount,
        });
        totalDispatched++;
        if (decision.retryCount > 0) totalRetried++;
        log({
          level: 'info',
          msg: decision.retryCount > 0 ? 'dispatched (retry)' : 'dispatched (new)',
          repo: `${route.owner}/${route.repo}`,
          issueId, shortId, attemptId,
          retry: decision.retryCount,
          previousStatus: decision.previous?.status || null,
          status: r.status, dryRun: !!r.dryRun,
        });
      } catch (err) {
        totalErrors++;
        log({ level: 'error', msg: 'dispatch failed', issueId, shortId, err: String(err).slice(0, 300) });
      }
    }
  }
  log({
    level: 'info', msg: 'poll v2 done', runId,
    totalSeen, totalDispatched, totalRetried,
    skipInFlight, skipHandled, skipCooldown, skipExhausted,
    errors: totalErrors, projectErrors: totalProjectErrors,
  });
  if (totalProjectErrors === projects.length && totalDispatched === 0) process.exit(2);
}

main().catch(err => fail('fatal', { err: String(err).slice(0, 500) }));
