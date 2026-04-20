/**
 * /api/sentry/webhook — Universal Sentry Error Receiver
 *
 * Catches EVERY Sentry event (runtime errors, performance issues, crashes)
 * and immediately:
 *   1. Sends SMS alert via Twilio
 *   2. Triggers the deploy-autofix pipeline with full error context
 *   3. Creates a GitHub Issue for tracking
 *
 * SETUP IN SENTRY:
 *   Settings → Developer Settings → Internal Integrations → smarter-poker
 *   → Webhooks → enable "issue" events
 *   → Webhook URL: https://smarter.poker/api/sentry/webhook
 *   → Add header: x-sentry-hook-secret: <SENTRY_WEBHOOK_SECRET>
 *
 * ENV VARS:
 *   SENTRY_WEBHOOK_SECRET  — shared secret from Sentry integration
 *   TWILIO_ACCOUNT_SID     — SMS sender
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER    — "from" number
 *   TWILIO_TO_NUMBER       — your number to receive alerts
 *   GH_PAT                 — GitHub PAT for issue creation
 *   ANTHROPIC_API_KEY      — for auto-fix
 */

import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO  = 'Smarter-Poker-World-Hub';

// ─── Raw body reader ──────────────────────────────────────────────────────────
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── HMAC verification against Sentry webhook secret ─────────────────────────
function verifySignature(rawBody, headerSig, secret) {
  if (!headerSig || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerSig.replace(/^sha256=/, ''), 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch { return false; }
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────
async function sendSmsAlert(message) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  const to    = process.env.TWILIO_TO_NUMBER;
  if (!sid || !token || !from || !to) {
    console.warn('[sentry-webhook] Twilio not configured — skipping SMS');
    return;
  }
  try {
    const body = new URLSearchParams({ From: from, To: to, Body: message.slice(0, 1600) });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) console.error('[sentry-webhook] SMS failed:', await res.text());
    else console.log('[sentry-webhook] SMS sent');
  } catch (e) { console.error('[sentry-webhook] SMS error:', e.message); }
}

// ─── GitHub Issue creation ────────────────────────────────────────────────────
async function createGitHubIssue(title, body) {
  const pat = process.env.GH_PAT;
  if (!pat) return;
  try {
    await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ title, body, labels: ['autofix', 'sentry-error'] }),
    });
  } catch (e) { console.error('[sentry-webhook] GitHub issue failed:', e.message); }
}

// ─── Trigger auto-fix with Anthropic ─────────────────────────────────────────
async function triggerAutofix(issueData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const pat    = process.env.GH_PAT;
  if (!apiKey || !pat) {
    console.warn('[sentry-webhook] ANTHROPIC_API_KEY or GH_PAT missing — skipping autofix');
    return;
  }

  // Build fix prompt
  const errorTitle = issueData.title || 'Unknown Error';
  const errorCulprit = issueData.culprit || '';
  const errorType  = issueData.metadata?.type || '';
  const errorValue = issueData.metadata?.value || '';
  const stacktrace = issueData.exceptions?.[0]?.stacktrace?.frames
    ?.slice(-5)
    .map(f => `  ${f.filename}:${f.lineno} in ${f.function}`)
    .join('\n') || 'No stacktrace available';

  const prompt = `You are an expert Next.js engineer fixing a production runtime error on smarter.poker.

SENTRY ERROR REPORT:
Title: ${errorTitle}
Type: ${errorType}
Value: ${errorValue}
Culprit: ${errorCulprit}

Stack Trace (last 5 frames):
${stacktrace}

GitHub Repo: ${GITHUB_OWNER}/${GITHUB_REPO}

Your task:
1. Use the GitHub API (token: provided) to read the failing file
2. Identify the exact bug causing this runtime error
3. Apply the minimal fix using the GitHub Contents API (create a commit with message "[autofix] sentry: ${errorTitle.slice(0,60)}")
4. Fix only the specific file referenced in the culprit/stacktrace
5. Do NOT refactor unrelated code

Use GitHub API base: https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}
Authorization: token ${pat}

Be surgical. Fix the error. Commit it.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const result = await resp.json();
    console.log('[sentry-webhook] Autofix response:', result?.content?.[0]?.text?.slice(0, 300));
  } catch (e) {
    console.error('[sentry-webhook] Autofix failed:', e.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'Failed to read body' }); }

  // Verify Sentry signature
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  const sigHeader = req.headers['sentry-hook-signature'] || req.headers['x-sentry-hook-secret'];
  if (secret && !verifySignature(rawBody, sigHeader, secret)) {
    console.error('[sentry-webhook] Signature verification FAILED');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

  const action = payload.action;
  const issue  = payload.data?.issue || payload.issue || {};
  const event  = payload.data?.event || {};

  console.log(`[sentry-webhook] Received: action=${action} issue=${issue.id} title=${issue.title}`);

  // We care about ALL error actions: created, triggered, escalating, regression
  const actionsThatNeedFix = ['created', 'triggered', 'escalating', 'regression'];
  if (!actionsThatNeedFix.includes(action)) {
    return res.status(200).json({ ok: true, message: `Ignored action: ${action}` });
  }

  // Acknowledge immediately — Sentry has a 15s timeout
  res.status(200).json({ ok: true, action, issue: issue.id });

  // ── Async handling after response sent ────────────────────────────────────
  const errorTitle  = issue.title || event.title || 'Unknown Error';
  const errorType   = issue.metadata?.type || issue.type || '';
  const errorValue  = issue.metadata?.value || '';
  const culprit     = issue.culprit || event.culprit || '';
  const sentryUrl   = issue.permalink || `https://smarter-software-inc.sentry.io/issues/${issue.id}/`;
  const level       = issue.level || 'error';
  const project     = issue.project?.slug || 'unknown';

  const smsMessage = `🚨 Smarter.Poker ${level.toUpperCase()} [${project}]\n${errorTitle}\nCulprit: ${culprit}\n${sentryUrl}`;

  // Fire all three in parallel
  await Promise.allSettled([
    sendSmsAlert(smsMessage),
    createGitHubIssue(
      `[autofix] ${errorTitle}`,
      `## Sentry Runtime Error\n\n**Action:** ${action}\n**Level:** ${level}\n**Culprit:** \`${culprit}\`\n**Type:** \`${errorType}\`\n**Value:** \`${errorValue}\`\n\n[View in Sentry](${sentryUrl})\n\n---\n*Auto-detected by Sentry webhook receiver*`
    ),
    triggerAutofix({
      title: errorTitle,
      culprit,
      metadata: { type: errorType, value: errorValue },
      exceptions: event.exception?.values || [],
    }),
  ]);

  console.log(`[sentry-webhook] Handled: ${errorTitle}`);
}
