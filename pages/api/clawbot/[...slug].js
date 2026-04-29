/**
 * /api/clawbot/* — Hono catch-all router (Phase 4.5 module #1, 2026-04-28)
 *
 * Consolidates 2 ClawBot handlers under a single Hono app. Both share the
 * same helper module (`src/lib/clawbot`) but have very different auth tiers:
 *
 *   GET /status         — public (read-only dashboard, no sensitive data)
 *   GET /sentry-triage  — Vercel cron (verifyCronAuth via CRON_SECRET)
 *
 * Replaces:
 *   status.js         (111 LOC)
 *   sentry-triage.js  (338 LOC)
 *   = 449 LOC, now ~430 LOC.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import {
  getSupabase,
  CLAWBOT_VERSION,
  TASK_IDS,
  runTask,
  logAudit,
  verifyCronAuth,
  sentryFetch,
  githubFetch,
} from '../../../src/lib/clawbot';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/clawbot');

// Cron-secret guard for the triage handler
const requireCron = async (c, next) => {
  const req = c.env?.req;
  if (!verifyCronAuth(req)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /status — public dashboard
// ═══════════════════════════════════════════════════════════════════════════
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

app.get('/status', async (c) => {
  try {
    const supabase = getSupabase();

    const { data: taskStates } = await supabase
      .from('clawbot_task_state')
      .select('*')
      .order('last_run_at', { ascending: false });

    const { data: recentLogs } = await supabase
      .from('clawbot_audit_log')
      .select('task_id, action, severity, details, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    const stateMap = new Map((taskStates || []).map((s) => [s.task_id, s]));
    const tasks = TASK_CATALOG.map((task) => {
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

    const enabledCount = tasks.filter((t) => t.enabled).length;
    const activeCount = tasks.filter((t) => t.status === 'success' || t.status === 'running').length;

    return c.json({
      success: true,
      clawbot: {
        version: CLAWBOT_VERSION,
        timestamp: new Date().toISOString(),
        summary: {
          total_tasks: tasks.length,
          enabled: enabledCount,
          active: activeCount,
          last_orchestrator_run: taskStates?.find((s) => s.task_id === 'orchestrator')?.last_run_at || null,
        },
        tasks,
        recent_activity: (recentLogs || []).slice(0, 20),
      },
    });
  } catch (err) {
    console.warn('[clawbot/status] error:', err.message);
    return c.json(
      {
        success: false,
        error: err.message,
        clawbot: { version: CLAWBOT_VERSION, status: 'error' },
      },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /sentry-triage — Vercel cron, CRON_SECRET required
// ═══════════════════════════════════════════════════════════════════════════
const SENTRY_ORG = 'smarter-poker';
const SENTRY_PROJECT_SLUG = 'smarter-poker-world-hub';
const GITHUB_REPO_OWNER = 'Smarter-Poker';
const GITHUB_REPO_NAME = 'Smarter-Poker-World-Hub';
const MIN_USERS_FOR_GITHUB_ISSUE = 5;
const MAX_ERRORS_TO_FETCH = 20;

app.get('/sentry-triage', requireCron, async (c) => {
  const result = await runTask(TASK_IDS.SENTRY_TRIAGE, async () => {
    const issues = await fetchSentryIssues();
    await logAudit(TASK_IDS.SENTRY_TRIAGE, 'fetched_sentry_issues', { count: issues.length });

    const previousErrors = await getPreviousSnapshot();
    const previousIds = new Set(previousErrors.map((e) => e.sentry_issue_id));

    const enriched = issues.map((issue) => ({
      sentry_issue_id: issue.id,
      title: issue.title,
      culprit: issue.culprit || 'unknown',
      level: issue.level || 'error',
      status: issue.status,
      first_seen: issue.firstSeen,
      last_seen: issue.lastSeen,
      user_count: issue.userCount || 0,
      event_count: issue.count ? parseInt(issue.count, 10) : 0,
      page_url: extractPageUrl(issue),
      category: categorizeError(issue),
      is_new: !previousIds.has(issue.id),
      is_recurring: previousIds.has(issue.id),
      sentry_link:
        issue.permalink || `https://sentry.io/organizations/${SENTRY_ORG}/issues/${issue.id}/`,
      metadata: {
        type: issue.metadata?.type || null,
        value: issue.metadata?.value || null,
        filename: issue.metadata?.filename || null,
      },
    }));

    await storeSnapshot(enriched);
    const githubIssuesCreated = await createGithubIssues(enriched);

    const newErrors = enriched.filter((e) => e.is_new);
    const recurringErrors = enriched.filter((e) => e.is_recurring);
    const criticalErrors = enriched.filter((e) => e.user_count >= 50);

    const summary = {
      total_errors: enriched.length,
      new_errors: newErrors.length,
      recurring_errors: recurringErrors.length,
      critical_errors: criticalErrors.length,
      github_issues_created: githubIssuesCreated.length,
      top_offender: enriched[0]
        ? `${enriched[0].title} (${enriched[0].user_count} users)`
        : 'none',
      snapshot_date: new Date().toISOString().split('T')[0],
    };

    return {
      summary: `${newErrors.length} new, ${recurringErrors.length} recurring, ${githubIssuesCreated.length} GitHub issues created`,
      errors: enriched,
      github_issues: githubIssuesCreated,
      ...summary,
    };
  });

  return c.json(result, result.success ? 200 : 500);
});

async function fetchSentryIssues() {
  try {
    const issues = await sentryFetch(
      `/projects/${SENTRY_ORG}/${SENTRY_PROJECT_SLUG}/issues/?query=is:unresolved&sort=users&limit=${MAX_ERRORS_TO_FETCH}`
    );
    return Array.isArray(issues) ? issues : [];
  } catch (err) {
    console.warn('[clawbot/sentry-triage] failed to fetch Sentry issues:', err.message);
    try {
      const orgs = await sentryFetch('/organizations/');
      if (Array.isArray(orgs) && orgs.length > 0) {
        const orgSlug = orgs[0].slug;
        const projects = await sentryFetch(`/organizations/${orgSlug}/projects/`);
        if (Array.isArray(projects) && projects.length > 0) {
          const projectSlug = projects[0].slug;
          console.warn(`[clawbot/sentry-triage] discovered org=${orgSlug}, project=${projectSlug}`);
          const issues = await sentryFetch(
            `/projects/${orgSlug}/${projectSlug}/issues/?query=is:unresolved&sort=users&limit=${MAX_ERRORS_TO_FETCH}`
          );
          return Array.isArray(issues) ? issues : [];
        }
      }
    } catch (discoveryErr) {
      console.warn('[clawbot/sentry-triage] Sentry discovery also failed:', discoveryErr.message);
    }
    return [];
  }
}

function extractPageUrl(issue) {
  const culprit = issue.culprit || '';
  if (culprit.includes('/hub/')) return culprit.split('/hub/')[1]?.split(/[?#]/)[0] || 'unknown';
  if (culprit.includes('/api/')) return culprit;
  if (culprit.includes('pages/')) return culprit.replace('pages/', '');
  return culprit || 'unknown';
}

function categorizeError(issue) {
  const title = (issue.title || '').toLowerCase();
  const culprit = (issue.culprit || '').toLowerCase();

  if (title.includes('typeerror') || title.includes('referenceerror')) return 'runtime';
  if (title.includes('network') || title.includes('fetch') || title.includes('timeout')) return 'network';
  if (title.includes('hydration') || title.includes('ssr')) return 'hydration';
  if (title.includes('chunk') || title.includes('loading')) return 'chunk-loading';
  if (culprit.includes('/api/')) return 'api';
  if (culprit.includes('commander')) return 'commander';
  if (culprit.includes('training') || culprit.includes('gto')) return 'training';
  if (culprit.includes('poker-near-me') || culprit.includes('venue')) return 'venue';
  if (culprit.includes('social') || culprit.includes('feed')) return 'social';
  return 'other';
}

async function getPreviousSnapshot() {
  try {
    const supabase = getSupabase();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('sentry_error_log')
      .select('sentry_issue_id')
      .gte('snapshot_date', dateStr)
      .lt('snapshot_date', new Date().toISOString().split('T')[0]);

    if (error) {
      console.warn('[clawbot/sentry-triage] previous snapshot error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[clawbot/sentry-triage] getPreviousSnapshot error:', err.message);
    return [];
  }
}

async function storeSnapshot(errors) {
  try {
    const supabase = getSupabase();
    const snapshotDate = new Date().toISOString().split('T')[0];

    const rows = errors.map((e) => ({
      sentry_issue_id: e.sentry_issue_id,
      title: e.title,
      culprit: e.culprit,
      level: e.level,
      first_seen: e.first_seen,
      last_seen: e.last_seen,
      user_count: e.user_count,
      event_count: e.event_count,
      page_url: e.page_url,
      category: e.category,
      is_new: e.is_new,
      sentry_link: e.sentry_link,
      metadata: e.metadata,
      snapshot_date: snapshotDate,
    }));

    const { error } = await supabase
      .from('sentry_error_log')
      .upsert(rows, { onConflict: 'sentry_issue_id,snapshot_date' });

    if (error) {
      console.warn('[clawbot/sentry-triage] snapshot store error:', error.message);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.warn('[clawbot/sentry-triage] storeSnapshot error:', err.message);
    return 0;
  }
}

async function createGithubIssues(errors) {
  const created = [];
  const highImpact = errors.filter((e) => e.user_count >= MIN_USERS_FOR_GITHUB_ISSUE && e.is_new);
  if (highImpact.length === 0) return created;

  let existingTitles = new Set();
  try {
    const existing = await githubFetch(
      `/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues?labels=sentry-auto&state=open&per_page=100`
    );
    existingTitles = new Set((existing || []).map((i) => i.title));
  } catch (err) {
    console.warn('[clawbot/sentry-triage] could not fetch existing GitHub issues:', err.message);
  }

  for (const error of highImpact) {
    const issueTitle = `[Sentry] ${error.title}`;
    if (existingTitles.has(issueTitle)) {
      await logAudit(TASK_IDS.SENTRY_TRIAGE, 'github_issue_skipped_duplicate', {
        title: issueTitle,
      });
      continue;
    }

    try {
      const body = buildGithubIssueBody(error);
      const issue = await githubFetch(
        `/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: issueTitle,
            body,
            labels: ['bug', 'sentry-auto', error.category],
          }),
        }
      );

      created.push({
        number: issue.number,
        url: issue.html_url,
        sentry_id: error.sentry_issue_id,
      });

      await logAudit(TASK_IDS.SENTRY_TRIAGE, 'github_issue_created', {
        issue_number: issue.number,
        sentry_id: error.sentry_issue_id,
        user_count: error.user_count,
      });
    } catch (err) {
      console.warn(
        `[clawbot/sentry-triage] failed to create GitHub issue for ${error.sentry_issue_id}:`,
        err.message
      );
      await logAudit(
        TASK_IDS.SENTRY_TRIAGE,
        'github_issue_creation_failed',
        { sentry_id: error.sentry_issue_id, error: err.message },
        'warning'
      );
    }
  }

  return created;
}

function buildGithubIssueBody(error) {
  return `## Sentry Auto-Triage Report

**Error**: ${error.title}
**Culprit**: \`${error.culprit}\`
**Category**: ${error.category}
**Severity**: ${error.level}

### Impact
- **Users affected**: ${error.user_count}
- **Total events**: ${error.event_count}
- **First seen**: ${error.first_seen}
- **Last seen**: ${error.last_seen}

### Page
\`${error.page_url}\`

### Metadata
${error.metadata.type ? `- **Type**: ${error.metadata.type}` : ''}
${error.metadata.value ? `- **Value**: ${error.metadata.value}` : ''}
${error.metadata.filename ? `- **File**: ${error.metadata.filename}` : ''}

### Links
- [View in Sentry](${error.sentry_link})

---
*Auto-created by ClawBot CB-01 Sentry Triage Pipeline*
*This issue was created because ${error.user_count} users are affected.*
`;
}

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[clawbot] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[clawbot] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
