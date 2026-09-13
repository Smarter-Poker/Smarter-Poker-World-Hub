/** Authenticated durable engine fault intake, consumed by the Codex alert task. */
import { authorizedAlert, alertmanagerEvents } from '../../../src/lib/operationalAlerts.mjs';
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  if (!authorizedAlert(req, process.env.ALERT_WEBHOOK_SECRET, 'x-alert-secret')) return res.status(401).json({ error: 'Unauthorized' });
  let events;
  try { events = alertmanagerEvents(req.body, 'engine'); }
  catch { return res.status(400).json({ error: 'Malformed engine alerts' }); }
  if (!events.length) return res.status(200).json({ ok: true, recorded: 0 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return res.status(503).json({ ok: false, recorded: 0 });
  const rows = events.map(({ payload: { alert: a } }) => ({
    fingerprint: a.fingerprint || `${a.labels.alertname}-${a.startsAt || ''}`,
    alertname: a.labels.alertname, severity: a.labels.severity || 'unknown',
    component: a.labels.component || null, status: a.status,
    summary: a.annotations?.summary || null, description: a.annotations?.description || null,
    labels: a.labels, starts_at: a.startsAt || null,
    ends_at: a.endsAt && !a.endsAt.startsWith('0001') ? a.endsAt : null,
    notified_via: ['codex-inbox'],
  }));
  try {
    const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/engine_alerts`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(rows), signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error('Inbox insert failed');
    const receipts = await result.json();
    if (!Array.isArray(receipts) || receipts.length !== rows.length || receipts.some((r) => !r.id)) throw new Error('Missing receipts');
    return res.status(200).json({ ok: true, recorded: receipts.length, db: 'ok', destination: 'codex' });
  } catch {
    return res.status(503).json({ ok: false, recorded: 0, db: 'failed' });
  }
}
