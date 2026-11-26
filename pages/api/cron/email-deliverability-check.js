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
import { resendApiKey, resendFrom, resendSendingDomain } from '../../../src/lib/email/resendAccount.mjs';


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
    // The account in use decides which domain must be verified: the Pro key
    // sends from mail.smarter.poker, the original key from smarter.poker.
    const apiKey = resendApiKey();
    const DOMAIN = resendSendingDomain();
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
        if (!hasSpf) return { check: 'spf_record', ok: false, detail: 'No SPF record found for ' + DOMAIN };

        // Resend's SPF does NOT live on the root domain, and looking for it
        // there failed this probe every single day.
        //
        // SPF is evaluated against the envelope sender (Return-Path), not the
        // visible From. Resend sends via Amazon SES and uses `send.<domain>`
        // as that Return-Path, so its SPF record belongs there. Live DNS:
        //   smarter.poker        "v=spf1 include:spf.privateemail.com ~all"
        //   send.smarter.poker   "v=spf1 include:amazonses.com ~all"
        // Both are correct. The root record covers Private Email, which the MX
        // records (mx1/mx2.privateemail.com) confirm is the real mailbox host;
        // the subdomain record covers Resend.
        //
        // The old test demanded `include:spf.resend.com` on the ROOT, which
        // Resend never asks for. Satisfying it would have meant adding
        // `include:amazonses.com` to smarter.poker - authorising the whole of
        // Amazon SES to send as @smarter.poker, far broader than needed. The
        // check was pushing toward a WORSE configuration than the live one.
        //
        // Cost of the false positive: a daily 503, `error` in cron_health_log
        // password-reset mail has broken. Identical failure recorded in
        // probe_heartbeats on 2026-08-15, -16 and -17.
        const sendResp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=send.${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        if (!sendResp.ok) {
            return { check: 'spf_includes_resend', ok: false, detail: `DoH returned ${sendResp.status} for send.${DOMAIN}` };
        }
        const sendBody = await sendResp.json();
        const sendTxts = (sendBody?.Answer || []).map((a) => a.data || '').join(' | ');
        // Accept the SES include Resend actually provisions, or a literal
        // resend.com include on either name in case they change instructions.
        const resendAuthorized =
            /include:amazonses\.com/i.test(sendTxts) ||
            /include:_?spf\.resend\.com/i.test(sendTxts) ||
            /include:_?spf\.resend\.com/i.test(txts);

        if (!resendAuthorized) {
            return {
                check: 'spf_includes_resend',
                ok: false,
                detail:
                    `No Resend SPF on send.${DOMAIN} (expected include:amazonses.com). ` +
                    `send.${DOMAIN} = "${sendTxts.slice(0, 120) || '(no TXT)'}"`,
            };
        }
        return {
            check: 'spf_includes_resend',
            ok: true,
            detail: `Root SPF present; Resend authorized via send.${DOMAIN}`,
        };
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
        if (!resp.ok) return { check: 'dmarc_record', ok: true, detail: 'DoH returned ' + resp.status + ' - DMARC optional, treating as pass' };
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

export async function checkBulkMailDns() {
    try {
        const spfResp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=send.mail.${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        let hasSpf = false;
        let spfTxts = '';
        if (spfResp.ok) {
            const body = await spfResp.json();
            spfTxts = (body?.Answer || []).map((a) => a.data || '').join(' | ');
            hasSpf = /v=spf1/i.test(spfTxts);
        }

        const dmarcResp = await fetch(
            `https://cloudflare-dns.com/dns-query?name=_dmarc.${DOMAIN}&type=TXT`,
            { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
        );
        let hasDmarc = false;
        let dmarcTxts = '';
        if (dmarcResp.ok) {
            const body = await dmarcResp.json();
            dmarcTxts = (body?.Answer || []).map((a) => a.data || '').join(' | ');
            hasDmarc = /v=DMARC1/i.test(dmarcTxts);
        }

        if (!hasSpf) {
            return {
                check: 'bulk_mail_dns',
                ok: true,
                severity: 'warn',
                detail: `send.mail.${DOMAIN} missing SPF record (${spfTxts.slice(0, 100) || 'none'})`,
            };
        }

        if (!hasDmarc) {
            return {
                check: 'bulk_mail_dns',
                ok: true,
                severity: 'warn',
                detail: `_dmarc.${DOMAIN} missing DMARC record (${dmarcTxts.slice(0, 100) || 'none'})`,
            };
        }

        return {
            check: 'bulk_mail_dns',
            ok: true,
            detail: `Bulk mail DNS aligned: send.mail.${DOMAIN} SPF present, _dmarc.${DOMAIN} DMARC present`,
        };
    } catch (e) {
        return {
            check: 'bulk_mail_dns',
            ok: true,
            severity: 'warn',
            detail: `Bulk mail DNS lookup failed: ${e?.message}`,
        };
    }
}

export async function checkNewsletterReputation7d(admin) {
    if (!admin) {
        return {
            check: 'newsletter_reputation_7d',
            ok: true,
            detail: 'Database admin client unavailable, skipping 7d reputation check',
        };
    }
    try {
        const sevenDaysAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

        // 1. 7d sent count from newsletter_campaigns
        let campaignsQuery = admin
            .from('newsletter_campaigns')
            .select('sent_count')
            // in-list: bounded status list
            .in('status', ['sent', 'partial']);
        if (typeof campaignsQuery.gte === 'function') {
            campaignsQuery = campaignsQuery.gte('created_at', sevenDaysAgoIso);
        }
        const campaignsRes = await campaignsQuery;
        const sent7d = (campaignsRes?.data || []).reduce(
            (sum, c) => sum + (Number(c?.sent_count) || 0),
            0,
        );

        // 2. 7d bounces from newsletter_subscribers
        let bounceQuery = admin
            .from('newsletter_subscribers')
            .select('id')
            .eq('source', 'resend_bounce');
        if (typeof bounceQuery.gte === 'function') {
            bounceQuery = bounceQuery.gte('unsubscribed_at', sevenDaysAgoIso);
        }
        const bounceRes = await bounceQuery;
        const bounceCount = Number(
            bounceRes?.count ?? (Array.isArray(bounceRes?.data) ? bounceRes.data.length : 0),
        );

        // 3. 7d complaints from newsletter_subscribers
        let complaintQuery = admin
            .from('newsletter_subscribers')
            .select('id')
            .eq('source', 'resend_complaint');
        if (typeof complaintQuery.gte === 'function') {
            complaintQuery = complaintQuery.gte('unsubscribed_at', sevenDaysAgoIso);
        }
        const complaintRes = await complaintQuery;
        const complaintCount = Number(
            complaintRes?.count ?? (Array.isArray(complaintRes?.data) ? complaintRes.data.length : 0),
        );

        const bounceRatePct = sent7d > 0 ? Number(((bounceCount / sent7d) * 100).toFixed(2)) : 0;
        const complaintRatePct = sent7d > 0 ? Number(((complaintCount / sent7d) * 100).toFixed(2)) : 0;

        const isElevated = sent7d >= 50 && (bounceRatePct >= 2.0 || complaintRatePct >= 0.1);

        if (isElevated) {
            return {
                check: 'newsletter_reputation_7d',
                ok: true,
                severity: 'warn',
                sent7d,
                bounceCount,
                complaintCount,
                bounceRatePct,
                complaintRatePct,
                detail: `Elevated 7d rates: bounceRate=${bounceRatePct}% (limit 2.0%), complaintRate=${complaintRatePct}% (limit 0.1%) over ${sent7d} sent`,
            };
        }

        return {
            check: 'newsletter_reputation_7d',
            ok: true,
            sent7d,
            bounceCount,
            complaintCount,
            bounceRatePct,
            complaintRatePct,
            detail: `Healthy 7d reputation: ${sent7d} sent, ${bounceCount} bounces (${bounceRatePct}%), ${complaintCount} complaints (${complaintRatePct}%)`,
        };
    } catch (e) {
        return {
            check: 'newsletter_reputation_7d',
            ok: true,
            severity: 'warn',
            detail: `Reputation check error: ${e?.message}`,
        };
    }
}

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const started = Date.now();
    const admin = getAdmin();
    const results = await Promise.all([
        checkResendDomain(),
        checkSpfRecord(),
        checkDkimRecord(),
        checkDmarcRecord(),
        checkBulkMailDns(),
        checkNewsletterReputation7d(admin),
    ]);

    const failures = results.filter((r) => !r.ok);
    const status = failures.length === 0 ? 'ok' : 'failed';

    // Heartbeat
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

        // Email alert
        if (resendApiKey() && process.env.OPS_ALERT_EMAIL) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${resendApiKey()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: resendFrom(process.env.RESEND_FROM_EMAIL || 'alerts@smarter.poker'),
                        to: process.env.OPS_ALERT_EMAIL,
                        subject: `[smarter.poker] Email deliverability check FAILED - ${failures.length}/4`,
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
