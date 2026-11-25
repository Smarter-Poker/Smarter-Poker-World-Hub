/**
 * Newsletter Subscription, Instant Day-0 Welcome Email & Preference Center API
 */
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { resendFrom } from '../../../src/lib/email/resendAccount.mjs';
import { sendEmail } from '../../../src/lib/dailyDigest/delivery.mjs';
import {
    buildWelcomeEmail,
    derivePreferenceMode,
    maskEmailAddress,
} from '../../../src/lib/newsletter/welcomeAndPreferences.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

const DEFAULT_SITE_URL = 'https://smarter.poker';
const DEFAULT_WELCOME_FROM = 'Smarter.Poker News <news@smarter.poker>';
const DEFAULT_POSTAL_ADDRESS = 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453';

// One generic message for every success path so responses cannot be used to
// enumerate who is already on the subscriber list.
const GENERIC_SUCCESS = 'Successfully subscribed!';
const GENERIC_UNSUBSCRIBED = 'You have been unsubscribed from the Smarter.Poker news digest.';

// ── Unsubscribe & Preference tokens ─────────────────────────────────────────
// Token = base64url(email) + '.' + base64url(HMAC-SHA256(payload, secret)).
const UNSUB_SIG_LENGTH = 43; // base64url of a 32-byte HMAC, unpadded

