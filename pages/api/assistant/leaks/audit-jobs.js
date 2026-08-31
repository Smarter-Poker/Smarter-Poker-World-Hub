import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../../src/lib/apiRateLimit';
import { checkSandboxAccess, isFeatureAccessible } from '../../../../src/lib/personal-assistant/contextAuthority';
import { kickAuditWorker, publicAuditJob } from '../../../../src/lib/personal-assistant/auditJobRuntime.mjs';

export const config = { maxDuration: 15 };
const LIMIT = { max: 30, windowMs: 60_000 };

let client;
function db() {
  if (!client) client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return client;
}

async function latestJob(userId) {
  return db().from('pa_leak_audit_jobs').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMIT)) return;
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ success: false, error: 'Method not allowed' });
    const { user, error } = await getServerUserWithFallback(req, db());
    if (error || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

    if (req.method === 'GET') {
      const { data, error: readError } = await latestJob(user.id);
      if (readError) return res.status(503).json({ success: false, retryable: true, error: 'Audit progress is temporarily unavailable.' });
      if (data && (data.status === 'queued' || (data.status === 'running' && new Date(data.lease_expires_at || 0) <= new Date()))) {
        await kickAuditWorker(data);
      }
      return res.status(200).json({ success: true, job: publicAuditJob(data) });
    }

    const access = await checkSandboxAccess(db(), user.id);
    if (!access.allowed || !isFeatureAccessible(access.accessLevel, 'leak_finder_detect')) {
      return res.status(403).json({ success: false, blocked: true, contextState: access.contextState, error: access.message });
    }
    const { data, error: startError } = await db().rpc('start_or_resume_pa_leak_audit_job', { p_user_id: user.id });
    const job = Array.isArray(data) ? data[0] : data;
    if (startError || !job) return res.status(503).json({ success: false, retryable: true, error: 'The durable audit could not be started.' });
    const kick = await kickAuditWorker(job);
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
