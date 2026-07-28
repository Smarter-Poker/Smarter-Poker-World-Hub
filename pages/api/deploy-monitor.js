/**
 * /api/deploy-monitor — Self-Healing Deployment Monitor (v2)
 *
 * Receives Vercel deployment webhooks. When a deployment fails (ERROR state),
 * it fetches the build logs, identifies the error, and triggers an automatic
 * fix via the Anthropic API + GitHub Contents API.
 *
 * WEBHOOK SETUP (Vercel Dashboard → Team Settings → Webhooks):
 *   URL:    https://smarter.poker/api/deploy-monitor
 *   Events: deployment (ALL events — error, canceled, failed, check-rerequested)
 *   Secret: (copy the value of DEPLOY_WEBHOOK_SECRET env var)
 *
 * AUTH (three-tier, checked in order):
 *   1. Vercel native: x-vercel-signature (HMAC-SHA1 of raw body, secret = DEPLOY_WEBHOOK_SECRET)
 *      This is the CORRECT Vercel webhook protocol. Use this in production.
 *   2. Legacy fallback: ?secret=XXX query string OR x-webhook-secret header
 *      For hand-rolled webhooks that don't use native Vercel signing.
 *   3. No secret configured: allow (dev-only; logs a warning).
 *
 * SILENT-FAILURE PROTECTION:
 *   Every auth rejection fires a GitHub Issue alert (rate-limited to 1/hour).
 *   A webhook that can't be authenticated is a pipeline-level outage — treat it
 *   like one. No more 401s vanishing into Vercel logs that nobody reads.
 *
 * CIRCUIT BREAKER (persistent):
 *   Counts [autofix] commits referencing the target SHA in git history.
 *   Survives cold starts. 3+ autofix commits for the same SHA = stop.
 *
 * ENV VARS:
 *   VERCEL_TOKEN          — Vercel API token (fetch build logs)
 *   GH_PAT                — GitHub PAT (read commits, push fixes, create issues)
 *   ANTHROPIC_API_KEY     — Claude API key (used by deploy-autofix)
 *   DEPLOY_WEBHOOK_SECRET — Shared secret with Vercel webhook
 *   DEPLOY_INTERNAL_SECRET — Optional, used for monitor → autofix internal call
 */

import crypto from 'crypto';
import { reportApiError } from '../../src/lib/sentryWrap';

// Disable Next.js body parsing so we can HMAC-verify the raw request bytes.
export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

const MAX_FIX_ATTEMPTS = 3;
const TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc';
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO = 'Smarter-Poker-World-Hub';

// In-memory alert rate limit (best-effort; Vercel cold starts reset it,
// which is actually fine — better to alert too often than not at all).
const lastAlertAt = new Map(); // key -> timestamp ms
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1h per alert key

