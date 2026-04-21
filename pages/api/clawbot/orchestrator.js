import { reportApiError } from '../../../src/lib/sentryWrap';
/**
 * ClawBot Orchestrator
 * 
 * Central cron entry point that dispatches to individual ClawBot tasks.
 * Runs on a schedule (daily) via vercel.json cron → /api/clawbot/orchestrator
 * 
 * Current tasks:
 * - CB-01: Sentry Error Triage (daily)
 * 
 * Future tasks will be added here as they are built.
 * 
 * SAFETY: The orchestrator only CALLS task endpoints — it never
 * executes task logic directly. Each task is self-contained.
 */

import {
  logAudit,
  verifyCronAuth,
  getSupabase,
  CLAWBOT_VERSION,
} from '../../../src/lib/clawbot';

// ─── Task Registry ──────────────────────────────────────────────────
// Each task has: id, endpoint path (relative), schedule description, enabled flag
const TASK_REGISTRY = [
  {
    id: 'cb-01-sentry-triage',
    name: 'Sentry Error Triage',
    endpoint: '/api/clawbot/sentry-triage',
    schedule: 'daily',
    enabled: true,
  },
  // Future tasks:
  // { id: 'cb-02-cron-health', name: 'Cron Job Health', endpoint: '/api/clawbot/cron-health', schedule: 'hourly', enabled: false },
  // { id: 'cb-03-deploy-health', name: 'Deploy Health Monitor', endpoint: '/api/clawbot/deploy-health', schedule: 'per-deploy', enabled: false },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  await logAudit('orchestrator', 'orchestrator_started', {
    version: CLAWBOT_VERSION,
    tasks_registered: TASK_REGISTRY.length,
    tasks_enabled: TASK_REGISTRY.filter(t => t.enabled).length,
  });

  const results = [];
  const enabledTasks = TASK_REGISTRY.filter(t => t.enabled);

  for (const task of enabledTasks) {
    try {
      // Build the full URL for the task endpoint
      const baseUrl = getBaseUrl(req);
      const taskUrl = `${baseUrl}${task.endpoint}`;

      console.warn(`[ClawBot] Dispatching: ${task.name} → ${taskUrl}`);

      const taskStart = Date.now();
      const response = await fetch(taskUrl, {
        method: 'GET',
        headers: {
          Authorization: req.headers.authorization || '',
          'x-clawbot-orchestrator': 'true',
        },
      });

      const body = await response.json().catch(() => ({ error: 'Failed to parse response' }));
      const taskDuration = Date.now() - taskStart;

      results.push({
        task_id: task.id,
        name: task.name,
        status: response.ok ? 'success' : 'failed',
        http_status: response.status,
        duration_ms: taskDuration,
        summary: body?.data?.summary || body?.summary || (response.ok ? 'OK' : body?.error),
      });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      results.push({
        task_id: task.id,
        name: task.name,
        status: 'error',
        error: err.message,
      });
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status !== 'success').length;

  await logAudit('orchestrator', 'orchestrator_completed', {
    duration_ms: totalDuration,
    tasks_run: results.length,
    successes: successCount,
    failures: failCount,
  });

  return res.status(200).json({
    success: true,
    version: CLAWBOT_VERSION,
    duration_ms: totalDuration,
    summary: `${successCount}/${enabledTasks.length} tasks succeeded`,
    results,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

function getBaseUrl(req) {
  // Prefer explicit site URL env var — always the canonical production domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  // VERCEL_URL is the deployment-specific subdomain (not smarter.poker) — only use as last resort
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Local dev: construct from request headers
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}
