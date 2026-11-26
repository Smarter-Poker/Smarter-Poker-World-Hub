/**
 * Newsletter Subscription, Instant Day-0 Welcome Email & Preference Center API
 */
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
const BLOCKED_CAPTURE_DOMAINS = new Set([
    'example.com',
    'example.org',
    'example.net',
    'test.com',
    'invalid',
    'localhost',
    'horse.ai',
]);

export function isBlockedCaptureEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    const at = clean.lastIndexOf('@');
    if (at <= 0) return true;
    const domain = clean.slice(at + 1);
    if (!domain || BLOCKED_CAPTURE_DOMAINS.has(domain)) return true;
    if (domain.endsWith('.invalid') || domain.endsWith('.localhost') || domain.endsWith('.example')) return true;
    return false;
}

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

export function escapeIlikePattern(value) {
    return String(value || '').replace(/([\\%_])/g, '\\$1');
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

export function resolveTokenOrEmailQuery(query = {}) {
    const rawE = typeof query.e === 'string' ? query.e : (typeof query.email === 'string' ? query.email : '');
    const rawT = typeof query.t === 'string' ? query.t : (typeof query.token === 'string' ? query.token : '');
    const cleanE = rawE.trim().toLowerCase();
    const cleanT = rawT.trim();
    if (!cleanT) return null;

    if (cleanT.includes('.')) {
        const verified = verifyUnsubscribeToken(cleanT);
        if (verified && (!cleanE || verified === cleanE)) {
            return { email: verified, verified: true, token: cleanT };
        }
    }
    if (cleanE && cleanE.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(cleanE)) {
        const reconstructed = `${b64url(Buffer.from(cleanE, 'utf8'))}.${cleanT}`;
        const verified = verifyUnsubscribeToken(reconstructed);
        if (verified) return { email: verified, verified: true, token: reconstructed };
    }
    return null;
}

export function resolveUnsubscribeTarget(raw, query = {}) {
    const value = String(raw || '').trim();
    if (value && value !== '1' && value !== 'true') {
        const fromToken = verifyUnsubscribeToken(value);
        if (fromToken) return { email: fromToken, verified: true, token: value };

        if (query?.t || query?.token) {
            return resolveTokenOrEmailQuery({
                ...query,
                e: query.e || query.email || value,
            });
        }
        return null;
    }
    return resolveTokenOrEmailQuery(query);
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

function keepConfirmationHtml(title, message) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} - Smarter.Poker</title>
</head>
<body style="margin:0;background:#05070a;color:#ffffff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px;color:#4fc1b3">${title}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 28px;color:#9fb3c8">${message}</p>
<a href="/hub/wire" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#4fc1b3;color:#05070a;text-decoration:none;font-weight:700">Read The Weekly Wire</a>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // 0. GET /api/news/subscribe?keep=<signed-token> (cold-lead re-permission, one click)
        const rawKeep = Array.isArray(req.query?.keep) ? req.query.keep[0] : req.query?.keep;

        if (req.method === 'GET' && typeof rawKeep === 'string' && rawKeep) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'private, no-store');
            const keepEmail = verifyUnsubscribeToken(rawKeep.trim());
            if (!keepEmail) {
                return res
                    .status(400)
                    .send(keepConfirmationHtml('Link Expired', 'That confirmation link is not valid or has expired.'));
            }

            try {
                const { data: keepRows, error: keepLookupErr } = await getSupabase()
                    .from('newsletter_subscribers')
                    .select('id, email, is_active, source')
                    .ilike('email', escapeIlikePattern(keepEmail))
                    .limit(5);
                if (keepLookupErr) {
                    console.warn('[Newsletter] Keep lookup failed:', keepLookupErr.message);
                    return res
                        .status(500)
                        .send(keepConfirmationHtml('Please Try Again', 'We could not confirm your subscription right now.'));
                }

                const stamp = `engaged:${new Date().toISOString().slice(0, 10)}`;
                const rows = Array.isArray(keepRows) ? keepRows : [];
                if (rows.length === 0) {
                    const { error: keepInsertErr } = await getSupabase()
                        .from('newsletter_subscribers')
                        .insert({ email: keepEmail, is_active: true, unsubscribed_at: null, source: stamp });
                    if (keepInsertErr) {
                        console.warn('[Newsletter] Keep insert failed:', keepInsertErr.message);
                        return res
                            .status(500)
                            .send(keepConfirmationHtml('Please Try Again', 'We could not confirm your subscription right now.'));
                    }
                } else {
                    for (const row of rows) {
                        const currentSource = String(row?.source || '').trim();
                        // An explicit unsubscribe or complaint is never undone by a stale keep link.
                        if (row?.is_active === false && ['unsubscribe', 'resend_complaint', 'resend_bounce'].includes(currentSource)) {
                            return res
                                .status(200)
                                .send(
                                    keepConfirmationHtml(
                                        'Subscription Confirmed',
                                        'Your email preferences are unchanged. You can resubscribe any time from the Weekly Wire page.'
                                    )
                                );
                        }
                        // Preserve explicit preference and snooze choices; only stamp engagement otherwise.
                        const preserveSource = currentSource === 'pref:wire_only' || currentSource === 'pref:all' || currentSource.startsWith('snooze:');
                        const patch = { is_active: true, unsubscribed_at: null };
                        if (!preserveSource) patch.source = stamp;
                        const { error: keepUpdateErr } = await getSupabase()
                            .from('newsletter_subscribers')
                            .update(patch)
                            .eq('id', row.id);
                        if (keepUpdateErr) {
                            console.warn('[Newsletter] Keep update failed:', keepUpdateErr.message);
                            return res
                                .status(500)
                                .send(keepConfirmationHtml('Please Try Again', 'We could not confirm your subscription right now.'));
                        }
                    }
                }
            } catch (keepErr) {
                try {
                    reportApiError(keepErr, req);
                } catch (_e) {
                    /* noop */
                }
                return res
                    .status(500)
                    .send(keepConfirmationHtml('Please Try Again', 'We could not confirm your subscription right now.'));
            }

            return res
                .status(200)
                .send(
                    keepConfirmationHtml(
                        'Subscription Confirmed',
                        'Thanks for confirming. You will keep receiving the Smarter.Poker Weekly Wire every week.'
                    )
                );
        }

        // 1. GET /api/news/subscribe?preferences=<signed-token> OR ?preferences=session OR ?preferences=1&e=...&t=...
        const hasPreferencesParam =
            typeof req.query?.preferences !== 'undefined' ||
            typeof req.query?.prefs !== 'undefined' ||
            (req.query?.mode && (req.query?.t || req.query?.token));
        const rawPreferences = Array.isArray(req.query?.preferences)
            ? req.query.preferences[0]
            : (req.query?.preferences ?? req.query?.prefs ?? '');

        if (req.method === 'GET' && hasPreferencesParam) {
            if (!applyRateLimit(req, res, LIMITS.read || LIMITS.write)) return;
            const prefStr = typeof rawPreferences === 'string' ? rawPreferences.trim() : '';
            let verifiedEmail = null;
            let sessionUserId = null;

            if (!prefStr || prefStr === 'session') {
                const sb = getSupabase();
                const authRes = await getServerUserWithFallback(req, sb);
                const user = authRes?.user ?? authRes;
                if (user?.id) {
                    sessionUserId = user.id;
                    verifiedEmail = user.email || (await sb.auth.admin.getUserById(user.id))?.data?.user?.email || null;
                }
                if (!verifiedEmail) {
                    return res.status(401).json({
                        success: false,
                        error: 'Authentication required.',
                    });
                }
            } else if (prefStr === '1' || prefStr === 'true') {
                const fromQuery = resolveTokenOrEmailQuery(req.query);
                if (fromQuery?.verified) {
                    verifiedEmail = fromQuery.email;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid or expired email preference link.',
                    });
                }
            } else {
                verifiedEmail = verifyUnsubscribeToken(prefStr);
                if (!verifiedEmail) {
                    const fromQuery = resolveTokenOrEmailQuery(req.query);
                    if (fromQuery?.verified) verifiedEmail = fromQuery.email;
                }
                if (!verifiedEmail) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid or expired email preference link.',
                    });
                }
            }

            verifiedEmail = verifiedEmail.trim().toLowerCase();

            const { data: existingRows, error: subErr } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id, email, is_active, source')
                .ilike('email', escapeIlikePattern(verifiedEmail))
                .limit(20);

            if (subErr) {
                console.warn('[Newsletter] Preference read failed:', subErr.message);
                return res.status(500).json({ success: false, error: 'Unable to load preferences.' });
            }

            const rows = Array.isArray(existingRows) ? existingRows : [];
            const subRow = rows.length > 0 ? rows[0] : null;
            let resolvedMode = derivePreferenceMode(subRow);
            if (!subRow && sessionUserId) {
                try {
                    const { data: npRows } = await getSupabase()
                        .from('notification_preferences')
                        .select('mute_all, email_enabled, marketing_enabled')
                        .eq('user_id', sessionUserId)
                        .limit(1);
                    const np = Array.isArray(npRows) && npRows.length > 0 ? npRows[0] : null;
                    if (np && (np.mute_all === true || np.email_enabled === false || np.marketing_enabled === false)) {
                        resolvedMode = 'unsubscribed';
                    }
                } catch (_npErr) {
                    /* non-blocking fallback */
                }
            }

            return res.status(200).json({
                success: true,
                maskedEmail: maskEmailAddress(verifiedEmail),
                currentMode: resolvedMode,
            });
        }

        // 2. GET / POST /api/news/subscribe?unsubscribe=<token-or-email> OR ?unsubscribe=1&e=...&t=... OR RFC 8058 One-Click
        const rawUnsub = Array.isArray(req.query?.unsubscribe)
            ? req.query.unsubscribe[0]
            : (req.query?.unsubscribe ?? (req.query?.unsub ?? ''));
        const hasUnsubQuery = Boolean(rawUnsub) || Boolean(req.query?.e && req.query?.t && req.method === 'POST');

        if (['GET', 'POST'].includes(req.method) && hasUnsubQuery) {
            if (req.method === 'GET' && !applyRateLimit(req, res, LIMITS.write)) return;

            const wantsJson =
                String(req.query.format || '') === 'json' ||
                String(req.headers.accept || '').includes('application/json');

            const target = resolveUnsubscribeTarget(rawUnsub, req.query);
            const verifiedTok = target?.verified ? String(target.token || '').trim() : '';

            const respond = (status, ok, message) => {
                if (wantsJson) {
                    return res
                        .status(status)
                        .json(ok ? { success: true, message } : { success: false, error: message });
                }
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(status).send(unsubscribeHtml(message, verifiedTok));
            };

            if (!target || target.verified !== true) {
                return respond(400, false, 'That unsubscribe link is not valid or has expired.');
            }

            try {
                const nowIso = new Date().toISOString();
                const targetEmail = target.email.trim().toLowerCase();
                const { data: existingRows, error: lookupError } = await getSupabase()
                    .from('newsletter_subscribers')
                    .select('id')
                    .ilike('email', escapeIlikePattern(targetEmail))
                    .limit(20);

                if (lookupError) {
                    console.warn('[Newsletter] Unsubscribe lookup failed:', lookupError.message);
                    return respond(500, false, 'We could not process that request. Please try again.');
                }

                const rows = Array.isArray(existingRows) ? existingRows : [];
                const writeResult = rows.length > 0
                    ? await getSupabase()
                          .from('newsletter_subscribers')
                          .update({ is_active: false, unsubscribed_at: nowIso, source: 'unsubscribe' })
                          // in-list: bounded duplicate subscriber rows for one email
                          .in('id', rows.map((r) => r.id).slice(0, 20))
                    : await getSupabase()
                          .from('newsletter_subscribers')
                          .insert({ email: targetEmail, is_active: false, unsubscribed_at: nowIso, source: 'unsubscribe' });

                if (writeResult.error) {
                    console.warn('[Newsletter] Unsubscribe failed:', writeResult.error.message);
                    return respond(500, false, 'We could not process that request. Please try again.');
                }

                try {
                    const { data: matchedProfiles } = await getSupabase()
                        .from('profiles')
                        .select('id')
                        .ilike('email', escapeIlikePattern(targetEmail))
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

        // 3. POST /api/news/subscribe with { action: 'preferences', token, mode/preference }
        if (req.body?.action === 'preferences') {
            const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
            let verifiedEmail = null;
            let sessionUserId = null;

            if (!rawToken || rawToken === 'session') {
                const sb = getSupabase();
                const authRes = await getServerUserWithFallback(req, sb);
                const user = authRes?.user ?? authRes;
                if (user?.id) {
                    sessionUserId = user.id;
                    verifiedEmail = user.email || (await sb.auth.admin.getUserById(user.id))?.data?.user?.email || null;
                }
                if (!verifiedEmail) {
                    return res.status(401).json({
                        success: false,
                        error: 'Authentication required.',
                    });
                }
            } else {
                verifiedEmail = verifyUnsubscribeToken(rawToken);
                if (!verifiedEmail && req.body?.e && req.body?.t) {
                    const candidate = resolveTokenOrEmailQuery({ e: req.body.e, t: req.body.t });
                    if (candidate?.verified) verifiedEmail = candidate.email;
                }
                if (!verifiedEmail) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid or expired preference token.',
                    });
                }
            }

            verifiedEmail = verifiedEmail.trim().toLowerCase();

            const rawPref = req.body?.preference || req.body?.mode;
            const preference = String(rawPref || '').trim();
            if (!['wire_only', 'snooze_30d', 'all', 'unsubscribe'].includes(preference)) {
                return res.status(400).json({
                    success: false,
                    error: 'Unsupported preference selection.',
                });
            }

            const nowIso = new Date().toISOString();
            const snoozeIso = new Date(Date.now() + 30 * 86_400_000).toISOString();

            const { data: existingRows, error: lookupErr } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id, user_id')
                .ilike('email', escapeIlikePattern(verifiedEmail))
                .limit(20);

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

            const rows = Array.isArray(existingRows) ? existingRows : [];
            let saveRes;
            if (rows.length > 0) {
                const updatePatch = { ...patch };
                if (sessionUserId) updatePatch.user_id = sessionUserId;
                saveRes = await getSupabase()
                    .from('newsletter_subscribers')
                    .update(updatePatch)
                    // in-list: bounded duplicate subscriber rows for one email
                    .in('id', rows.map((r) => r.id).slice(0, 20));
            } else {
                const insertPayload = {
                    email: verifiedEmail,
                    ...patch,
                    ...(sessionUserId ? { user_id: sessionUserId } : {}),
                };
                if (patch.is_active) {
                    insertPayload.subscribed_at = nowIso;
                }
                saveRes = await getSupabase()
                    .from('newsletter_subscribers')
                    .insert(insertPayload);
            }

            if (saveRes.error) {
                console.warn('[Newsletter] Preference save failed:', saveRes.error.message);
                return res.status(500).json({ success: false, error: 'Unable to update preferences.' });
            }

            try {
                const targetUserIds = new Set();
                if (sessionUserId) targetUserIds.add(sessionUserId);
                for (const r of rows) {
                    if (r?.user_id) targetUserIds.add(String(r.user_id));
                }
                const { data: profiles } = await getSupabase()
                    .from('profiles')
                    .select('id')
                    .ilike('email', escapeIlikePattern(verifiedEmail))
                    .limit(10);
                for (const prof of profiles || []) {
                    if (prof?.id) targetUserIds.add(String(prof.id));
                }

                for (const uid of targetUserIds) {
                    let prefPatch = null;
                    if (preference === 'all') {
                        prefPatch = {
                            user_id: uid,
                            mute_all: false,
                            email_enabled: true,
                            marketing_enabled: true,
                            updated_at: nowIso,
                        };
                    } else if (preference === 'wire_only') {
                        prefPatch = {
                            user_id: uid,
                            mute_all: false,
                            email_enabled: true,
                            marketing_enabled: false,
                            updated_at: nowIso,
                        };
                    } else if (preference === 'snooze_30d') {
                        prefPatch = {
                            user_id: uid,
                            mute_all: false,
                            email_enabled: true,
                            updated_at: nowIso,
                        };
                    } else if (preference === 'unsubscribe') {
                        prefPatch = {
                            user_id: uid,
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
            if (isBlockedCaptureEmail(normalizedEmail)) {
                return res.status(400).json({ success: false, error: 'Valid email required' });
            }

            let authenticatedOwnerId = null;
            try {
                const sb = getSupabase();
                const authRes = await getServerUserWithFallback(req, sb);
                const authUser = authRes?.user ?? authRes;
                if (authUser?.id) {
                    const sessionEmail = String(
                        authUser.email || (await sb.auth.admin.getUserById(authUser.id))?.data?.user?.email || ''
                    )
                        .trim()
                        .toLowerCase();
                    if (sessionEmail && sessionEmail === normalizedEmail) {
                        authenticatedOwnerId = authUser.id;
                    }
                }
            } catch (_sessionCheckErr) {
                /* anonymous capture allowed */
            }

            const safeSource =
                typeof source === 'string' && /^[a-z0-9:_-]{1,64}$/i.test(source)
                    ? source
                    : 'news_hub';

            const nowIso = new Date().toISOString();
            const { data: existingRows } = await getSupabase()
                .from('newsletter_subscribers')
                .select('id, is_active, source')
                .ilike('email', escapeIlikePattern(normalizedEmail))
                .limit(20);

            const rows = Array.isArray(existingRows) ? existingRows : [];
            const hasHardSuppression = rows.some((r) =>
                ['resend_complaint', 'resend_bounce'].includes(String(r.source || '').trim().toLowerCase())
            );
            const wasSnoozed = rows.some((r) =>
                String(r.source || '').trim().toLowerCase().startsWith('snooze:')
            );
            const allInactive = rows.length > 0 && rows.every((r) => r.is_active === false);
            const shouldSendWelcome = !hasHardSuppression && (rows.length === 0 || allInactive);

            if (rows.length > 0) {
                if ((!hasHardSuppression || authenticatedOwnerId) && (rows.some((r) => !r.is_active) || wasSnoozed)) {
                    const updatePayload = {
                        is_active: true,
                        unsubscribed_at: null,
                        source: safeSource,
                        ...(authenticatedOwnerId ? { user_id: authenticatedOwnerId } : {}),
                    };
                    const { error: reactivateError } = await getSupabase()
                        .from('newsletter_subscribers')
                        .update(updatePayload)
                        // in-list: bounded duplicate subscriber rows for one email
                        .in('id', rows.map((r) => r.id).slice(0, 20));
                    if (reactivateError) {
                        console.warn('[Newsletter] Reactivation failed:', reactivateError.message);
                        return res.status(500).json({ success: false, error: 'Subscription failed' });
                    }
                }
            } else {
                const { error } = await getSupabase()
                    .from('newsletter_subscribers')
                    .insert({
                        email: normalizedEmail,
                        is_active: true,
                        source: safeSource,
                        subscribed_at: nowIso,
                        ...(authenticatedOwnerId ? { user_id: authenticatedOwnerId } : {}),
                    });

                if (error) throw error;
            }

            if (authenticatedOwnerId) {
                try {
                    await getSupabase()
                        .from('notification_preferences')
                        .upsert(
                            {
                                user_id: authenticatedOwnerId,
                                mute_all: false,
                                email_enabled: true,
                                marketing_enabled: true,
                                updated_at: nowIso,
                            },
                            { onConflict: 'user_id' }
                        );
                } catch (_subPrefErr) {
                    /* non-blocking preference mirror */
                }
            }

            if (shouldSendWelcome) {
                try {
                    const { data: profileRows } = await getSupabase()
                        .from('profiles')
                        .select('id, username')
                        .ilike('email', escapeIlikePattern(normalizedEmail))
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
