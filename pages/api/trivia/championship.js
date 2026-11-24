import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('championship standings server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
}

export default async function handler(req, res) {
    res.setHeader('Allow', 'GET');

    if (req.method !== 'GET') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    const rawMonth = typeof req.query?.month === 'string' ? req.query.month.trim() : '';
    if (rawMonth && !MONTH_RE.test(rawMonth)) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(400).json({ success: false, error: 'invalid_month_format' });
    }

    const includeHorses = String(req.query?.includeHorses || 'false').toLowerCase() === 'true';
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/championship', operation: 'service_client' }); } catch (_) {}
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    try {
        const { data, error } = await client.rpc('trivia_monthly_championship_standings_v1', {
            p_month: rawMonth || null,
            p_include_horses: includeHorses,
            p_limit: limit,
        });
        if (error) {
            try { reportApiError(error, { route: 'trivia/championship', month: rawMonth || 'current' }); } catch (_) {}
            res.setHeader('Cache-Control', 'no-store');
            return res.status(500).json({ success: false, error: 'championship_standings_failed' });
        }
        if (!data || data.success !== true) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(400).json({ success: false, error: data?.error || 'championship_standings_failed' });
        }
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res.status(200).json(data);
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/championship' }); } catch (_) {}
        res.setHeader('Cache-Control', 'no-store');
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
