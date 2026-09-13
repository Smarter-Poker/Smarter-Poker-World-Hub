/** Operational pager intake. Every accepted alert is durable before 200; no SMS. */
import { ALERT_TASK_ID, alertmanagerEvents, authorizedAlert, recordOperationalAlerts } from '../../../src/lib/operationalAlerts.mjs';
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
const MAX_SMS_CHARS = 480;

/** Render one Alertmanager notification as a lock-screen-sized text. */
export function renderPage(payload) {
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  const paged = alerts.filter((a) => a?.labels?.page === 'sms');
  if (paged.length === 0) return null;

  const firing = paged.filter((a) => a.status === 'firing');
  const resolved = paged.filter((a) => a.status === 'resolved');

  const lines = [];
  if (firing.length) {
    lines.push('[PAGE] smarter.poker');
    for (const a of firing) {
      const name = a.labels?.alertname || 'unknown';
      const summary = (a.annotations?.summary || '').trim();
      lines.push(summary ? `${name}: ${summary}` : name);
    }
  }
  if (resolved.length) {
    lines.push(firing.length ? '' : '[RESOLVED] smarter.poker');
    for (const a of resolved) {
      lines.push(`resolved: ${a.labels?.alertname || 'unknown'}`);
    }
  }
  const url = (payload?.externalURL || '').trim();
  if (url) lines.push(url);

  const text = lines.join('\n');
  return Array.from(text).slice(0, MAX_SMS_CHARS).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const authenticated = authorizedAlert(req, process.env.CRON_SECRET)
    || authorizedAlert(req, process.env.CRON_SECRET, 'x-cron-secret');
  if (!authenticated) return res.status(401).json({ error: 'unauthorized' });
  let events;
  try { events = alertmanagerEvents(req.body); }
  catch { return res.status(400).json({ error: 'Malformed Alertmanager payload' }); }
  try {
    const ids = await recordOperationalAlerts(events);
    return res.status(200).json({ sent: false, recorded: ids.length, ids, destination: 'codex', taskId: ALERT_TASK_ID });
  } catch {
    return res.status(503).json({ sent: false, recorded: 0, error: 'Operational inbox unavailable; retry delivery' });
  }
}
