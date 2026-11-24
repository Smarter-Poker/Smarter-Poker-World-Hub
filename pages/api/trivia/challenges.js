import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { emitTriviaRealtimeBroadcasts } from '../../../src/lib/trivia/realtimeBroadcast.mjs';

const CODE_RE = /^[A-Z0-9]{6,16}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STAKES = new Set([10, 25, 50, 100]);

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('trivia challenges server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
}

function buildPvpHandoff(challenge, existingHandoff = null) {
    if (!challenge || typeof challenge !== 'object') return existingHandoff || null;
    const challengeCode = String(
        existingHandoff?.challengeCode || challenge.challengeCode || '',
    ).trim().toUpperCase();
    const stakeAmount = Number(existingHandoff?.stake ?? challenge.stakeAmount);
    if (!CODE_RE.test(challengeCode) || !Number.isInteger(stakeAmount) || !ALLOWED_STAKES.has(stakeAmount)) {
        return existingHandoff || null;
    }
    const matchId = existingHandoff?.matchId || challenge.matchId || null;
    const paired = Boolean(existingHandoff?.paired || matchId);
    return {
        ...(existingHandoff && typeof existingHandoff === 'object' ? existingHandoff : {}),
        stake: stakeAmount,
        stakeAmount,
        challengeCode,
        challengeId: existingHandoff?.challengeId || challenge.id || null,
        matchId,
        paired,
        quoteEndpoint: existingHandoff?.quoteEndpoint || '/api/trivia/pvp/quote',
        joinEndpoint: existingHandoff?.joinEndpoint || '/api/trivia/pvp/join',
        resumeEndpoint: existingHandoff?.resumeEndpoint || '/api/trivia/pvp/resume',
        requiresServerQuote: true,
        route: existingHandoff?.route
            || `/hub/trivia/pvp?challenge=${encodeURIComponent(challengeCode)}&stake=${stakeAmount}${matchId ? `&match=${encodeURIComponent(matchId)}` : ''}`,
        guidance: paired
            ? 'Your Direct Friend Duel Is Active. Resume Your Match Below.'
            : 'Review Your Server-Quoted Stake And Join The Matched 1v1 Queue.',
    };
}

