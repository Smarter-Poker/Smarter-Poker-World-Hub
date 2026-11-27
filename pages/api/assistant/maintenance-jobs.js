import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { ACCESS_LEVELS, checkSandboxAccess } from '../../../src/lib/personal-assistant/contextAuthority.js';
import { notify } from '../../../src/lib/notify';
import { kickAuditWorker } from '../../../src/lib/personal-assistant/auditJobRuntime.mjs';
import { leakTypeTitle } from '../../../src/lib/personal-assistant/leakRecord';

export const config = { maxDuration: 60 };

let _solverCoverageExportMod = null;
try {
  // Static require for Next.js/Webpack bundling and compile() harnesses that mock it;
  // older compile() harnesses that omit solverCoverageExport.mjs catch cleanly here.
  // eslint-disable-next-line global-require
  _solverCoverageExportMod = require('../../../src/lib/personal-assistant/solverCoverageExport.mjs');
} catch {
  _solverCoverageExportMod = null;
}

async function loadSolverCoverageExport() {
  if (_solverCoverageExportMod && typeof _solverCoverageExportMod.buildSolverHarvestQueueExport === 'function') {
    return _solverCoverageExportMod;
  }
  const modUrl = new URL(
    '../../../src/lib/personal-assistant/solverCoverageExport.mjs',
    `file://${process.cwd()}/pages/api/assistant/maintenance-jobs.js`,
  ).href;
  _solverCoverageExportMod = await (new Function('u', 'return import(u)'))(modUrl);
  return _solverCoverageExportMod;
}

export function getUtcDayKey(dateInput = new Date()) {
  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const valid = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return valid.toISOString().slice(0, 10);
}

