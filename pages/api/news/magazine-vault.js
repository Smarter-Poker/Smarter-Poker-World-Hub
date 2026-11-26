/**
 * Smarter.Poker Monthly Magazine Vault Harvester API (/api/news/magazine-vault)
 *
 * Scheduled every 6 hours (`:45`) by OpenClaw (`Authorization: Bearer $CRON_SECRET`)
 * and callable on demand by administrators from `/admin/newsletter`.
 * Runs outside `pages/api/cron/` per repository cron cap policy.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';
import { currentIssuePeriod, isValidIssuePeriod } from '../../../src/lib/magazine/magazineSchema.mjs';
import { harvestMonthlyMagazineVault } from '../../../src/lib/magazine/vaultHarvester.mjs';

export const config = { maxDuration: 300 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

let _supabase = null;
async function getSupabase(req = null) {
    if (req?._supabase) return req._supabase;
    if (req?._supabaseClient) return req._supabaseClient;
    if (!_supabase) {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        _supabase = createClient();
    }
    return _supabase;
}

async function checkVaultRateLimit(req, res, mode = 'read') {
    try {
        const { applyRateLimit, LIMITS } = await import('../../../src/lib/apiRateLimit.js');
        return applyRateLimit(req, res, mode === 'write' ? LIMITS.write : LIMITS.read);
    } catch (err) {
        if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
        return true;
    }
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

    const sb = await getSupabase(req);
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
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    if (!(await checkVaultRateLimit(req, res, req.method === 'GET' ? 'read' : 'write'))) return;

    const auth = await authorizeVaultCaller(req);
    if (!auth) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
        const rawPeriod = String(body.issuePeriod || safeQ(req.query?.issuePeriod) || '').trim();
        if (rawPeriod && !isValidIssuePeriod(rawPeriod)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Issue Period Format. Expected YYYY-MM.',
            });
        }
        const issuePeriod = rawPeriod || currentIssuePeriod();

        const result = await harvestMonthlyMagazineVault(await getSupabase(req), {
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
            error: 'Monthly Magazine Vault Harvest Failed',
        });
    }
}