function errorStatus(code) {
    switch (code) {
        case 'authentication_required': return 401;
        case 'challenger_insufficient_diamonds':
        case 'accepter_insufficient_diamonds': return 402;
        case 'not_challenge_owner':
        case 'unauthorized_recipient': return 403;
        case 'challenge_not_found':
        case 'challenged_user_not_found':
        case 'challenger_profile_not_found':
        case 'accepter_profile_not_found': return 404;
        case 'invalid_challenge_code':
        case 'invalid_stake_amount':
        case 'invalid_action':
        case 'invalid_challenged_user_id':
        case 'cannot_challenge_self':
        case 'cannot_accept_own_challenge': return 400;
        case 'challenge_expired':
        case 'challenge_cancelled':
        case 'challenge_not_open':
        case 'challenge_already_accepted':
        case 'challenger_already_in_match':
        case 'accepter_already_in_match':
        case 'too_many_open_challenges': return 409;
        case 'pvp_joins_paused':
        case 'rules_unavailable':
        case 'pvp_configuration_unavailable': return 503;
        default: return 500;
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET, POST');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return undefined;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/challenges', operation: 'service_client' }); } catch (_) {}
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);

    try {
        if (req.method === 'GET') {
            const rawCode = typeof req.query?.code === 'string' ? req.query.code.trim().toUpperCase() : '';
            if (rawCode) {
                if (!CODE_RE.test(rawCode)) {
                    return res.status(400).json({ success: false, error: 'invalid_challenge_code' });
                }
                const { data, error } = await client.rpc('trivia_friend_challenge_get_v1', {
                    p_challenge_code: rawCode,
                    p_viewer_id: user?.id || null,
                });
                if (error) {
                    try { reportApiError(error, { route: 'trivia/challenges', operation: 'get' }); } catch (_) {}
                    return res.status(500).json({ success: false, error: 'challenge_lookup_failed' });
                }
                if (!data || data.success !== true) {
                    const code = data?.error || 'challenge_not_found';
                    return res.status(errorStatus(code)).json({ success: false, error: code });
                }
                const pvpHandoff = buildPvpHandoff(data.challenge, data.pvpHandoff);
                return res.status(200).json({
                    ...data,
                    challengeCode: data.challenge?.challengeCode || rawCode,
                    stakeAmount: data.challenge?.stakeAmount ?? null,
                    pvpHandoff,
                });
            }

            if (authError || !user?.id) {
                return res.status(401).json({ success: false, error: 'authentication_required' });
            }
            const limitRaw = Number(req.query?.limit);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 20;
            const { data, error } = await client.rpc('trivia_friend_challenge_list_v1', {
                p_user_id: user.id,
                p_limit: limit,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/challenges', operation: 'list', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'challenge_list_failed' });
            }
            return res.status(200).json(data || { success: true, items: [] });
        }

        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }

        const body = req.body || {};
        const action = String(body.action || '').trim().toLowerCase();

        if (action === 'create') {
            const stakeAmount = Number(body.stakeAmount ?? body.stake ?? 25);
            if (!Number.isInteger(stakeAmount) || !ALLOWED_STAKES.has(stakeAmount)) {
                return res.status(400).json({ success: false, error: 'invalid_stake_amount' });
            }
            const expiresMinutesRaw = Number(body.expiresMinutes ?? 30);
            const expiresMinutes = Number.isFinite(expiresMinutesRaw)
                ? Math.min(Math.max(Math.trunc(expiresMinutesRaw), 5), 1440)
                : 30;
            const rawChallengedId = body.challengedUserId ?? body.challenged_user_id ?? null;
            let challengedUserId = null;
            if (rawChallengedId !== null && rawChallengedId !== undefined && rawChallengedId !== '') {
                const candidate = String(rawChallengedId).trim();
                if (!UUID_RE.test(candidate)) {
                    return res.status(400).json({ success: false, error: 'invalid_challenged_user_id' });
                }
                challengedUserId = candidate.toLowerCase();
            }
            const rpcArgs = {
                p_user_id: user.id,
                p_stake_amount: stakeAmount,
                p_expires_minutes: expiresMinutes,
                ...(challengedUserId ? { p_challenged_user_id: challengedUserId } : {}),
            };
            const { data, error } = await client.rpc('trivia_friend_challenge_create_v1', rpcArgs);
            if (error) {
                try { reportApiError(error, { route: 'trivia/challenges', operation: 'create', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'challenge_create_failed' });
            }
            if (!data || data.success !== true) {
                const code = data?.error || 'challenge_create_failed';
                return res.status(errorStatus(code)).json({ success: false, error: code });
            }
            return res.status(200).json(data);
        }

        if (action === 'accept' || action === 'cancel') {
            const challengeCode = String(body.challengeCode ?? body.code ?? '').trim().toUpperCase();
            if (!CODE_RE.test(challengeCode)) {
                return res.status(400).json({ success: false, error: 'invalid_challenge_code' });
            }
            const rpcName = action === 'accept'
                ? 'trivia_friend_challenge_accept_v1'
                : 'trivia_friend_challenge_cancel_v1';
            const { data, error } = await client.rpc(rpcName, {
                p_user_id: user.id,
                p_challenge_code: challengeCode,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/challenges', operation: action, userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: `challenge_${action}_failed` });
            }
            if (!data || data.success !== true) {
                const code = data?.error || `challenge_${action}_failed`;
                return res.status(errorStatus(code)).json({ success: false, error: code });
            }

            const { broadcastTargets, ...publicData } = data;
            const resolvedMatchId = broadcastTargets?.matchId || publicData.challenge?.matchId || null;
            const challengerId = broadcastTargets?.challengerId || (action === 'cancel' ? user.id : null);
            const broadcastEntries = [];
            const signalPayload = {
                type: 'state_change',
                entityId: resolvedMatchId || publicData.challenge?.id || challengeCode,
                state: publicData.challenge?.status || action,
                action,
                challengeCode: publicData.challenge?.challengeCode || challengeCode,
                matchId: resolvedMatchId,
            };

            if (challengerId) {
                broadcastEntries.push({
                    channel: `trivia:pvp:user:${challengerId}`,
                    event: action === 'accept' ? 'match_update' : 'state_update',
                    payload: signalPayload,
                });
            }
            if (action === 'accept' && user.id && user.id !== challengerId) {
                broadcastEntries.push({
                    channel: `trivia:pvp:user:${user.id}`,
                    event: 'match_update',
                    payload: signalPayload,
                });
            }
            if (resolvedMatchId) {
                broadcastEntries.push({
                    channel: `trivia:pvp:match:${resolvedMatchId}`,
                    event: 'match_update',
                    payload: signalPayload,
                });
            }
            if (broadcastEntries.length > 0) {
                await emitTriviaRealtimeBroadcasts(broadcastEntries);
            }

            if (action === 'accept') {
                const pvpHandoff = buildPvpHandoff(publicData.challenge, publicData.pvpHandoff);
                return res.status(200).json({
                    ...publicData,
                    challengeCode: publicData.challenge?.challengeCode || challengeCode,
                    stakeAmount: publicData.challenge?.stakeAmount ?? pvpHandoff?.stakeAmount ?? null,
                    matchId: resolvedMatchId,
                    pvpHandoff,
                });
            }
            return res.status(200).json(publicData);
        }

        return res.status(400).json({ success: false, error: 'invalid_action' });
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/challenges', userId: user?.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
