import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { ACCESS_LEVELS, checkSandboxAccess } from '../../../src/lib/personal-assistant/contextAuthority.js';
import { notify } from '../../../src/lib/notify';
import { kickAuditWorker } from '../../../src/lib/personal-assistant/auditJobRuntime.mjs';

export const config = { maxDuration: 60 };

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
        .select('id, user_id')
        .in('id', requeuedIds.slice(i, i + 50));

      if (!jobsError && Array.isArray(batchJobs)) {
        jobs.push(...batchJobs);
      }
    }

    if (jobs.length > 0) {
      const results = await Promise.allSettled(
        jobs.map(job => kickAuditWorker(job))
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
 * enforces 72h notification throttle, and sends via notify().
 */
export async function runDueNudges(supabase, { limit = 100 } = {}) {
  const nowIso = new Date().toISOString();
  const { data: dueRows, error: dueError } = await supabase
    .from('leak_review_state')
    .select('user_id, leak_id, due_at')
    .eq('retired', false)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(limit);

  if (dueError) {
    console.warn('[maintenance-jobs] due reviews query failed:', dueError.message);
    return { success: false, error: dueError.message, dueFound: 0, sentCount: 0 };
  }

  const uniqueUserIds = [...new Set((dueRows || []).map(r => r.user_id).filter(Boolean))];
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

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

    // Send master notification
    const res = await notify(supabase, {
      userId,
      type: 'personal_assistant_review_due',
      title: 'Spaced Repetition Review Due',
      body: 'You have leak drills ready for review. Keep your study streak alive!',
      url: '/hub/personal-assistant/leaks?tab=leaks',
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
 * enforces 7-day throttle, builds 3-line summary, and sends via notify().
 */
export async function runWeeklyDigest(supabase, { limit = 100 } = {}) {
  const { data: prefRows, error: prefError } = await supabase
    .from('pa_coaching_preferences')
    .select('user_id')
    .eq('weekly_digest_opt_in', true)
    .limit(limit);

  if (prefError) {
    console.warn('[maintenance-jobs] weekly digest prefs query failed:', prefError.message);
    return { success: false, error: prefError.message, optedInFound: 0, sentCount: 0 };
  }

  const userIds = [...new Set((prefRows || []).map(r => r.user_id).filter(Boolean))];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  let sentCount = 0;
  let skippedSeated = 0;
  let skippedThrottled = 0;

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
    const [leaksRes, reviewsRes] = await Promise.all([
      supabase
        .from('user_leaks')
        .select('id, title, leak_type, status, ev_loss')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('leak_review_state')
        .select('leak_id, reps, remediation_baseline_at, retired')
        .eq('user_id', userId)
        .limit(50),
    ]);

    const leaks = leaksRes.data || [];
    const reviews = reviewsRes.data || [];

    const activeLeaks = leaks.filter(l => l.status !== 'resolved');
    const topLeakName = activeLeaks[0]?.title || activeLeaks[0]?.leak_type || 'None Detected';

    const totalDrills = reviews.reduce((sum, r) => sum + (Number(r.reps) || 0), 0);
    const verifiedLiveFixes = reviews.filter(r => Boolean(r.remediation_baseline_at)).length;

    const summaryBody = `• Top Leak: ${topLeakName}\n• Drills Completed: ${totalDrills}\n• Verified Live Fixes: ${verifiedLiveFixes}`;

    const res = await notify(supabase, {
      userId,
      type: 'personal_assistant_weekly_digest',
      title: 'Your Weekly Poker Coaching Digest',
      body: summaryBody,
      url: '/hub/personal-assistant',
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
  };
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