function unsubscribeSecret() {
    return (
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    );
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeUnsubscribeToken(email) {
    const secret = unsubscribeSecret();
    const normalized = String(email || '').trim().toLowerCase();
    if (!secret) return normalized;
    const payload = b64url(Buffer.from(normalized, 'utf8'));
    const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token) {
    const secret = unsubscribeSecret();
    if (!secret || typeof token !== 'string') return null;

    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;

    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (sig.length !== UNSUB_SIG_LENGTH) return null;

    const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    let email;
    try {
        email = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch (_e) {
        return null;
    }

    email = email.trim().toLowerCase();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
    return email;
}

function resolveUnsubscribeTarget(raw) {
    const value = String(raw).trim();
    if (!value || value.length > 2048) return null;

    const fromToken = verifyUnsubscribeToken(value);
    if (fromToken) return { email: fromToken, verified: true };

    const email = value.toLowerCase();
    if (email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email)) {
        return { email, verified: false };
    }
    return null;
}

export { buildWelcomeEmail, derivePreferenceMode, maskEmailAddress };

function unsubscribeHtml(message, verifiedToken = '') {
    const prefsLink = verifiedToken
        ? `<div style="margin-top:16px"><a href="/hub/email-preferences?token=${encodeURIComponent(verifiedToken)}" style="color:#60a5fa;font-size:14px;text-decoration:underline">Manage Email Preferences Instead</a></div>`
        : '';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Unsubscribed - Smarter.Poker</title>
</head>
<body style="margin:0;background:#05070a;color:#ffffff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px">Smarter.Poker News</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 28px;color:#9fb3c8">${message}</p>
<a href="/hub/news" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#4fc1b3;color:#05070a;text-decoration:none;font-weight:700">Back To The News Hub</a>
${prefsLink}
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // 1. GET /api/news/subscribe?preferences=<signed-token>
        const rawPreferences = Array.isArray(req.query?.preferences)
            ? req.query.preferences[0]
            : req.query?.preferences;

        if (req.method === 'GET' && typeof rawPreferences === 'string' && rawPreferences) {
            if (!applyRateLimit(req, res, LIMITS.read || LIMITS.write)) return;
            const verifiedEmail = verifyUnsubscribeToken(rawPreferences.trim());
            if (!verifiedEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired email preference link.',
                });
            }

            const { data: subRow, error: subErr } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id, email, is_active, source')
                .eq('email', verifiedEmail)
                .maybeSingle();

            if (subErr) {
                console.warn('[Newsletter] Preference read failed:', subErr.message);
                return res.status(500).json({ success: false, error: 'Unable to load preferences.' });
            }

            return res.status(200).json({
                success: true,
                maskedEmail: maskEmailAddress(verifiedEmail),
                currentMode: derivePreferenceMode(subRow),
            });
        }

        // 2. GET / POST /api/news/subscribe?unsubscribe=<token-or-email>
        const rawUnsub = Array.isArray(req.query?.unsubscribe)
            ? req.query.unsubscribe[0]
            : req.query?.unsubscribe;

        if (['GET', 'POST'].includes(req.method) && typeof rawUnsub === 'string' && rawUnsub) {
            if (req.method === 'GET' && !applyRateLimit(req, res, LIMITS.write)) return;

            const wantsJson =
                String(req.query.format || '') === 'json' ||
                String(req.headers.accept || '').includes('application/json');

            const target = resolveUnsubscribeTarget(rawUnsub);
            const verifiedTok = target?.verified ? String(rawUnsub).trim() : '';

            const respond = (status, ok, message) => {
                if (wantsJson) {
                    return res
                        .status(status)
                        .json(ok ? { success: true, message } : { success: false, error: message });
                }
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(status).send(unsubscribeHtml(message, verifiedTok));
            };

            if (!target) {
                return respond(400, false, 'That unsubscribe link is not valid or has expired.');
            }

            try {
                const nowIso = new Date().toISOString();
                const { data: existingSub, error: lookupError } = await getSupabase()
                    .from('newsletter_subscribers')
                    .select('id')
                    .eq('email', target.email)
                    .maybeSingle();

                if (lookupError) {
                    console.warn('[Newsletter] Unsubscribe lookup failed:', lookupError.message);
                    return respond(500, false, 'We could not process that request. Please try again.');
                }

                const writeResult = existingSub?.id
                    ? await getSupabase()
                          .from('newsletter_subscribers')
                          .update({ is_active: false, unsubscribed_at: nowIso, source: 'unsubscribe' })
                          .eq('id', existingSub.id)
                    : await getSupabase()
                          .from('newsletter_subscribers')
                          .insert({ email: target.email, is_active: false, unsubscribed_at: nowIso, source: 'unsubscribe' });

                if (writeResult.error) {
                    console.warn('[Newsletter] Unsubscribe failed:', writeResult.error.message);
                    return respond(500, false, 'We could not process that request. Please try again.');
                }

                try {
                    const { data: matchedProfiles } = await getSupabase()
                        .from('profiles')
                        .select('id')
                        .ilike('email', target.email)
                        .limit(10);
                    for (const prof of matchedProfiles || []) {
                        if (!prof?.id) continue;
                        await getSupabase()
                            .from('notification_preferences')
                            .upsert(
                                { user_id: prof.id, marketing_enabled: false, updated_at: nowIso },
                                { onConflict: 'user_id' }
                            );
                    }
                } catch (_unsubPrefErr) {
                    /* non-blocking preference mirror */
                }
            } catch (error) {
                try {
                    reportApiError(error, req);
                } catch (_e) {
                    /* noop */
                }
                console.warn('[Newsletter] Unsubscribe exception:', error?.message || error);
                return respond(500, false, 'We could not process that request. Please try again.');
            }

            console.log(
                '[Newsletter] unsubscribe',
                JSON.stringify({ verified: target.verified, at: new Date().toISOString() })
            );

            return respond(200, true, GENERIC_UNSUBSCRIBED);
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // 3. POST /api/news/subscribe with { action: 'preferences', token, preference }
        if (req.body?.action === 'preferences') {
            const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
            const verifiedEmail = verifyUnsubscribeToken(rawToken);
            if (!verifiedEmail) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired preference token.',
                });
            }

            const preference = String(req.body?.preference || '').trim();
            if (!['wire_only', 'snooze_30d', 'all', 'unsubscribe'].includes(preference)) {
                return res.status(400).json({
                    success: false,
                    error: 'Unsupported preference selection.',
                });
            }

            const nowIso = new Date().toISOString();
            const snoozeIso = new Date(Date.now() + 30 * 86_400_000).toISOString();

            const { data: existingSub, error: lookupErr } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id')
                .eq('email', verifiedEmail)
                .maybeSingle();

            if (lookupErr) {
                console.warn('[Newsletter] Preference lookup failed:', lookupErr.message);
                return res.status(500).json({ success: false, error: 'Unable to update preferences.' });
            }

            let patch;
            if (preference === 'wire_only') {
                patch = { is_active: true, unsubscribed_at: null, source: 'pref:wire_only' };
            } else if (preference === 'snooze_30d') {
                patch = { is_active: true, unsubscribed_at: null, source: `snooze:${snoozeIso}` };
            } else if (preference === 'all') {
                patch = { is_active: true, unsubscribed_at: null, source: 'pref:all' };
            } else {
                patch = { is_active: false, unsubscribed_at: nowIso, source: 'unsubscribe' };
            }

            const saveRes = existingSub?.id
                ? await getSupabase()
                      .from('newsletter_subscribers')
                      .update(patch)
                      .eq('id', existingSub.id)
                : await getSupabase()
                      .from('newsletter_subscribers')
                      .insert({ email: verifiedEmail, ...patch });

            if (saveRes.error) {
                console.warn('[Newsletter] Preference save failed:', saveRes.error.message);
                return res.status(500).json({ success: false, error: 'Unable to update preferences.' });
            }

            try {
                const { data: profiles } = await getSupabase()
                    .from('profiles')
                    .select('id')
                    .ilike('email', verifiedEmail)
                    .limit(10);
                for (const prof of profiles || []) {
                    if (!prof?.id) continue;
                    let prefPatch = null;
                    if (preference === 'all') {
                        prefPatch = {
                            user_id: prof.id,
                            mute_all: false,
                            email_enabled: true,
                            marketing_enabled: true,
                            updated_at: nowIso,
                        };
                    } else if (preference === 'wire_only') {
                        prefPatch = {
                            user_id: prof.id,
                            mute_all: false,
                            email_enabled: true,
                            marketing_enabled: false,
                            updated_at: nowIso,
                        };
                    } else if (preference === 'unsubscribe') {
                        prefPatch = {
                            user_id: prof.id,
                            marketing_enabled: false,
                            updated_at: nowIso,
                        };
                    }
                    if (prefPatch) {
                        await getSupabase()
                            .from('notification_preferences')
                            .upsert(prefPatch, { onConflict: 'user_id' });
                    }
                }
            } catch (_prefSyncErr) {
                /* non-blocking preference mirror */
            }

            const nextMode = preference === 'unsubscribe' ? 'unsubscribed' : preference;
            return res.status(200).json({
                success: true,
                maskedEmail: maskEmailAddress(verifiedEmail),
                currentMode: nextMode,
            });
        }

        // 4. Ordinary POST /api/news/subscribe with { email, source } + Instant Day-0 Welcome Email
        try {
            const { email, source } = req.body || {};

            if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email.trim())) {
                return res.status(400).json({ success: false, error: 'Valid email required' });
            }
            const normalizedEmail = email.trim().toLowerCase();

            const safeSource =
                typeof source === 'string' && /^[a-z0-9:_-]{1,64}$/i.test(source)
                    ? source
                    : 'news_hub';

            const { data: existing } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id, is_active, source')
                .eq('email', normalizedEmail)
                .maybeSingle();

            const wasSnoozed = Boolean(
                existing && String(existing.source || '').trim().toLowerCase().startsWith('snooze:')
            );
            const shouldSendWelcome = !existing || existing.is_active === false;

            if (existing) {
                if (!existing.is_active || wasSnoozed) {
                    const { error: reactivateError } = await getSupabase()
                        .from('newsletter_subscribers')
                        .update({ is_active: true, unsubscribed_at: null, source: safeSource })
                        .eq('id', existing.id);
                    if (reactivateError) {
                        console.warn('[Newsletter] Reactivation failed:', reactivateError.message);
                        return res.status(500).json({ success: false, error: 'Subscription failed' });
                    }
                }
            } else {
                const { error } = await getSupabase()
                    .from('newsletter_subscribers')
                    .insert({ email: normalizedEmail, is_active: true, source: safeSource });

                if (error) throw error;
            }

            try {
                const { data: matchedProfiles } = await getSupabase()
                    .from('profiles')
                    .select('id')
                    .ilike('email', normalizedEmail)
                    .limit(10);
                const nowIso = new Date().toISOString();
                for (const prof of matchedProfiles || []) {
                    if (!prof?.id) continue;
                    await getSupabase()
                        .from('notification_preferences')
                        .upsert(
                            {
                                user_id: prof.id,
                                mute_all: false,
                                email_enabled: true,
                                marketing_enabled: true,
                                updated_at: nowIso,
                            },
                            { onConflict: 'user_id' }
                        );
                }
            } catch (_subPrefErr) {
                /* non-blocking preference mirror */
            }

            if (shouldSendWelcome) {
                try {
                    const { data: profileRows } = await getSupabase()
                        .from('profiles')
                        .select('id, username')
                        .ilike('email', normalizedEmail)
                        .limit(1);

                    const existingProfile = Array.isArray(profileRows) && profileRows.length > 0 ? profileRows[0] : null;
                    const unsubToken = makeUnsubscribeToken(normalizedEmail);
                    const welcome = buildWelcomeEmail({
                        hasExistingProfile: Boolean(existingProfile?.id),
                        username: existingProfile?.username || '',
                        siteUrl: DEFAULT_SITE_URL,
                        unsubscribeUrl: `${DEFAULT_SITE_URL}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`,
                        preferencesUrl: `${DEFAULT_SITE_URL}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`,
                    });

                    await sendEmail({
                        to: [normalizedEmail],
                        from: resendFrom(DEFAULT_WELCOME_FROM),
                        subject: welcome.subject,
                        html: welcome.html,
                        text: welcome.text,
                        headers: {
                            'List-Unsubscribe': `<${welcome.unsubscribeUrl}>`,
                            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                        },
                    });
                } catch (welcomeErr) {
                    console.warn('[Newsletter] Day-0 welcome email skipped:', welcomeErr?.message || welcomeErr);
                }
            }

            return res.status(200).json({ success: true, message: GENERIC_SUCCESS });
        } catch (error) {
            try {
                reportApiError(error, req);
            } catch (_e) {
                /* noop */
            }
            console.warn('Newsletter subscription error:', error);
            return res.status(500).json({ success: false, error: 'Subscription failed' });
        }
    } catch (err) {
        try {
            reportApiError(err, req);
        } catch (_reportError) {
            console.warn('[App] Handled exception:', _reportError?.message || _reportError);
        }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
