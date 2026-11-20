/**
 * The marketing email, in the Club Arena console look (#SmarterCasinoRealism):
 * a bevelled gunmetal frame with four rivets, a blue LED rail, chrome
 * lettering, the official Smarter.Poker crowned-king logo at the top (Dan,
 * 2026-11-18: "USE THE SMARTER.POKER LOGO"), and an illuminated pill button.
 *
 * Email HTML is its own dialect: tables for layout, inline styles only, solid
 * bgcolor fallbacks under every gradient (Outlook ignores gradients), images
 * with explicit width and alt text. Every campaign carries, by law and by
 * Gmail/Yahoo bulk-sender rules: who sent it, a postal address, a working
 * one-click unsubscribe, and a plain-text part.
 *
 * Pure module apart from links.mjs: no I/O, unit-tested.
 */
import { clickUrl, unsubscribeUrl, withUtm, PUBLIC_BASE_URL } from './links.mjs';

export const ASSETS = Object.freeze({
    brand: `${PUBLIC_BASE_URL}/email/smarter-poker-logo.jpg`,
    hero: `${PUBLIC_BASE_URL}/email/club-arena-hero.jpg`,
});

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** First name for "Hi Jason," - from the stored name, never guessed from an address. */
export function firstNameOf(displayName) {
    const n = String(displayName || '').trim().split(/\s+/)[0] || '';
    return /^[A-Za-z][A-Za-z'.-]{0,30}$/.test(n) ? n : '';
}

/** {{first_name}}, {{name}}, {{promo_code}} merge fields; unknown fields are left out, never printed raw. */
export function mergeFields(text, { displayName, promoCode } = {}) {
    const first = firstNameOf(displayName);
    return String(text || '')
        .replace(/\{\{\s*first_name\s*\}\}/gi, first || 'there')
        .replace(/\{\{\s*name\s*\}\}/gi, String(displayName || '').trim() || 'there')
        .replace(/\{\{\s*promo_code\s*\}\}/gi, String(promoCode || ''))
        .replace(/\{\{[^}]*\}\}/g, '');
}

const paragraphs = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const rivet = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9aa6b4;border:1px solid #2a323c;"></span>';

/**
 * @param {object} campaign  sp_marketing_campaigns row (subject, preheader, headline, body, cta_label, cta_url, promo_code, slug, id)
 * @param {object} recipient { email, display_name }
 * @param {object} settings  sp_marketing_settings (from_name, postal_address)
 * @param {object} [opts]    { env, test: boolean }
 */
