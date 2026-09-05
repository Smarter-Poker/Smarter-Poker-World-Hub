/**
 * POST /api/internal/alertmanager-page
 *
 * THE 3AM PAGER (2026-09-04)
 *
 * Alertmanager on engine-01 posts here, natively, for every alert carrying the
 * label `page: sms`. This route turns that into a text message on Dan's phone.
 * Everything else Alertmanager knows about goes to the email digest and never
 * touches this file.
 *
 * WHY IT EXISTS. Thirty Prometheus rules shipped on 2026-09-04 and, with the
 * Sentry subscription gone, Alertmanager became the only path from a firing
 * rule to a human. Its email receiver worked; nothing reached a phone. Dan was
 * asked which alerts are worth waking for and answered with six. Those six
 * carry `page: sms` in infra/monitoring/*.yml in the Club Arena repo, and a
 * test there fails if the list changes without saying so.
 *
 * WHY HERE, AND NOT THE OPEN CLAW DISPATCHER. The dispatcher has a Twilio
 * path too, but it runs on a different host from Alertmanager and every way of
 * letting it read Alertmanager's API meant carrying a credential across hosts
 * or reopening the Caddy vhost that also fronts the game server. Alertmanager
 * can already POST to the public internet with a bearer token from a file, this
 * app already authenticates cron traffic with CRON_SECRET, and this app already
 * pages the same phone from deploy-monitor.js with the same Twilio account. So
 * the whole thing is one new file and one secret file on engine-01.
 *
 * WHO CAN CALL IT. Only a caller presenting CRON_SECRET - the same gate every
 * cron route uses. A wrong or missing token is a 401 and nothing is sent.
 *
 * WHAT IT SENDS. One text per Alertmanager notification. Alertmanager groups
 * by alertname and owns the repeat interval (4h for this route, see
 * alertmanager.yml), so this file is deliberately stateless - the dedup lives
 * where the state already is. A resolved notification sends a RESOLVED text so
 * the loop closes.
 *
 * WHAT IT RETURNS. 200 once Twilio accepted the message. 502 if Twilio did not,
 * so Alertmanager retries with backoff - a page that failed to send SHOULD be
 * retried. 400/401/405 are not retried by Alertmanager and are not meant to be.
 */

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

/** The phone that deploy-monitor.js already pages. Overridable per environment. */
const PAGER_PHONE = (process.env.ALERT_PAGER_PHONE || '+17086775221').trim();

/** Twilio's hard SMS ceiling is 1600 chars; keep a page readable on a lock screen. */
const MAX_SMS_CHARS = 480;

function readBearer(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  if (m) return m[1].trim();
  const x = req.headers['x-cron-secret'];
  return x ? String(x).trim() : '';
}

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

/** Same mechanism deploy-monitor.js uses; no SDK, one POST. */
async function sendSms(body) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const fromPhone = (process.env.TWILIO_PHONE_NUMBER || '').trim();
  if (!accountSid || !authToken || !fromPhone) {
    return { ok: false, status: 0, reason: 'twilio env missing' };
  }
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const form = new URLSearchParams({ From: fromPhone, To: PAGER_PHONE, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  );
  if (res.ok) return { ok: true, status: res.status };
  const err = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, reason: err?.message || `twilio ${res.status}` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || readBearer(req) !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.alerts)) {
    return res.status(400).json({ error: 'not an Alertmanager webhook payload' });
  }

  const text = renderPage(payload);
  if (!text) {
    // Alertmanager only routes page=sms here, so this is a routing mistake
    // rather than a normal case. Say so, but do not make Alertmanager retry.
    console.warn('[alertmanager-page] notification carried no page=sms alerts', {
      receiver: payload.receiver,
      alertnames: payload.alerts.map((a) => a?.labels?.alertname),
    });
    return res.status(200).json({ sent: false, reason: 'no page=sms alerts' });
  }

  try {
    const r = await sendSms(text);
    if (r.ok) {
      console.warn('[alertmanager-page] paged', {
        status: payload.status,
        alerts: payload.alerts.map((a) => a?.labels?.alertname),
      });
      return res.status(200).json({ sent: true });
    }
    console.error('[alertmanager-page] Twilio refused the page', r);
    return res.status(502).json({ sent: false, reason: r.reason });
  } catch (err) {
    // Not routed through reportApiError: this route is not on the Sentry
    // allowlist (docs/SENTRY-FREE-TIER-POLICY.md), so that call would only
    // console.error anyway - and a pager that pages about itself failing is
    // a loop. Vercel captures the log; Alertmanager retries on the 502.
    console.error('[alertmanager-page] send threw', err?.message || err);
    return res.status(502).json({ sent: false, reason: err?.message || 'send failed' });
  }
}
