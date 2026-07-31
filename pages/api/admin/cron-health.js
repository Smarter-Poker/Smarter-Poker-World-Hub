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

/** Registry of all expected cron jobs and their intervals (in minutes) */
const CRON_REGISTRY = [
    { name: 'tournament-alerts',       endpoint: '/api/cron/tournament-alerts',       intervalMin: 60,   description: 'OneSignal push for upcoming tournaments' },
    { name: 'daily-challenge',         endpoint: '/api/cron/daily-challenge',         intervalMin: 1440, description: 'Generate daily trivia challenge' },
    { name: 'content-grinder',         endpoint: '/api/cron/content-grinder',         intervalMin: 360,  description: 'AI content generation pipeline' },
    { name: 'diamond-daily-rewards',   endpoint: '/api/cron/diamond-daily-rewards',   intervalMin: 1440, description: 'Daily login diamond rewards' },
    { name: 'venue-data-refresh',      endpoint: '/api/cron/venue-data-refresh',      intervalMin: 4320, description: 'PokerAtlas/Bravo venue refresh (72h)' },
    { name: 'sentry-triage',           endpoint: '/api/cron/sentry-triage',           intervalMin: 60,   description: 'OpenClaw Sentry error triage' },
    { name: 'vip-expiration-check',    endpoint: '/api/cron/vip-expiration',          intervalMin: 1440, description: 'Check and expire lapsed VIP memberships' },
    { name: 'leaderboard-snapshot',    endpoint: '/api/cron/leaderboard-snapshot',    intervalMin: 1440, description: 'Daily leaderboard snapshot' },
];

function getStatus(lastRun, intervalMin) {
    if (!lastRun) return { status: 'NEVER_RUN', healthy: false };
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
    if (authErr || !user) {
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

        const results = CRON_REGISTRY.map(cron => {
            const log = logMap[cron.name];
            const { status, healthy, minutesAgo } = getStatus(log?.last_run_at, cron.intervalMin);
            return {
                name: cron.name,
                endpoint: cron.endpoint,
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

        const healthyCount = results.filter(r => r.healthy).length;
        const totalCount = results.length;

        return res.status(200).json({
            overallHealth: healthyCount === totalCount ? 'ALL_HEALTHY' : `${healthyCount}/${totalCount}_HEALTHY`,
            healthyCount,
            totalCount,
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
