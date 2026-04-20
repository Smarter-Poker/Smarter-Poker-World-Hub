/**
 * /api/cron/deploy-error-poll — Autopilot Deployment Error Poller v2
 *
 * Runs every 5 minutes via Open Claw. Polls the Vercel Deployments API for
 * recent ERROR deployments and triggers the autofix pipeline for each one.
 *
 * KEY BEHAVIORS:
 *   1. Only processes the LATEST ERROR deployment (newest = most relevant)
 *   2. Skips SIGKILL/OOM errors (not fixable by code changes)
 *   3. Skips [autofix] commits (prevents infinite loops)
 *   4. Skips if a READY or BUILDING deploy exists that is NEWER than the error
 *   5. Circuit breaker: max 3 autofix attempts per broken SHA
 *   6. Only permanently dedup on successful fix — retries on failure
 *
 * ENV VARS:
 *   VERCEL_TOKEN          — Vercel API token (fetch deployments)
 *   DEPLOY_INTERNAL_SECRET — Internal secret for calling deploy-autofix
 *   CRON_SECRET            — Vercel cron auth (optional)
 */

export const config = {
  maxDuration: 60,
};

const TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc';
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO = 'Smarter-Poker-World-Hub';
const MAX_FIX_ATTEMPTS = 3;

// Only dedup deployments that were SUCCESSFULLY fixed (pushed to main)
// Failed/skipped deployments are retried on the next cycle
const fixedDeployments = new Set();

