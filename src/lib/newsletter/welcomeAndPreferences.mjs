import { buildPromoSignupUrl } from '../promoCampaigns/promoSignupToken.mjs';
import { buildMastheadCrestUrl } from './emailImageProxy.mjs';
import { appendNewsletterUtm } from './utmAttribution.mjs';

const DEFAULT_SITE_URL = 'https://smarter.poker';
const DEFAULT_POSTAL_ADDRESS = 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function maskEmailAddress(email) {
    const clean = String(email || '').trim().toLowerCase();
    const at = clean.indexOf('@');
    if (at <= 0) return '***';
    const local = clean.slice(0, at);
    const domain = clean.slice(at + 1);
    return `${local.charAt(0)}***@${domain}`;
}

export function derivePreferenceMode(row, nowMs = Date.now()) {
    if (!row) return 'all';
    if (row.is_active === false) return 'unsubscribed';
    const src = String(row.source || '').trim();
    if (src === 'pref:wire_only') return 'wire_only';
    if (src.startsWith('snooze:')) {
        const rawTs = src.slice('snooze:'.length).trim();
        const parsedMs = /^\d+$/.test(rawTs) ? Number(rawTs) : Date.parse(rawTs);
        if (Number.isFinite(parsedMs) && parsedMs > nowMs) {
            return 'snooze_30d';
        }
    }
    return 'all';
}