export function campaignEmail(campaign, recipient, settings, opts = {}) {
    const env = opts.env || process.env;
    const merge = (t) => mergeFields(t, { displayName: recipient.display_name, promoCode: campaign.promo_code });
    const subject = (opts.test ? '[TEST] ' : '') + merge(campaign.subject).trim();
    const preheader = merge(campaign.preheader || '').trim();
    const headline = merge(campaign.headline).trim();
    const body = paragraphs(merge(campaign.body));
    const dest = withUtm(campaign.cta_url || `${PUBLIC_BASE_URL}/hub/club-arena/`, campaign.slug);
    const cta = campaign.id ? clickUrl(recipient.email, campaign.id, dest, env) : dest;
    const unsub = unsubscribeUrl(recipient.email, campaign.id || null, env);
    const sender = String(settings?.from_name || 'Smarter.Poker');
    const postal = String(settings?.postal_address || '').trim();
    const promo = String(campaign.promo_code || '').trim();

    const text = [
        `${headline}`, '',
        ...body.flatMap((p) => [p, '']),
        ...(promo ? [`Your code: ${promo}`, ''] : []),
        `${campaign.cta_label || 'Play Now'}: ${dest}`, '',
        `${sender}${postal ? ` - ${postal}` : ''}`,
        `You are getting this because of your relationship with ${sender}. Unsubscribe: ${unsub || 'reply with UNSUBSCRIBE'}`,
    ].join('\n');

    const bodyHtml = body.map((p) => `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#d6dde6;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const promoHtml = promo ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 20px auto;"><tr><td bgcolor="#0b1420" style="background:#0b1420;border:1px solid #2fa8ff;border-radius:10px;padding:12px 22px;text-align:center;">`
        + `<div style="font-size:11px;letter-spacing:3px;color:#7fc8ff;font-weight:700;">YOUR CODE</div>`
        + `<div style="font-size:24px;letter-spacing:4px;color:#ffffff;font-weight:800;font-family:'Courier New',monospace;">${esc(promo)}</div></td></tr></table>` : '';

    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
        + `<title>${esc(subject)}</title></head>`
        + '<body style="margin:0;padding:0;background:#05070a;" bgcolor="#05070a">'
        + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#05070a;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>`
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#05070a" style="background:#05070a;"><tr><td align="center" style="padding:24px 10px;">'
        // Outer bevel: light top edge, dark bottom edge.
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:16px;border-top:1px solid #8995a3;border-left:1px solid #5c6672;border-right:1px solid #2c333c;border-bottom:2px solid #11151a;'
        + 'background:#1c232c;background-image:linear-gradient(180deg,#2b333d 0%,#1a2028 45%,#12171d 100%);" bgcolor="#1c232c">'
        + `<tr><td style="padding:10px 12px 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="left">${rivet}</td><td align="right">${rivet}</td></tr></table></td></tr>`
        + `<tr><td align="center" style="padding:6px 24px 4px 24px;"><img src="${ASSETS.brand}" width="170" height="170" alt="Smarter.Poker" style="display:block;width:170px;height:170px;border:1px solid #2fa8ff;border-radius:14px;"></td></tr>`
        // Blue LED rail.
        + '<tr><td style="padding:6px 24px 0 24px;"><div style="height:2px;line-height:2px;font-size:0;background:#2fa8ff;background-image:linear-gradient(90deg,rgba(47,168,255,0) 0%,#2fa8ff 20%,#9be0ff 50%,#2fa8ff 80%,rgba(47,168,255,0) 100%);">&nbsp;</div></td></tr>'
        + `<tr><td style="padding:18px 18px 0 18px;"><img src="${ASSETS.hero}" width="560" alt="Club Arena" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:10px;border:1px solid #2fa8ff;"></td></tr>`
        // Inset content well.
        + '<tr><td style="padding:18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1117" style="background:#0d1117;border-radius:12px;border-top:1px solid #05070a;border-bottom:1px solid #3a4450;"><tr><td style="padding:26px 24px 8px 24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
        + `<h1 style="margin:0 0 16px 0;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:.5px;color:#eef2f6;text-align:center;">${esc(headline)}</h1>`
        + bodyHtml + promoHtml
        + '<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 22px auto;"><tr>'
        + `<td bgcolor="#1e8fff" style="border-radius:999px;background:#1e8fff;background-image:linear-gradient(180deg,#7cd0ff 0%,#2fa8ff 40%,#1170d6 100%);border:1px solid #a9e2ff;">`
        + `<a href="${esc(cta)}" style="display:inline-block;padding:15px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:1px;color:#ffffff;text-decoration:none;text-transform:uppercase;">${esc(campaign.cta_label || 'Play Now')}</a></td></tr></table>`
        + '</td></tr></table></td></tr>'
        + `<tr><td style="padding:0 12px 10px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="left">${rivet}</td><td align="right">${rivet}</td></tr></table></td></tr>`
        + '</table>'
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#7d8794;text-align:center;">`
        + `${esc(sender)}${postal ? `<br>${esc(postal)}` : ''}<br>18+ only. Play responsibly.<br>`
        + `You are getting this because of your relationship with ${esc(sender)}. `
        + (unsub ? `<a href="${esc(unsub)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a>` : 'Reply with UNSUBSCRIBE to stop these emails.')
        + '</td></tr></table>'
        + '</td></tr></table></body></html>';

    const headers = unsub
        ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : {};
    return { subject, html, text, headers };
}

/** What blocks a send. Empty list = sendable. */
export function sendBlockers(campaign, settings) {
    const out = [];
    if (!String(settings?.postal_address || '').trim()) out.push('Mailing address is not set (required by CAN-SPAM).');
    if (settings && settings.sending_enabled === false) out.push('Sending is switched off in Marketing settings.');
    for (const k of ['subject', 'headline', 'body']) if (!String(campaign?.[k] || '').trim()) out.push(`Campaign ${k} is empty.`);
    return out;
}
