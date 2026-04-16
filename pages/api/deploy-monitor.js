/**
 * /api/deploy-monitor — Self-Healing Deployment Monitor
 *
 * Receives Vercel deployment webhooks. When a deployment fails (ERROR state),
 * it fetches the build logs, identifies the error, and triggers an automatic
 * fix via the Anthropic API + GitHub Contents API.
 *
 * WEBHOOK SETUP:
 *   Vercel Dashboard → Project Settings → Git → Deploy Hooks... NO.
 *   Vercel Dashboard → Account Settings → Webhooks → Add:
 *     URL: https://smarter.poker/api/deploy-monitor
 *     Events: deployment.error, deployment.canceled
 *     Secret: (set DEPLOY_WEBHOOK_SECRET in env)
 *
 * ENV VARS REQUIRED:
 *   VERCEL_TOKEN          — Vercel API token (already in .env.local)
 *   GH_PAT                — GitHub PAT for pushing fixes (already in .env.local)
 *   ANTHROPIC_API_KEY     — Claude API key for generating fixes
 *   DEPLOY_WEBHOOK_SECRET — Vercel webhook signing secret (optional but recommended)
 *
 * CIRCUIT BREAKER:
 *   Max 3 auto-fix attempts per commit SHA. After that, it stops and logs
 *   the failure for manual intervention. Prevents infinite fix loops.
 */

// In-memory circuit breaker (resets on cold start, which is fine —
// Vercel functions cold-start frequently enough)
const fixAttempts = new Map();
const MAX_FIX_ATTEMPTS = 3;
const TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc';
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';

/**
 * Create a GitHub Issue to alert about autofix failures.
 * Non-blocking — errors are caught silently so the main flow continues.
 */
async function createAlertIssue(title, body) {
  const ghPat = process.env.GH_PAT;
  if (!ghPat) return;

  try {
    // Check for existing open autofix-failure issue to avoid duplicates
    const searchRes = await fetch(
      'https://api.github.com/repos/Smarter-Poker/Smarter-Poker-World-Hub/issues?labels=autofix-failure&state=open&per_page=1',
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
    );

    if (searchRes.ok) {
      const existing = await searchRes.json();
      if (existing.length > 0) {
        // Add comment to existing issue instead of creating a new one
        await fetch(
          `https://api.github.com/repos/Smarter-Poker/Smarter-Poker-World-Hub/issues/${existing[0].number}/comments`,
          {
            method: 'POST',
            headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          }
        );
        console.log(`[deploy-monitor] Alert added as comment to issue #${existing[0].number}`);
        return;
      }
    }

    // Create new issue
    await fetch(
      'https://api.github.com/repos/Smarter-Poker/Smarter-Poker-World-Hub/issues',
      {
        method: 'POST',
        headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          labels: ['autofix-failure'],
        }),
      }
    );
    console.log('[deploy-monitor] Alert issue created on GitHub');
  } catch (err) {
    console.error('[deploy-monitor] Failed to create alert issue:', err.message);
  }
}

