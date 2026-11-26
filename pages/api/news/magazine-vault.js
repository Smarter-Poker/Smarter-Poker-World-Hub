/**
 * Smarter.Poker Monthly Magazine Vault Harvester API (/api/news/magazine-vault)
 *
 * Scheduled every 6 hours (`:45`) by OpenClaw (`Authorization: Bearer $CRON_SECRET`)
 * and callable on demand by administrators from `/admin/newsletter`.
 * Runs outside `pages/api/cron/` per repository cron cap policy.
 */
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { currentIssuePeriod, isValidIssuePeriod } from '../../../src/lib/magazine/magazineSchema.mjs';
import { harvestMonthlyMagazineVault } from '../../../src/lib/magazine/vaultHarvester.mjs';

export const config = { maxDuration: 300 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

async function authorizeVaultCaller(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    const sb = getSupabase();
    const authRes = await getServerUserWithFallback(req, sb);
    const user = authRes?.user ?? authRes;
    if (!user?.id) return null;

    const { data: profRows, error } = await sb
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .limit(1);
    const profile = Array.isArray(profRows) ? profRows[0] : null;
    if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
        return null;
    }
    return { kind: 'admin', userId: user.id };
}

const safeQ = (v) => (Array.isArray(v) ? String(v[0]) : v == null ? '' : String(v));

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const auth = await authorizeVaultCaller(req);
    if (!auth) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
        const rawPeriod = String(body.issuePeriod || safeQ(req.query?.issuePeriod) || '').trim();
        const issuePeriod = isValidIssuePeriod(rawPeriod) ? rawPeriod : currentIssuePeriod();

        const result = await harvestMonthlyMagazineVault(getSupabase(), {
            issuePeriod,
            externalBudgetMs: 20_000,
        });

        return res.status(200).json({
            success: true,
            issuePeriod: result.issuePeriod,
            harvestedCount: result.harvestedCount,
            countsBySection: result.countsBySection,
        });
    } catch (error) {
        try {
            reportApiError(error, req);
        } catch {
            /* ignore reporting error */
        }
        return res.status(500).json({
            success: false,
            error: error?.message || 'Monthly magazine vault harvest failed',
        });
    }
}
