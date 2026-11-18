/**
 * /api/email/unsubscribe?t=<signed token>
 *
 *   POST (any body, including RFC 8058 "List-Unsubscribe=One-Click" sent by
 *        Gmail and Yahoo from the inbox button) -> unsubscribes at once.
 *   GET  -> a confirmation page with one button. A GET never unsubscribes on
 *        its own, because mail security scanners fetch every link in a
 *        message, and a scanner must not opt somebody out.
 *
 * The token is signed (src/lib/marketing/links.mjs), so a URL edited to name
 * another address is refused. The suppression list is the single do-not-email
 * list: campaigns and player announcement emails both read it.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { verifyUnsubscribe } from '../../../src/lib/marketing/links.mjs';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function page(title, message, form = '') {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + `<meta name="robots" content="noindex"><title>${esc(title)}</title></head>`
        + '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#05070a;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
        + '<main style="max-width:420px;width:calc(100% - 32px);padding:28px 24px;border-radius:16px;border-top:1px solid #8995a3;border-bottom:2px solid #11151a;background:linear-gradient(180deg,#2b333d 0%,#1a2028 45%,#12171d 100%);color:#d6dde6;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08);">'
        + '<img src="/email/smarter-poker-logo.jpg" alt="Smarter.Poker" width="140" height="140" style="border-radius:12px;">'
        + '<div style="height:2px;margin:12px 0 18px;background:linear-gradient(90deg,transparent,#2fa8ff,#9be0ff,#2fa8ff,transparent);"></div>'
        + `<h1 style="margin:0 0 10px;font-size:22px;color:#eef2f6;">${esc(title)}</h1><p style="margin:0 0 18px;line-height:1.55;">${esc(message)}</p>${form}`
        + '</main></body></html>';
}

export function makeHandler({ getClient = createClient, rateLimit = applyRateLimit, limits = LIMITS } = {}) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex');
        if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return res.status(405).send('Method Not Allowed');
        }
        if (!rateLimit(req, res, limits.write || limits.default)) return undefined;
        const token = String((req.query?.t ?? (req.body && typeof req.body === 'object' ? req.body.t : '')) || '');
        const claim = verifyUnsubscribe(token);
        if (!claim) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(400).send(page('Link Not Recognised', 'This unsubscribe link is not valid. Reply to any of our emails with UNSUBSCRIBE and we will take you off the list by hand.'));
        }
        if (req.method === 'GET') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            const form = `<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(token)}">`
                + '<button type="submit" style="cursor:pointer;padding:14px 30px;border-radius:999px;border:1px solid #a9e2ff;background:linear-gradient(180deg,#7cd0ff 0%,#2fa8ff 40%,#1170d6 100%);color:#fff;font-weight:800;letter-spacing:1px;text-transform:uppercase;font-size:15px;box-shadow:0 0 18px rgba(47,168,255,.55);">Unsubscribe</button></form>';
            return res.status(200).send(page('Stop These Emails?', `Unsubscribe ${claim.email} from Smarter.Poker promotional email.`, form));
        }
        const sb = getClient();
        const { error } = await sb.rpc('fn_sp_marketing_suppress', {
            p_email: claim.email, p_reason: 'unsubscribed', p_source: 'unsubscribe_link', p_campaign_id: claim.campaignId,
        });
        if (error) {
            console.error('[email-unsubscribe]', error.message);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(500).send(page('Something Went Wrong', 'We could not record that just now. Please try the link again in a minute.'));
        }
        const wantsHtml = String(req.headers?.accept || '').includes('text/html');
        if (!wantsHtml) return res.status(200).json({ success: true });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(page('You Are Unsubscribed', `${claim.email} will not get Smarter.Poker promotional email again. Account and security messages still arrive.`));
    };
}

export default makeHandler();