export default async function handler(req, res) {
  // Only accept POST (webhook) and GET (status check)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'deploy-monitor',
      description: 'Self-healing deployment monitor. Receives Vercel webhooks on deployment failure, auto-fixes via Anthropic API + GitHub API.',
      activeCircuitBreakers: fixAttempts.size,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const payload = req.body;

    // ── Validate webhook payload ──
    if (!payload || !payload.type) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // ── Verify webhook signature (if DEPLOY_WEBHOOK_SECRET is set) ──
    // NOTE: Vercel signs the raw request body bytes. Next.js auto-parses the body
    // before our handler sees it, so we CANNOT reliably re-create the original bytes.
    // Instead of HMAC verification (which would always mismatch), we use a shared
    // secret as a bearer token in a custom header set during webhook creation.
    // Vercel webhooks don't support custom headers natively, so we rely on the
    // x-vercel-signature approach only when we can access raw body, or use a
    // URL-based secret: /api/deploy-monitor?secret=XXX
    const webhookSecret = process.env.DEPLOY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSecret = req.query?.secret || req.headers['x-webhook-secret'];
      if (providedSecret !== webhookSecret) {
        console.log('[deploy-monitor] Invalid or missing webhook secret');
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    // We only care about deployment failures
    const eventType = payload.type;
    if (eventType !== 'deployment.error' && eventType !== 'deployment.canceled') {
      return res.status(200).json({
        action: 'ignored',
        reason: `Event type ${eventType} is not a failure — no action needed`
      });
    }

    const deployment = payload.payload?.deployment || payload.payload || {};
    const deploymentId = deployment.id || deployment.uid || 'unknown';
    const projectId = deployment.projectId || payload.payload?.projectId || 'unknown';
    const commitSha = deployment.meta?.githubCommitSha || 'unknown';
    const commitMsg = deployment.meta?.githubCommitMessage || '';
    const state = deployment.state || deployment.readyState || eventType;

    console.log(`[deploy-monitor] Received ${eventType} for deployment ${deploymentId} (project: ${projectId}, SHA: ${commitSha})`);

    // ── Project filter: only process hub-vanguard deployments ──
    // The webhook fires at the account level for ALL projects. Without this
    // filter, a failure in any other project would trigger autofix against
    // the World Hub repo — corrupting it with unrelated "fixes".
    if (projectId !== PROJECT_ID && projectId !== 'unknown') {
      console.log(`[deploy-monitor] Ignoring deployment from project ${projectId} (not hub-vanguard)`);
      return res.status(200).json({
        action: 'ignored',
        reason: `Deployment belongs to project ${projectId}, not hub-vanguard (${PROJECT_ID})`,
      });
    }

    // ── Hard stop: never auto-fix an [autofix] commit ──
    // This prevents infinite loops even across cold starts where the in-memory
    // circuit breaker has been reset. If autofix broke it, a human must fix it.
    if (commitMsg.startsWith('[autofix]')) {
      console.log(`[deploy-monitor] Refusing to auto-fix an [autofix] commit: ${commitSha}`);
      // Alert: an autofix commit failed — the pipeline's own fix broke the build
      createAlertIssue(
        `Autofix commit failed to build — ${commitSha.substring(0, 8)}`,
        `## Autofix Commit Failed\n\nAn \`[autofix]\` commit itself failed to build. This means the AI-generated fix introduced a new error.\n\n**Commit SHA:** \`${commitSha}\`\n**Commit message:** ${commitMsg.substring(0, 200)}\n**Deployment:** ${deploymentId}\n\nManual intervention required. The self-healing pipeline will NOT retry this commit.`
      );
      return res.status(200).json({
        action: 'refused',
        reason: 'Will not auto-fix an [autofix] commit — prevents infinite loops. Manual intervention required.',
        commitSha,
      });
    }

    // ── Circuit breaker: don't fix the same commit more than 3 times ──
    const attempts = fixAttempts.get(commitSha) || 0;
    if (attempts >= MAX_FIX_ATTEMPTS) {
      console.log(`[deploy-monitor] Circuit breaker: ${commitSha} has ${attempts} fix attempts. Stopping.`);
      // Alert: circuit breaker tripped — autofix exhausted all attempts
      createAlertIssue(
        `Deploy autofix circuit breaker tripped — ${commitSha.substring(0, 8)}`,
        `## Circuit Breaker Tripped\n\nAutofix exhausted all ${MAX_FIX_ATTEMPTS} attempts for commit \`${commitSha}\` without successfully fixing the build.\n\n**Commit SHA:** \`${commitSha}\`\n**Commit message:** ${commitMsg.substring(0, 200)}\n**Attempts:** ${attempts}/${MAX_FIX_ATTEMPTS}\n\nManual intervention required. Check Vercel build logs:\nhttps://vercel.com/smarter-poker/hub-vanguard/deployments`
      );
      return res.status(200).json({
        action: 'circuit_breaker',
        commitSha,
        attempts,
        message: `Auto-fix stopped after ${MAX_FIX_ATTEMPTS} attempts. Manual intervention required.`,
      });
    }

    // CANCELED deployments don't need fixing — they were superseded by a newer push
    if (eventType === 'deployment.canceled' || state === 'CANCELED') {
      return res.status(200).json({
        action: 'ignored',
        reason: 'CANCELED deployments are superseded builds — no fix needed',
        commitSha,
      });
    }

    // ── Fetch build logs from Vercel ──
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.error('[deploy-monitor] Missing VERCEL_TOKEN env var');
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
      // Extract error lines from build output
      const errorLines = (Array.isArray(events) ? events : [])
        .filter(e => e.type === 'stderr' || e.type === 'error' ||
                     (e.payload?.text && (
                       e.payload.text.includes('Error:') ||
                       e.payload.text.includes('error') ||
                       e.payload.text.includes('failed') ||
                       e.payload.text.includes('Module not found') ||
                       e.payload.text.includes('Cannot find') ||
                       e.payload.text.includes('Unexpected') ||
                       e.payload.text.includes('SyntaxError')
                     )))
        .map(e => e.payload?.text || e.text || JSON.stringify(e.payload))
        .slice(-50); // Last 50 error lines

      buildErrors = errorLines.join('\n');
    } else {
      // Fallback: try the build logs endpoint
      const buildLogsRes = await fetch(
        `https://api.vercel.com/v2/deployments/${deploymentId}/events?teamId=${TEAM_ID}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } }
      );
      if (buildLogsRes.ok) {
        const allEvents = await buildLogsRes.json();
        buildErrors = (Array.isArray(allEvents) ? allEvents : [])
          .map(e => e.payload?.text || '')
          .filter(t => t.includes('Error') || t.includes('error') ||
                       t.includes('failed') || t.includes('Module not found') ||
                       t.includes('Cannot find') || t.includes('Unexpected') ||
                       t.includes('SyntaxError'))
          .slice(-50)
          .join('\n');
      }
    }

    if (!buildErrors) {
      console.log(`[deploy-monitor] Could not extract build errors for ${deploymentId}`);
      return res.status(200).json({
        action: 'skipped',
        reason: 'Could not extract build errors from deployment logs',
        deploymentId,
        commitSha,
      });
    }

    console.log(`[deploy-monitor] Build errors extracted (${buildErrors.length} chars). Calling autofix...`);

    // ── Atomically increment the circuit breaker BEFORE calling autofix ──
    // This prevents race conditions where two simultaneous webhooks for the
    // same SHA both read 0 attempts and both proceed.
    const currentAttempt = attempts + 1;
    fixAttempts.set(commitSha, currentAttempt);

    // ── Call the autofix endpoint ──
    const autofixUrl = `https://${req.headers.host}/api/deploy-autofix`;
    const autofixHeaders = { 'Content-Type': 'application/json' };
    // Pass internal secret if configured
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
        attempt: currentAttempt,
      }),
    });

    const autofixResult = await autofixRes.json();

    const duration = Date.now() - startTime;
    console.log(`[deploy-monitor] Autofix result: ${autofixResult.action} (${duration}ms)`);

    return res.status(200).json({
      action: autofixResult.action || 'autofix_attempted',
      commitSha,
      attempt: currentAttempt,
      maxAttempts: MAX_FIX_ATTEMPTS,
      autofixResult,
      durationMs: duration,
    });

  } catch (err) {
    console.error('[deploy-monitor] Error:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
