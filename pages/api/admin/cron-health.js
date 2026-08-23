/**
 * Cron Health Monitor API
 * GET /api/admin/cron-health
 *
 * Returns the status of all scheduled cron jobs by checking their last
 * execution timestamps in the cron_health_log table.
 */

import { createClient as supabaseServerClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit as apiRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

/**
 * Registry of expected cron jobs.
 *
 * ── 2026-08-12 audit ────────────────────────────────────────────────────
 * This monitor has NEVER been able to report a healthy job, and it was
 * quietly alarming instead of saying so.
 *
 * Verified against production:
 *   * `cron_health_log` contains ZERO rows.
 *   * The table has a CREATE TABLE and RLS policies
 *     (supabase/migrations/20260329_roadmap_phases.sql) and exactly ONE
 *     reader — this file — and NO WRITER anywhere: not in this repo, not in
 *     smarter-poker-workers, not in scripts/openclaw-cron-dispatcher.py.
 *
 * So every job resolved to NEVER_RUN and the endpoint always answered
 * "0/8_HEALTHY". That is indistinguishable from eight genuinely broken
 * jobs, which is the worst possible failure mode for a health check: it
 * cries wolf permanently and therefore gets ignored.
 *
 * The `endpoint` values were also stale. Six of the eight handlers exist
 * nowhere at all; `daily-challenge` and `sentry-triage` moved to Open Claw /
 * the workers repo during the Phase 2 migration (CLAUDE.md §11). `location`
 * now records where each job actually lives, so the registry stops implying
 * a local route that was deleted.
 *
 * This change makes the monitor HONEST, not green. Wiring real telemetry is
 * a separate piece of work: each job must upsert into cron_health_log when
 * it completes. Until something writes, `NO_TELEMETRY` is the correct
 * answer and `overallHealth` says so explicitly.
 */
const CRON_REGISTRY = [
    // ── The 24 REAL local handlers (pages/api/cron/*) ────────────────────
    // As of 2026-08-14 every one of these is wrapped in withCronHealth
    // (src/lib/cronHealth.js), which upserts into cron_health_log on each
    // authorized run — the writer this table never had. Names match the
    // handler filename, which is the cron_name the wrapper records.
    // Intervals come from the ACTUAL schedules: vercel.json for 15,
    // scripts/openclaw-cron-dispatcher.py for the other 9.
    { name: 'signup-probe',               location: 'vercel',    intervalMin: 1440,  description: 'Signup flow probe' },
    { name: 'signup-probe-restricted',    location: 'vercel',    intervalMin: 15,    description: 'Restricted signup probe' },
    { name: 'sentry-signup-bridge',       location: 'vercel',    intervalMin: 15,    description: 'Bridge Sentry signup errors' },
    { name: 'trigger-audit',              location: 'vercel',    intervalMin: 1440,  description: 'DB trigger audit' },
    { name: 'email-deliverability-check', location: 'vercel',    intervalMin: 1440,  description: 'Email deliverability check' },
    { name: 'archive-signup-errors',      location: 'vercel',    intervalMin: 1440,  description: 'Archive signup error rows' },
    { name: 'login-probe',                location: 'vercel',    intervalMin: 15,    description: 'Login flow probe' },
    { name: 'recovery-probe',             location: 'vercel',    intervalMin: 15,    description: 'Account recovery probe' },
    { name: 'auth-integrity-audit',       location: 'vercel',    intervalMin: 1440,  description: 'Auth integrity audit' },
    { name: 'generate-trivia',            location: 'vercel',    intervalMin: 1440,  description: 'Generate trivia questions' },
    { name: 'trivia-pool-guard',          location: 'vercel',    intervalMin: 1440,  description: 'Trivia pool floor guard' },
    { name: 'trivia-tournament-tick',     location: 'vercel',    intervalMin: 15,    description: 'Trivia tournament state tick' },
    { name: 'vip-lapse',                  location: 'vercel',    intervalMin: 60,    description: 'Expire lapsed VIP memberships' },
    { name: 'vip-stipend',                location: 'vercel',    intervalMin: 43200, description: 'Monthly VIP diamond stipend' },
    { name: 'pvp-settle',                 location: 'vercel',    intervalMin: 30,    description: 'Settle PvP trivia matches' },
    { name: 'cleanup-expired-stories',    location: 'open-claw', intervalMin: 360,   description: 'Delete expired stories' },
    { name: 'cleanup-orphan-uploads',     location: 'open-claw', intervalMin: 1440,  description: 'Remove orphaned uploads' },
    { name: 'cleanup-stale-streams',      location: 'open-claw', intervalMin: 5,     description: 'Close stale live streams' },
    { name: 'live-cleanup',               location: 'open-claw', intervalMin: 5,     description: 'Live surface cleanup' },
    { name: 'live-reminders',             location: 'open-claw', intervalMin: 5,     description: 'Live stream reminders' },
    { name: 'social-page-completion-nudge', location: 'open-claw', intervalMin: 4320, description: 'Nudge incomplete social pages' },
    { name: 'transcode-videos',           location: 'open-claw', intervalMin: 1,     description: 'Drain video transcode queue' },
    { name: 'yt-pipeline-recovery',       location: 'open-claw', intervalMin: 15,    description: 'YT worker queue top-up' },

    // ── Remote jobs (no local handler; telemetry must come from THEIR side) ──
    { name: 'daily-challenge',            location: 'open-claw', intervalMin: 1440,  remote: true, description: 'Generate daily trivia challenge (workers repo)' },
    { name: 'sentry-triage',              location: 'workers',   intervalMin: 60,    remote: true, description: 'OpenClaw Sentry error triage (workers repo)' },

    // REMOVED 2026-08-14: tournament-alerts, content-grinder,
    // diamond-daily-rewards, venue-data-refresh, vip-expiration-check,
    // leaderboard-snapshot. Those six existed NOWHERE — not here, not in the
    // workers repo, not in the dispatcher — so listing them made the
    // dashboard report phantoms forever. If one is revived, add it back with
    // its real location and schedule.
];

/**
 * @param hasTelemetry false when cron_health_log holds no rows at all, in
 *        which case a missing entry says nothing about the job — only that
 *        nothing is reporting. Do not surface that as a job failure.
 */
function getStatus(lastRun, intervalMin, hasTelemetry, isRemote = false) {
    if (!lastRun) {
        // A REMOTE job's telemetry has to come from its own repo; a missing
        // row here says nothing about it. Without this carve-out, the first
        // local telemetry row would flip both remote jobs to NEVER_RUN and
        // leave them red forever — the exact cry-wolf failure this dashboard
        // was rebuilt to eliminate.
        if (isRemote) return { status: 'NO_REMOTE_TELEMETRY', healthy: null };
        return hasTelemetry
            ? { status: 'NEVER_RUN', healthy: false }
            : { status: 'NO_TELEMETRY', healthy: null };
    }
    const ago = (Date.now() - new Date(lastRun).getTime()) / 60000;
    // Allow 50% grace period
    if (ago <= intervalMin * 1.5) return { status: 'HEALTHY', healthy: true, minutesAgo: Math.round(ago) };
    if (ago <= intervalMin * 3) return { status: 'LATE', healthy: false, minutesAgo: Math.round(ago) };
    return { status: 'STALE', healthy: false, minutesAgo: Math.round(ago) };
}

export default async function handler(req, res) {
  try {

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const rateLimitResult = await apiRateLimit(req, { maxRequests: 30, windowMs: 60000 });
    if (rateLimitResult) return res.status(429).json({ error: 'Too many requests' });

    const supabase = supabaseServerClient(req);

    // Auth — admin only
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check admin status
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile || profile.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        // Fetch last run times from cron_health_log
        const { data: logs } = await supabase
            .from('cron_health_log')
            .select('cron_name, last_run_at, last_status, last_duration_ms, error_message')
            .order('last_run_at', { ascending: false });

        const logMap = {};
        (logs || []).forEach(log => {
            if (!logMap[log.cron_name]) logMap[log.cron_name] = log;
        });

        // Nothing writes cron_health_log today (see the registry note above),
        // so an empty table means "no telemetry", not "every job is broken".
        const hasTelemetry = (logs || []).length > 0;

        const results = CRON_REGISTRY.map(cron => {
            const log = logMap[cron.name];
            const { status, healthy, minutesAgo } = getStatus(
                log?.last_run_at, cron.intervalMin, hasTelemetry, !!cron.remote
            );
            return {
                name: cron.name,
                // Where the job actually runs. The old `endpoint` field named
                // local /api/cron/* routes, six of which do not exist.
                location: cron.location,
                description: cron.description,
                expectedInterval: `${cron.intervalMin}m`,
                status,
                healthy,
                lastRunAt: log?.last_run_at || null,
                minutesAgo: minutesAgo || null,
                lastStatus: log?.last_status || null,
                lastDurationMs: log?.last_duration_ms || null,
                errorMessage: log?.error_message || null,
            };
        });

        // `healthy: null` means unknown — exclude it from both counts so an
        // absent telemetry pipeline never masquerades as a failing job.
        const known = results.filter(r => r.healthy !== null);
        const healthyCount = known.filter(r => r.healthy).length;
        const totalCount = results.length;

        let overallHealth;
        if (!hasTelemetry) {
            overallHealth = 'NO_TELEMETRY';
        } else if (known.length > 0 && healthyCount === known.length) {
            overallHealth = 'ALL_HEALTHY';
        } else {
            overallHealth = `${healthyCount}/${known.length}_HEALTHY`;
        }

        return res.status(200).json({
            overallHealth,
            healthyCount,
            knownCount: known.length,
            totalCount,
            // Explicit so an operator reading this endpoint understands why
            // everything is "unknown" rather than assuming an outage.
            telemetry: hasTelemetry ? 'reporting' : 'no writer — cron_health_log is empty; jobs do not report completion yet',
            crons: results,
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[CronHealth] Error:', err);
        return res.status(500).json({ error: 'Failed to check cron health' });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
