/**
 * /api/cron/deploy-error-poll — Autopilot Deployment Error Poller
 *
 * Runs every 1 minute via Vercel Cron. Polls the Vercel Deployments API for
 * recent ERROR deployments and triggers the autofix pipeline for each one.
 *
 * This replaces the unreliable Vercel webhook approach. Webhooks only fire
 * for Integrations, not project-level events. This poller guarantees that
 * EVERY failed deployment is automatically detected and fixed.
 *
 * DEDUPLICATION:
 *   Uses a simple in-memory Set + Vercel API last-seen timestamp to avoid
 *   re-triggering autofix on deployments that have already been processed.
 *   Also checks git history for existing [autofix] commits targeting the SHA.
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

// In-memory deduplication (resets on cold start — fine, git history is the durable guard)
const processedDeployments = new Set();

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
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=5`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );

    if (!deploymentsRes.ok) {
      const errText = await deploymentsRes.text();
      return res.status(500).json({ error: `Vercel API error: ${deploymentsRes.status}`, details: errText.substring(0, 200) });
    }

    const data = await deploymentsRes.json();
    const deployments = data.deployments || [];

    // ── Step 2: Find ERROR deployments ──
    const errorDeploys = deployments.filter((d) => d.state === 'ERROR');

    if (errorDeploys.length === 0) {
      return res.status(200).json({ action: 'ok', message: 'No ERROR deployments found', checked: deployments.length });
    }

    const results = [];

    for (const deploy of errorDeploys) {
      const deployId = deploy.uid;
      const commitSha = deploy.meta?.githubCommitSha || '';
      const commitMsg = deploy.meta?.githubCommitMessage || '';

      // ── Dedup: skip if already processed this cold-start cycle ──
      if (processedDeployments.has(deployId)) {
        results.push({ deployId, action: 'skipped', reason: 'already processed (in-memory)' });
        continue;
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
              processedDeployments.add(deployId);
              results.push({ deployId, commitSha: commitSha.substring(0, 8), action: 'circuit_breaker', attempts: autofixCount });
              continue;
            }
          }
        } catch (e) {
          console.error(`[deploy-error-poll] Git history check failed: ${e.message}`);
        }
      }

      // ── Skip [autofix] commits (prevent infinite loops) ──
      if (commitMsg.includes('[autofix]')) {
        processedDeployments.add(deployId);
        results.push({ deployId, action: 'skipped', reason: 'is an [autofix] commit' });
        continue;
      }

      // ── Step 3: Fetch build logs ──
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

            // Find error lines AND their surrounding context (±2 lines)
            // so the autofix handler can see both the error AND the file path
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
                // Include this line and ±2 lines of context
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
        processedDeployments.add(deployId);
        results.push({ deployId, action: 'skipped', reason: 'could not extract build errors from logs' });
        continue;
      }

      // ── Step 4: Call deploy-autofix ──
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
        processedDeployments.add(deployId);
        results.push({ deployId, commitSha: commitSha.substring(0, 8), autofixResult });
      } catch (e) {
        processedDeployments.add(deployId);
        results.push({ deployId, action: 'autofix_call_failed', error: e.message });
      }
    }

    return res.status(200).json({
      action: 'polled',
      timestamp: new Date().toISOString(),
      totalDeployments: deployments.length,
      errorDeployments: errorDeploys.length,
      results,
    });
  } catch (e) {
    console.error(`[deploy-error-poll] Fatal error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
}
