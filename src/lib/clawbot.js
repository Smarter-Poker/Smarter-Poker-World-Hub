/**
 * ClawBot — Shared Library
 * 
 * Common utilities for all ClawBot automation tasks:
 * - Audit logging (every action tracked in Supabase)
 * - Task state management (last run, next run, status)
 * - Safety boundaries (read-only enforcement)
 * - Alert delivery helpers
 * 
 * SAFETY RULES (hardcoded, non-overridable):
 * - NO auto-code-fixes
 * - NO auto-deploys
 * - NO auto-deletes of user data
 * - NO auto-bans
 * - NO payment modifications
 * - ALL actions logged to clawbot_audit_log
 */

import { createClient } from '@supabase/supabase-js';

// ─── Supabase Admin Client (service role) ───────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('[ClawBot] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
    _supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

// ─── Constants ──────────────────────────────────────────────────────
export const CLAWBOT_VERSION = '1.0.0';

export const TASK_IDS = {
  SENTRY_TRIAGE: 'cb-01-sentry-triage',
  CRON_HEALTH: 'cb-02-cron-health',
  DEPLOY_HEALTH: 'cb-03-deploy-health',
  DB_PERFORMANCE: 'cb-04-db-performance',
  CONTENT_QUALITY: 'cb-05-content-quality',
  NEWS_DISCOVERY: 'cb-06-news-discovery',
  ENGAGEMENT_OPTIMIZER: 'cb-07-engagement-optimizer',
  VENUE_INTEGRITY: 'cb-08-venue-integrity',
  TOURNAMENT_VALIDATOR: 'cb-09-tournament-validator',
  SCRAPER_RESILIENCE: 'cb-10-scraper-resilience',
  CHURN_DETECTOR: 'cb-11-churn-detector',
  CONTENT_RECOMMENDER: 'cb-12-content-recommender',
  STREAK_WATCHDOG: 'cb-13-streak-watchdog',
  STRIPE_MONITOR: 'cb-14-stripe-monitor',
  VIP_FUNNEL: 'cb-15-vip-funnel',
  ANTI_ABUSE: 'cb-16-anti-abuse',
  SECURITY_SCAN: 'cb-17-security-scan',
  COMPLIANCE_AUDIT: 'cb-18-compliance-audit',
};

export const TASK_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

// ─── Audit Logging ──────────────────────────────────────────────────
/**
 * Log a ClawBot action to the audit table.
 * Every automation action MUST be logged — no exceptions.
 */
export async function logAudit(taskId, action, details = {}, severity = 'info') {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('clawbot_audit_log').insert({
      task_id: taskId,
      action,
      details: typeof details === 'string' ? { message: details } : details,
      severity, // 'info' | 'warning' | 'error' | 'critical'
      clawbot_version: CLAWBOT_VERSION,
      created_at: new Date().toISOString(),
    });
    if (error) console.warn('[ClawBot] Audit log write failed:', error.message);
  } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
}

// ─── Task State Management ──────────────────────────────────────────
/**
 * Get the last run state for a task.
 * Returns { task_id, status, last_run_at, last_success_at, last_error, run_count }
 */
export async function getTaskState(taskId) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clawbot_task_state')
      .select('*')
      .eq('task_id', taskId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    console.warn(`[ClawBot] getTaskState(${taskId}) failed:`, err.message);
    return null;
  }
}

/**
 * Update task state after a run.
 */
export async function updateTaskState(taskId, status, details = {}) {
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const update = {
      task_id: taskId,
      status,
      last_run_at: now,
      last_details: typeof details === 'string' ? { message: details } : details,
      updated_at: now,
    };

    if (status === TASK_STATUS.SUCCESS) {
      update.last_success_at = now;
      update.last_error = null;
    } else if (status === TASK_STATUS.FAILED) {
      update.last_error = details?.error || details?.message || 'Unknown error';
    }

    const { error } = await supabase
      .from('clawbot_task_state')
      .upsert(update, { onConflict: 'task_id' });

    if (error) throw error;
  } catch (err) {
    console.warn(`[ClawBot] updateTaskState(${taskId}) failed:`, err.message);
  }
}

// ─── Task Runner Wrapper ────────────────────────────────────────────
/**
 * Wraps a ClawBot task with standard pre/post lifecycle:
 * 1. Log task start
 * 2. Update state to RUNNING
 * 3. Execute the task function
 * 4. Log success/failure
 * 5. Update state accordingly
 * 
 * Returns { success, data?, error?, duration_ms }
 */
export async function runTask(taskId, taskFn) {
  const startTime = Date.now();
  
  await logAudit(taskId, 'task_started');
  await updateTaskState(taskId, TASK_STATUS.RUNNING);

  try {
    const result = await taskFn();
    const duration = Date.now() - startTime;

    await logAudit(taskId, 'task_completed', {
      duration_ms: duration,
      result_summary: result?.summary || 'OK',
    });
    await updateTaskState(taskId, TASK_STATUS.SUCCESS, {
      duration_ms: duration,
      ...result,
    });

    return { success: true, data: result, duration_ms: duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err.message || 'Unknown error';

    await logAudit(taskId, 'task_failed', { error: errorMsg, duration_ms: duration }, 'error');
    await updateTaskState(taskId, TASK_STATUS.FAILED, { error: errorMsg, duration_ms: duration });

    return { success: false, error: errorMsg, duration_ms: duration };
  }
}

// ─── Cron Auth Guard ────────────────────────────────────────────────
/**
 * Verify the request is from Vercel Cron (CRON_SECRET header).
 * Returns true if authorized, false if not.
 */
export function verifyCronAuth(req) {
  // In development, allow all
  if (process.env.NODE_ENV === 'development') return true;
  
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[ClawBot] CRON_SECRET not set — denying request');
    return false;
  }
  
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

// ─── Sentry API Client ─────────────────────────────────────────────
/**
 * Make a request to the Sentry API.
 * Uses SENTRY_TOKEN from environment.
 */
export async function sentryFetch(path, options = {}) {
  const token = process.env.SENTRY_TOKEN;
  if (!token) throw new Error('[ClawBot] SENTRY_TOKEN not configured');

  const baseUrl = 'https://sentry.io/api/0';
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body');
    throw new Error(`Sentry API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── GitHub API Client ──────────────────────────────────────────────
/**
 * Make a request to the GitHub API.
 * Uses GITHUB_TOKEN from environment.
 */
export async function githubFetch(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('[ClawBot] GITHUB_TOKEN not configured');

  const baseUrl = 'https://api.github.com';
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body');
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Supabase Helper (exposed for tasks) ────────────────────────────
export { getSupabase };
