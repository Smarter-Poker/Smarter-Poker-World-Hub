import { reportApiError } from '../../../src/lib/sentryWrap';
/**
 * CB-01: Sentry Error Triage Pipeline
 * 
 * Roadmap item 1.3 — Automated Sentry Monitoring Pipeline
 * 
 * What this does:
 * 1. Pulls top 20 unresolved errors from Sentry by user impact
 * 2. Categorizes by page, severity, user count, first/last seen
 * 3. Stores results in `sentry_error_log` Supabase table
 * 4. Compares against previous day's snapshot → detects NEW vs RECURRING
 * 5. Auto-creates GitHub issues for errors affecting 5+ users
 * 6. Returns a triage summary
 * 
 * SAFETY: Read-only from Sentry. Write to Supabase + GitHub issues.
 *         NEVER auto-fixes code or triggers deploys.
 * 
 * Schedule: Daily via vercel.json cron → /api/clawbot/orchestrator
 * Manual:   GET /api/clawbot/sentry-triage (requires CRON_SECRET or dev mode)
 */

import {
  runTask,
  logAudit,
  verifyCronAuth,
  sentryFetch,
  githubFetch,
  getSupabase,
  TASK_IDS,
} from '../../../src/lib/clawbot';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

// ─── Config ─────────────────────────────────────────────────────────
const SENTRY_ORG = 'smarter-poker';
const SENTRY_PROJECT_SLUG = 'smarter-poker-world-hub';
const GITHUB_REPO_OWNER = 'Smarter-Poker';
const GITHUB_REPO_NAME = 'Smarter-Poker-World-Hub';
const MIN_USERS_FOR_GITHUB_ISSUE = 5;
const MAX_ERRORS_TO_FETCH = 20;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = await runTask(TASK_IDS.SENTRY_TRIAGE, async () => {
    // Step 1: Fetch top unresolved issues from Sentry
    const issues = await fetchSentryIssues();
    await logAudit(TASK_IDS.SENTRY_TRIAGE, 'fetched_sentry_issues', {
      count: issues.length,
    });

    // Step 2: Get previous day's snapshot for comparison
    const previousErrors = await getPreviousSnapshot();
    const previousIds = new Set(previousErrors.map((e) => e.sentry_issue_id));

    // Step 3: Categorize and enrich
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
      sentry_link: issue.permalink || `https://sentry.io/organizations/${SENTRY_ORG}/issues/${issue.id}/`,
      metadata: {
        type: issue.metadata?.type || null,
        value: issue.metadata?.value || null,
        filename: issue.metadata?.filename || null,
      },
    }));

    // Step 4: Store snapshot in Supabase
    const stored = await storeSnapshot(enriched);

    // Step 5: Auto-create GitHub issues for high-impact errors
    const githubIssuesCreated = await createGithubIssues(enriched);

    // Step 6: Build summary
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
      snapshot_date: getTodayCST(), // Phase 77 — CST anchor matches storeSnapshot/getPreviousSnapshot below
    };

    return {
      summary: `${newErrors.length} new, ${recurringErrors.length} recurring, ${githubIssuesCreated.length} GitHub issues created`,
      errors: enriched,
      github_issues: githubIssuesCreated,
      ...summary,
    };
  });

  return res.status(result.success ? 200 : 500).json(result);
}

// ─── Sentry API Calls ───────────────────────────────────────────────

