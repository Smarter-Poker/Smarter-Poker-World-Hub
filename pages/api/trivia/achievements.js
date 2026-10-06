import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import {
    ACHIEVEMENT_CONTRACT,
    ACHIEVEMENT_VERSION,
    achievementErrorStatus,
    normalizeAchievementItem,
    normalizeAchievementSnapshot,
    sanitizeAchievementId,
} from '../../../src/lib/trivia/achievementAuthority.mjs';

let cachedServiceClient = null;

function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceRoleKey) throw new Error('achievement authority server configuration is unavailable');
        cachedServiceClient = createClient(
            url,
            serviceRoleKey,
            { auth: { persistSession: false, autoRefreshToken: false } }
        );
    }
    return cachedServiceClient;
}

function safeReport(error, context) {
    try { reportApiError(error, context); } catch (_) {}
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', 'GET, POST');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        safeReport(error, { route: 'trivia/achievements', operation: 'service_client' });
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }
    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    try {
        if (req.method === 'GET') {
            const { data, error } = await client.rpc('trivia_achievements_snapshot_v2', {
                p_user_id: user.id,
            });
            if (error) {
                safeReport(error, { route: 'trivia/achievements', operation: 'snapshot', userId: user.id });
                return res.status(500).json({ success: false, error: 'achievement_snapshot_failed' });
            }
            if (!data || data.success === false) {
                const code = data?.error || 'achievement_snapshot_failed';
                return res.status(achievementErrorStatus(code)).json({ success: false, error: code });
            }
            const snapshot = normalizeAchievementSnapshot(data);
            return res.status(200).json({ success: true, ...snapshot });
        }

        if (req.method === 'POST') {
            const achievementId = sanitizeAchievementId(req.body?.achievementId);
            if (!achievementId) {
                return res.status(400).json({ success: false, error: 'invalid_achievement_id' });
            }

            const { data, error } = await client.rpc('trivia_achievement_claim_v2', {
                p_user_id: user.id,
                p_achievement_id: achievementId,
            });
            if (error) {
                safeReport(error, { route: 'trivia/achievements', operation: 'claim', userId: user.id, achievementId });
                return res.status(503).json({ success: false, error: 'award_failed' });
            }
            if (!data || data.success === false) {
                const code = data?.error || 'award_failed';
                let item = null;
                try { item = data?.item ? normalizeAchievementItem(data.item) : null; } catch (_) {}
                return res.status(achievementErrorStatus(code)).json({
                    success: false,
                    error: code,
                    ...(item ? { item } : {}),
                });
            }

            const item = normalizeAchievementItem(data.item);
            return res.status(200).json({
                success: true,
                contract: ACHIEVEMENT_CONTRACT,
                version: ACHIEVEMENT_VERSION,
                item,
            });
        }
    } catch (error) {
        safeReport(error, { route: 'trivia/achievements', userId: user.id });
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
