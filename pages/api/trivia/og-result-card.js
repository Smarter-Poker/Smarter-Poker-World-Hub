import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { buildResultCardSvg, isValidTriviaUuid } from '../../../src/lib/trivia/socialGrowthHelpers.mjs';

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('og result card server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
}

export function resolveOgPlayerLabel(profile) {
    if (profile?.is_horse === true) return 'Smarter Horse';
    return String(profile?.display_name || profile?.username || 'Smarter.Poker Player').trim() || 'Smarter.Poker Player';
}

function sendSvg(res, svg, cacheHeader = 'public, max-age=300, s-maxage=300') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', cacheHeader);
    return res.status(200).send(svg);
}

export default async function handler(req, res) {
    res.setHeader('Allow', 'GET');
    if (req.method !== 'GET') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    const rawSessionId = typeof req.query?.sessionId === 'string' ? req.query.sessionId.trim() : '';
    const rawMatchId = typeof req.query?.matchId === 'string' ? req.query.matchId.trim() : '';

    if ((rawSessionId && !isValidTriviaUuid(rawSessionId)) || (rawMatchId && !isValidTriviaUuid(rawMatchId))) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(400).json({ success: false, error: 'invalid_record_id' });
    }

    if (rawSessionId || rawMatchId) {
        let client;
        try {
            client = serviceClient();
        } catch (error) {
            try { reportApiError(error, { route: 'trivia/og-result-card', operation: 'service_client' }); } catch (_) {}
            res.setHeader('Cache-Control', 'no-store');
            return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
        }

        try {
            if (rawSessionId) {
                const { data: session, error: sessionErr } = await client
                    .from('trivia_sessions')
                    .select('id, user_id, mode, status, score, correct_count, diamonds_awarded, question_ids, submitted_at')
                    .eq('id', rawSessionId)
                    .eq('status', 'submitted')
                    .maybeSingle();

                if (sessionErr) {
                    try { reportApiError(sessionErr, { route: 'trivia/og-result-card', sessionId: rawSessionId }); } catch (_) {}
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(500).json({ success: false, error: 'verified_result_lookup_failed' });
                }

                if (!session) {
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(404).json({ success: false, error: 'verified_result_not_found' });
                }

                const [profileRes, streakRes] = await Promise.all([
                    session.user_id
                        ? client
                            .from('profiles')
                            .select('display_name, username, is_horse')
                            .eq('id', session.user_id)
                            .maybeSingle()
                        : Promise.resolve({ data: null }),
                    session.user_id
                        ? client
                            .from('trivia_streaks')
                            .select('current_streak')
                            .eq('user_id', session.user_id)
                            .maybeSingle()
                        : Promise.resolve({ data: null }),
                ]);

                const totalQuestions = Array.isArray(session.question_ids) ? session.question_ids.length : 0;
                const correctCount = Math.max(0, Number(session.correct_count) || 0);
                const diamondsAwarded = Math.max(0, Number(session.diamonds_awarded) || 0);
                const currentStreak = Math.max(0, Number(streakRes?.data?.current_streak) || 0);
                const playerLabel = resolveOgPlayerLabel(profileRes?.data);

                // Ignore all client-supplied score/mode/diamonds/player params for DB-verified sessions.
                const svg = buildResultCardSvg({
                    mode: session.mode || 'daily',
                    score: correctCount,
                    total: totalQuestions,
                    diamonds: diamondsAwarded,
                    streak: currentStreak,
                    player: playerLabel,
                    verified: true,
                    verificationId: session.id.slice(0, 8),
                });
                return sendSvg(res, svg);
            }

            // DB-verified settled PvP match card
            const { data: match, error: matchErr } = await client
                .from('trivia_pvp_matches')
                .select('id, status, player1_id, player2_id, player1_score, player2_score, winner_id, stake_amount, questions, completed_at')
                .eq('id', rawMatchId)
                .in('status', ['complete', 'completed'])
                .maybeSingle();

            if (matchErr) {
                try { reportApiError(matchErr, { route: 'trivia/og-result-card', matchId: rawMatchId }); } catch (_) {}
                res.setHeader('Cache-Control', 'no-store');
                return res.status(500).json({ success: false, error: 'verified_result_lookup_failed' });
            }

            if (!match) {
                res.setHeader('Cache-Control', 'no-store');
                return res.status(404).json({ success: false, error: 'verified_result_not_found' });
            }

            const featuredPlayerId = match.winner_id || match.player1_id || null;
            const isPlayer2 = Boolean(featuredPlayerId && match.player2_id && featuredPlayerId === match.player2_id);
            const verifiedScore = Math.max(0, Number(isPlayer2 ? match.player2_score : match.player1_score) || 0);
            const totalQuestions = Array.isArray(match.questions) && match.questions.length > 0 ? match.questions.length : 20;
            const verifiedDiamonds = match.winner_id && Number.isFinite(Number(match.stake_amount))
                ? Math.max(0, Math.round(Number(match.stake_amount) * 2 * 0.9))
                : 0;

            let playerLabel = 'Smarter.Poker Player';
            if (featuredPlayerId) {
                const { data: profile } = await client
                    .from('profiles')
                    .select('display_name, username, is_horse')
                    .eq('id', featuredPlayerId)
                    .maybeSingle();
                playerLabel = resolveOgPlayerLabel(profile);
            }

            const svg = buildResultCardSvg({
                mode: 'pvp',
                score: verifiedScore,
                total: totalQuestions,
                diamonds: verifiedDiamonds,
                streak: 0,
                player: playerLabel,
                verified: true,
                verificationId: match.id.slice(0, 8),
            });
            return sendSvg(res, svg);
        } catch (error) {
            try { reportApiError(error, { route: 'trivia/og-result-card', sessionId: rawSessionId, matchId: rawMatchId }); } catch (_) {}
            res.setHeader('Cache-Control', 'no-store');
            return res.status(500).json({ success: false, error: 'internal_error' });
        }
    }

    // Raw query-param preview without a verified settled DB record: explicitly stamped SAMPLE PREVIEW | UNVERIFIED.
    const svg = buildResultCardSvg({
        mode: req.query?.mode,
        score: req.query?.score,
        total: req.query?.total,
        diamonds: req.query?.diamonds,
        streak: req.query?.streak,
        player: req.query?.player,
        grid: req.query?.grid,
        verified: false,
    });
    return sendSvg(res, svg);
}
