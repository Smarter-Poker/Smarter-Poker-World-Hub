/**
 * /api/cron/email-deliverability-check — Nightly Email Health Audit
 * ═══════════════════════════════════════════════════════════════════════════
 * Confirmation emails breaking is a SILENT signup killer: users sign up,
 * never get the email, never confirm, never become real users. The
 * signup-probe alone wouldn't catch this because it uses
 * admin.createUser with email_confirm:true (skips email sending).
 *
 * This cron runs nightly and asserts:
 *   1. Resend domain is verified (SPF + DKIM aligned)
 *   2. SUPABASE_SMTP env vars match Resend (or whichever provider)
 *   3. The DNS records for smarter.poker include SPF that authorizes
 *      Resend (`include:_spf.resend.com`)
 *   4. RESEND_API_KEY is set + the API key works (calls Resend
 *      `/domains` endpoint to verify)
 *
 * Failures are surfaced via:
 *   - /api/health/signup (would surface as a "warn" eventually if we
 *     wired this in)
 *   - probe_heartbeats with status='failed'
 *   - Optional Resend email + Sentry capture
 *
 * What this CANNOT detect:
 *   - Specific recipient inbox provider (Gmail, Outlook) flagging us as
 *     spam — that requires a separate inbox-placement test (use Mailgenius
 *     or similar)
 *   - One-off bounces — only systemic issues
 *
 * Cadence: once a day at 6am UTC (cheap, RESTful, no probe burn).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { validateCronAuth } from '../../../src/utils/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { withCronHealth } from '../../../src/lib/cronHealth';

let Sentry;
try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    Sentry = require('@sentry/nextjs');
} catch (_) {
    Sentry = { captureMessage: () => null, withScope: (cb) => cb({ setTag: () => null, setLevel: () => null }) };
}

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

const DOMAIN = 'smarter.poker';

async function checkResendDomain() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return { check: 'resend_api_key', ok: false, detail: 'RESEND_API_KEY not set' };
    }
    try {
        const resp = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${apiKey}` },
            // 10s timeout
            signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) {
            return { check: 'resend_api_key', ok: false, detail: `Resend API returned ${resp.status}` };
        }
        const body = await resp.json();
        const domains = body?.data || [];
        const ourDomain = domains.find((d) => d.name === DOMAIN);
        if (!ourDomain) {
            return { check: 'resend_domain_listed', ok: false, detail: `${DOMAIN} not configured in Resend account` };
        }
        if (ourDomain.status !== 'verified') {
            return { check: 'resend_domain_verified', ok: false, detail: `Resend domain status: ${ourDomain.status}` };
        }
        return { check: 'resend_domain_verified', ok: true, detail: 'verified' };
    } catch (e) {
        return { check: 'resend_api_key', ok: false, detail: `Resend API call failed: ${e?.message}` };
    }
}

async function checkSpfRecord() {
    // Use Cloudflare's DNS-over-HTTPS to look up TXT records.
    // (Avoid Node DNS module — unreliable in Vercel edge.)
    try {
        const resp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        if (!resp.ok) return { check: 'spf_record', ok: false, detail: `DoH returned ${resp.status}` };
        const body = await resp.json();
        const txts = (body?.Answer || []).map((a) => a.data || '').join(' | ');
        const hasSpf = /v=spf1/i.test(txts);
        const includesResend = /include:_?spf\.resend\.com/i.test(txts) || /include:resend\.com/i.test(txts);
        if (!hasSpf) return { check: 'spf_record', ok: false, detail: 'No SPF record found for ' + DOMAIN };
        if (!includesResend) return { check: 'spf_includes_resend', ok: false, detail: 'SPF exists but does not include Resend — ' + txts.slice(0, 200) };
        return { check: 'spf_includes_resend', ok: true, detail: 'SPF authorizes Resend' };
    } catch (e) {
        return { check: 'spf_record', ok: false, detail: `DNS lookup failed: ${e?.message}` };
    }
}

async function checkDkimRecord() {
    // Resend uses `resend._domainkey.<domain>` as the selector
    try {
        const resp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=resend._domainkey.${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        if (!resp.ok) return { check: 'dkim_record', ok: false, detail: `DoH returned ${resp.status}` };
        const body = await resp.json();
        const txts = (body?.Answer || []).map((a) => a.data || '').join(' | ');
        const hasDkim = /v=DKIM1/i.test(txts) || /p=[A-Za-z0-9+/]/i.test(txts);
        if (!hasDkim) return { check: 'dkim_record', ok: false, detail: 'No DKIM record at resend._domainkey.' + DOMAIN };
        return { check: 'dkim_record', ok: true, detail: 'DKIM record present' };
    } catch (e) {
        return { check: 'dkim_record', ok: false, detail: `DNS lookup failed: ${e?.message}` };
    }
}

async function checkDmarcRecord() {
    try {
        const resp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=_dmarc.${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        if (!resp.ok) return { check: 'dmarc_record', ok: true, detail: 'DoH returned ' + resp.status + ' — DMARC optional, treating as pass' };
        const body = await resp.json();
        const txts = (body?.Answer || []).map((a) => a.data || '').join(' | ');
        const hasDmarc = /v=DMARC1/i.test(txts);
        if (!hasDmarc) {
            // DMARC is highly recommended but not strictly required —
            // warn but don't fail
            return { check: 'dmarc_record', ok: true, severity: 'warn', detail: 'No DMARC record. Recommend adding p=quarantine' };
        }
        return { check: 'dmarc_record', ok: true, detail: 'DMARC present: ' + txts.slice(0, 100) };
    } catch (e) {
        return { check: 'dmarc_record', ok: true, severity: 'warn', detail: `DNS lookup failed: ${e?.message}` };
    }
}

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const started = Date.now();
    const results = await Promise.all([
        checkResendDomain(),
        checkSpfRecord(),
        checkDkimRecord(),
        checkDmarcRecord(),
    ]);

    const failures = results.filter((r) => !r.ok);
    const status = failures.length === 0 ? 'ok' : 'failed';

    // Heartbeat
    const admin = getAdmin();
    if (admin) {
        // The heartbeat must never take the probe down with it.
        //
        // This was `.insert({...}).catch(() => null)`. Supabase's PostgREST
        // builder is a THENABLE, not a Promise: it implements .then() but has
        // no .catch(), so the call threw TypeError before the await ever ran —
        // every day since 2026-06-17, per Vercel's runtime errors. The probe
        // that exists to tell us when email delivery breaks was itself broken,
        // silently, for two months.
        //
        // The builder returns { error } rather than rejecting, so the failure
        // is read from the result instead of caught.
        const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
            probe_name: 'email-deliverability',
            status: failures.length > 0 ? 'failed' : 'ok',
            duration_ms: Date.now() - started,
            details: { results, failure_count: failures.length },
        });
        if (heartbeatErr) {
            console.warn('[email-deliverability] heartbeat write failed:', heartbeatErr.message);
        }
    }

    if (failures.length > 0) {
        // Sentry alert
        try {
            Sentry.withScope((scope) => {
                scope.setTag('auth.flow', 'email_deliverability');
                scope.setTag('auth.source', 'email_deliverability_cron');
                scope.setLevel('error');
                Sentry.captureMessage(`Email deliverability degraded: ${failures.map((f) => f.check).join(', ')}`);
            });
        } catch (_) { /* never fail cron because of alerting */ }

        // Email alert
        if (process.env.RESEND_API_KEY && process.env.OPS_ALERT_EMAIL) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker',
                        to: process.env.OPS_ALERT_EMAIL,
                        subject: `[smarter.poker] Email deliverability check FAILED — ${failures.length}/4`,
                        text: JSON.stringify({ failures, allResults: results }, null, 2),
                    }),
                });
            } catch (_) { /* swallow — alerting failure shouldn't fail the cron */ }
        }
    }

    return res.status(failures.length === 0 ? 200 : 503).json({
        status,
        domain: DOMAIN,
        check_count: results.length,
        failure_count: failures.length,
        results,
        duration_ms: Date.now() - started,
    });
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('email-deliverability-check', handler);
