/**
 * Daily Player of the Year licensed-feed synchronizer.
 *
 * GPI's published terms require a licence for regular use of its rankings.
 * This route therefore consumes only a configured licensed JSON feed; it does
 * not scrape or bypass the public site's protections.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

function authorized(req) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
    const adminKey = process.env.ADMIN_API_KEY;
    return Boolean(adminKey && req.headers['x-admin-key'] === adminKey);
}

function pickRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.rankings)) return payload.rankings;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function normalizeRow(row, index) {
    const playerName = String(row?.player_name || row?.playerName || row?.name || '').trim();
    const rank = Number(row?.rank ?? row?.position ?? index + 1);
    const points = Number(String(row?.points ?? row?.score ?? '').replace(/,/g, ''));
    if (!playerName || !Number.isInteger(rank) || rank < 1 || rank > 500 || !Number.isFinite(points) || points < 0) {
        return null;
    }
    return {
        player_name: playerName.slice(0, 180),
        external_player_id: String(row?.external_player_id || row?.playerId || row?.id || '').trim().slice(0, 180) || null,
        rank,
        points,
        country: String(row?.country || '').trim().slice(0, 100) || null,
        team: String(row?.team || '').trim().slice(0, 160) || null,
    };
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const feedUrl = process.env.GPI_LICENSED_FEED_URL;
    const feedToken = process.env.GPI_LICENSED_FEED_TOKEN;
    if (!feedUrl || !feedToken) {
        return res.status(503).json({
            success: false,
            configured: false,
            error: 'Licensed GPI feed is not configured. No rankings were changed.',
        });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(feedUrl);
        if (parsedUrl.protocol !== 'https:') throw new Error('HTTPS required');
    } catch {
        return res.status(503).json({ success: false, configured: false, error: 'Licensed GPI feed URL is invalid.' });
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        let response;
        try {
            response = await fetch(parsedUrl.toString(), {
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${feedToken}`,
                    'User-Agent': 'Smarter.Poker-Licensed-GPI-Sync/1.0',
                },
            });
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`Licensed feed returned HTTP ${response.status}`);

        const payload = await response.json();
        const rawRows = pickRows(payload);
        const rows = rawRows.map(normalizeRow).filter(Boolean);
        const uniqueRanks = new Set(rows.map((row) => row.rank));
        if (rows.length < 5 || uniqueRanks.size !== rows.length) {
            return res.status(422).json({
                success: false,
                error: 'Licensed feed failed validation. Existing standings were preserved.',
            });
        }

        const currentYear = new Date().getUTCFullYear();
        const year = Number(payload?.year || currentYear);
        if (!Number.isInteger(year) || year < currentYear - 1 || year > currentYear + 1) {
            return res.status(422).json({ success: false, error: 'Licensed feed year is invalid.' });
        }
        const sourceUpdatedAt = new Date(payload?.updated_at || payload?.updatedAt || Date.now());
        if (Number.isNaN(sourceUpdatedAt.getTime())) {
            return res.status(422).json({ success: false, error: 'Licensed feed freshness timestamp is invalid.' });
        }

        const { data: inserted, error } = await getSupabase().rpc('fn_replace_licensed_poy_rankings', {
            p_year: year,
            p_rows: rows,
            p_source_url: parsedUrl.origin,
            p_source_updated_at: sourceUpdatedAt.toISOString(),
        });
        if (error) throw error;

        return res.status(200).json({
            success: true,
            configured: true,
            year,
            rows: inserted,
            source_updated_at: sourceUpdatedAt.toISOString(),
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[POY licensed sync] failed:', error?.message || error);
        return res.status(502).json({ success: false, error: 'Licensed standings sync failed. Existing standings were preserved.' });
    }
}