async function fetchSentryIssues() {
  try {
    // Fetch unresolved issues sorted by user impact (priority)
    const issues = await sentryFetch(
      `/projects/${SENTRY_ORG}/${SENTRY_PROJECT_SLUG}/issues/?query=is:unresolved&sort=users&limit=${MAX_ERRORS_TO_FETCH}`
    );
    return Array.isArray(issues) ? issues : [];
  } catch (err) {
    console.warn('[CB-01] Failed to fetch Sentry issues:', err.message);
    // Try alternative org/project discovery
    try {
      const orgs = await sentryFetch('/organizations/');
      if (Array.isArray(orgs) && orgs.length > 0) {
        const orgSlug = orgs[0].slug;
        const projects = await sentryFetch(`/organizations/${orgSlug}/projects/`);
        if (Array.isArray(projects) && projects.length > 0) {
          const projectSlug = projects[0].slug;
          console.warn(`[CB-01] Discovered org=${orgSlug}, project=${projectSlug}`);
          const issues = await sentryFetch(
            `/projects/${orgSlug}/${projectSlug}/issues/?query=is:unresolved&sort=users&limit=${MAX_ERRORS_TO_FETCH}`
          );
          return Array.isArray(issues) ? issues : [];
        }
      }
    } catch (discoveryErr) {
      console.warn('[CB-01] Sentry discovery also failed:', discoveryErr.message);
    }
    return [];
  }
}

// ─── Categorization ─────────────────────────────────────────────────

function extractPageUrl(issue) {
  // Try to extract the affected page from the culprit path
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
  if (culprit.includes('/api/mlb') || culprit.includes('mlb-analytics')) return 'mlb';
  if (culprit.includes('/api/')) return 'api';
  if (culprit.includes('commander')) return 'commander';
  if (culprit.includes('training') || culprit.includes('gto')) return 'training';
  if (culprit.includes('poker-near-me') || culprit.includes('venue')) return 'venue';
  if (culprit.includes('social') || culprit.includes('feed')) return 'social';
  return 'other';
}

// ─── Supabase Snapshot Storage ──────────────────────────────────────

async function getPreviousSnapshot() {
  try {
    const supabase = getSupabase();
    // Phase 77 — CST anchor for daily snapshot rotation. Previously rotated
    // at UTC midnight (=6pm CST), so an ops-team "today's errors" review
    // before close-of-business CST would actually be tomorrow's bucket.
    const today = getTodayCST();
    // Yesterday in CST: derived from today + day arithmetic so DST is handled
    // by the same Intl-based anchor.
    const cstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cstNow.setDate(cstNow.getDate() - 1);
    const y = cstNow.getFullYear();
    const m = String(cstNow.getMonth() + 1).padStart(2, '0');
    const d = String(cstNow.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const { data, error } = await supabase
      .from('sentry_error_log')
      .select('sentry_issue_id')
      .gte('snapshot_date', dateStr)
      .lt('snapshot_date', today);

    if (error) {
      console.warn('[CB-01] Failed to get previous snapshot:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[CB-01] getPreviousSnapshot error:', err.message);
    return [];
  }
}

async function storeSnapshot(errors) {
  try {
    const supabase = getSupabase();
    const snapshotDate = getTodayCST(); // Phase 77 — match summary + getPreviousSnapshot anchor

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

    const { error } = await supabase.from('sentry_error_log').upsert(rows, {
      onConflict: 'sentry_issue_id,snapshot_date',
    });

    if (error) {
      console.warn('[CB-01] Failed to store snapshot:', error.message);
      return 0;
    }

    return rows.length;
  } catch (err) {
    console.warn('[CB-01] storeSnapshot error:', err.message);
    return 0;
  }
}

// ─── GitHub Issue Auto-Creation ─────────────────────────────────────

async function createGithubIssues(errors) {
  const created = [];
  const highImpact = errors.filter((e) => e.user_count >= MIN_USERS_FOR_GITHUB_ISSUE && e.is_new);

  if (highImpact.length === 0) return created;

  // Check for existing issues to avoid duplicates
  let existingTitles = new Set();
  try {
    const existing = await githubFetch(
      `/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues?labels=sentry-auto&state=open&per_page=100`
    );
    existingTitles = new Set((existing || []).map((i) => i.title));
  } catch (err) {
    console.warn('[CB-01] Could not fetch existing GitHub issues:', err.message);
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
        try { reportApiError(err, null); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn(`[CB-01] Failed to create GitHub issue for ${error.sentry_issue_id}:`, err.message);
      await logAudit(TASK_IDS.SENTRY_TRIAGE, 'github_issue_creation_failed', {
        sentry_id: error.sentry_issue_id,
        error: err.message,
      }, 'warning');
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