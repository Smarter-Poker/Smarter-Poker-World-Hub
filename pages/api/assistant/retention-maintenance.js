import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { validateCronAuth } from '../../../src/utils/cron-auth';

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
 * Prunes expired `training_tool_records` rows (`tool_id = 'synced-hand-history'`)
 * for users who configured a finite `retention_days` policy in `pa_coaching_preferences`.
 * Fails closed if the preferences read or any per-user delete errors.
 */
export async function runSyncedHandHistoryRetentionSweep(admin, { limit = 250 } = {}) {
  if (!admin) {
    return {
      success: false,
      error: 'Missing Supabase Admin Client',
      syncedHandsDeleted: 0,
      usersChecked: 0,
      errors: ['Missing Supabase Admin Client'],
    };
  }

  const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 250)));
  const { data: prefRows, error: prefError } = await admin
    .from('pa_coaching_preferences')
    .select('user_id, retention_days')
    .not('retention_days', 'is', null)
    .limit(safeLimit);

  if (prefError) {
    const errMsg = prefError.message || 'Preferences retention query failed';
    console.warn('[assistant/retention-maintenance] synced hand history preferences query failed:', errMsg);
    return {
      success: false,
      error: errMsg,
      syncedHandsDeleted: 0,
      usersChecked: 0,
      errors: [errMsg],
    };
  }

  let syncedHandsDeleted = 0;
  let usersChecked = 0;
  const errors = [];

  for (const row of prefRows || []) {
    const userId = String(row?.user_id || '').trim();
    const rawDays = Number(row?.retention_days);
    if (!userId || !Number.isFinite(rawDays) || rawDays < 1) {
      continue;
    }

    const days = Math.min(3650, Math.max(1, Math.floor(rawDays)));
    const cutoffIso = new Date(Date.now() - days * 86400 * 1000).toISOString();
    usersChecked += 1;

    const { data: deletedRows, error: deleteError } = await admin
      .from('training_tool_records')
      .delete()
      .eq('user_id', userId)
      .eq('tool_id', 'synced-hand-history')
      .lt('updated_at', cutoffIso)
      .select('id');

    if (deleteError) {
      const msg = deleteError.message || `Failed to delete expired synced-hand-history for ${userId}`;
      errors.push(msg);
      continue;
    }

    syncedHandsDeleted += Array.isArray(deletedRows) ? deletedRows.length : 0;
  }

  if (errors.length > 0) {
    console.warn('[assistant/retention-maintenance] synced hand history sweep failed:', errors[0]);
    return {
      success: false,
      error: errors[0],
      syncedHandsDeleted,
      usersChecked,
      errors,
    };
  }

  return {
    success: true,
    error: null,
    syncedHandsDeleted,
    usersChecked,
    errors: [],
  };
}

async function retentionHandler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!validateCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const admin = getAdmin();
  if (!admin) return res.status(500).json({ status: 'unconfigured', error: 'Missing Supabase Environment Variables' });

  const started = Date.now();
  const { data, error } = await admin.rpc('apply_personal_assistant_retention_batch', { p_limit: 250 });
  if (error || data?.error || data?.success === false) {
    console.warn('[assistant/retention-maintenance] sweep failed:', error?.message || data?.error);
    return res.status(500).json({ status: 'error', error: 'Personal Assistant Retention Sweep Failed' });
  }

  const syncedHandsRetention = await runSyncedHandHistoryRetentionSweep(admin, { limit: 250 });
  if (!syncedHandsRetention.success) {
    console.warn('[assistant/retention-maintenance] synced hand history retention sweep failed:', syncedHandsRetention.error);
    return res.status(500).json({
      status: 'error',
      error: 'Personal Assistant Retention Sweep Failed',
      syncedHandsRetention,
    });
  }

  return res.status(200).json({
    status: 'ok',
    ...(data || {}),
    syncedHandsDeleted: syncedHandsRetention.syncedHandsDeleted,
    syncedHandsRetention,
    durationMs: Date.now() - started,
  });
}

const monitoredHandler = withCronHealth('personal-assistant-retention', retentionHandler);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
    return await monitoredHandler(req, res);
  } catch (error) {
    console.warn('[assistant/retention-maintenance] unexpected failure:', error?.message || error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ status: 'error', error: 'Personal Assistant Retention Sweep Failed' });
  }
}