export function buildWelcomeEmail({
    hasExistingProfile = false,
    username = '',
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl = `${DEFAULT_SITE_URL}/api/news/subscribe?unsubscribe=preview`,
    preferencesUrl = `${DEFAULT_SITE_URL}/hub/email-preferences`,
} = {}) {
    const cleanSite = String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const safeCrestUrl = escapeHtml(buildMastheadCrestUrl({ siteUrl: cleanSite }));
    const utmCampaign = hasExistingProfile ? 'day0_member' : 'day0_new_lead';
    const tagUrl = (u) =>
        appendNewsletterUtm(u, {
            source: 'welcome_email',
            medium: 'email',
            campaign: utmCampaign,
        });

    if (!hasExistingProfile) {
        const subject = 'Welcome To Smarter.Poker: Claim 25 Free Chips + 30-Day VIP + 500 Free Diamonds';
        const rawSignupUrl = buildPromoSignupUrl(
            `${cleanSite}/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450`,
            { siteUrl: cleanSite }
        );
        const signupUrl = tagUrl(rawSignupUrl);
        const wireArchiveUrl = tagUrl(`${cleanSite}/hub/wire`);
        const toolsUrl = tagUrl(`${cleanSite}/tools`);
        const preheader = 'Your Weekly Wire subscription is active - claim 25 Free Kings Club Chips, 30-Day VIP, and 500 Free Diamonds.';
        const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0b1118;border:1px solid #1b2c3d;border-radius:16px;">
<tr><td style="padding:28px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${safeCrestUrl}" alt="Smarter.Poker" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;border:0;" /></td>
<td valign="middle"><div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:2.8px;text-transform:uppercase;">SMARTER.POKER WEEKLY WIRE</div></td>
</tr></table>
<h1 style="margin:10px 0 12px 0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:800;">Welcome To The Wire &middot; Your New-Player Bonus Is Ready</h1>
<p style="margin:0 0 20px 0;color:#b7cadc;font-size:15px;line-height:1.6;">You are now on the Smarter.Poker Weekly Wire for solver decision spots, pro poker calculator drops, and live tournament intelligence.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a24;border:1px solid #1b2c3d;border-radius:12px;margin-bottom:22px;">
<tr><td style="padding:20px;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">EXCLUSIVE SUBSCRIBER REWARD</div>
<div style="color:#ffffff;font-size:19px;font-weight:800;margin:6px 0 8px 0;line-height:1.3;">25 Free Chips + 30-Day VIP + 500 Free Diamonds</div>
<div style="color:#b7cadc;font-size:14px;line-height:1.55;margin-bottom:16px;">Create your free Smarter.Poker account through this link and verify your phone number to unlock 25 Free Chips in Kings Club (Code 25450), 30 Days of VIP Access, and 500 Free Diamonds.</div>
<a href="${escapeHtml(signupUrl)}" style="display:inline-block;background:#4fc1b3;color:#05070a;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:8px;">Claim Your Free Welcome Bonus</a>
</td></tr>
</table>
<p style="margin:0 0 10px 0;color:#b7cadc;font-size:13.5px;line-height:1.55;">While you wait for the next Weekly Wire edition, explore <a href="${escapeHtml(wireArchiveUrl)}" style="color:#4fc1b3;text-decoration:underline;">past Weekly Wire issues</a> or run math in our <a href="${escapeHtml(toolsUrl)}" style="color:#60a5fa;text-decoration:underline;">42 Free Poker Calculators</a>.</p>
<div style="border-top:1px solid #1b2c3d;margin-top:22px;padding-top:16px;color:#8fa6bc;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${escapeHtml(DEFAULT_POSTAL_ADDRESS)}</div>
<div style="margin-top:6px;">
<a href="${escapeHtml(preferencesUrl)}" style="color:#9fb3c8;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="${escapeHtml(wireArchiveUrl)}" style="color:#9fb3c8;text-decoration:underline;">Web Archive</a>
</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
        const text = [
            'SMARTER.POKER WEEKLY WIRE',
            '',
            'Welcome to the Smarter.Poker Weekly Wire.',
            'Create your free account and verify your phone number to claim 25 Free Chips in Kings Club (Code 25450), 30-Day VIP, and 500 Free Diamonds:',
            signupUrl,
            '',
            `Web Archive: ${wireArchiveUrl}`,
            `Email Preferences: ${preferencesUrl}`,
            `Unsubscribe: ${unsubscribeUrl}`,
            `Smarter.Poker | ${DEFAULT_POSTAL_ADDRESS}`,
        ].join('\n');

        return { subject, html, text, unsubscribeUrl, preferencesUrl };
    }

    const subject = "You're On The Smarter.Poker Weekly Wire";
    const greeting = username ? `@${username}` : 'Player';
    const preheader = 'Your Weekly Wire subscription is confirmed - jump into GTO Hand Lab or Club Arena anytime.';
    const handLabUrl = tagUrl(`${cleanSite}/hub/training/hand-lab`);
    const clubArenaUrl = tagUrl(`${cleanSite}/hub/club-arena/`);
    const wireArchiveUrl = tagUrl(`${cleanSite}/hub/wire`);
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0b1118;border:1px solid #1b2c3d;border-radius:16px;">
<tr><td style="padding:28px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${safeCrestUrl}" alt="Smarter.Poker" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;border:0;" /></td>
<td valign="middle"><div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:2.8px;text-transform:uppercase;">SMARTER.POKER WEEKLY WIRE</div></td>
</tr></table>
<h1 style="margin:10px 0 12px 0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:800;">Welcome Back, ${escapeHtml(greeting)} &middot; You're On The Wire</h1>
<p style="margin:0 0 20px 0;color:#b7cadc;font-size:15px;line-height:1.6;">Every week you will receive curated world poker storylines, a solver-backed Spot Of The Week, new Smarter.Poker upgrades, and rotating pro calculator spotlights.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a24;border:1px solid #1b2c3d;border-radius:12px;margin-bottom:20px;">
<tr><td style="padding:20px;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">READY RIGHT NOW</div>
<div style="color:#ffffff;font-size:18px;font-weight:800;margin:6px 0 8px 0;">Sharpen Your Edge &amp; Hit The Tables</div>
<div style="color:#b7cadc;font-size:14px;line-height:1.55;margin-bottom:16px;">Warm up with real-time EV grading in the 4-Variant GTO Hand Lab or jump straight into live cash and tournament tables inside Club Arena.</div>
<a href="${escapeHtml(handLabUrl)}" style="display:inline-block;background:#4fc1b3;color:#05070a;text-decoration:none;font-weight:800;font-size:13.5px;padding:11px 18px;border-radius:8px;margin-right:10px;">Open GTO Hand Lab</a>
<a href="${escapeHtml(clubArenaUrl)}" style="display:inline-block;background:#1b2c3d;color:#ffffff;text-decoration:none;font-weight:800;font-size:13.5px;padding:11px 18px;border-radius:8px;">Enter Club Arena</a>
</td></tr>
</table>
<div style="border-top:1px solid #1b2c3d;margin-top:22px;padding-top:16px;color:#8fa6bc;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${escapeHtml(DEFAULT_POSTAL_ADDRESS)}</div>
<div style="margin-top:6px;">
<a href="${escapeHtml(preferencesUrl)}" style="color:#9fb3c8;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="${escapeHtml(wireArchiveUrl)}" style="color:#9fb3c8;text-decoration:underline;">Web Archive</a>
</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
    const text = [
        'SMARTER.POKER WEEKLY WIRE',
        '',
        `Welcome ${greeting} - you are now subscribed to the Smarter.Poker Weekly Wire.`,
        `Open GTO Hand Lab: ${handLabUrl}`,
        `Enter Club Arena: ${clubArenaUrl}`,
        `Web Archive: ${wireArchiveUrl}`,
        '',
        `Email Preferences: ${preferencesUrl}`,
        `Unsubscribe: ${unsubscribeUrl}`,
        `Smarter.Poker | ${DEFAULT_POSTAL_ADDRESS}`,
    ].join('\n');

    return { subject, html, text, unsubscribeUrl, preferencesUrl };
}