// ─────────────────────────────────────────────────────────────────────────────
// Raw body reader (required for HMAC verification)
// ─────────────────────────────────────────────────────────────────────────────
// Raw body reader (required for HMAC verification).
// Capped at 2 MB — Vercel webhook payloads are ~5 KB; anything larger is either
// malformed or a memory-exhaustion attack. Attacker sends gigabytes → we truncate.
const MAX_RAW_BODY_BYTES = 2 * 1024 * 1024;
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let killed = false;
    req.on('data', (c) => {
      if (killed) return;
      total += c.length;
      if (total > MAX_RAW_BODY_BYTES) {
        killed = true;
        // Truncate and reject cleanly — handler returns 413 Payload Too Large.
        const err = new Error(`Request body exceeds ${MAX_RAW_BODY_BYTES} bytes`);
        err.statusCode = 413;
        reject(err);
        try { req.destroy(); } catch { /* noop */ }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!killed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Constant-time HMAC-SHA1 verification (matches Vercel's webhook protocol)
// ─────────────────────────────────────────────────────────────────────────────
function verifyVercelSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');
  if (expected.length !== signatureHeader.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetch() with AbortController timeout — any outbound call can hang the
// serverless handler up to Vercel's 60s ceiling, which triggers webhook
// retries and cascading alerts. Every non-Claude fetch in this file must
// use this wrapper (Claude already has its own 45s guard).
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Issue alerting (non-blocking, deduped against open autofix-failure)
// ─────────────────────────────────────────────────────────────────────────────
async function createAlertIssue(title, body, { alertKey, ghPat } = {}) {
  const token = ghPat || process.env.GH_PAT;
  if (!token) return;

  // Per-key rate limit via Supabase (survives cold starts) with in-memory fallback
  if (alertKey) {
    if (await isRecentlyAlerted(alertKey)) return;
    await recordAlert(alertKey);
  }

  try {
    const searchRes = await fetchWithTimeout(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?labels=autofix-failure&state=open&per_page=1`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
      8000
    );

    if (searchRes.ok) {
      const existing = await searchRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        const res = await fetchWithTimeout(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${existing[0].number}/comments`,
          {
            method: 'POST',
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body: `## ${title}\n\n${body}` }),
          },
          8000
        );
        if (!res.ok) throw new Error(`GitHub comment API failed: ${res.status}`);
        console.warn(`[deploy-monitor] Alert comment added to issue #${existing[0].number}`);
        return;
      }
    }

    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: ['autofix-failure'] }),
      },
      8000
    );
    if (!res.ok) throw new Error(`GitHub issues API failed: ${res.status}`);
    console.warn('[deploy-monitor] Alert issue created on GitHub');
  } catch (err) {
    console.warn('[deploy-monitor] Failed to create alert issue:', err.message);
  }

  // Best-effort SMS alert.
  try {
    await sendSmsAlert(`🚨 Vercel Deploy Crash\n${title}`);
  } catch (err) {
    console.warn('[deploy-monitor] SMS alert failed (non-fatal):', err.message);
  }

  // Best-effort parallel email. Never throws — monitor must keep running.
  try {
    await sendEmailAlert({
      subject: `[Smarter.Poker Autofix] ${title}`,
      markdown: body,
      tag: 'alert',
    });
  } catch (err) {
    console.warn('[deploy-monitor] Email alert failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS alerting via Twilio — non-blocking, never throws
// ─────────────────────────────────────────────────────────────────────────────
async function sendSmsAlert(message) {
  return; // DISABLED per user request
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  const ownerPhone = '+17086775221';

  if (!accountSid || !authToken || !fromPhone) {
    console.warn('[deploy-monitor] Twilio credentials missing — skipping SMS');
    return;
  }

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const body = new URLSearchParams({
      From: fromPhone,
      To: ownerPhone,
      Body: Array.from(message).slice(0, 1000).join('') // Safe unicode-aware truncation
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      }
    );

    if (res.ok) {
      console.warn(`[deploy-monitor] SMS alert sent to ${ownerPhone}`);
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('[deploy-monitor] SMS API error:', res.status, errData);
    }
  } catch (err) {
    console.warn('[deploy-monitor] Failed to dispatch SMS:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email alerting via Resend — non-blocking, never throws
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailAlert({ subject, markdown, tag = 'info' }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[deploy-monitor] RESEND_API_KEY not set — skipping email');
    return;
  }
  const to = process.env.OPS_ALERT_EMAIL || 'admin@smarter.poker';
  const from = process.env.OPS_ALERT_FROM || 'deploy-monitor@smarter.poker';

  // Convert markdown to very simple HTML (no external dep). Good enough for alerts.
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px;padding:16px;">
    <pre style="white-space:pre-wrap;word-wrap:break-word;background:#f6f8fa;padding:12px;border-radius:6px;font-size:13px;">${String(markdown)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>
    <p style="color:#8b949e;font-size:12px;margin-top:12px;">
      Sent by deploy-monitor · tag=${tag} · ${new Date().toISOString()}
    </p>
  </div>`;

  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, tags: [{ name: 'source', value: 'deploy-monitor' }, { name: 'tag', value: tag }] }),
    }, 10000);
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[deploy-monitor] Resend rejected email (HTTP ${res.status}):`, errText.substring(0, 200));
    } else {
      console.warn(`[deploy-monitor] Email alert sent (tag=${tag})`);
    }
  } catch (err) {
    console.warn('[deploy-monitor] Resend fetch error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured telemetry log — JSON per decision, queryable via Vercel logs
// Swap this function body with a PostHog ingest call once POSTHOG_KEY is set
// ─────────────────────────────────────────────────────────────────────────────
function logTelemetry(decision, context = {}) {
  console.warn(
    `[telemetry] ${JSON.stringify({
      event: 'deploy_monitor_decision',
      decision,
      timestamp: new Date().toISOString(),
      ...context,
    })}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent alert dedup via Supabase (survives cold starts)
// Table: deploy_alerts(alert_key text PK, expires_at timestamptz)
// Falls back gracefully to in-memory lastAlertAt Map if Supabase is unreachable
// ─────────────────────────────────────────────────────────────────────────────
async function isRecentlyAlerted(alertKey) {
  if (!alertKey) return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    // Fallback to in-memory map (legacy behavior)
    const last = lastAlertAt.get(alertKey) || 0;
    return Date.now() - last < ALERT_COOLDOWN_MS;
  }
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/deploy_alerts?alert_key=eq.${encodeURIComponent(alertKey)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=alert_key`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
      6000
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn('[deploy-monitor] Supabase dedup read failed (falling through):', err.message);
    return false;
  }
}

async function recordAlert(alertKey) {
  if (!alertKey) return;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Always write to in-memory too so single-worker runs are fast.
  lastAlertAt.set(alertKey, Date.now());

  // Evict expired entries to bound memory. Runs opportunistically on each write,
  // so a single Lambda instance never accumulates more entries than the set of
  // distinct alertKeys seen within ~2× cooldown. Prevents memory leak on
  // long-running instances that would otherwise grow the Map unboundedly.
  const evictBefore = Date.now() - ALERT_COOLDOWN_MS * 2;
  for (const [k, ts] of lastAlertAt) {
    if (ts < evictBefore) lastAlertAt.delete(k);
  }

  if (!supabaseUrl || !serviceKey) return;
  const expiresAt = new Date(Date.now() + ALERT_COOLDOWN_MS).toISOString();
  try {
    await fetchWithTimeout(`${supabaseUrl}/rest/v1/deploy_alerts?on_conflict=alert_key`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ alert_key: alertKey, expires_at: expiresAt }),
    });
  } catch (err) {
    console.warn('[deploy-monitor] Supabase dedup write failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-rollback: when circuit breaker trips, find last-known-good deploy
// and promote it to production. Keeps git history intact (no force-push).
// Controlled by AUTOFIX_ROLLBACK_ENABLED env var; defaults OFF for safety.
// ─────────────────────────────────────────────────────────────────────────────
async function findLastGoodDeploy(beforeSha) {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) return null;
  // Defensive: if beforeSha is missing or invalid, we cannot safely exclude
  // the broken deploy from candidates. Refuse to rollback rather than risk
  // promoting the broken deploy back to production.
  if (!beforeSha || beforeSha === 'unknown' || beforeSha.length < 7) {
    console.warn('[deploy-monitor] findLastGoodDeploy: invalid beforeSha, refusing to pick rollback target');
    return null;
  }
  try {
    const res = await fetchWithTimeout(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&target=production&limit=20&state=READY`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
      10000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const deps = data.deployments || [];
    // Find the most recent READY production deploy whose SHA isn't the broken one
    for (const d of deps) {
      const sha = d.meta?.githubCommitSha;
      if (sha && sha !== beforeSha && d.state === 'READY') {
        return { id: d.uid, sha, createdAt: d.createdAt };
      }
    }
    return null;
  } catch (err) {
    console.warn('[deploy-monitor] findLastGoodDeploy failed:', err.message);
    return null;
  }
}

async function rollbackToDeploy(deploymentId) {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) return { ok: false, reason: 'VERCEL_TOKEN missing' };
  try {
    const res = await fetchWithTimeout(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/promote/${deploymentId}?teamId=${TEAM_ID}`,
      { method: 'POST', headers: { Authorization: `Bearer ${vercelToken}` } },
      10000
    );
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, reason: `Vercel promote ${res.status}: ${errText.substring(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent circuit breaker: count [autofix] commits referencing the SHA
// ─────────────────────────────────────────────────────────────────────────────
async function countPersistentAttempts(commitSha, branchName, ghPat) {
  if (!ghPat) return 0;
  // Defensive: commitSha='unknown' (fallback when webhook payload is missing it)
  // would match any commit message containing the word "unknown" and silently
  // trip the circuit breaker. Bail early for invalid/short SHAs.
  if (!commitSha || commitSha === 'unknown' || commitSha.length < 7) return 0;
  const shortSha = commitSha.substring(0, 8);
  const targetBranch = branchName || 'main'; // Fallback to main if unknown
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${encodeURIComponent(targetBranch)}&per_page=15`,
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } },
      8000
    );
    if (!res.ok) return 0;
    const commits = await res.json();
    if (!Array.isArray(commits)) return 0;
    return commits.filter((c) => {
      const msg = c.commit?.message || '';
      return msg.startsWith('[autofix]') && msg.includes(shortSha);
    }).length;
  } catch (err) {
    console.warn('[deploy-monitor] countPersistentAttempts failed:', err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {

  const startTime = Date.now();

  // ── GET: health / diagnostics ────────────────────────────────────────────
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'deploy-monitor',
      version: 'v2',
      description: 'Self-healing deploy monitor. POST Vercel webhook events here.',
      expectedEvents: ['deployment.error', 'deployment.canceled'],
      project: PROJECT_ID,
      config: {
        hasVercelToken: !!process.env.VERCEL_TOKEN,
        hasGhPat: !!process.env.GH_PAT,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasWebhookSecret: !!process.env.DEPLOY_WEBHOOK_SECRET,
        hasInternalSecret: !!process.env.DEPLOY_INTERNAL_SECRET,
      },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Read raw body (required for HMAC) ────────────────────────────────────
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.warn('[deploy-monitor] Failed to read request body:', err.message);
    const code = err.statusCode === 413 ? 413 : 400;
    return res.status(code).json({
      error: code === 413 ? 'Request body too large' : 'Failed to read request body',
    });
  }

  let payload;
  try {
    payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : null;
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!payload || !payload.type) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // ── AUTH: three-tier check ───────────────────────────────────────────────
  const webhookSecret = process.env.DEPLOY_WEBHOOK_SECRET;
  const sigHeader = req.headers['x-vercel-signature'];
  const querySecret = req.query?.secret;
  const headerSecret = req.headers['x-webhook-secret'];
  let authMethod = 'none';

  // Constant-time string compare — prevents timing-leak of the secret through
  // the shared_secret fallback. Only compares when both are same-length strings.
  const safeEq = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch { return false; }
  };

  // webhookSecret truthiness was checking for just "is set" — an empty string
  // would fall to the else branch (unauthenticated accept). Explicitly require
  // a non-empty value. If someone mis-sets DEPLOY_WEBHOOK_SECRET="" in Vercel,
  // we now reject all webhooks rather than silently drop auth.
  if (webhookSecret && webhookSecret.length > 0) {
    // Method 1: Vercel native HMAC-SHA1 (PREFERRED)
    if (sigHeader && verifyVercelSignature(rawBody, sigHeader, webhookSecret)) {
      authMethod = 'hmac';
    }
    // Method 2: Legacy URL/header secret (FALLBACK) — constant-time compare
    else if (safeEq(querySecret, webhookSecret) || safeEq(headerSecret, webhookSecret)) {
      authMethod = 'shared_secret';
    }
    // Method 3: Rejected — fire alert so this never vanishes silently
    else {
      console.warn('[deploy-monitor] AUTH FAILED — hmac=%s querySecret=%s headerSecret=%s',
        sigHeader ? 'present(mismatch)' : 'absent',
        querySecret ? 'present(mismatch)' : 'absent',
        headerSecret ? 'present(mismatch)' : 'absent');

      await createAlertIssue(
        `Deploy webhook auth failing — ${new Date().toISOString().slice(0, 10)}`,
        `## Webhook auth rejected

The deploy-monitor webhook is rejecting incoming Vercel events because no valid auth is being provided.

**What this means:** production failures will NOT be auto-fixed until this is resolved.

**Diagnostics:**
- \`x-vercel-signature\` header present: **${sigHeader ? 'yes (signature did not match)' : 'no'}**
- \`?secret=\` query string: **${querySecret ? 'yes (did not match DEPLOY_WEBHOOK_SECRET)' : 'no'}**
- \`x-webhook-secret\` header: **${headerSecret ? 'yes (did not match DEPLOY_WEBHOOK_SECRET)' : 'no'}**
- \`DEPLOY_WEBHOOK_SECRET\` env var: **set**
- Event type: \`${payload.type}\`
- Timestamp: \`${new Date().toISOString()}\`

**Fix:** Go to Vercel Dashboard → Team Settings → Webhooks → edit the webhook for \`https://smarter.poker/api/deploy-monitor\`. Either:
1. (Preferred) Set the webhook "Secret" field to the same value as \`DEPLOY_WEBHOOK_SECRET\` in Vercel project env. Vercel will then sign each request with \`x-vercel-signature\` and we verify via HMAC-SHA1.
2. (Fallback) Append \`?secret=<value>\` to the webhook URL, where \`<value>\` equals \`DEPLOY_WEBHOOK_SECRET\`.

Alert is rate-limited to 1 issue/comment per hour.`,
        { alertKey: 'webhook_auth_failed' }
      );

      return res.status(401).json({ error: 'Invalid webhook auth', authMethods: ['hmac', 'shared_secret'] });
    }
  } else {
    // SECURITY: a missing DEPLOY_WEBHOOK_SECRET is a server misconfiguration,
    // not a grant. This previously FAILED OPEN: it only logged a warning, set
    // authMethod = 'unauthenticated_dev' and fell through to the handler, so an
    // unset secret let anyone POST a forged Vercel deployment-failure event and
    // drive the autofix pipeline (Claude API spend + commits pushed via GH_PAT).
    console.warn('[deploy-monitor] DEPLOY_WEBHOOK_SECRET is not configured — rejecting webhook');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ── From here on: the webhook is authenticated. Proceed with handling. ──
  const eventType = payload.type || '';

  // Broad failure detection: catch ANY event that indicates a problem.
  // This includes deployment.error, deployment.canceled, deployment.check-rerequested,
  // as well as any event where the internal deployment state is ERROR/FAILED/CANCELED.
  const deployment = payload.payload?.deployment || payload.payload || {};
  const deployState = (deployment.state || deployment.readyState || '').toUpperCase();
  const isFailureEvent = (
    eventType.includes('error') ||
    eventType.includes('fail') ||
    eventType.includes('cancel') ||
    eventType.includes('timeout') ||
    eventType.includes('check') ||
    ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(deployState)
  );

  if (!isFailureEvent) {
    return res.status(200).json({
      action: 'ignored',
      authMethod,
      reason: `Event type '${eventType}' with state '${deployState}' is not a failure — no action needed`,
    });
  }

  try {
    const deploymentId = deployment.id || deployment.uid || 'unknown';
    const projectId = deployment.projectId || payload.payload?.projectId || null;
    const commitSha = deployment.meta?.githubCommitSha || 'unknown';
    const commitMsg = deployment.meta?.githubCommitMessage || '';
    const state = deployState || eventType;

    console.warn(`[deploy-monitor] Received ${eventType}/${state} for deployment ${deploymentId} (project: ${projectId}, SHA: ${commitSha}, auth: ${authMethod})`);

    // ── Project filter (HARDENED): require exact match ────────────────────
    // Previous version allowed projectId === 'unknown' through. That meant any
    // payload-shape change (Vercel webhook v1 vs v2) would cause ALL failures
    // across ALL projects to be processed against the World Hub repo.
    if (!projectId || projectId !== PROJECT_ID) {
      console.warn(`[deploy-monitor] Ignoring deployment from project ${projectId} (not hub-vanguard)`);
      return res.status(200).json({
        action: 'ignored',
        reason: `Deployment belongs to project ${projectId || 'unknown'}, not hub-vanguard (${PROJECT_ID})`,
        authMethod,
      });
    }

    // ── Hard stop: never auto-fix an [autofix] commit ─────────────────────
    if (commitMsg.startsWith('[autofix]')) {
      console.warn(`[deploy-monitor] Refusing to auto-fix an [autofix] commit: ${commitSha}`);
      await createAlertIssue(
        `Autofix commit failed to build — ${commitSha.substring(0, 8)}`,
        `## Autofix Commit Failed

An \`[autofix]\` commit itself failed to build. The AI-generated fix introduced a new error.

**Commit SHA:** \`${commitSha}\`
**Commit message:** ${commitMsg.substring(0, 300)}
**Deployment:** ${deploymentId}

Manual intervention required. The self-healing pipeline will NOT retry this commit.`,
        { alertKey: `autofix_commit_failed_${commitSha.substring(0, 8)}`, ghPat: process.env.GH_PAT }
      );
      return res.status(200).json({
        action: 'refused',
        reason: 'Will not auto-fix an [autofix] commit — prevents infinite loops.',
        commitSha,
        authMethod,
      });
    }

    // ── Persistent circuit breaker ────────────────────────────────────────
    const branchName = deployment.meta?.githubCommitRef || 'main';
    const attempts = await countPersistentAttempts(commitSha, branchName, process.env.GH_PAT);
    if (attempts >= MAX_FIX_ATTEMPTS) {
      console.warn(`[deploy-monitor] Circuit breaker: ${commitSha} has ${attempts} autofix commits. Stopping.`);
      logTelemetry('circuit_breaker_tripped', {
        commitSha: commitSha.substring(0, 8),
        attempts,
      });

      // Auto-rollback (if enabled) — promote last-known-good production deploy
      let rollbackNote = '';
      if (process.env.AUTOFIX_ROLLBACK_ENABLED === 'true') {
        const lastGood = await findLastGoodDeploy(commitSha);
        if (lastGood) {
          const rb = await rollbackToDeploy(lastGood.id);
          if (rb.ok) {
            rollbackNote = `\n\n**AUTO-ROLLBACK EXECUTED** — production alias promoted to deploy \`${lastGood.id}\` (sha \`${lastGood.sha.substring(0, 8)}\`, originally built ${lastGood.createdAt}). Git history is unchanged; only the prod alias moved.`;
            logTelemetry('rollback_executed', {
              from: commitSha.substring(0, 8),
              to: lastGood.sha.substring(0, 8),
              deploymentId: lastGood.id,
            });
          } else {
            rollbackNote = `\n\n**Auto-rollback ATTEMPTED but FAILED:** ${rb.reason}`;
            logTelemetry('rollback_failed', { reason: rb.reason });
          }
        } else {
          rollbackNote = `\n\n**Auto-rollback skipped:** no suitable last-good deploy found.`;
        }
      }

      await createAlertIssue(
        `Deploy autofix circuit breaker tripped — ${commitSha.substring(0, 8)}`,
        `## Circuit Breaker Tripped

Autofix exhausted all ${MAX_FIX_ATTEMPTS} attempts for commit \`${commitSha}\` without successfully fixing the build.

**Commit SHA:** \`${commitSha}\`
**Commit message:** ${commitMsg.substring(0, 300)}
**Attempts (persistent, counted from git history):** ${attempts}/${MAX_FIX_ATTEMPTS}${rollbackNote}

Manual intervention required. Check Vercel build logs:
https://vercel.com/smarter-poker/hub-vanguard/deployments`,
        { alertKey: `circuit_breaker_${commitSha.substring(0, 8)}`, ghPat: process.env.GH_PAT }
      );
      return res.status(200).json({
        action: 'circuit_breaker',
        commitSha,
        attempts,
        rollback: rollbackNote ? rollbackNote.trim() : 'disabled',
        message: `Auto-fix stopped after ${MAX_FIX_ATTEMPTS} attempts. Manual intervention required.`,
        authMethod,
      });
    }

    // CANCELED deployments are superseded — no fix needed
    if (eventType === 'deployment.canceled' || state === 'CANCELED') {
      return res.status(200).json({
        action: 'ignored',
        reason: 'CANCELED deployments are superseded builds — no fix needed',
        commitSha,
        authMethod,
      });
    }

    // ── Fetch build logs ──────────────────────────────────────────────────
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[deploy-monitor] Missing VERCEL_TOKEN env var');
      await createAlertIssue(
        `Deploy monitor misconfigured — VERCEL_TOKEN missing`,
        `The deploy-monitor endpoint received a valid webhook but \`VERCEL_TOKEN\` is not set. Cannot fetch build logs. Set it in Vercel project env.`,
        { alertKey: 'missing_vercel_token', ghPat: process.env.GH_PAT }
      );
      return res.status(500).json({ error: 'VERCEL_TOKEN not configured' });
    }

    console.warn(`[deploy-monitor] Fetching build logs for ${deploymentId}...`);
    const logsRes = await fetchWithTimeout(
      `https://api.vercel.com/v2/deployments/${deploymentId}/events?teamId=${TEAM_ID}&direction=backward&limit=1000`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
      12000
    );

    let buildErrors = '';
    if (logsRes.ok) {
      const events = await logsRes.json();
      const errorLines = (Array.isArray(events) ? events : [])
        .filter((e) => {
          if (e.type === 'stderr' || e.type === 'error') return true;
          const text = (e.payload?.text || e.text || '').toLowerCase();
          return text.includes('error') || 
            text.includes('failed') || 
            text.includes('module not found') || 
            text.includes('cannot find') || 
            text.includes('unexpected') ||
            text.includes('syntax');
        })
        .map((e) => e.payload?.text || e.text || JSON.stringify(e.payload || e))
        .slice(-200);
      buildErrors = errorLines.join('\n');
    }

    if (!buildErrors) {
      console.warn(`[deploy-monitor] Could not extract build errors for ${deploymentId}`);
      // Fire agent notification — empty log = pipeline blind spot, not a benign skip.
      // The deployment failed but we cannot auto-fix. Human or agent must investigate.
      await createAlertIssue(
        `Deploy failed — logs unavailable for ${commitSha.substring(0, 8)}`,
        `## Vercel Deployment Failed — Build Log Unavailable\n\n**Commit:** \`${commitSha}\`\n**Message:** ${commitMsg.substring(0, 200)}\n**Deployment:** ${deploymentId}\n**Auth:** ${authMethod}\n\nThe Vercel deployment failed, but the build log API returned no error lines to analyze.\nThis could mean:\n- The build log was empty (infrastructure failure)\n- The error happened before Next.js compilation (install/config phase)\n- The deployment ID is synthetic or expired\n\nManual investigation required: https://vercel.com/smarter-poker/hub-vanguard/deployments`,
        { alertKey: `no_build_logs_${deploymentId}`, ghPat: process.env.GH_PAT }
      );
      return res.status(200).json({
        action: 'skipped',
        reason: 'Could not extract build errors from deployment logs',
        deploymentId,
        commitSha,
        authMethod,
      });
    }

    console.warn(`[deploy-monitor] Build errors extracted (${buildErrors.length} chars). Calling autofix...`);

    // ── Call autofix ──────────────────────────────────────────────────────
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '') || 'smarter.poker';
    const autofixUrl = `https://${host}/api/deploy-autofix`;
    const autofixHeaders = { 'Content-Type': 'application/json' };
    if (process.env.DEPLOY_INTERNAL_SECRET) {
      autofixHeaders['x-internal-secret'] = process.env.DEPLOY_INTERNAL_SECRET;
    }
    const autofixRes = await fetchWithTimeout(autofixUrl, {
      method: 'POST',
      headers: autofixHeaders,
      body: JSON.stringify({
        commitSha,
        commitMessage: commitMsg,
        deploymentId,
        buildErrors,
        attempt: attempts + 1,
        branch: branchName,
      }),
    }, 55000);

    let autofixResult = {};
    if (!autofixRes.ok) {
      const errText = await autofixRes.text().catch(() => '');
      autofixResult = {
        action: 'api_error',
        reason: `Autofix API returned ${autofixRes.status}: ${errText.substring(0, 200)}`,
      };
    } else {
      try {
        autofixResult = await autofixRes.json();
      } catch (e) {
        autofixResult = {
          action: 'api_error',
          reason: `Autofix API returned invalid JSON: ${e.message}`,
        };
      }
    }
    const duration = Date.now() - startTime;
    console.warn(`[deploy-monitor] Autofix result: ${autofixResult.action} (${duration}ms)`);

    // Structured telemetry for every autofix run (success or skip)
    logTelemetry('autofix_completed', {
      commitSha: commitSha.substring(0, 8),
      action: autofixResult.action,
      attempt: attempts + 1,
      durationMs: duration,
      filePath: autofixResult.filePath,
      newSha: autofixResult.newSha,
    });

    // Success notification — you want to know when autofix ships code to main
    if (autofixResult.action === 'fixed') {
      const shortSha = commitSha.substring(0, 8);
      const newShortSha = (autofixResult.newSha || '').substring(0, 8);
      await sendEmailAlert({
        subject: `[Smarter.Poker Autofix] ✓ Fixed ${autofixResult.filePath || 'a build error'} (${shortSha})`,
        markdown: `## Autofix succeeded

**Original broken commit:** \`${commitSha}\`
**Commit message:** ${commitMsg.substring(0, 200)}
**File repaired:** \`${autofixResult.filePath || '(unknown)'}\`
**Fix commit:** \`${newShortSha}\`
**Attempt:** ${attempts + 1}/${MAX_FIX_ATTEMPTS}
**Duration:** ${duration}ms
**Model:** ${process.env.AUTOFIX_CLAUDE_MODEL || 'claude-3-7-sonnet-20250219'}

Vercel is now rebuilding with the fix. You should see a green deployment within ~2 minutes.

Review the change: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${autofixResult.newSha || ''}

If the fix looks wrong, revert it: \`git revert ${newShortSha}\``,
        tag: 'autofix_success',
      });
    }

    // Review-needed notification — a sensitive-file fix was staged as a PR for human approval
    else if (autofixResult.action === 'pr_opened') {
      const shortSha = commitSha.substring(0, 8);
      await sendEmailAlert({
        subject: `[Smarter.Poker Autofix] 👀 Review needed: PR #${autofixResult.prNumber} — ${autofixResult.filePath || 'fix'}`,
        markdown: `## Autofix staged a fix for your review

The file touched is either in a sensitive area (auth / payments / engine / lib) OR was modified in the last 24h (hot zone), so the fix was pushed to a branch and a PR was opened INSTEAD of being merged to main.

**File:** \`${autofixResult.filePath || '(unknown)'}\`
**Branch:** \`${autofixResult.branch || '(unknown)'}\`
**Sensitive path:** ${autofixResult.sensitive}
**Hot file (recently changed):** ${autofixResult.hot}
**Original broken commit:** \`${commitSha}\`
**Attempt:** ${attempts + 1}/${MAX_FIX_ATTEMPTS}

**→ Review and merge the PR:** ${autofixResult.prUrl || '(no URL)'}

Vercel will NOT rebuild main until you merge. Production continues serving the last-known-good deploy.`,
        tag: 'autofix_pr_opened',
      });
    }

    // Failure notification — any outcome that did NOT produce a fix on main or a PR
    // Failure notification — any outcome that did NOT produce a fix on main or a PR
    else if (autofixResult.action !== 'refused' && autofixResult.action !== 'ignored') {
      const markdownBody = `## Autofix could not repair this build

**Commit:** \`${commitSha}\`
**Message:** ${commitMsg.substring(0, 200)}
**Action:** \`${autofixResult.action}\` ${autofixResult.action === 'skipped' ? '(guard rejected the fix)' : autofixResult.action === 'api_error' ? '(Anthropic API call failed)' : autofixResult.action === 'timeout' ? '(Claude call exceeded 45s timeout)' : autofixResult.action === 'push_failed' ? '(GitHub push rejected — likely SHA conflict or permissions)' : autofixResult.action === 'pr_failed' ? '(branch was created and pushed, but PR open failed)' : ''}
**Reason:** ${autofixResult.reason || '(none given)'}
**Attempt:** ${attempts + 1}/${MAX_FIX_ATTEMPTS}
**Duration:** ${duration}ms

${autofixResult.action === 'pr_failed' && autofixResult.branch ? `A branch was already created — you can open the PR manually: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/pull/new/${autofixResult.branch}\n\n` : ''}Build errors (first 500 chars):
\`\`\`
${(buildErrors || '').substring(0, 500)}
\`\`\`

Manual intervention needed. Check the Vercel build: https://vercel.com/smarter-poker/hub-vanguard/deployments`;

      await sendEmailAlert({
        subject: `[Smarter.Poker Autofix] ⚠ Did not fix ${commitSha.substring(0, 8)} (${autofixResult.action})`,
        markdown: markdownBody,
        tag: `autofix_${autofixResult.action}`,
      });

      await createAlertIssue(
        `Deploy autofix failed — ${commitSha.substring(0, 8)}`,
        markdownBody,
        { alertKey: `autofix_failure_${commitSha.substring(0, 8)}`, ghPat: process.env.GH_PAT }
      );
    }

    return res.status(200).json({
      action: autofixResult.action || 'autofix_attempted',
      commitSha,
      attempt: attempts + 1,
      maxAttempts: MAX_FIX_ATTEMPTS,
      autofixResult,
      durationMs: duration,
      authMethod,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[deploy-monitor] Error:', err);
    // Pipeline-level errors also deserve an alert
    await createAlertIssue(
      `deploy-monitor threw an exception — ${new Date().toISOString().slice(0, 10)}`,
      `The monitor handler threw during webhook processing. Check Vercel runtime logs.\n\nError: \`${err.message || 'unknown'}\`\nStack:\n\`\`\`\n${(err.stack || '').substring(0, 2000)}\n\`\`\``,
      { alertKey: `monitor_exception_fallback`, ghPat: process.env.GH_PAT }
    );
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
