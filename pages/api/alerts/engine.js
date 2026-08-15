/* ═══════════════════════════════════════════════════════════════════════════
   API: Alertmanager webhook receiver — engine + infra alerts

   WHY THIS EXISTS (2026-08-15)

   Ten poker tables froze permanently and sat dead for 18+ minutes. Nobody was
   notified, and nobody COULD have been: an audit found 27 alert rules querying
   metrics that do not exist in Prometheus (EngineDown queried
   `up{job="engine_pm2"}` while the real scrape job is `engine_game_server`),
   and Alertmanager routed every alert that did fire to a `null-receiver`.
   The Slack webhook in the monitoring .env turned out to be truncated and
   invalid — Slack answered webhook posts with its documentation homepage.

   So this endpoint is the delivery path that does not depend on any external
   account being correctly configured:
     1. Record EVERY alert in public.engine_alerts. That table is the durable
        answer to "did we know?", independent of whether email went out.
     2. Email critical alerts via Resend, which is already configured and in
        use by other routes in this codebase.

   Auth: shared secret via the `x-alert-secret` header, matched against
   ALERT_WEBHOOK_SECRET. Alertmanager sends it as a custom HTTP header.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || 'admin@smarter.poker';

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

async function fetchWithTimeout(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function emailCritical(alerts) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || alerts.length === 0) return false;

    const rows = alerts
        .map((a) => {
            const l = a.labels || {};
            const ann = a.annotations || {};
            return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>${escapeHtml(l.alertname)}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(ann.summary || '')}</td>
      </tr>
      <tr><td colspan="2" style="padding:0 12px 12px;color:#555;font-size:13px;white-space:pre-wrap;border-bottom:1px solid #eee">${escapeHtml(ann.description || '')}${ann.runbook ? `<br><a href="${escapeHtml(ann.runbook)}">Runbook</a>` : ''}</td></tr>`;
        })
        .join('');

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
    <h2 style="color:#c0392b;margin-bottom:4px">Production alert — players may be affected</h2>
    <p style="color:#666;margin-top:0">${alerts.length} critical alert(s) firing on the poker engine.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <p style="color:#888;font-size:12px;margin-top:16px">
      Engine health: <a href="https://engine.smarter.poker/health">engine.smarter.poker/health</a><br>
      Look at <code>stalledTables</code> for the affected table ids.
    </p>
  </div>`;

    try {
        const r = await fetchWithTimeout(
            'https://api.resend.com/emails',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: `Engine Alerts <${process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker'}>`,
                    to: ALERT_EMAIL_TO,
                    subject: `[CRITICAL] ${alerts.map((a) => a.labels?.alertname).filter(Boolean).join(', ')}`,
                    html,
                    tags: [{ name: 'source', value: 'engine-alerts' }],
                }),
            },
            10000
        );
        if (!r.ok) {
            console.warn('[alerts/engine] Resend rejected:', r.status, (await r.text()).slice(0, 200));
            return false;
        }
        return true;
    } catch (err) {
        console.warn('[alerts/engine] Resend error:', err.message);
        return false;
    }
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const expected = process.env.ALERT_WEBHOOK_SECRET;
        if (!expected) {
            // Fail closed: an unauthenticated public alert sink is a spam vector.
            console.warn('[alerts/engine] ALERT_WEBHOOK_SECRET not configured — refusing');
            return res.status(503).json({ error: 'Alert receiver not configured' });
        }
        if (req.headers['x-alert-secret'] !== expected) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const body = req.body || {};
        const alerts = Array.isArray(body.alerts) ? body.alerts : [];
        if (alerts.length === 0) return res.status(200).json({ ok: true, recorded: 0 });

        const critical = alerts.filter(
            (a) => a.status === 'firing' && (a.labels?.severity === 'critical')
        );
        const emailed = await emailCritical(critical);

        // Record LAST, and never let a DB failure swallow the alert silently:
        // the console line is picked up by container logs either way.
        const rows = alerts.map((a) => ({
            fingerprint: a.fingerprint || `${a.labels?.alertname}-${a.startsAt}`,
            alertname: a.labels?.alertname || 'unknown',
            severity: a.labels?.severity || 'unknown',
            component: a.labels?.component || null,
            status: a.status || 'firing',
            summary: a.annotations?.summary || null,
            description: a.annotations?.description || null,
            labels: a.labels || {},
            starts_at: a.startsAt || null,
            ends_at: a.endsAt && !a.endsAt.startsWith('0001') ? a.endsAt : null,
            notified_via: emailed && a.labels?.severity === 'critical' ? ['email'] : [],
        }));

        for (const r of rows) {
            console.warn(
                `[alerts/engine] ${r.status.toUpperCase()} ${r.severity} ${r.alertname}: ${r.summary || ''}`
            );
        }

        const { error } = await getSupabase().from('engine_alerts').insert(rows);
        if (error) console.warn('[alerts/engine] DB insert failed:', error.message);

        return res.status(200).json({
            ok: true,
            recorded: rows.length,
            critical: critical.length,
            emailed,
            db: error ? 'failed' : 'ok',
        });
    } catch (err) {
        reportApiError?.(err, 'alerts/engine');
        console.error('[alerts/engine] handler error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
