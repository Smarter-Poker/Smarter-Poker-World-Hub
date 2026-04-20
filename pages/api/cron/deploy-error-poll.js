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

// ── Notification helper ──────────────────────────────────────────────────────
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
    console.error(`[deploy-error-poll] Notification failed: ${e.message}`);
  }
}

// ── Extract ALL broken file paths from build logs ────────────────────────────
function extractBrokenFiles(buildErrors) {
  const files = new Set();

  // Module not found: Can't resolve './path/to/file'
  // Then next line: ./pages/some-page.js
  const moduleNotFound = buildErrors.match(/\.\/(pages|src|lib|components|utils|hooks|styles)\/[^\s'",)]+/g);
  if (moduleNotFound) moduleNotFound.forEach(f => files.add(f.replace('./', '')));

  // TypeScript: src/components/Foo.tsx(12,5): error TS2304
  const tsErrors = buildErrors.match(/(pages|src|lib|components)\/[^\s(:]+\.(tsx?|jsx?)/g);
  if (tsErrors) tsErrors.forEach(f => files.add(f));

  return [...files];
}

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

    // ── Step 2: Check if latest deploy is READY or BUILDING ──
    const latestDeploy = deployments[0];
    if (latestDeploy && (latestDeploy.state === 'READY' || latestDeploy.state === 'BUILDING')) {
      // NOTE: QUEUED intentionally NOT included — queued deploys can get CANCELED by Vercel,
      // leaving an ERROR deployment permanently unprocessed. Only skip when confirmed READY/BUILDING.
      // ── Post-fix verification: check if a previous autofix deploy went READY ──
      const latestMsg = latestDeploy.meta?.githubCommitMessage || '';
      if (latestDeploy.state === 'READY' && latestMsg.includes('[autofix]')) {
        // Fire-and-forget — don't block poll response for webhook delivery
        sendNotification({
          title: '✅ Autofix Rebuild Succeeded',
          message: `\`${latestDeploy.meta?.githubCommitSha?.substring(0, 9)}\` is READY — autofix resolved the build error.`,
          color: 'good',
          fields: [
            { title: 'File', value: latestMsg.match(/in (.+?) \(/)?.[1] || 'unknown', short: true },
            { title: 'SHA', value: latestDeploy.meta?.githubCommitSha?.substring(0, 9) || '', short: true },
          ],
        }).catch(() => {});
      }

      return res.status(200).json({
        action: 'ok',
        message: `Latest deploy is ${latestDeploy.state} — no action needed`,
        latestSha: latestDeploy.meta?.githubCommitSha?.substring(0, 9),
      });
    }

    // ── Step 3: Find the LATEST ERROR deployment ──
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
      fixedDeployments.add(deployId);

      // Notify that autofix itself failed — needs manual attention
      await sendNotification({
        title: '⚠️ Autofix Rebuild Failed',
        message: `The autofix commit \`${commitSha.substring(0, 9)}\` itself failed to build. Manual intervention may be needed.`,
        color: 'danger',
        fields: [
          { title: 'Deploy', value: deployId.substring(0, 12), short: true },
          { title: 'SHA', value: commitSha.substring(0, 9), short: true },
        ],
      });

      return res.status(200).json({ action: 'skipped', deployId, reason: 'is an [autofix] commit — skipping to prevent loops' });
    }

    // ── Circuit breaker: check git history ──
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

            await sendNotification({
              title: '🛑 Autofix Circuit Breaker',
              message: `Reached ${MAX_FIX_ATTEMPTS} fix attempts for \`${commitSha.substring(0, 9)}\`. Stopping. Manual fix required.`,
              color: 'danger',
              fields: [{ title: 'Attempts', value: String(autofixCount), short: true }],
            });

            return res.status(200).json({ action: 'circuit_breaker', deployId, commitSha: commitSha.substring(0, 8), attempts: autofixCount });
          }
          // Track attempt count for escalation
          attemptTracker[commitSha] = autofixCount + 1;
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

          // ── SIGKILL/OOM detection ──
          const isSigkill = allLines.some((l) => l.includes('SIGKILL') || l.includes('out of memory') || l.includes('OOM'));
          if (isSigkill) {
            console.log(`[deploy-error-poll] SIGKILL/OOM detected for ${deployId}`);

            await sendNotification({
              title: '💥 Build OOM/SIGKILL',
              message: `Deploy \`${commitSha.substring(0, 9)}\` killed by SIGKILL (out of memory). Not fixable by autofix.`,
              color: 'danger',
              fields: [{ title: 'SHA', value: commitSha.substring(0, 9), short: true }],
            });

            return res.status(200).json({
              action: 'skipped', deployId, commitSha: commitSha.substring(0, 8),
              reason: 'SIGKILL/OOM — infrastructure error, not fixable by code changes.',
            });
          }

          // ── Extract errors with context (±3 lines for better file path capture) ──
          const errorKeywords = [
            'Module not found', 'Cannot find', 'SyntaxError', 'Type error', 'TypeError',
            'Failed to compile', 'Build failed', 'error TS', 'Unexpected token',
            'ReferenceError', 'is not a module', 'does not provide an export',
            'Cannot read properties', 'exited with',
            // TypeScript-specific patterns
            'TS2304', 'TS2305', 'TS2307', 'TS2345', 'TS2322', 'TS2339', 'TS2551',
            'TS7006', 'TS2554', 'TS1005', 'TS1128', 'TS2741',
            'does not exist on type',
          ];
          const includedIndices = new Set();
          allLines.forEach((line, idx) => {
            if (errorKeywords.some((kw) => line.includes(kw)) ||
                /\.\/(pages|src|lib|components)\//.test(line)) {
              // ±3 lines of context (increased from ±2)
              for (let j = Math.max(0, idx - 3); j <= Math.min(allLines.length - 1, idx + 3); j++) {
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
      return res.status(200).json({ action: 'skipped', deployId, reason: 'could not extract build errors from logs (will retry)' });
    }

    // ── Step 5: Extract ALL broken files for multi-file fix ──
    const brokenFiles = extractBrokenFiles(buildErrors);
    const attempt = attemptTracker[commitSha] || 1;

    console.log(`[deploy-error-poll] Found ${brokenFiles.length} broken file(s): ${brokenFiles.join(', ')}`);
    console.log(`[deploy-error-poll] Attempt ${attempt}/${MAX_FIX_ATTEMPTS} for ${commitSha.substring(0, 8)}`);

    // ── Step 6: Call deploy-autofix with escalation context ──
    try {
      const autofixPayload = {
        commitSha,
        deploymentId: deployId,
        buildErrors,
        attempt,
        // Multi-file hint: pass extracted file paths so autofix can fix all at once
        brokenFiles: brokenFiles.length > 0 ? brokenFiles : undefined,
        // Escalation: on attempt 2+, request more aggressive fixes
        escalation: attempt >= 2 ? {
          level: attempt,
          hint: attempt >= 2
            ? 'Previous fix attempt failed. Try a different approach: check if the import target was renamed/moved, or if the file should be deleted entirely.'
            : undefined,
        } : undefined,
      };

      const autofixRes = await fetch('https://smarter.poker/api/deploy-autofix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
        },
        body: JSON.stringify(autofixPayload),
      });

      const autofixResult = await autofixRes.json().catch(() => ({ action: 'parse_error' }));

      // Only permanently mark as fixed if the fix was ACTUALLY pushed
      if (autofixResult.action === 'fixed') {
        fixedDeployments.add(deployId);
        console.log(`[deploy-error-poll] ✅ Fix pushed for ${deployId}`);

        // Notify about the fix
        await sendNotification({
          title: '🔧 Autofix Deployed',
          message: `Claude fixed \`${autofixResult.filePath || autofixResult.file || 'unknown'}\` and pushed to main. Rebuild starting.`,
          color: 'warning',
          fields: [
            { title: 'File(s)', value: autofixResult.filePath || autofixResult.file || 'unknown', short: true },
            { title: 'Attempt', value: `${attempt}/${MAX_FIX_ATTEMPTS}`, short: true },
            { title: 'SHA', value: autofixResult.newCommitSha?.substring(0, 9) || commitSha.substring(0, 9), short: true },
          ],
        });
      } else {
        console.log(`[deploy-error-poll] Autofix returned: ${autofixResult.action} — will retry`);
      }

      return res.status(200).json({
        action: 'processed',
        deployId,
        commitSha: commitSha.substring(0, 8),
        attempt,
        brokenFiles,
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
