import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../../src/lib/apiRateLimit';
import { checkSandboxAccess, isFeatureAccessible } from '../../../../src/lib/personal-assistant/contextAuthority';
import { kickAuditWorker, publicAuditJob } from '../../../../src/lib/personal-assistant/auditJobRuntime.mjs';

export const config = { maxDuration: 15 };
const LIMIT = { max: 30, windowMs: 60_000 };

let client;
export function _setSupabaseForTesting(mockClient) {
  client = mockClient;
}

function db() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Personal Assistant audit-jobs service role configuration is missing');
    }
    client = createClient(url, key);
  }
  return client;
}

async function latestJob(userId) {
  return db().from('pa_leak_audit_jobs').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMIT)) return;
    const { user, error, status: authStatus } = await getServerUserWithFallback(req, db());
    if (error || !user) {
      return res.status(authStatus === 503 ? 503 : 401).json({
        success: false,
        error: authStatus === 503 ? 'Session verification unavailable' : 'Authentication required',
      });
    }

    if (req.method === 'GET') {
      const { data, error: readError } = await latestJob(user.id);
      if (readError) return res.status(503).json({ success: false, retryable: true, error: 'Audit progress is temporarily unavailable.' });
      const access = await checkSandboxAccess(db(), user.id);
      const rtaRestricted = !access?.allowed
        || !isFeatureAccessible(access.accessLevel, 'leak_finder_view')
        || !isFeatureAccessible(access.accessLevel, 'leak_finder_detect');
      if (data && !rtaRestricted && (data.status === 'queued' || (data.status === 'running' && new Date(data.lease_expires_at || 0) <= new Date()))) {
        await kickAuditWorker(data, { fullRescan: Boolean(data?.progress?.fullRescan) });
      }
      const projected = publicAuditJob(data);
      let job = projected;
      if (projected && rtaRestricted) {
        const { result: _omittedResult, leaks: _omittedLeaks, ...safeJob } = projected;
        job = {
          ...safeJob,
          rtaRestricted: true,
          contextState: access?.contextState || 'session_active_unknown',
        };
      }
      return res.status(200).json({
        success: true,
        job,
        ...(rtaRestricted ? { rtaRestricted: true, contextState: access?.contextState || 'session_active_unknown' } : {}),
      });
    }

    const access = await checkSandboxAccess(db(), user.id);
    if (!access.allowed || !isFeatureAccessible(access.accessLevel, 'leak_finder_detect')) {
      return res.status(403).json({ success: false, blocked: true, contextState: access.contextState, error: access.message });
    }
    const fullRescan = Boolean(req.body?.fullRescan);
    const { data, error: startError } = await db().rpc('start_or_resume_pa_leak_audit_job', { p_user_id: user.id });
    let job = Array.isArray(data) ? data[0] : data;
    if (startError || !job) return res.status(503).json({ success: false, retryable: true, error: 'The durable audit could not be started.' });

    // Persist fullRescan durably on the job row so retries/cold starts never silently
    // downgrade a Full Re-Audit to an incremental scan or resume a stale pre-fullRescan cursor.
    if (fullRescan && job.status === 'queued') {
      const nextProgress = { ...(job.progress && typeof job.progress === 'object' ? job.progress : {}), fullRescan: true };
      const resetCursor = job.progress?.fullRescan === true ? job.audit_cursor : null;
      const { data: updatedJob } = await db()
        .from('pa_leak_audit_jobs')
        .update({ audit_cursor: resetCursor, progress: nextProgress })
        .eq('id', job.id)
        .eq('user_id', user.id)
        .eq('status', 'queued')
        .select('*')
        .maybeSingle();
      if (updatedJob) job = updatedJob;
    }

    const kick = await kickAuditWorker(job, { fullRescan });
    // The database checkpoint is the acceptance boundary. If the first worker
    // kick races a deploy/cold start, this viewer's two-second status poll (or a
    // later device) safely kicks the same queued job again.
    return res.status(202).json({
      success: true,
      accepted: true,
      workerScheduled: kick.ok,
      job: publicAuditJob(job),
      warning: kick.ok ? null : 'The Audit Is Saved And Will Resume From This Checkpoint.',
    });
  } catch (error) {
    console.warn('[assistant/leaks/audit-jobs] request failed', error?.message || error);
    if (!res.headersSent) return res.status(500).json({
      success: false,
      retryable: true,
      error: 'The Audit Service Encountered An Unexpected Error.',
    });
  }
}
