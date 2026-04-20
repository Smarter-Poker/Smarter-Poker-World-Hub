/**
 * /api/sentry/webhook — Sentry → GitHub repository_dispatch bridge.
 *
 * Receives Sentry Internal Integration webhooks (issue.created,
 * issue.triggered, issue.escalating, issue.regression) and fires a
 * `repository_dispatch` of type `sentry-autofix` at the repo matching the
 * issue's Sentry project slug. The `sentry-autofix.yml` workflow in each
 * repo is listening for that event and owns the full autofix loop
 * (fetch event → call Claude → apply patch → open draft PR).
 *
 * This file is the ONLY trigger surface between Sentry and GitHub. It MUST:
 *   - verify the Sentry webhook HMAC
 *   - acknowledge fast (<15s; Sentry retries otherwise)
 *   - route by sentry_project slug to the correct GitHub repo
 *   - record the attempt in Supabase so we can dedup + track
 *
 * ENV (required):
 *   SENTRY_WEBHOOK_SECRET       — HMAC secret shared with Sentry integration
 *   AUTOFIX_GITHUB_TOKEN        — classic PAT with `repo` scope
 *     (falls back to GITHUB_TOKEN or GH_PAT)
 *   SUPABASE_URL                — for autofix_attempts ledger
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * ENV (optional):
 *   TWILIO_* / ONESIGNAL_*      — human SMS / push alerts (fire-and-forget)
 */

import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

// Project slug → GitHub repo routing. When Sentry captures an issue, its
// project.slug (verified per-event — NOT user-controllable) decides which
// repo gets the repository_dispatch.
const PROJECT_TO_REPO = {
  'javascript-nextjsmarter-poker-world-hubs': { owner: 'Smarter-Poker', repo: 'Smarter-Poker-World-Hub' },
  'javascript-react':                           { owner: 'Smarter-Poker', repo: 'Smarter-Poker-Club-Arena'   },
  'javascript-react-3h':                        { owner: 'Smarter-Poker', repo: 'Smarter-Poker-Club-Commander' },
};

const DISPATCH_EVENT = 'sentry-autofix';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Sentry signs the request body with HMAC-SHA256 over the shared secret and
// sends the digest in `sentry-hook-signature`. Must be timing-safe.
function verifySignature(rawBody, headerSig, secret) {
  if (!headerSig || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerSig.replace(/^sha256=/, ''), 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch { return false; }
}

async function recordAttempt({ issueId, shortId, projectSlug, repo }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const body = {
      sentry_issue_id: String(issueId),
      sentry_short_id: shortId || null,
      sentry_project:  projectSlug,
      repo:            repo,
      status:          'dispatched',
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };
    const res = await fetch(`${url}/rest/v1/autofix_attempts`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=ignore-duplicates',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[sentry-webhook] Supabase insert failed', res.status, await res.text().catch(()=> ''));
      return null;
    }
    const rows = await res.json().catch(() => []);
    return rows?.[0]?.id || null;
  } catch (e) {
    console.warn('[sentry-webhook] Supabase error', e.message);
    return null;
  }
}

async function fireDispatch({ owner, repo, issueId, shortId, projectSlug, title, level, attemptId }) {
  const token = process.env.AUTOFIX_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (!token) throw new Error('AUTOFIX_GITHUB_TOKEN missing');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'smarter-poker-sentry-webhook/1.0',
    },
    body: JSON.stringify({
      event_type: DISPATCH_EVENT,
      client_payload: {
        issue_id: String(issueId),
        short_id: shortId || '',
        sentry_project: projectSlug,
        sentry_org: 'smarter-software-inc',
        issue_title: (title || '').slice(0, 200),
        issue_level: level || 'error',
        attempt_id: attemptId || '',
        source: 'sentry-webhook',
      },
    }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub dispatch failed: ${res.status} ${text.slice(0, 400)}`);
  }
  return { status: res.status };
}

// Best-effort human alerts — do not block the main path.
async function sendHumanAlerts({ title, level, projectSlug, permalink }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to   = process.env.TWILIO_TO_NUMBER;
  if (sid && tok && from && to) {
    const msg = `Smarter.Poker ${String(level).toUpperCase()} [${projectSlug}] ${title}\n${permalink}`;
    try {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: msg.slice(0, 1600) }),
      });
    } catch (e) { console.warn('[sentry-webhook] SMS failed', e.message); }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch { return res.status(400).json({ error: 'bad body' }); }

  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  // Sentry internal-integration header is `sentry-hook-signature`.
  const sig = req.headers['sentry-hook-signature'] || req.headers['x-sentry-hook-signature'];
  if (!secret) {
    console.error('[sentry-webhook] SENTRY_WEBHOOK_SECRET missing');
    return res.status(500).json({ error: 'server misconfigured' });
  }
  if (!verifySignature(rawBody, sig, secret)) {
    return res.status(401).json({ error: 'bad signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).json({ error: 'bad json' }); }

  const action  = payload.action;
  const issue   = payload.data?.issue || payload.issue || {};
  const project = issue.project?.slug || payload.data?.issue?.project?.slug || '';

  // Accept creation, escalation, regression, and "triggered" (alert-rule relay).
  const dispatchable = ['created', 'triggered', 'escalating', 'regression'];
  if (!dispatchable.includes(action)) {
    return res.status(200).json({ ok: true, ignored: action });
  }

  const route = PROJECT_TO_REPO[project];
  if (!route) {
    console.warn('[sentry-webhook] unknown project', project);
    return res.status(200).json({ ok: true, ignored_project: project });
  }

  // ACK fast — Sentry retries on >15s.
  res.status(202).json({ ok: true, action, issue: issue.id, project, repo: `${route.owner}/${route.repo}` });

  // Fire-and-forget downstream.
  const attemptId = await recordAttempt({
    issueId: issue.id,
    shortId: issue.shortId || issue.short_id,
    projectSlug: project,
    repo: `${route.owner}/${route.repo}`,
  });

  const tasks = [
    fireDispatch({
      owner: route.owner,
      repo:  route.repo,
      issueId: issue.id,
      shortId: issue.shortId || issue.short_id,
      projectSlug: project,
      title: issue.title,
      level: issue.level,
      attemptId,
    }),
    sendHumanAlerts({
      title: issue.title || 'Unknown',
      level: issue.level || 'error',
      projectSlug: project,
      permalink: issue.permalink || `https://smarter-software-inc.sentry.io/issues/${issue.id}/`,
    }),
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[sentry-webhook] task ${i} failed`, r.reason?.message || r.reason);
    }
  });
  console.log(`[sentry-webhook] dispatched ${issue.id} → ${route.owner}/${route.repo} (attempt ${attemptId || 'none'})`);
}