export default async function handler(req, res) {
  // Vercel cron auth
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const vercelToken = process.env.VERCEL_TOKEN;
  const internalSecret = process.env.DEPLOY_INTERNAL_SECRET;
  const ghPat = process.env.GH_PAT;

  if (!vercelToken) {
    return res.status(500).json({ error: 'VERCEL_TOKEN not configured' });
  }

  try {
    // ── Step 1: Fetch recent deployments ──
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=10`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );

    if (!deploymentsRes.ok) {
      const errText = await deploymentsRes.text();
      return res.status(500).json({ error: `Vercel API error: ${deploymentsRes.status}`, details: errText.substring(0, 200) });
    }

    const data = await deploymentsRes.json();
    const deployments = data.deployments || [];

    // ── Step 2: Check if the LATEST deploy is READY or BUILDING ──
    // If a newer deploy is already READY or BUILDING, the ERROR deploys are superseded
    const latestDeploy = deployments[0];
    if (latestDeploy && (latestDeploy.state === 'READY' || latestDeploy.state === 'BUILDING')) {
      return res.status(200).json({
        action: 'ok',
        message: `Latest deploy ${latestDeploy.uid} is ${latestDeploy.state} — no action needed`,
        latestSha: latestDeploy.meta?.githubCommitSha?.substring(0, 9),
      });
    }

    // ── Step 3: Find the LATEST ERROR deployment (most relevant) ──
    const latestError = deployments.find((d) => d.state === 'ERROR');

    if (!latestError) {
      return res.status(200).json({ action: 'ok', message: 'No ERROR deployments found', checked: deployments.length });
    }

    const deployId = latestError.uid;
    const commitSha = latestError.meta?.githubCommitSha || '';
    const commitMsg = latestError.meta?.githubCommitMessage || '';

    // ── Dedup: skip if we already FIXED this deployment ──
    if (fixedDeployments.has(deployId)) {
      return res.status(200).json({ action: 'skipped', deployId, reason: 'already fixed (in-memory)' });
    }

    // ── Skip [autofix] commits (prevent infinite loops) ──
    if (commitMsg.includes('[autofix]')) {
      fixedDeployments.add(deployId); // Don't retry autofix commits
      return res.status(200).json({ action: 'skipped', deployId, reason: 'is an [autofix] commit — skipping to prevent loops' });
    }

    // ── Circuit breaker: check git history for [autofix] commits ──
    if (ghPat && commitSha) {
      try {
        const commitsRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=main&per_page=20`,
          { headers: { Authorization: `Bearer ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          const autofixCount = commits.filter(
            (c) => c.commit?.message?.includes('[autofix]') && c.commit?.message?.includes(commitSha.substring(0, 7))
          ).length;
          if (autofixCount >= MAX_FIX_ATTEMPTS) {
            fixedDeployments.add(deployId);
            return res.status(200).json({ action: 'circuit_breaker', deployId, commitSha: commitSha.substring(0, 8), attempts: autofixCount });
          }
        }
      } catch (e) {
        console.error(`[deploy-error-poll] Git history check failed: ${e.message}`);
      }
    }

    // ── Step 4: Fetch build logs ──
    console.log(`[deploy-error-poll] Processing ERROR deployment ${deployId} (${commitSha.substring(0, 8)})`);

    let buildErrors = '';
    try {
      const logsRes = await fetch(
        `https://api.vercel.com/v2/deployments/${deployId}/events?teamId=${TEAM_ID}&direction=backward&limit=500`,
        { headers: { Authorization: `Bearer ${vercelToken}` } }
      );
      if (logsRes.ok) {
        const events = await logsRes.json();
        if (Array.isArray(events)) {
          const allLines = events
            .map((e) => e.payload?.text || e.text || '')
            .filter(Boolean);

          // ── SIGKILL/OOM detection: these are infrastructure errors, not code errors ──
          const isSigkill = allLines.some((l) => l.includes('SIGKILL') || l.includes('out of memory') || l.includes('OOM'));
          if (isSigkill) {
            // Don't permanently dedup — SIGKILL may resolve on retry (transient memory pressure)
            console.log(`[deploy-error-poll] SIGKILL/OOM detected for ${deployId} — not fixable by code changes`);
            return res.status(200).json({
              action: 'skipped',
              deployId,
              commitSha: commitSha.substring(0, 8),
              reason: 'SIGKILL/OOM — infrastructure error, not fixable by code changes. Will retry if no newer deploy supersedes.',
            });
          }

          // Find error lines AND their surrounding context (±2 lines)
          const errorKeywords = [
            'Module not found', 'Cannot find', 'SyntaxError', 'Type error', 'TypeError',
            'Failed to compile', 'Build failed', 'error TS', 'Unexpected token',
            'ReferenceError', 'is not a module', 'does not provide an export',
            'Cannot read properties', 'exited with', 'Error:'
          ];
          const includedIndices = new Set();
          allLines.forEach((line, idx) => {
            if (errorKeywords.some((kw) => line.includes(kw)) ||
                /\.\/(pages|src|lib|components)\//.test(line)) {
              for (let j = Math.max(0, idx - 2); j <= Math.min(allLines.length - 1, idx + 2); j++) {
                includedIndices.add(j);
              }
            }
          });
          const contextLines = [...includedIndices].sort((a, b) => a - b).map((i) => allLines[i]);
          buildErrors = contextLines.join('\n');
        }
      }
    } catch (e) {
      console.error(`[deploy-error-poll] Log fetch failed for ${deployId}: ${e.message}`);
    }

    if (!buildErrors) {
      // Don't dedup — maybe logs weren't ready yet, retry next cycle
      return res.status(200).json({ action: 'skipped', deployId, reason: 'could not extract build errors from logs (will retry)' });
    }

    // ── Step 5: Call deploy-autofix ──
    console.log(`[deploy-error-poll] Triggering autofix for ${deployId} — errors: ${buildErrors.substring(0, 100)}...`);

    try {
      const autofixUrl = `https://smarter.poker/api/deploy-autofix`;
      const autofixRes = await fetch(autofixUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
        },
        body: JSON.stringify({
          commitSha,
          deploymentId: deployId,
          buildErrors,
          attempt: 1,
        }),
      });

      const autofixResult = await autofixRes.json().catch(() => ({ action: 'parse_error' }));

      // Only permanently mark as fixed if the fix was ACTUALLY pushed
      if (autofixResult.action === 'fixed') {
        fixedDeployments.add(deployId);
        console.log(`[deploy-error-poll] ✅ Fix pushed for ${deployId}`);
      } else {
        // Don't dedup — allow retry on next cycle
        console.log(`[deploy-error-poll] Autofix returned: ${autofixResult.action} — will retry if error persists`);
      }

      return res.status(200).json({
        action: 'processed',
        deployId,
        commitSha: commitSha.substring(0, 8),
        autofixResult,
      });
    } catch (e) {
      console.error(`[deploy-error-poll] Autofix call failed: ${e.message}`);
      return res.status(200).json({ action: 'autofix_call_failed', deployId, error: e.message });
    }
  } catch (e) {
    console.error(`[deploy-error-poll] Fatal error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
}
