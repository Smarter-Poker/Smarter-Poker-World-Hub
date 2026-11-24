import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const CODE_RE = /^[A-Z0-9]{6,16}$/;
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

function errorStatus(code) {
    switch (code) {
        case 'authentication_required': return 401;
        case 'not_challenge_owner': return 403;
        case 'challenge_not_found': return 404;
        case 'invalid_challenge_code':
        case 'invalid_stake_amount':
        case 'invalid_action':
        case 'cannot_accept_own_challenge': return 400;
        case 'challenge_expired':
        case 'challenge_not_open':
        case 'too_many_open_challenges': return 409;
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
                return res.status(200).json(data);
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
            const { data, error } = await client.rpc('trivia_friend_challenge_create_v1', {
                p_user_id: user.id,
                p_stake_amount: stakeAmount,
                p_expires_minutes: expiresMinutes,
            });
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
            return res.status(200).json(data);
        }

        return res.status(400).json({ success: false, error: 'invalid_action' });
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/challenges', userId: user?.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
