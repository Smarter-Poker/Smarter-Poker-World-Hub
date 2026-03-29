/**
 * ClawBot Status Dashboard API
 * 
 * Returns the current state of all ClawBot tasks:
 * - Last run time, status, duration
 * - Recent audit log entries
 * - Task registry (enabled/disabled)
 * 
 * GET /api/clawbot/status
 * 
 * No auth required — status is read-only and contains no sensitive data.
 */

import {
  getSupabase,
  CLAWBOT_VERSION,
  TASK_IDS,
} from '../../../src/lib/clawbot';

// Task metadata for display
const TASK_CATALOG = [
  { id: TASK_IDS.SENTRY_TRIAGE, name: 'Sentry Error Triage', domain: 'Operations', enabled: true },
  { id: TASK_IDS.CRON_HEALTH, name: 'Cron Job Health', domain: 'Operations', enabled: false },
  { id: TASK_IDS.DEPLOY_HEALTH, name: 'Deploy Health Monitor', domain: 'Operations', enabled: false },
  { id: TASK_IDS.DB_PERFORMANCE, name: 'DB Performance Watchdog', domain: 'Data Quality', enabled: false },
  { id: TASK_IDS.VENUE_INTEGRITY, name: 'Venue Data Integrity', domain: 'Data Quality', enabled: false },
  { id: TASK_IDS.TOURNAMENT_VALIDATOR, name: 'Tournament Data Validator', domain: 'Data Quality', enabled: false },
  { id: TASK_IDS.SCRAPER_RESILIENCE, name: 'Scraper Resilience', domain: 'Data Quality', enabled: false },
  { id: TASK_IDS.CONTENT_QUALITY, name: 'Content Quality Auditor', domain: 'Content', enabled: false },
  { id: TASK_IDS.NEWS_DISCOVERY, name: 'News Source Discovery', domain: 'Content', enabled: false },
  { id: TASK_IDS.ENGAGEMENT_OPTIMIZER, name: 'Engagement Optimizer', domain: 'Content', enabled: false },
  { id: TASK_IDS.CHURN_DETECTOR, name: 'Churn Risk Detector', domain: 'Engagement', enabled: false },
  { id: TASK_IDS.CONTENT_RECOMMENDER, name: 'Content Recommender', domain: 'Engagement', enabled: false },
  { id: TASK_IDS.STREAK_WATCHDOG, name: 'Streak Watchdog', domain: 'Engagement', enabled: false },
  { id: TASK_IDS.STRIPE_MONITOR, name: 'Stripe Payment Monitor', domain: 'Revenue', enabled: false },
  { id: TASK_IDS.VIP_FUNNEL, name: 'VIP Funnel Tracker', domain: 'Revenue', enabled: false },
  { id: TASK_IDS.ANTI_ABUSE, name: 'Anti-Abuse Scanner', domain: 'Security', enabled: false },
  { id: TASK_IDS.SECURITY_SCAN, name: 'Security Audit Auto', domain: 'Security', enabled: false },
  { id: TASK_IDS.COMPLIANCE_AUDIT, name: 'Compliance Audit', domain: 'Security', enabled: false },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();

    // Fetch all task states
    const { data: taskStates, error: stateErr } = await supabase
      .from('clawbot_task_state')
      .select('*')
      .order('last_run_at', { ascending: false });

    // Fetch recent audit log (last 50 entries)
    const { data: recentLogs, error: logErr } = await supabase
      .from('clawbot_audit_log')
      .select('task_id, action, severity, details, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    // Merge task catalog with live state
    const stateMap = new Map((taskStates || []).map(s => [s.task_id, s]));
    
    const tasks = TASK_CATALOG.map(task => {
      const state = stateMap.get(task.id);
      return {
        ...task,
        status: state?.status || 'never_run',
        last_run_at: state?.last_run_at || null,
        last_success_at: state?.last_success_at || null,
        last_error: state?.last_error || null,
        last_details: state?.last_details || null,
      };
    });

    const enabledCount = tasks.filter(t => t.enabled).length;
    const activeCount = tasks.filter(t => t.status === 'success' || t.status === 'running').length;

    return res.status(200).json({
      success: true,
      clawbot: {
        version: CLAWBOT_VERSION,
        timestamp: new Date().toISOString(),
        summary: {
          total_tasks: tasks.length,
          enabled: enabledCount,
          active: activeCount,
          last_orchestrator_run: taskStates?.find(s => s.task_id === 'orchestrator')?.last_run_at || null,
        },
        tasks,
        recent_activity: (recentLogs || []).slice(0, 20),
      },
    });
  } catch (err) {
    console.error('[ClawBot Status] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      clawbot: {
        version: CLAWBOT_VERSION,
        status: 'error',
      },
    });
  }
}
