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
    console.error(`[deploy-error-poll] recordAttempt failed: ${e.message}`);
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
    console.error(`[deploy-error-poll] updateAttemptStatus failed: ${e.message}`);
  }
}

// ── Notification helper ──────────────────────────────────────────────────────
async function sendErrorSMS(title, message) {
  const adminPhone = process.env.MY_PHONE_NUMBER || process.env.ADMIN_PHONE;
  if (!adminPhone) return;
  const body = `🚨 SMARTER.POKER ALERT 🚨\n\n${title}\n${message}`;
  await sendSMS(adminPhone, body).catch(e => console.error('[deploy-error-poll] SMS failed:', e));
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
    console.error(`[deploy-error-poll] Notification failed: ${e.message}`);
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

  // ── Supabase kill-switch ──
  // Shared emergency stop with the Hetzner poll.mjs poller.
  // Flip autofix_config.paused=true in Supabase to halt both loops without SSH.
  const paused = await isAutofixPaused();
  if (paused) {
    console.log('[deploy-error-poll] Autofix globally paused via autofix_config — exiting');
    return res.status(200).json({ action: 'paused', message: 'Autofix is globally paused via kill-switch' });
  }
  // NOTE: Anthropic billing/credit exhaustion is detected in deploy-autofix.js
  // directly from the API response (402, credit-related error body).
  // When detected there, an SMS is sent immediately and Grok takes over as fallback.

  try {
    // 10s timeout on Step 1 Vercel deployments fetch — prevents hanging the whole
    // 60s function budget while waiting on a slow Vercel API.
    const step1Abort = new AbortController();
    const step1Timeout = setTimeout(() => step1Abort.abort(), 10000);
    let deploymentsRes;
    try {
      deploymentsRes = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=25`,
        { headers: { Authorization: `Bearer ${vercelToken}` }, signal: step1Abort.signal }
      );
    } finally {
      clearTimeout(step1Timeout);
    }

    if (!deploymentsRes.ok) {
      const errText = await deploymentsRes.text();
      return res.status(500).json({ error: `Vercel API error: ${deploymentsRes.status}`, details: errText.substring(0, 200) });
    }

    const data = await deploymentsRes.json();
    const allDeployments = data.deployments || [];

    // ── Step 1b: Auto-cancel stale, hung, and redundant builds ──
    const nowMs = Date.now();

    // 1. Stale Preview Queue: Cancel QUEUED preview branches >5m old (they clog concurrency)
    const stalePreviewQueued = allDeployments.filter(d => {
      const branch = d.meta?.githubCommitRef || '';
      return d.state === 'QUEUED' && branch !== 'main' && (nowMs - d.createdAt) > 5 * 60 * 1000;
    });

    // 2. Hung Builds: Cancel ANY build (main or preview) stuck BUILDING for >15m
    const hungBuilds = allDeployments.filter(d =>
      d.state === 'BUILDING' && (nowMs - d.createdAt) > 15 * 60 * 1000
    );

    // 3. Redundant Main Queue: Keep only the NEWEST queued main build, cancel the rest
    const mainQueued = allDeployments.filter(d => d.state === 'QUEUED' && (d.meta?.githubCommitRef || '') === 'main');
    mainQueued.sort((a, b) => b.createdAt - a.createdAt); // newest first
    const redundantMainQueued = mainQueued.slice(1);

    const buildsToCancel = [...stalePreviewQueued, ...hungBuilds, ...redundantMainQueued];
    const uniqueToCancel = [...new Map(buildsToCancel.map(item => [item.uid, item])).values()];
    // Track which UIDs were actually canceled so we exclude them from the
    // newerBuilding guard below — otherwise a just-canceled BUILDING build
    // still appears BUILDING in our in-memory array and causes a 1-cycle skip.
    const canceledUids = new Set();

    // Cancel ALL stale builds in PARALLEL — sequential await adds N×1s latency
    await Promise.all(uniqueToCancel.map(async (stale) => {
      try {
        await fetch(`https://api.vercel.com/v12/deployments/${stale.uid}/cancel?teamId=${TEAM_ID}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${vercelToken}` },
        });
        canceledUids.add(stale.uid);
        const reason = stale.state === 'BUILDING' ? 'Hung >15m' : (stale.meta?.githubCommitRef === 'main' ? 'Redundant Queue' : 'Preview >5m');
        console.log(`[deploy-error-poll] Cancelled ${stale.state} build ${stale.uid} (${reason}, branch: ${stale.meta?.githubCommitRef})`);
      } catch (e) {
        console.error(`[deploy-error-poll] Failed to cancel ${stale.uid}: ${e.message}`);
      }
    }));

    // CRITICAL: Filter to main branch only. Preview branch deploys (sentry-autofix/,
    // fix/, feature/) must not affect production error detection. Without this filter,
    // a BUILDING preview deploy masks a main branch ERROR behind it.
    const deployments = allDeployments.filter(
      (d) => (d.meta?.githubCommitRef || '') === 'main'
    );

    if (deployments.length === 0) {
      return res.status(200).json({ action: 'ok', message: 'No main branch deployments in recent history', checked: allDeployments.length });
    }

    // ── Step 2: Short-circuit ONLY if the latest ACTIONABLE main deploy is READY ──
    // QUEUED = not yet started (not a health signal).
    // CANCELED = dropped (not a health signal).
    // Only READY = healthy. BUILDING = may go ERROR later. ERROR = act on it.
    const latestActionable = deployments.find(
      (d) => d.state === 'READY' || d.state === 'ERROR' || d.state === 'BUILDING'
    );
    if (latestActionable && latestActionable.state === 'READY') {
      // ── Post-fix verification: check if a previous autofix deploy went READY ──
      const latestMsg = latestActionable.meta?.githubCommitMessage || '';
      if (latestMsg.includes('[autofix]')) {
        // Fire-and-forget — don't block poll response for webhook delivery
        sendNotification({
          title: '✅ Autofix Rebuild Succeeded',
          message: `\`${latestActionable.meta?.githubCommitSha?.substring(0, 9)}\` is READY — autofix resolved the build error.`,
          color: 'good',
          fields: [
            { title: 'File', value: latestMsg.match(/in (.+?) \(/)?.[1] || 'unknown', short: true },
            { title: 'SHA', value: latestActionable.meta?.githubCommitSha?.substring(0, 9) || '', short: true },
          ],
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }

      return res.status(200).json({
        action: 'ok',
        message: 'Latest actionable deploy is READY — no action needed',
        latestSha: latestActionable.meta?.githubCommitSha?.substring(0, 9),
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

      // Fire-and-forget — don't block response for webhook delivery
      sendNotification({
        title: '⚠️ Autofix Rebuild Failed',
        message: `The autofix commit \`${commitSha.substring(0, 9)}\` itself failed to build. Manual intervention may be needed.`,
        color: 'danger',
        fields: [
          { title: 'Deploy', value: deployId.substring(0, 12), short: true },
          { title: 'SHA', value: commitSha.substring(0, 9), short: true },
        ],
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      sendErrorSMS('Autofix Rebuild Failed', `The autofix commit ${commitSha.substring(0, 9)} itself failed to build. Manual intervention may be needed.`).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

      return res.status(200).json({ action: 'skipped', deployId, reason: 'is an [autofix] commit — skipping to prevent loops' });
    }

    // ── Circuit breaker: check git history ──
    // Also initializes attemptTracker so escalation works even without GH_PAT.
    if (!attemptTracker[commitSha]) {
      attemptTracker[commitSha] = 1; // Default: first attempt
      const trackedKeys = Object.keys(attemptTracker);
      if (trackedKeys.length > 50) delete attemptTracker[trackedKeys[0]];
    }
    if (ghPat && commitSha) {
      try {
        // 10s timeout — prevents this GitHub check from eating 10-30s of the 60s budget
        const cbAbort = new AbortController();
        const cbTimeout = setTimeout(() => cbAbort.abort(), 10000);
        let commitsRes;
        try {
          commitsRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=main&per_page=20`,
            { headers: { Authorization: `Bearer ${ghPat}`, Accept: 'application/vnd.github.v3+json' }, signal: cbAbort.signal }
          );
        } finally {
          clearTimeout(cbTimeout);
        }
        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          const autofixCount = commits.filter(
            (c) => c.commit?.message?.includes('[autofix]') && c.commit?.message?.includes(commitSha.substring(0, 9))
          ).length;
          if (autofixCount >= MAX_FIX_ATTEMPTS) {
            fixedDeployments.add(deployId);
            // Mark permanently unfixable in Supabase so Hetzner skips it too
            recordAttempt({
              deployId, commitSha, strategy: 'generic', confidence: 'low',
              status: 'skipped_unfixable',
              metadata: { reason: 'circuit_breaker', attempts: autofixCount },
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

            sendNotification({
              title: '🛑 Autofix Circuit Breaker',
              message: `Reached ${MAX_FIX_ATTEMPTS} fix attempts for \`${commitSha.substring(0, 9)}\`. Stopping. Manual fix required.`,
              color: 'danger',
              fields: [{ title: 'Attempts', value: String(autofixCount), short: true }],
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            sendErrorSMS('Autofix Circuit Breaker', `Reached ${MAX_FIX_ATTEMPTS} fix attempts for ${commitSha.substring(0, 9)}. Stopping. Manual fix required.`).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

            return res.status(200).json({ action: 'circuit_breaker', deployId, commitSha: commitSha.substring(0, 8), attempts: autofixCount });
          }
          // Track real attempt count from git history (authoritative)
          attemptTracker[commitSha] = autofixCount + 1;
        }
      } catch (e) {
        console.error(`[deploy-error-poll] Git history check failed: ${e.message}`);
        // attemptTracker already defaulted to 1 above — escalation still works
      }
    }

    // ── Step 3b: Guard — don't autofix ERROR if a NEWER BUILDING deploy exists ──
    // If the most recent BUILDING deploy started AFTER the ERROR deploy, a manual fix
    // is already in flight. Wait for it to complete before generating a competing autofix.
    // EXCLUDE builds that were JUST canceled in Step 1b — they still appear as BUILDING
    // in our in-memory array but are actually canceling on Vercel's side.
    const newerBuilding = deployments.find(
      (d) => d.state === 'BUILDING' && d.createdAt > latestError.createdAt && !canceledUids.has(d.uid)
    );
    if (newerBuilding) {
      return res.status(200).json({
        action: 'ok',
        message: 'Newer BUILDING deploy in progress — waiting before autofix to avoid conflict',
        buildingSha: newerBuilding.meta?.githubCommitSha?.substring(0, 9),
        errorSha: commitSha.substring(0, 9),
      });
    }

    // ── Step 4: Fetch build logs ──
    console.log(`[deploy-error-poll] Processing ERROR deployment ${deployId} (${commitSha.substring(0, 8)})`);

    let buildErrors = '';
    // Track log-fetch failures per deploy — if we can't get logs 3 times, permanently skip.
    const logFailKey = `logfail:${deployId}`;
    try {
      // 20s timeout on Vercel log fetch — prevents hanging the whole 60s function
      // budget on a slow/unresponsive Vercel Events API.
      const logAbort = new AbortController();
      const logTimeout = setTimeout(() => logAbort.abort(), 20000);
      let logsRes;
      try {
        logsRes = await fetch(
          `https://api.vercel.com/v2/deployments/${deployId}/events?teamId=${TEAM_ID}&direction=backward&limit=500`,
          { headers: { Authorization: `Bearer ${vercelToken}` }, signal: logAbort.signal }
        );
      } finally {
        clearTimeout(logTimeout);
      }
      if (logsRes.ok) {
        const events = await logsRes.json();
        if (Array.isArray(events)) {
          const allLines = events
            .map((e) => e.payload?.text || e.text || '')
            .filter(Boolean);

          // ── SIGKILL / SIGABRT / OOM detection ──
          // SIGKILL  = Linux kernel killed the process (container RAM limit exceeded).
          // SIGABRT  = Node.js aborted itself when heap exceeded --max-old-space-size.
          // Both are infrastructure-level — NOT fixable by changing application code.
          // DO NOT bump max-old-space-size as a fix: the correct fix is cpus:1 in next.config.
          // Use word-boundary anchored patterns to avoid false positives on words
          // like 'bloom', 'gloom', 'BOOM' etc. that contain 'OOM' as a substring.
          const isSigkill = allLines.some((l) =>
            l.includes('SIGKILL') ||
            l.includes('SIGABRT') ||
            l.includes('out of memory') ||
            l.includes('Ineffective mark-compacts near heap limit') ||
            l.includes('JavaScript heap out of memory') ||
            l.includes('Allocation failed') ||
            /\bOOM\b/.test(l)
          );
          if (isSigkill) {
            console.log(`[deploy-error-poll] SIGKILL/SIGABRT/OOM detected for ${deployId}`);
            fixedDeployments.add(deployId); // Prevent re-fetching logs every 2 min
            // Write to Supabase so the Hetzner poller won't open a competing OOM PR
            // (its fix-oom.mjs bumps heap which we know makes OOM WORSE on serial build).
            recordAttempt({
              deployId, commitSha, strategy: 'oom', confidence: 'high',
              status: 'skipped_unfixable',
              metadata: { reason: 'SIGKILL_SIGABRT_OOM_detected_by_openclaw' },
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

            // Fire-and-forget — don't block response for webhook delivery
            sendNotification({
              title: '💥 Build OOM/SIGABRT',
              message: `Deploy \`${commitSha.substring(0, 9)}\` killed by OOM signal (infrastructure issue). DO NOT bump heap — cpus:1 is the fix.`,
              color: 'danger',
              fields: [{ title: 'SHA', value: commitSha.substring(0, 9), short: true }],
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            sendErrorSMS('Build OOM/SIGABRT', `Deploy ${commitSha.substring(0, 9)} killed by OOM. Infrastructure issue — NOT fixable by bumping heap. cpus:1 is the fix.`).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

            return res.status(200).json({
              action: 'skipped', deployId, commitSha: commitSha.substring(0, 8),
              reason: 'SIGKILL/SIGABRT/OOM — infrastructure error. NOT fixable by heap bump. cpus:1 in next.config is the correct fix.',
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
          // Hoist regex OUTSIDE forEach — avoids recompiling 500x for each log line
          const srcDirRegex = /\.\/(?:pages|src|lib|components|services|data|utils|hooks|styles)\//;
          const includedIndices = new Set();
          allLines.forEach((line, idx) => {
            if (errorKeywords.some((kw) => line.includes(kw)) ||
                srcDirRegex.test(line)) {
              // ±3 lines of context
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
      // Track consecutive log-fetch failures. After 3, permanently skip so we
      // don't hammer the Vercel Events API on a deploy whose logs are unavailable.
      attemptTracker[logFailKey] = (attemptTracker[logFailKey] || 0) + 1;
      if (attemptTracker[logFailKey] >= 3) {
        fixedDeployments.add(deployId);
        console.log(`[deploy-error-poll] Log fetch failed 3 times for ${deployId} — deduped`);
      }
    }

    if (!buildErrors) {
      return res.status(200).json({ action: 'skipped', deployId, reason: 'could not extract build errors from logs (will retry)' });
    }

    // ── Step 5: Extract ALL broken files for multi-file fix ──
    const brokenFiles = extractBrokenFiles(buildErrors);
    const attempt = attemptTracker[commitSha] || 1;

    console.log(`[deploy-error-poll] Found ${brokenFiles.length} broken file(s): ${brokenFiles.join(', ')}`);
    console.log(`[deploy-error-poll] Attempt ${attempt}/${MAX_FIX_ATTEMPTS} for ${commitSha.substring(0, 8)}`);

    // ── Step 5b: Cross-poller dedup — check Supabase before firing Claude ──
    // If the Hetzner poller already dispatched a GitHub Actions fix for this commit,
    // skip to avoid two competing fixes on the same broken file.
    const alreadyHandled = await alreadyAttemptedInSupa(commitSha);
    if (alreadyHandled) {
      console.log(`[deploy-error-poll] ${commitSha.substring(0, 8)} already handled by another poller — skipping`);
      fixedDeployments.add(deployId); // Don't check Supabase again this session
      return res.status(200).json({ action: 'skipped', deployId, reason: 'already handled by another autofix poller (Supabase dedup)' });
    }
    // Record attempt in Supabase BEFORE firing so the Hetzner poller sees it immediately
    // Capture the ID so we can update it to 'failed' if autofix doesn't succeed —
    // otherwise a stale 'running' row permanently blocks Hetzner from retrying.
    const attemptId = await recordAttempt({
      deployId, commitSha,
      strategy: brokenFiles.length > 0 ? 'generic' : 'generic',
      confidence: brokenFiles.length > 0 ? 'medium' : 'low',
      status: 'running',
      metadata: { brokenFiles, attempt },
    });

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
          hint: 'Previous fix attempt failed. Try a different approach: check if the import target was renamed/moved, or if the file should be deleted entirely.',
        } : undefined,
      };

      // AbortController prevents TCP-level hangs from zombifying the poller
      // past its 60s maxDuration limit. Without this, a stalled deploy-autofix
      // HTTP connection (not HTTP timeout) can hold the poller indefinitely.
      const pollAbort = new AbortController();
      const pollTimeout = setTimeout(() => pollAbort.abort(), 55000); // 55s — 5s before poller dies

      let autofixRes;
      try {
        autofixRes = await fetch('https://smarter.poker/api/deploy-autofix', {
          method: 'POST',
          signal: pollAbort.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          },
          body: JSON.stringify(autofixPayload),
        });
      } finally {
        clearTimeout(pollTimeout);
      }

      const autofixResult = await autofixRes.json().catch(() => ({ action: 'parse_error' }));

      // Only permanently mark as fixed if the fix was ACTUALLY pushed
      if (autofixResult.action === 'fixed') {
        fixedDeployments.add(deployId);
        console.log(`[deploy-error-poll] ✅ Fix pushed for ${deployId}`);

        // Notify about the fix (fire-and-forget)
        sendNotification({
          title: '🔧 Autofix Deployed',
          message: `Claude fixed \`${autofixResult.filePath || autofixResult.file || 'unknown'}\` and pushed to main. Rebuild starting.`,
          color: 'warning',
          fields: [
            { title: 'File(s)', value: autofixResult.filePath || autofixResult.file || 'unknown', short: true },
            { title: 'Attempt', value: `${attempt}/${MAX_FIX_ATTEMPTS}`, short: true },
            { title: 'SHA', value: autofixResult.newCommitSha?.substring(0, 9) || commitSha.substring(0, 9), short: true },
          ],
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } else if (autofixResult.action === 'pr_opened') {
        // PR mode — notify so humans know to review
        sendNotification({
          title: '📋 Autofix PR Opened',
          message: `Fix for \`${autofixResult.filePath || 'unknown'}\` staged in PR #${autofixResult.prNumber}. Review and merge to unblock deploy.`,
          color: 'warning',
          fields: [
            { title: 'PR', value: autofixResult.prUrl || 'unknown', short: true },
            { title: 'Attempt', value: `${attempt}/${MAX_FIX_ATTEMPTS}`, short: true },
          ],
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        sendErrorSMS('Autofix PR Opened', `Fix for ${autofixResult.filePath || 'unknown'} staged in PR #${autofixResult.prNumber}. Review and merge to unblock deploy.`).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } else if (autofixResult.action === 'skipped') {
        // Track 'skipped' results — if a deploy is skipped twice in a row (e.g. OOM with
        // no code to fix), permanently dedup it so we don't hammer the API every 2min.
        const skipKey = `skip:${deployId}`;
        if (!attemptTracker[skipKey]) {
          attemptTracker[skipKey] = 1;
        } else {
          attemptTracker[skipKey]++;
        }
        if (attemptTracker[skipKey] >= 2) {
          fixedDeployments.add(deployId);
          console.log(`[deploy-error-poll] Deduped unfixable deploy ${deployId} after ${attemptTracker[skipKey]} skips`);
        } else {
          console.log(`[deploy-error-poll] Autofix skipped (attempt ${attemptTracker[skipKey]}/2) — will retry once more`);
        }
        // Release Hetzner — our skip doesn't mean Hetzner can't do better
        updateAttemptStatus(attemptId, 'failed').catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } else {
        console.log(`[deploy-error-poll] Autofix returned: ${autofixResult.action} — will retry`);
        // Release Hetzner — our failure doesn't mean Hetzner can't succeed
        updateAttemptStatus(attemptId, 'failed').catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
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
      if (e.name === 'AbortError') {
        console.error(`[deploy-error-poll] Autofix call timed out after 55s for ${deployId}`);
        return res.status(200).json({ action: 'autofix_timeout', deployId, error: 'deploy-autofix fetch timed out' });
      }
      console.error(`[deploy-error-poll] Autofix call failed: ${e.message}`);
      return res.status(200).json({ action: 'autofix_call_failed', deployId, error: e.message });
    }
  } catch (e) {
    console.error(`[deploy-error-poll] Fatal error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
}