export function getUtcIsoWeekKey(dateInput = new Date()) {
  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const valid = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const target = new Date(Date.UTC(valid.getUTCFullYear(), valid.getUTCMonth(), valid.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

let _admin = null;
export function _setAdminClientForTesting(client) {
  _admin = client;
}

function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

/**
 * 1. Stalled audit recovery
 * Recovers running audit jobs whose leases expired, then kicks workers.
 */
export async function runRecoverAudits(supabase, { p_limit = 25 } = {}) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('requeue_stalled_pa_leak_audit_jobs', {
    p_limit,
  });

  if (rpcError) {
    console.warn('[maintenance-jobs] requeue_stalled_pa_leak_audit_jobs failed:', rpcError.message);
    return {
      success: false,
      error: rpcError.message,
      stalledRequeued: 0,
      activeCount: 0,
      failed24h: 0,
      p95DurationMs: 0,
      requeuedIds: [],
      kickedCount: 0,
    };
  }

  const rawIds = rpcData?.requeuedIds || [];
  const requeuedIds = Array.isArray(rawIds) ? rawIds : [];
  let kickedCount = 0;

  if (requeuedIds.length > 0) {
    const jobs = [];
    for (let i = 0; i < requeuedIds.length; i += 50) {
      const { data: batchJobs, error: jobsError } = await supabase
        .from('pa_leak_audit_jobs')
        .select('id, user_id, progress')
        .in('id', requeuedIds.slice(i, i + 50));

      if (!jobsError && Array.isArray(batchJobs)) {
        jobs.push(...batchJobs);
      }
    }

    if (jobs.length > 0) {
      const results = await Promise.allSettled(
        jobs.map(job => (
          job?.progress?.fullRescan === true
            ? kickAuditWorker(job, { fullRescan: true })
            : kickAuditWorker(job)
        ))
      );
      kickedCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    }
  }

  return {
    success: true,
    stalledRequeued: Number(rpcData?.stalledRequeued || 0),
    requeuedIds,
    activeCount: Number(rpcData?.activeCount || 0),
    failed24h: Number(rpcData?.failed24h || 0),
    p95DurationMs: Number(rpcData?.p95DurationMs || 0),
    kickedCount,
  };
}

/**
 * 2. Due review nudges
 * Finds due reviews, dedupes users, verifies not seated & not in cooldown,
 * enforces 72h notification throttle, and sends via notify() with deterministic UTC-day dedupe key.
 */
export async function runDueNudges(supabase, { limit = 500, now = new Date() } = {}) {
  const nowDate = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(now);
  const validNow = Number.isFinite(nowDate.getTime()) ? nowDate : new Date();
  const nowIso = validNow.toISOString();
  const utcDayKey = getUtcDayKey(validNow);

  const { data: dueRows, error: dueError } = await supabase
    .from('leak_review_state')
    .select('user_id, leak_id, due_at')
    .eq('retired', false)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: false })
    .limit(limit);

  if (dueError) {
    console.warn('[maintenance-jobs] due reviews query failed:', dueError.message);
    return { success: false, error: dueError.message, dueFound: 0, sentCount: 0 };
  }

  const uniqueUserIds = [...new Set((dueRows || []).map(r => r.user_id).filter(Boolean))];
  const seventyTwoHoursAgo = new Date(validNow.getTime() - 72 * 3600 * 1000).toISOString();

  let sentCount = 0;
  let skippedSeated = 0;
  let skippedThrottled = 0;

  for (const userId of uniqueUserIds) {
    // RTA guard: not seated & not in cooldown
    try {
      const access = await checkSandboxAccess(supabase, userId);
      if (access?.allowed !== true || access?.accessLevel === ACCESS_LEVELS.LIMITED_REVIEW) {
        skippedSeated++;
        continue;
      }
    } catch (accessErr) {
      console.warn('[maintenance-jobs] checkSandboxAccess check failed closed for user', userId, accessErr?.message);
      skippedSeated++;
      continue;
    }

    // 72h throttle per user
    const { data: recentNotif, error: notifErr } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'personal_assistant_review_due')
      .gte('created_at', seventyTwoHoursAgo)
      .limit(1);

    if (notifErr || (recentNotif && recentNotif.length > 0)) {
      skippedThrottled++;
      continue;
    }

    const dedupeKey = `pa_review_due:${userId}:${utcDayKey}`;

    // Send master notification with deterministic UTC-day dedupe/idempotency key
    const res = await notify(supabase, {
      userId,
      type: 'personal_assistant_review_due',
      title: 'Spaced Repetition Review Due',
      body: 'You have leak drills ready for review. Keep your study streak alive!',
      url: '/hub/personal-assistant/leaks?tab=leaks',
      tag: dedupeKey,
      dedupeKey,
      idempotencyKey: dedupeKey,
      data: {
        dedupeKey,
        idempotencyKey: dedupeKey,
        utcDayKey,
      },
    });

    if (res?.ok) {
      sentCount++;
    }
  }

  return {
    success: true,
    dueFound: dueRows?.length || 0,
    uniqueUsers: uniqueUserIds.length,
    sentCount,
    skippedSeated,
    skippedThrottled,
  };
}

/**
 * 3. Weekly coaching digest
 * Finds opted-in users, verifies not seated & not in cooldown,
 * enforces 7-day throttle, fails closed on DB read errors, builds 3-line summary,
 * and sends via notify() with deterministic UTC ISO-week dedupe key.
 */
