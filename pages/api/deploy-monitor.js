/**
 * /api/deploy-monitor — Self-Healing Deployment Monitor (v2)
 *
 * Receives Vercel deployment webhooks. When a deployment fails (ERROR state),
 * it fetches the build logs, identifies the error, and triggers an automatic
 * fix via the Anthropic API + GitHub Contents API.
 *
 * WEBHOOK SETUP (Vercel Dashboard → Team Settings → Webhooks):
 *   URL:    https://smarter.poker/api/deploy-monitor
 *   Events: deployment.error, deployment.canceled
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

// Disable Next.js body parsing so we can HMAC-verify the raw request bytes.
export const config = {
  api: {
    bodyParser: false,
  },
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
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
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
// GitHub Issue alerting (non-blocking, deduped against open autofix-failure)
// ─────────────────────────────────────────────────────────────────────────────
async function createAlertIssue(title, body, { alertKey, ghPat } = {}) {
  const token = ghPat || process.env.GH_PAT;
  if (!token) return;

  // Per-key rate limit — prevents a misconfigured webhook from creating 500 issues
  if (alertKey) {
    const last = lastAlertAt.get(alertKey) || 0;
    if (Date.now() - last < ALERT_COOLDOWN_MS) return;
    lastAlertAt.set(alertKey, Date.now());
  }

  try {
    const searchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?labels=autofix-failure&state=open&per_page=1`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );

    if (searchRes.ok) {
      const existing = await searchRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${existing[0].number}/comments`,
          {
            method: 'POST',
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body: `## ${title}\n\n${body}` }),
          }
        );
        console.log(`[deploy-monitor] Alert comment added to issue #${existing[0].number}`);
        return;
      }
    }

    await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: ['autofix-failure'] }),
      }
    );
    console.log('[deploy-monitor] Alert issue created on GitHub');
  } catch (err) {
    console.error('[deploy-monitor] Failed to create alert issue:', err.message);
  }

  // Best-effort parallel email. Never throws — monitor must keep running.
  try {
    await sendEmailAlert({
      subject: `[Smarter.Poker Autofix] ${title}`,
      markdown: body,
      tag: 'alert',
    });
  } catch (err) {
    console.error('[deploy-monitor] Email alert failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email alerting via Resend — non-blocking, never throws
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailAlert({ subject, markdown, tag = 'info' }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[deploy-monitor] RESEND_API_KEY not set — skipping email');
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
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, tags: [{ name: 'source', value: 'deploy-monitor' }, { name: 'tag', value: tag }] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[deploy-monitor] Resend rejected email (HTTP ${res.status}):`, errText.substring(0, 200));
    } else {
      console.log(`[deploy-monitor] Email alert sent (tag=${tag})`);
    }
  } catch (err) {
    console.error('[deploy-monitor] Resend fetch error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured telemetry log — JSON per decision, queryable via Vercel logs
// Swap this function body with a PostHog ingest call once POSTHOG_KEY is set
// ─────────────────────────────────────────────────────────────────────────────
function logTelemetry(decision, context = {}) {
  console.log(
    `[telemetry] ${JSON.stringify({
      event: 'deploy_monitor_decision',
      decision,
      timestamp: new Date().toISOString(),
      ...context,
    })}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent circuit breaker: count [autofix] commits referencing the SHA
// ─────────────────────────────────────────────────────────────────────────────
async function countPersistentAttempts(commitSha, ghPat) {
  if (!ghPat) return 0;
  const shortSha = commitSha.substring(0, 8);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=main&per_page=15`,
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) return 0;
    const commits = await res.json();
    if (!Array.isArray(commits)) return 0;
    return commits.filter((c) => {
      const msg = c.commit?.message || '';
      return msg.startsWith('[autofix]') && msg.includes(shortSha);
    }).length;
  } catch (err) {
    console.error('[deploy-monitor] countPersistentAttempts failed:', err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
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
    console.error('[deploy-monitor] Failed to read request body:', err.message);
    return res.status(400).json({ error: 'Failed to read request body' });
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

  if (webhookSecret) {
    // Method 1: Vercel native HMAC-SHA1 (PREFERRED)
    if (sigHeader && verifyVercelSignature(rawBody, sigHeader, webhookSecret)) {
      authMethod = 'hmac';
    }
    // Method 2: Legacy URL/header secret (FALLBACK)
    else if (querySecret === webhookSecret || headerSecret === webhookSecret) {
      authMethod = 'shared_secret';
    }
    // Method 3: Rejected — fire alert so this never vanishes silently
    else {
      console.log('[deploy-monitor] AUTH FAILED — hmac=%s querySecret=%s headerSecret=%s',
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
    // No secret configured — allow (dev only). Log a warning.
    console.warn('[deploy-monitor] DEPLOY_WEBHOOK_SECRET not set — accepting unauthenticated webhook');
    authMethod = 'unauthenticated_dev';
  }

  // ── From here on: the webhook is authenticated. Proceed with handling. ──
  const eventType = payload.type;
  if (eventType !== 'deployment.error' && eventType !== 'deployment.canceled') {
    return res.status(200).json({
      action: 'ignored',
      authMethod,
      reason: `Event type ${eventType} is not a failure — no action needed`,
    });
  }

  try {
    const deployment = payload.payload?.deployment || payload.payload || {};
    const deploymentId = deployment.id || deployment.uid || 'unknown';
    const projectId = deployment.projectId || payload.payload?.projectId || null;
    const commitSha = deployment.meta?.githubCommitSha || 'unknown';
    const commitMsg = deployment.meta?.githubCommitMessage || '';
    const state = deployment.state || deployment.readyState || eventType;

    console.log(`[deploy-monitor] Received ${eventType} for deployment ${deploymentId} (project: ${projectId}, SHA: ${commitSha}, auth: ${authMethod})`);

    // ── Project filter (HARDENED): require exact match ────────────────────
    // Previous version allowed projectId === 'unknown' through. That meant any
    // payload-shape change (Vercel webhook v1 vs v2) would cause ALL failures
    // across ALL projects to be processed against the World Hub repo.
    if (!projectId || projectId !== PROJECT_ID) {
      console.log(`[deploy-monitor] Ignoring deployment from project ${projectId} (not hub-vanguard)`);
      return res.status(200).json({
        action: 'ignored',
        reason: `Deployment belongs to project ${projectId || 'unknown'}, not hub-vanguard (${PROJECT_ID})`,
        authMethod,
      });
    }

    // ── Hard stop: never auto-fix an [autofix] commit ─────────────────────
    if (commitMsg.startsWith('[autofix]')) {
      console.log(`[deploy-monitor] Refusing to auto-fix an [autofix] commit: ${commitSha}`);
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
    const attempts = await countPersistentAttempts(commitSha, process.env.GH_PAT);
    if (attempts >= MAX_FIX_ATTEMPTS) {
      console.log(`[deploy-monitor] Circuit breaker: ${commitSha} has ${attempts} autofix commits. Stopping.`);
      await createAlertIssue(
        `Deploy autofix circuit breaker tripped — ${commitSha.substring(0, 8)}`,
        `## Circuit Breaker Tripped

Autofix exhausted all ${MAX_FIX_ATTEMPTS} attempts for commit \`${commitSha}\` without successfully fixing the build.

**Commit SHA:** \`${commitSha}\`
**Commit message:** ${commitMsg.substring(0, 300)}
**Attempts (persistent, counted from git history):** ${attempts}/${MAX_FIX_ATTEMPTS}

Manual intervention required. Check Vercel build logs:
https://vercel.com/smarter-poker/hub-vanguard/deployments`,
        { alertKey: `circuit_breaker_${commitSha.substring(0, 8)}`, ghPat: process.env.GH_PAT }
      );
      return res.status(200).json({
        action: 'circuit_breaker',
        commitSha,
        attempts,
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
      console.error('[deploy-monitor] Missing VERCEL_TOKEN env var');
      await createAlertIssue(
        `Deploy monitor misconfigured — VERCEL_TOKEN missing`,
        `The deploy-monitor endpoint received a valid webhook but \`VERCEL_TOKEN\` is not set. Cannot fetch build logs. Set it in Vercel project env.`,
        { alertKey: 'missing_vercel_token', ghPat: process.env.GH_PAT }
      );
      return res.status(500).json({ error: 'VERCEL_TOKEN not configured' });
    }

    console.log(`[deploy-monitor] Fetching build logs for ${deploymentId}...`);
    const logsRes = await fetch(
      `https://api.vercel.com/v2/deployments/${deploymentId}/events?teamId=${TEAM_ID}&direction=backward&limit=100`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );

    let buildErrors = '';
    if (logsRes.ok) {
      const events = await logsRes.json();
      const errorLines = (Array.isArray(events) ? events : [])
        .filter((e) => e.type === 'stderr' || e.type === 'error' ||
          (e.payload?.text && (
            e.payload.text.includes('Error:') ||
            e.payload.text.includes('error') ||
            e.payload.text.includes('failed') ||
            e.payload.text.includes('Module not found') ||
            e.payload.text.includes('Cannot find') ||
            e.payload.text.includes('Unexpected') ||
            e.payload.text.includes('SyntaxError')
          )))
        .map((e) => e.payload?.text || e.text || JSON.stringify(e.payload))
        .slice(-50);
      buildErrors = errorLines.join('\n');
    }

    if (!buildErrors) {
      console.log(`[deploy-monitor] Could not extract build errors for ${deploymentId}`);
      return res.status(200).json({
        action: 'skipped',
        reason: 'Could not extract build errors from deployment logs',
        deploymentId,
        commitSha,
        authMethod,
      });
    }

    console.log(`[deploy-monitor] Build errors extracted (${buildErrors.length} chars). Calling autofix...`);

    // ── Call autofix ──────────────────────────────────────────────────────
    const autofixUrl = `https://${req.headers.host}/api/deploy-autofix`;
    const autofixHeaders = { 'Content-Type': 'application/json' };
    if (process.env.DEPLOY_INTERNAL_SECRET) {
      autofixHeaders['x-internal-secret'] = process.env.DEPLOY_INTERNAL_SECRET;
    }
    const autofixRes = await fetch(autofixUrl, {
      method: 'POST',
      headers: autofixHeaders,
      body: JSON.stringify({
        commitSha,
        commitMessage: commitMsg,
        deploymentId,
        buildErrors,
        attempt: attempts + 1,
      }),
    });

    const autofixResult = await autofixRes.json();
    const duration = Date.now() - startTime;
    console.log(`[deploy-monitor] Autofix result: ${autofixResult.action} (${duration}ms)`);

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
**Model:** ${process.env.AUTOFIX_CLAUDE_MODEL || 'claude-sonnet-4-20250514'}

Vercel is now rebuilding with the fix. You should see a green deployment within ~2 minutes.

Review the change: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${autofixResult.newSha || ''}

If the fix looks wrong, revert it: \`git revert ${newShortSha}\``,
        tag: 'autofix_success',
      });
    }

    // Failure notification — Claude tried but couldnt produce a valid fix
    if (autofixResult.action === 'skipped' || autofixResult.action === 'error') {
      await sendEmailAlert({
        subject: `[Smarter.Poker Autofix] ⚠ Skipped fix for ${commitSha.substring(0, 8)}`,
        markdown: `## Autofix could not repair this build

**Commit:** \`${commitSha}\`
**Message:** ${commitMsg.substring(0, 200)}
**Reason:** ${autofixResult.reason || '(none given)'}
**Action:** ${autofixResult.action}
**Attempt:** ${attempts + 1}/${MAX_FIX_ATTEMPTS}

Build errors (first 500 chars):
\`\`\`
${(buildErrors || '').substring(0, 500)}
\`\`\`

Manual intervention needed. Check the Vercel build: https://vercel.com/smarter-poker/hub-vanguard/deployments`,
        tag: 'autofix_skipped',
      });
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
    console.error('[deploy-monitor] Error:', err);
    // Pipeline-level errors also deserve an alert
    await createAlertIssue(
      `deploy-monitor threw an exception — ${new Date().toISOString().slice(0, 10)}`,
      `The monitor handler threw during webhook processing. Check Vercel runtime logs.\n\nError: \`${err.message || 'unknown'}\`\nStack:\n\`\`\`\n${(err.stack || '').substring(0, 2000)}\n\`\`\``,
      { alertKey: 'monitor_exception', ghPat: process.env.GH_PAT }
    );
    return res.status(500).json({
      error: err.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
