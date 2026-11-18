/**
 * The campaign sender. Runs inside the existing hourly
 * /api/cron/signup-welcome-back fire, after player announcements, because
 * CLAUDE.md section 11 forbids a net-new cron route.
 *
 * One run:
 *   1. links contacts who have since signed up (the conversion count);
 *   2. connects the Resend webhook once, if it is not connected yet, and
 *      keeps its signing secret in sp_marketing_settings (service-role only),
 *      so bounces and complaints come back without anybody pasting a secret;
 *   3. sends the next batch inside every cap the database enforces
 *      (per-campaign daily cap, global daily cap, sending switch, mailing
 *      address present), each with an idempotency key so an overlapping run
 *      can never send one person the same campaign twice.
 *
 * Nothing pending is a no-op. A failure here never turns the welcome-back run
 * red: the caller wraps it in its own try, like the other two steps.
 */
import { campaignEmail, sendBlockers } from './template.mjs';
import { PUBLIC_BASE_URL } from './links.mjs';

export const WEBHOOK_EVENTS = ['email.delivered', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked'];
export const WEBHOOK_ENDPOINT = `${PUBLIC_BASE_URL}/api/email/resend-webhook`;
const MAIL_DOMAIN = 'mail.smarter.poker';

/** The From header. The Pro account only sends from mail.smarter.poker, so anything else falls back to it. */
export function campaignFrom(settings, bulkAddr) {
    const name = String(settings?.from_name || 'Smarter.Poker').replace(/[<>"]/g, '').trim() || 'Smarter.Poker';
    const wanted = String(settings?.from_email || '').trim().toLowerCase();
    const addr = wanted.endsWith(`@${MAIL_DOMAIN}`) ? wanted : (bulkAddr || `promos@${MAIL_DOMAIN}`);
    return `${name} <${addr}>`;
}

export async function ensureResendWebhook(sb, { apiKey, fetchImpl = fetch, log = () => {} } = {}) {
    const { data: s, error } = await sb.from('sp_marketing_settings').select('webhook_secret, webhook_id').eq('id', 1).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (s?.webhook_secret) return { ok: true, already: true };
    if (!apiKey) return { ok: false, error: 'no Resend key' };
    const res = await fetchImpl('https://api.resend.com/webhooks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ endpoint: WEBHOOK_ENDPOINT, events: WEBHOOK_EVENTS }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.signing_secret) {
        return { ok: false, error: `resend webhooks ${res.status}: ${String(body?.message || body?.name || '').slice(0, 200)}` };
    }
    const { error: upErr } = await sb.from('sp_marketing_settings').update({
        webhook_id: body.id || null, webhook_secret: body.signing_secret, webhook_connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', 1);
    if (upErr) return { ok: false, error: upErr.message };
    log(`[marketing] Resend webhook connected (${body.id || 'id unknown'})`);
    return { ok: true, created: true };
}

export async function runMarketingCampaigns(sb, {
    sendEmail, apiKey = null, bulkAddr = null, fetchImpl = fetch, log = () => {}, deadline = Date.now() + 60000, batch = 60, env = process.env,
} = {}) {
    const summary = { linked: 0, webhook: null, batch: 0, sent: 0, failed: 0, deferred: 0, blocked: null, errors: [] };

    const { data: linked, error: linkErr } = await sb.rpc('fn_sp_marketing_link_conversions');
    if (linkErr) summary.errors.push(`link: ${linkErr.message}`); else summary.linked = Number(linked) || 0;

    try { summary.webhook = await ensureResendWebhook(sb, { apiKey, fetchImpl, log }); }
    catch (e) { summary.webhook = { ok: false, error: String(e?.message || e) }; }

    const { data: settings, error: setErr } = await sb.from('sp_marketing_settings').select('*').eq('id', 1).maybeSingle();
    if (setErr || !settings) { summary.errors.push(`settings: ${setErr?.message || 'missing'}`); return summary; }

    const { data: rows, error } = await sb.rpc('fn_sp_marketing_next_batch', { p_limit: batch });
    if (error) { summary.errors.push(`batch: ${error.message}`); return summary; }
    summary.batch = (rows || []).length;
    if (!summary.batch) return summary;

    const ids = [...new Set(rows.map((r) => r.campaign_id))];
    const { data: campaigns, error: cErr } = await sb.from('sp_marketing_campaigns').select('*').in('id', ids);
    if (cErr) { summary.errors.push(`campaigns: ${cErr.message}`); return summary; }
    const byId = new Map((campaigns || []).map((c) => [c.id, c]));
    const from = campaignFrom(settings, bulkAddr);

    for (const r of rows) {
        if (Date.now() >= deadline) { summary.deferred++; continue; }
        const c = byId.get(r.campaign_id);
        if (!c || c.status !== 'sending') continue;
        const blockers = sendBlockers(c, settings);
        if (blockers.length) { summary.blocked = blockers; break; }
        const msg = campaignEmail(c, { email: r.email, display_name: r.display_name }, settings, { env });
        const res = await sendEmail({
            to: [r.email], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers,
            idempotencyKey: `campaign-${c.id}-${r.email_key}`, from, replyTo: settings.reply_to || null,
            ...(apiKey ? { apiKey } : {}),
        });
        if (res?.ok) summary.sent++; else summary.failed++;
        const { error: mErr } = await sb.rpc('fn_sp_marketing_mark_sent', {
            p_campaign_id: c.id, p_email_key: r.email_key, p_ok: !!res?.ok,
            p_provider_id: res?.ok ? (res.id || null) : null, p_error: res?.ok ? null : String(res?.error || 'unknown'),
        });
        if (mErr) summary.errors.push(`mark ${r.email_key}: ${mErr.message}`);
    }
    log(`[marketing] batch ${summary.batch}: sent ${summary.sent}, failed ${summary.failed}, deferred ${summary.deferred}${summary.blocked ? `, blocked: ${summary.blocked.join(' ')}` : ''}`);
    return summary;
}

/** A test send to the operator. Never touches recipients or caps. */
export async function sendCampaignTest(campaign, settings, to, { sendEmail, displayName = '', apiKey = null, bulkAddr = null, env = process.env } = {}) {
    const msg = campaignEmail(campaign, { email: to, display_name: displayName }, settings, { env, test: true });
    const res = await sendEmail({
        to: [to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers,
        from: campaignFrom(settings, bulkAddr), replyTo: settings?.reply_to || null,
        idempotencyKey: `campaign-test-${campaign.id}-${Date.now()}`, ...(apiKey ? { apiKey } : {}),
    });
    return res;
}