export async function runWeeklyDigest(supabase, { limit = 100, now = new Date() } = {}) {
  const nowDate = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(now);
  const validNow = Number.isFinite(nowDate.getTime()) ? nowDate : new Date();
  const isoWeekKey = getUtcIsoWeekKey(validNow);

  const { data: prefRows, error: prefError } = await supabase
    .from('pa_coaching_preferences')
    .select('user_id')
    .eq('weekly_digest_opt_in', true)
    .limit(limit);

  if (prefError) {
    console.warn('[maintenance-jobs] weekly digest prefs query failed:', prefError.message);
    return {
      success: false,
      error: prefError.message,
      optedInFound: 0,
      sentCount: 0,
      skippedSeated: 0,
      skippedThrottled: 0,
      skippedReadError: 0,
    };
  }

  const userIds = [...new Set((prefRows || []).map(r => r.user_id).filter(Boolean))];
  const sevenDaysAgo = new Date(validNow.getTime() - 7 * 86400 * 1000).toISOString();

  let sentCount = 0;
  let skippedSeated = 0;
  let skippedThrottled = 0;
  let skippedReadError = 0;

  for (const userId of userIds) {
    // RTA guard: not seated & not in cooldown
    try {
      const access = await checkSandboxAccess(supabase, userId);
      if (access?.allowed !== true || access?.accessLevel === ACCESS_LEVELS.LIMITED_REVIEW) {
        skippedSeated++;
        continue;
      }
    } catch (accessErr) {
      console.warn('[maintenance-jobs] checkSandboxAccess failed closed for digest user', userId, accessErr?.message);
      skippedSeated++;
      continue;
    }

    // 7-day throttle
    const { data: recentDigest, error: digestErr } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'personal_assistant_weekly_digest')
      .gte('created_at', sevenDaysAgo)
      .limit(1);

    if (digestErr || (recentDigest && recentDigest.length > 0)) {
      skippedThrottled++;
      continue;
    }

    // Read user leaks and review state for 3-line summary
    let leaksRes;
    let reviewsRes;
    try {
      [leaksRes, reviewsRes] = await Promise.all([
        supabase
          .from('user_leaks')
          .select('id, leak_type, status, avg_ev_loss_bb, is_active')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(20),
        supabase
          .from('leak_review_state')
          .select('leak_id, reps, remediation_baseline_at, retired')
          .eq('user_id', userId)
          .limit(50),
      ]);
    } catch (readErr) {
      console.warn('[maintenance-jobs] weekly digest data read threw for user', userId, readErr?.message || readErr);
      skippedReadError++;
      continue;
    }

    if (leaksRes?.error || reviewsRes?.error) {
      console.warn(
        '[maintenance-jobs] weekly digest data read failed closed for user',
        userId,
        leaksRes?.error?.message || reviewsRes?.error?.message,
      );
      skippedReadError++;
      continue;
    }

    const leaks = leaksRes?.data || [];
    const reviews = reviewsRes?.data || [];

    const activeLeaks = leaks
      .filter(l => l.status !== 'resolved' && l.is_active !== false)
      .sort((a, b) => Number(b.avg_ev_loss_bb || 0) - Number(a.avg_ev_loss_bb || 0));
    const topLeakName = activeLeaks[0]?.leak_type
      ? leakTypeTitle(activeLeaks[0].leak_type)
      : 'None Detected';

    const totalDrills = reviews.reduce((sum, r) => sum + (Number(r.reps) || 0), 0);
    const drillsMastered = reviews.filter(r => Boolean(r.remediation_baseline_at)).length;

    const summaryBody = `• Top Leak: ${topLeakName}\n• Drills Completed: ${totalDrills}\n• Drills Mastered (Live Tracking): ${drillsMastered}`;
    const dedupeKey = `pa_weekly_digest:${userId}:${isoWeekKey}`;

    const res = await notify(supabase, {
      userId,
      type: 'personal_assistant_weekly_digest',
      title: 'Your Weekly Poker Coaching Digest',
      body: summaryBody,
      url: '/hub/personal-assistant',
      tag: dedupeKey,
      dedupeKey,
      idempotencyKey: dedupeKey,
      data: {
        dedupeKey,
        idempotencyKey: dedupeKey,
        isoWeekKey,
      },
    });

    if (res?.ok) {
      sentCount++;
    }
  }

  return {
    success: true,
    optedInFound: userIds.length,
    sentCount,
    skippedSeated,
    skippedThrottled,
    skippedReadError,
  };
}

/**
 * 4. Read-only solver coverage gap harvest summary
 * Reads recent unpriced hand_audit_decisions (`solver_verified = false`, bounded .limit(limit))
 * and formats structured harvest queue targets. Never touches M1/M2 solver hosts.
 */
