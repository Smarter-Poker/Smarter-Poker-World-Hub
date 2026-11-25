/**
 * Automated Player Lifecycle Retention API (/api/news/lifecycle)
 *
 * Actions:
 *   - `preview` (GET or POST): dry-run queue inspection across `unverified_48h`,
 *     `welcome_back_21d`, and `vip_diamond_nudge` without sending or recording markers.
 *   - `test` (POST): sends 1 sample `[TEST]` lifecycle email to `testEmail`
 *     without recording ledger markers.
 *   - `run` (POST): executes due lifecycle retention triggers and records
 *     deterministic UUID markers in `public.newsletter_campaigns`.
 *
 * Auth:
 *   - `Authorization: Bearer <CRON_SECRET>`
 *   - `x-admin-key: <ADMIN_API_KEY>`
 *   - Verified Supabase admin JWT (`admin`, `superadmin`, `god` or `is_admin = true`)
 *   - 90s HMAC operator signature (`x-operator-timestamp` + `x-operator-signature`)
 *     restricted strictly to `preview` and `test`.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { verifyOperatorTestSignature } from '../../../src/lib/promoCampaigns/dispatch.mjs';
import {
    LIFECYCLE_TRIGGERS,
    previewLifecycleRetention,
    renderLifecycleEmail,
    runLifecycleRetention,
    sendTestLifecycleEmail,
} from '../../../src/lib/promoCampaigns/lifecycleEngine.mjs';

export const config = { maxDuration: 300 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
let _supabase = null;

function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(Array.isArray(value) ? value[0] : value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

async function authorize(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    if (req.method === 'POST' && req.body && typeof req.body === 'object') {
        const bodyAction = String(req.body.action || '').trim();
        if (
            (bodyAction === 'preview' || bodyAction === 'test') &&
            verifyOperatorTestSignature({
                action: bodyAction,
                testEmail: req.body.testEmail || '',
                testPhone: '',
                timestampHeader: req.headers['x-operator-timestamp'] || '',
                signatureHeader: req.headers['x-operator-signature'] || '',
            })
        ) {
            return { kind: 'operator_test', userId: null };
        }
    }

    const sb = getSupabase();
    const { user } = await getServerUserWithFallback(req, sb);
    if (!user?.id) return null;
    const { data: profile, error } = await sb
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();
    if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) return null;
    return { kind: 'admin', userId: user.id };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const auth = await authorize(req);
    if (!auth) {
        return res.status(401).json({ success: false, error: 'Administrator access required' });
    }

    try {
        const sb = getSupabase();
        const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
        const rawAction = req.method === 'GET'
            ? String(req.query?.action || 'preview').trim()
            : String(body.action || 'preview').trim();

        const maxPerTrigger = clampInt(body.maxPerTrigger ?? req.query?.maxPerTrigger, 25, 1, 250);
        const includeOlderDormant = Boolean(body.includeOlderDormant === true || req.query?.includeOlderDormant === '1');

        if (rawAction === 'preview') {
            const preview = await previewLifecycleRetention(sb, {
                maxPerTrigger,
                includeOlderDormant,
            });
            const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker').replace(/\/+$/, '');
            const sampleUnsub = `${siteUrl}/api/news/subscribe?unsubscribe=preview`;
            const samplePrefs = `${siteUrl}/hub/email-preferences?token=preview`;
            const nowMs = Date.now();
            const htmlPreviews = {};
            for (const trigger of LIFECYCLE_TRIGGERS) {
                try {
                    htmlPreviews[trigger] = renderLifecycleEmail({
                        trigger,
                        username: 'grinder',
                        userId: '00000000-0000-4000-8000-000000000001',
                        diamonds: trigger === 'vip_diamond_nudge' ? 1200 : 0,
                        vipExpiresAt: trigger === 'vip_diamond_nudge' ? new Date(nowMs + 2 * 86_400_000).toISOString() : null,
                        siteUrl,
                        unsubscribeUrl: sampleUnsub,
                        preferencesUrl: samplePrefs,
                        nowMs,
                    }).html;
                } catch (_renderErr) {
                    htmlPreviews[trigger] = '';
                }
            }
            return res.status(200).json({
                ...preview,
                htmlPreviews,
                htmlPreview: htmlPreviews.welcome_back_21d || '',
            });
        }

        if (rawAction === 'test') {
            const trigger = LIFECYCLE_TRIGGERS.includes(body.trigger) ? body.trigger : 'unverified_48h';
            const out = await sendTestLifecycleEmail(sb, {
                trigger,
                testEmail: body.testEmail || '',
            });
            return res.status(200).json(out);
        }

        if (rawAction === 'run') {
            if (auth.kind === 'operator_test') {
                return res.status(403).json({
                    success: false,
                    error: 'Operator test signature is restricted to preview and test actions.',
                });
            }
            const result = await runLifecycleRetention(sb, {
                dryRun: false,
                dailyGate: Boolean(body.dailyGate),
                maxPerTrigger,
                includeOlderDormant,
                createdBy: auth.userId,
            });
            return res.status(200).json(result);
        }

        return res.status(400).json({
            success: false,
            error: 'Unsupported action. Expected preview, test, or run.',
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[News lifecycle] error:', error?.message || error);
        return res.status(400).json({
            success: false,
            error: error?.message || 'Lifecycle retention operation failed',
        });
    }
}
