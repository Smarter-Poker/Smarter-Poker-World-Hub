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
  const alerts = events.map(({ payload: { alert } }) => alert);
  const eventIds = alerts.map((a) => a.labels.engine_alert_event_id ?? null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (alerts.some((a, i) => Object.hasOwn(a.labels, 'engine_alert_event_id')
      && (typeof eventIds[i] !== 'string' || !uuid.test(eventIds[i])))) {
    return res.status(400).json({ ok: false, recorded: 0, error: 'Malformed engine event ID' });
  }
  try {
    const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/fn_record_engine_alerts`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ p_alerts: alerts }), signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) {
      const failure = await result.json().catch(() => ({}));
      if (failure.code === '23505') return res.status(409).json({ ok: false, recorded: 0, error: 'Event ID payload collision' });
      if (['22023', '22007', '22008', '22P02'].includes(failure.code)) {
        return res.status(400).json({ ok: false, recorded: 0, error: 'Malformed engine alert' });
      }
      throw new Error('Inbox insert failed');
    }
    const receipts = await result.json();
    if (!Array.isArray(receipts) || receipts.length !== alerts.length || receipts.some((r, i) =>
      !Number.isSafeInteger(r?.id) || r.id <= 0 || r.event_id !== (eventIds[i]?.toLowerCase() ?? null))) {
      throw new Error('Missing or mismatched receipts');
    }
    return res.status(200).json({ ok: true, recorded: receipts.length, db: 'ok', destination: 'codex', receipts });
  } catch {
    return res.status(503).json({ ok: false, recorded: 0, db: 'failed' });
  }
}
