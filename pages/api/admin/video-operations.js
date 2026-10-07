import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { buildAlerts } = require('../../../lib/videoOperationsAlerts');
const { isVideoAdminProfile } = require('../../../lib/videoAdminAuthorization');
const {
  isVideoOperationsOperationId,
  isVideoReconciliationQuarantineSnapshot,
} = require('../../../lib/videoOperationsContract');

function clients() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !anon || !service) return null;
  return {
    anon: createClient(url, anon, { auth: { persistSession: false } }),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  };
}

async function authorize(req, res, connection) {
  const configured = (process.env.ADMIN_ROUTE_SECRET || '').trim();
  if (configured && req.headers['x-admin-secret'] === configured) return { id: null };
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin session required' });
    return false;
  }
  const { data, error } = await connection.anon.auth.getUser(authorization.slice(7));
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired admin session' });
    return false;
  }
  const profile = await connection.admin.from('profiles').select('is_admin, role')
    .eq('id', data.user.id).maybeSingle();
  if (profile.error || !isVideoAdminProfile(profile.data)) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return data.user;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const connection = clients();
  if (!connection) return res.status(500).json({ error: 'Video operations reporting is not configured' });
  const user = await authorize(req, res, connection);
  if (!user) return;

  if (req.method === 'PATCH') {
    const controlKey = typeof req.body?.control_key === 'string' ? req.body.control_key : '';
    const enabled = req.body?.enabled;
    const expectedUpdatedAt = typeof req.body?.expected_updated_at === 'string' ? req.body.expected_updated_at : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const operationId = typeof req.body?.operation_id === 'string' ? req.body.operation_id : '';
    const parsedTimestamp = new Date(expectedUpdatedAt);
    if (!isVideoOperationsOperationId(operationId)
      || !controlKey || typeof enabled !== 'boolean' || !expectedUpdatedAt
      || !Number.isFinite(parsedTimestamp.getTime())
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedUpdatedAt)
      || reason.length < 1 || reason.length > 240) {
      return res.status(400).json({ error: 'Choose a pipeline switch, provide a valid operation ID and current version, and enter a reason up to 240 characters.' });
    }
    if (!user.id) return res.status(403).json({ error: 'A signed-in admin is required to change pipeline switches.' });
    try {
      const { data, error } = await connection.admin.rpc('fn_set_video_reels_pipeline_control', {
        p_operation_id: operationId,
        p_actor_id: user.id,
        p_control_key: controlKey,
        p_enabled: enabled,
        p_expected_updated_at: expectedUpdatedAt,
        p_reason: reason,
      });
      if (error) {
        const conflict = error.message?.includes('version conflict') || error.message?.includes('already has this value')
          || error.message?.includes('operation replay payload mismatch');
        return res.status(conflict ? 409 : 400).json({ error: conflict
          ? 'This switch changed or this action was already applied. Refresh the snapshot and try again.'
          : 'The pipeline switch could not be changed.' });
      }
      return res.status(200).json({ result: data });
    } catch {
      return res.status(503).json({ error: 'The pipeline switch could not be changed.' });
    }
  }

  const requested = Number.parseInt(Array.isArray(req.query.windowHours) ? req.query.windowHours[0] : req.query.windowHours, 10);
  const windowHours = [24, 72, 168].includes(requested) ? requested : 24;
  try {
    const [operationsResult, quarantineResult] = await Promise.all([
      connection.admin.rpc('fn_video_operations_snapshot', { p_window_hours: windowHours }),
      connection.admin.rpc('fn_video_reconciliation_quarantine_snapshot'),
    ]);
    const { data, error } = operationsResult;
    const { data: reconciliationQuarantines, error: quarantineError } = quarantineResult;
    if (error || !data || typeof data !== 'object' || Array.isArray(data)
      || quarantineError || !isVideoReconciliationQuarantineSnapshot(reconciliationQuarantines)) {
      return res.status(503).json({ error: 'Video operations snapshot is unavailable' });
    }
    const snapshot = { ...data, reconciliationQuarantines };
    return res.status(200).json({ snapshot, alerts: buildAlerts(snapshot) });
  } catch {
    return res.status(503).json({ error: 'Video operations snapshot is unavailable' });
  }
}
