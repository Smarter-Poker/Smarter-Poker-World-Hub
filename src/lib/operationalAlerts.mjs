import { createHash, timingSafeEqual } from 'node:crypto';

export const ALERT_TASK_ID = '01a09b86-5ba8-7290-8657-1041f13dd3ca';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function alertEventKey(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function authorizedAlert(req, expected, header = 'authorization') {
  const supplied = header === 'authorization'
    ? String(req.headers?.authorization || req.headers?.Authorization || '').replace(/^Bearer\s+/i, '')
    : String(req.headers?.[header] || '');
  const a = Buffer.from(String(expected || '').trim());
  const b = Buffer.from(supplied.trim());
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
export function alertmanagerEvents(payload, source = 'alertmanager') {
  if (!object(payload) || !Array.isArray(payload.alerts) || payload.alerts.length > 200) {
    throw new TypeError('Expected at most 200 Alertmanager alerts');
  }
  if (payload.truncatedAlerts > 0) throw new TypeError('Truncated alerts must be replayed in full');
  return payload.alerts.map((alert) => {
    if (!object(alert) || !object(alert.labels) || typeof alert.labels.alertname !== 'string'
        || !alert.labels.alertname.trim() || !['firing', 'resolved'].includes(alert.status)) {
      throw new TypeError('Malformed alert');
    }
    // Preserve every label, annotation and timestamp. Do not truncate evidence
    // to the old SMS character limit or combine unrelated alerts into one row.
    const evidence = { alert, receiver: payload.receiver || null, externalURL: payload.externalURL || null };
    return { source, event_key: alertEventKey(evidence), alertname: alert.labels.alertname,
      status: alert.status, severity: alert.labels.severity || 'unknown', payload: evidence };
  });
}
export async function recordOperationalAlerts(events) {
  if (!events.length) return [];
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Operational inbox is not configured');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/fn_record_operational_alerts`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_events: events }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Operational inbox refused delivery (${response.status})`);
  const ids = await response.json();
  if (!Array.isArray(ids) || ids.length !== events.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Operational inbox returned an invalid receipt');
  }
  return ids;
}
