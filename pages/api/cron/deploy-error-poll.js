/**
 * /api/cron/deploy-error-poll — Autopilot Deployment Error Poller v3
 *
 * Runs every 2 minutes via Open Claw. Polls the Vercel Deployments API for
 * recent ERROR deployments and triggers the autofix pipeline.
 *
 * v3 IMPROVEMENTS:
 *   1. 2-minute polling (was 5 min)
 *   2. Multi-file error extraction — finds ALL broken files in one cycle
 *   3. Post-fix verification — checks if autofix rebuild went READY
 *   4. Slack/Discord webhook notification when autofix fires
 *   5. TypeScript error pattern support (error TS*, type errors)
 *   6. Attempt escalation — passes attempt number + extra context on retries
 *   7. SIGKILL/OOM skip, circuit breaker, [autofix] loop prevention
 *   8. Only dedup on successful fix — retries failures
 */

import { sendSMS } from '../../../src/lib/commander/twilio';

export const config = {
  maxDuration: 60,
};

const TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc';
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO = 'Smarter-Poker-World-Hub';
const MAX_FIX_ATTEMPTS = 3;

// Best-effort dedup — resets on serverless cold start.
// The circuit breaker (git history check at Step 3) is the authoritative guard.
const fixedDeployments = new Set();
// Track attempt counts per commit SHA (for escalation) — also best-effort.
const attemptTracker = {};

// ── Supabase coordination helpers ────────────────────────────────────────────
// OpenClaw participates in the shared kill-switch, daily budget cap, and
// per-commit dedup table alongside the Hetzner poll.mjs poller. Writing to
// autofix_attempts prevents the Hetzner poller from opening a competing PR
// for the same deploy (especially OOM bumps that we already know won't work).
async function sbFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const abort = new AbortController();
  const t = setTimeout(() => abort.abort(), 5000);
  try {
    return await fetch(`${url}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...options.headers,
      },
      signal: abort.signal,
    });
  } catch { return null; } finally { clearTimeout(t); }
}

async function isAutofixPaused() {
  try {
    const res = await sbFetch('/rest/v1/rpc/autofix_is_paused', { method: 'POST', body: '{}' });
    if (!res?.ok) return false;
    return await res.json(); // boolean
  } catch { return false; }
}




async function alreadyAttemptedInSupa(commitSha) {
  try {
    const res = await sbFetch(
      `/rest/v1/autofix_attempts?select=id&commit_sha=eq.${encodeURIComponent(commitSha)}&status=in.(running,pr_opened,merged,skipped_unfixable)`,
      { method: 'GET' }
    );
    if (!res?.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

// Returns the row id so the caller can update the status after autofix completes.
async function recordAttempt({ deployId, commitSha, strategy, confidence, status, metadata }) {
  try {
    // Generate ID client-side — poll.mjs always provides it, so the table
    // may not have gen_random_uuid() as a DEFAULT. Safe to provide even if DEFAULT exists.
    const id = crypto.randomUUID();
    const res = await sbFetch('/rest/v1/autofix_attempts', {
      method: 'POST',
      headers: { Prefer: 'return=representation', Accept: 'application/json' },
      body: JSON.stringify({
        id,
        source: 'vercel_openclaw',
        deployment_id: deployId,
        commit_sha: commitSha,
        repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        strategy: strategy || 'generic',
        confidence: confidence || 'medium',
        status,
        metadata: metadata || {},
      }),
    });
    // Return the id whether or not the response parsed correctly
    return id;
  } catch (e) {
    console.warn(`[deploy-error-poll] recordAttempt failed: ${e.message}`);
    return null;
  }
}

// Update the status of a recorded attempt by id.
// Used to flip 'running' → 'failed' when autofix doesn't succeed,
// so the Hetzner poller isn't permanently blocked by a stale 'running' row.
async function updateAttemptStatus(id, status) {
  if (!id) return;
  try {
    await sbFetch(`/rest/v1/autofix_attempts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status }),
    });
  } catch (e) {
    console.warn(`[deploy-error-poll] updateAttemptStatus failed: ${e.message}`);
  }
}

// ── Notification helper ──────────────────────────────────────────────────────
async function sendErrorSMS(title, message) {
  const adminPhone = process.env.MY_PHONE_NUMBER || process.env.ADMIN_PHONE;
  if (!adminPhone) return;
  const body = `🚨 SMARTER.POKER ALERT 🚨\n\n${title}\n${message}`;
  await sendSMS(adminPhone, body).catch(e => console.warn('[deploy-error-poll] SMS failed:', e));
}

async function sendNotification({ title, message, color, fields }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    if (webhookUrl.includes('discord.com')) {
      // Discord webhook format
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title,
            description: message,
            color: color === 'good' ? 0x00ff00 : color === 'danger' ? 0xff0000 : 0xffaa00,
            fields: fields?.map(f => ({ name: f.title, value: f.value, inline: true })) || [],
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    } else {
      // Slack webhook format
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [{
            color,
            title,
            text: message,
            fields: fields || [],
            ts: Math.floor(Date.now() / 1000),
          }],
        }),
      });
    }
  } catch (e) {
    console.warn(`[deploy-error-poll] Notification failed: ${e.message}`);
  }
}

// ── Extract ALL broken file paths from build logs ────────────────────────────
function extractBrokenFiles(buildErrors) {
  const files = new Set();

  // Module not found: Can't resolve './path/to/file.js'
  // MUST end with a recognized extension — otherwise module names like
  // 'lib/does-not-exist-for-autofix-test' are falsely matched as file paths.
  const moduleNotFound = buildErrors.match(/\.\/(pages|src|lib|components|utils|hooks|styles|services|data)\/[\w./\-\[\]]+\.(jsx?|tsx?|mjs|cjs)/g);
  if (moduleNotFound) moduleNotFound.forEach(f => files.add(f.replace('./', '')));

  // TypeScript: src/components/Foo.tsx(12,5): error TS2304
  // Also covers utils/ and hooks/ directories
  const tsErrors = buildErrors.match(/(pages|src|lib|components|utils|hooks|services|data)\/[^\s(:]+\.(tsx?|jsx?)/g);
  if (tsErrors) tsErrors.forEach(f => files.add(f));

  return [...files];
}

export default async function handler(req, res) {
  // ── AUTOFIX DISABLED ──
  // Per user request, the automated deployment fix pipeline is permanently disabled
  // to prevent LLM hallucinations from corrupting production files.
  return res.status(200).json({ status: 'skipped', message: 'Autofix pipeline disabled manually.' });
}
