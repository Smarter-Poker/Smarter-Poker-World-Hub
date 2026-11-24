/**
 * Admin Promotional Campaign & Bulk Lead Import API
 *
 * GET  /api/admin/promo-campaign -> default Smarter.Poker promo draft, sender info & provider status
 * POST /api/admin/promo-campaign -> actions:
 *   - action: 'import'  { rawText, emails?, phones?, source? }
 *   - action: 'preview' { subject, headline, body, ctaLabel, ctaUrl, smsBody, postalAddress, channels, scope }
 *   - action: 'test'    { ...draft, testEmail?, testPhone? }
 *   - action: 'send'    { ...draft }
 *
 * Auth: Verified Supabase session with admin/superadmin/god role, OR
 *       Authorization: Bearer $CRON_SECRET / x-admin-key: $ADMIN_API_KEY for operator CLI calls.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { resendApiKey, resendFrom } from '../../../src/lib/email/resendAccount.mjs';
import {
    DEFAULT_POSTAL_ADDRESS,
    DEFAULT_PROMO_DRAFT,
    DEFAULT_PROMO_FROM,
    dispatchPromoCampaign,
    importMarketingLeads,
} from '../../../src/lib/promoCampaigns/dispatch.mjs';

export const config = { maxDuration: 300 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
let _supabase = null;

function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

async function authorizeAdmin(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    const sb = getSupabase();
    const { user } = await getServerUserWithFallback(req, sb);
    if (!user?.id) return null;
    const { data: profile, error } = await sb
        .from('profiles')
        .select('role, is_admin, phone')
        .eq('id', user.id)
        .maybeSingle();
    if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) return null;
    return {
        kind: 'admin',
        userId: user.id,
        email: typeof user.email === 'string' ? user.email.trim() : '',
        phone: typeof profile.phone === 'string' ? profile.phone.trim() : '',
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const auth = await authorizeAdmin(req);
    if (!auth) {
        return res.status(401).json({ success: false, error: 'Administrator access required' });
    }

    try {
        if (req.method === 'GET') {
            const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM);
            const emailConfigured = Boolean(resendApiKey());
            const smsConfigured = Boolean(
                (process.env.TWILIO_ACCOUNT_SID || '').trim() &&
                    (process.env.TWILIO_AUTH_TOKEN || '').trim() &&
                    (process.env.TWILIO_PHONE_NUMBER || '').trim()
            );
            return res.status(200).json({
                success: true,
                from,
                postalAddress: DEFAULT_POSTAL_ADDRESS,
                emailConfigured,
                smsConfigured,
                viewerEmail: auth.email || '',
                viewerPhone: auth.phone || '',
                defaultDraft: DEFAULT_PROMO_DRAFT,
            });
        }

        const body = typeof req.body === 'object' && req.body ? req.body : {};
        const action = String(body.action || '').trim();
        const sb = getSupabase();

        if (action === 'import') {
            const result = await importMarketingLeads(sb, {
                rawText: body.rawText || '',
                emails: body.emails || [],
                phones: body.phones || [],
                source: body.source || 'admin_import',
            });
            return res.status(200).json({ success: true, ...result });
        }

        if (action === 'preview' || action === 'test' || action === 'send') {
            const result = await dispatchPromoCampaign(sb, {
                subject: body.subject,
                headline: body.headline,
                body: body.body,
                ctaLabel: body.ctaLabel,
                ctaUrl: body.ctaUrl,
                smsBody: body.smsBody,
                postalAddress: body.postalAddress,
                channels: body.channels,
                scope: body.scope,
                dryRun: action === 'preview',
                testOnly: action === 'test',
                testEmail: body.testEmail || '',
                testPhone: body.testPhone || '',
                createdBy: auth.userId,
            });
            return res.status(200).json(result);
        }

        return res.status(400).json({ success: false, error: 'Unsupported action. Expected import, preview, test, or send.' });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[Admin promo-campaign] error:', error?.message || error);
        return res.status(400).json({
            success: false,
            error: error?.message || 'Promotional campaign operation failed',
        });
    }
}
