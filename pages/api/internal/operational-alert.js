import { ALERT_TASK_ID, alertEventKey, authorizedAlert, recordOperationalAlerts } from '../../../src/lib/operationalAlerts.mjs';
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  if (!authorizedAlert(req, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  const b = req.body;
  if (!b || typeof b.source !== 'string' || !b.source.trim() || b.source.length > 120
      || typeof b.alertname !== 'string' || !b.alertname.trim() || b.alertname.length > 240
      || !['firing', 'resolved', 'info'].includes(b.status)
      || !b.payload || typeof b.payload !== 'object' || Array.isArray(b.payload)
      || (b.eventKey !== undefined && (typeof b.eventKey !== 'string' || !b.eventKey || b.eventKey.length > 512))) {
    return res.status(400).json({ error: 'Malformed operational alert' });
  }
  try {
    const ids = await recordOperationalAlerts([{ source: b.source, event_key: b.eventKey || alertEventKey(b),
      alertname: b.alertname, status: b.status, severity: b.severity || 'critical', payload: b.payload }]);
    return res.status(200).json({ recorded: true, ids, destination: 'codex', taskId: ALERT_TASK_ID });
  } catch {
    return res.status(503).json({ recorded: false, error: 'Operational inbox unavailable; retry delivery' });
  }
}
