/**
 * GET /api/trivia/pvp/ratings
 *
 * Rate-limited (LIMITS.read) endpoint returning the top Trivia PvP Elo
 * leaderboard (humans-only default, sanitized display name, Elo, tier, W-L-T)
 * plus the current authenticated viewer's PvP Elo rating when signed in.
 */

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import {
    DEFAULT_PVP_ELO,
    DEFAULT_PVP_TIER,
    eloTierForRating,
    sanitizeDisplayName,
} from '../../../../src/lib/trivia/integrityAndElo.mjs';

let cachedClient = null;
function serviceClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    if (!cachedClient) cachedClient = createClient(url, key, { auth: { persistSession: false } });
    return cachedClient;
}

function parseLimit(raw) {
    const parsed = Number.parseInt(String(raw ?? '50'), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 50;
    return Math.min(100, parsed);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, { ...LIMITS.read, scope: 'trivia-pvp-ratings' })) return;

    const hasAuthContext = Boolean(req.headers?.authorization || req.headers?.cookie);
    res.setHeader(
        'Cache-Control',
        hasAuthContext
            ? 'private, no-store, max-age=0'
            : 'public, s-maxage=30, stale-while-revalidate=60',
    );

    const sb = serviceClient();
    if (!sb) {
        return res.status(503).json({ success: false, error: 'server_misconfigured' });
    }

    try {
        const limit = parseLimit(req.query?.limit);
        const includeHorses = req.query?.includeHorses === 'true';

        // Fetch top rated accounts with headroom in case horse rows are filtered out.
        const fetchLimit = Math.min(250, limit + 50);
        const { data: ratingRows, error: ratingsErr } = await sb
            .from('trivia_pvp_ratings')
            .select('user_id, elo, peak_elo, games_played, wins, losses, ties, tier, updated_at')
            .order('elo', { ascending: false })
            .order('games_played', { ascending: false })
            .order('user_id', { ascending: true })
            .limit(fetchLimit);

        if (ratingsErr) {
            console.warn('[trivia/pvp/ratings] ratings read failed:', ratingsErr.code || ratingsErr.message);
            return res.status(503).json({ success: false, error: 'ratings_unavailable' });
        }

        const safeRows = Array.isArray(ratingRows) ? ratingRows : [];
        const userIds = safeRows.map((row) => row.user_id).filter(Boolean);
        const profileMap = new Map();

        if (userIds.length > 0) {
            for (let offset = 0; offset < userIds.length; offset += 50) {
                const { data: profiles } = await sb
                    .from('profiles')
                    .select('id, display_name, username, is_horse')
                    .in('id', userIds.slice(offset, offset + 50));
                for (const profile of Array.isArray(profiles) ? profiles : []) {
                    profileMap.set(profile.id, profile);
                }
            }
        }

        const filtered = safeRows.filter((row) => {
            const profile = profileMap.get(row.user_id);
            if (!includeHorses && profile?.is_horse === true) return false;
            return true;
        });

        const leaderboard = [];
        let lastElo = null;
        let lastRank = 0;
        for (let idx = 0; idx < Math.min(filtered.length, limit); idx += 1) {
            const row = filtered[idx];
            const profile = profileMap.get(row.user_id);
            const elo = Number.isInteger(row.elo) ? row.elo : DEFAULT_PVP_ELO;
            const rank = lastElo === elo ? lastRank : idx + 1;
            lastElo = elo;
            lastRank = rank;
            leaderboard.push({
                rank,
                userId: row.user_id,
                displayName: sanitizeDisplayName(profile),
                elo,
                peakElo: Number.isInteger(row.peak_elo) ? row.peak_elo : elo,
                tier: row.tier || eloTierForRating(elo),
                gamesPlayed: Math.max(0, Number(row.games_played) || 0),
                wins: Math.max(0, Number(row.wins) || 0),
                losses: Math.max(0, Number(row.losses) || 0),
                ties: Math.max(0, Number(row.ties) || 0),
                updatedAt: row.updated_at || null,
            });
        }

        let viewer = null;
        if (hasAuthContext) {
            const { user } = await getServerUserWithFallback(req, sb);
            if (user?.id) {
                const listed = leaderboard.find((entry) => entry.userId === user.id);
                if (listed) {
                    viewer = { ...listed, unrated: listed.gamesPlayed === 0 };
                } else {
                    const { data: ownRow } = await sb
                        .from('trivia_pvp_ratings')
                        .select('user_id, elo, peak_elo, games_played, wins, losses, ties, tier, updated_at')
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (ownRow) {
                        const ownElo = Number.isInteger(ownRow.elo) ? ownRow.elo : DEFAULT_PVP_ELO;
                        viewer = {
                            rank: null,
                            userId: user.id,
                            elo: ownElo,
                            peakElo: Number.isInteger(ownRow.peak_elo) ? ownRow.peak_elo : ownElo,
                            tier: ownRow.tier || eloTierForRating(ownElo),
                            gamesPlayed: Math.max(0, Number(ownRow.games_played) || 0),
                            wins: Math.max(0, Number(ownRow.wins) || 0),
                            losses: Math.max(0, Number(ownRow.losses) || 0),
                            ties: Math.max(0, Number(ownRow.ties) || 0),
                            updatedAt: ownRow.updated_at || null,
                            unrated: (Number(ownRow.games_played) || 0) === 0,
                        };
                    } else {
                        viewer = {
                            rank: null,
                            userId: user.id,
                            elo: DEFAULT_PVP_ELO,
                            peakElo: DEFAULT_PVP_ELO,
                            tier: DEFAULT_PVP_TIER,
                            gamesPlayed: 0,
                            wins: 0,
                            losses: 0,
                            ties: 0,
                            updatedAt: null,
                            unrated: true,
                        };
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            scope: includeHorses ? 'all' : 'human',
            total: leaderboard.length,
            leaderboard,
            viewer,
        });
    } catch (err) {
        console.warn('[trivia/pvp/ratings] unexpected error:', err?.message || err);
        try { reportApiError(err, req); } catch (_) { /* best effort */ }
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'ratings_request_failed' });
        }
        return undefined;
    }
}
