/**
 * /api/email/resend-webhook - Resend delivery events (Dan, 2026-11-18).
 *
 * Before this route nothing read bounces or spam complaints back, so a dead
 * address was mailed again and a person who pressed "spam" kept getting mail -
 * from the same Resend account that sends signup codes. Now:
 *   - the request is verified with the Svix signature (src/lib/marketing/svix.mjs)
 *     against the signing secret the hourly runner stored when it created the
 *     webhook (sp_marketing_settings.webhook_secret); unsigned -> 401;
 *   - each event is recorded once (svix-id), a hard bounce or a complaint
 *     suppresses the address everywhere, and the campaign pauses itself if its
 *     complaint or bounce rate crosses the line (fn_sp_marketing_record_event).
 *
 * Events for mail that is not a campaign (signup codes, digests) are recorded
 * too, and a complaint about any of our mail suppresses promotional email to
 * that address: somebody who calls us spam should not get promotions.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { verifySvix } from '../../../src/lib/marketing/svix.mjs';

export const config = { api: { bodyParser: false } };

async function readRaw(req, limit = 256 * 1024) {
    if (typeof req.body === 'string') return req.body;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}

let cachedSecret = { value: null, at: 0 };

export function makeHandler({ getClient = createClient, now = () => Date.now() } = {}) {
    return async function handler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        let raw;
        try { raw = await readRaw(req); } catch (e) { return res.status(e.status || 400).json({ error: 'Bad body' }); }

        const sb = getClient();
        if (!cachedSecret.value || now() - cachedSecret.at > 60000) {
            const { data } = await sb.from('sp_marketing_settings').select('webhook_secret').eq('id', 1).maybeSingle();
            cachedSecret = { value: data?.webhook_secret || null, at: now() };
        }
        const verdict = verifySvix(cachedSecret.value, req.headers, raw, now());
        if (!verdict.ok) return res.status(401).json({ error: 'Unauthorized' });

        let event;
        try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
        const type = String(event?.type || '');
        const data = event?.data || {};
        const to = Array.isArray(data.to) ? data.to[0] : data.to;
        const { data: result, error } = await sb.rpc('fn_sp_marketing_record_event', {
            p_event_id: verdict.id, p_type: type, p_message_id: data.email_id || null, p_email: to || null, p_payload: event,
        });
        if (error) {
            console.error('[resend-webhook]', error.message);
            return res.status(500).json({ error: 'Not recorded' });
        }
        return res.status(200).json({ ok: true, ...(result || {}) });
    };
}

export function resetSecretCacheForTests() { cachedSecret = { value: null, at: 0 }; }

export default makeHandler();