export async function runSolverCoverageGapSummary(
  supabase,
  { limit = 1000, maxBuckets = 15, generatedAt } = {},
) {
  if (!supabase) {
    return {
      success: false,
      error: 'Missing Supabase client',
      schemaVersion: 1,
      totalUnmeasuredDecisions: 0,
      buckets: [],
      markdown: '',
    };
  }

  const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit) || 1000)));
  const safeMaxBuckets = Math.max(1, Math.min(200, Math.floor(Number(maxBuckets) || 15)));

  try {
    let query = supabase
      .from('hand_audit_decisions')
      .select('game_id, street, hero_position, spot_type, stack_depth_bb, solver_verified, solver_source, classification, match_tier, audited_at')
      .eq('solver_verified', false);

    if (typeof query?.order === 'function') {
      query = query.order('audited_at', { ascending: false });
    }

    const { data: decisionRows, error } = await query.limit(safeLimit);

    if (error) {
      console.warn('[maintenance-jobs] solver coverage gap query failed:', error.message);
      return {
        success: false,
        error: error.message || 'Solver coverage gap query failed',
        schemaVersion: 1,
        totalUnmeasuredDecisions: 0,
        buckets: [],
        markdown: '',
      };
    }

    const { buildSolverHarvestQueueExport, formatHarvestQueueMarkdown } = await loadSolverCoverageExport();
    const report = buildSolverHarvestQueueExport(decisionRows || [], {
      maxBuckets: safeMaxBuckets,
      ...(generatedAt ? { generatedAt } : {}),
    });
    const markdown = formatHarvestQueueMarkdown(report);

    return {
      success: true,
      ...report,
      markdown,
    };
  } catch (err) {
    console.warn('[maintenance-jobs] solver coverage gap summary failed:', err?.message || err);
    return {
      success: false,
      error: err?.message || 'Solver coverage gap summary failed',
      schemaVersion: 1,
      totalUnmeasuredDecisions: 0,
      buckets: [],
      markdown: '',
    };
  }
}

async function maintenanceHandler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const admin = getAdmin();
  if (!admin) {
    return res.status(500).json({ status: 'unconfigured', error: 'Missing Supabase Environment Variables' });
  }

  const started = Date.now();
  const action = String(req.query?.action || req.body?.action || 'all').toLowerCase();

  const results = {};

  if (action === 'all' || action === 'recover_audits') {
    results.recoverAudits = await runRecoverAudits(admin);
  }
  if (action === 'all' || action === 'due_nudges') {
    results.dueNudges = await runDueNudges(admin);
  }
  if (action === 'all' || action === 'weekly_digest') {
    results.weeklyDigest = await runWeeklyDigest(admin);
  }
  if (action === 'coverage_gaps') {
    results.coverageGaps = await runSolverCoverageGapSummary(admin);
  } else if (action === 'all') {
    const gapSummary = await runSolverCoverageGapSummary(admin, { limit: 1000, maxBuckets: 5 });
    results.coverageGaps = gapSummary.success
      ? {
          success: true,
          schemaVersion: gapSummary.schemaVersion,
          generatedAt: gapSummary.generatedAt,
          totalUnmeasuredDecisions: gapSummary.totalUnmeasuredDecisions,
          buckets: gapSummary.buckets,
        }
      : {
          success: false,
          error: gapSummary.error || 'Coverage gaps summary failed',
          schemaVersion: 1,
          totalUnmeasuredDecisions: 0,
          buckets: [],
        };
  }

  return res.status(200).json({
    status: 'ok',
    action,
    durationMs: Date.now() - started,
    results,
  });
}

const monitoredHandler = withCronHealth('personal-assistant-maintenance', maintenanceHandler);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  // Validate method BEFORE burning rate-limit budget
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!applyRateLimit(req, res, LIMITS.write)) return;

  try {
    return await monitoredHandler(req, res);
  } catch (error) {
    console.warn('[assistant/maintenance-jobs] unexpected failure:', error?.message || error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ status: 'error', error: 'Personal Assistant Maintenance Jobs Failed' });
  }
}
