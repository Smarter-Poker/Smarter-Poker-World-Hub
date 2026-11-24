import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import {
    STREAK_MILESTONES,
    STREAK_MILESTONE_REWARDS,
    computeClaimableMilestones,
} from '../../../src/lib/trivia/streakMilestoneModel.mjs';

const REQUEST_KEY_RE = /^[A-Za-z0-9:_-]{8,128}$/;
const FREEZE_ITEM_TYPE = 'streak_shield';
const FREEZE_COST_DIAMONDS = 25;
const FREEZE_MAX_QUANTITY = 5;

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('streak freeze server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
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
        try { reportApiError(error, { route: 'trivia/streak-freeze', operation: 'service_client' }); } catch (_) {}
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    if (req.method === 'GET') {
        try {
            const [itemRes, streakRes, profileRes, claimsRes, consumptionRes] = await Promise.all([
                client
                    .from('trivia_user_items')
                    .select('quantity, updated_at')
                    .eq('user_id', user.id)
                    .eq('item_type', FREEZE_ITEM_TYPE)
                    .maybeSingle(),
                client
                    .from('trivia_streaks')
                    .select('current_streak, best_streak')
                    .eq('user_id', user.id)
                    .maybeSingle(),
                client
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', user.id)
                    .maybeSingle(),
                client
                    .from('trivia_streak_milestone_claims')
                    .select('milestone_days, reward_diamonds, journal_id, reference_id, claimed_at')
                    .eq('user_id', user.id)
                    .order('milestone_days', { ascending: true }),
                client
                    .from('trivia_streak_freeze_consumptions')
                    .select('missed_date, consumed_at')
                    .eq('user_id', user.id)
                    .order('missed_date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ]);

            if (itemRes.error || streakRes.error || profileRes.error || claimsRes.error || consumptionRes.error) {
                const dbErr = itemRes.error || streakRes.error || profileRes.error || claimsRes.error || consumptionRes.error;
                try { reportApiError(dbErr, { route: 'trivia/streak-freeze', operation: 'read', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'streak_freeze_read_failed' });
            }

            const currentStreak = Math.max(0, Number(streakRes.data?.current_streak) || 0);
            const bestStreak = Math.max(0, Number(streakRes.data?.best_streak) || 0);
            const claimedMilestones = (Array.isArray(claimsRes.data) ? claimsRes.data : []).map((row) => ({
                milestoneDays: Number(row.milestone_days),
                rewardDiamonds: Number(row.reward_diamonds),
                journalId: row.journal_id || null,
                referenceId: row.reference_id || null,
                claimedAt: row.claimed_at || null,
            }));
            const claimableMilestones = computeClaimableMilestones(
                Math.max(currentStreak, bestStreak),
                claimedMilestones,
            );

            return res.status(200).json({
                success: true,
                itemType: FREEZE_ITEM_TYPE,
                quantity: Math.max(0, Number(itemRes.data?.quantity) || 0),
                maxQuantity: FREEZE_MAX_QUANTITY,
                costDiamonds: FREEZE_COST_DIAMONDS,
                currentStreak,
                bestStreak,
                balance: Math.max(0, Number(profileRes.data?.diamonds) || 0),
                updatedAt: itemRes.data?.updated_at || null,
                claimedMilestones,
                claimableMilestones,
                milestoneRewards: STREAK_MILESTONE_REWARDS,
                lastFreezeConsumedDate: consumptionRes.data?.missed_date || null,
                lastFreezeConsumedAt: consumptionRes.data?.consumed_at || null,
            });
        } catch (error) {
            try { reportApiError(error, { route: 'trivia/streak-freeze', operation: 'read', userId: user.id }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'internal_error' });
        }
    }

    const action = String(req.body?.action || 'purchase').trim().toLowerCase();
    const requestKey = String(req.body?.requestKey ?? req.body?.idempotencyKey ?? '').trim();
    if (!REQUEST_KEY_RE.test(requestKey)) {
        return res.status(400).json({ success: false, error: 'invalid_request_key' });
    }

    if (action === 'claim_milestone') {
        const milestoneDays = Math.trunc(Number(req.body?.milestoneDays));
        if (!STREAK_MILESTONES.includes(milestoneDays)) {
            return res.status(400).json({ success: false, error: 'invalid_milestone_days' });
        }

        try {
            const { data, error } = await client.rpc('trivia_streak_claim_milestone_v1', {
                p_user_id: user.id,
                p_milestone_days: milestoneDays,
                p_request_key: requestKey,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/streak-freeze', operation: 'claim_milestone', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'milestone_claim_failed' });
            }
            if (!data || data.success !== true) {
                const code = data?.error || 'milestone_claim_failed';
                const status = code === 'milestone_not_reached'
                    ? 409
                    : code === 'invalid_milestone_days' || code === 'invalid_request_key'
                        ? 400
                        : 500;
                return res.status(status).json({
                    success: false,
                    error: code,
                    ...(Number.isFinite(data?.milestoneDays) ? { milestoneDays: data.milestoneDays } : {}),
                    ...(Number.isFinite(data?.currentStreak) ? { currentStreak: data.currentStreak } : {}),
                    ...(Number.isFinite(data?.bestStreak) ? { bestStreak: data.bestStreak } : {}),
                });
            }
            return res.status(200).json({ ...data, action: 'claim_milestone' });
        } catch (error) {
            try { reportApiError(error, { route: 'trivia/streak-freeze', operation: 'claim_milestone', userId: user.id }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'internal_error' });
        }
    }

    if (action !== 'purchase') {
        return res.status(400).json({ success: false, error: 'invalid_action' });
    }

    try {
        const { data, error } = await client.rpc('trivia_streak_freeze_purchase_v1', {
            p_user_id: user.id,
            p_request_key: requestKey,
        });
        if (error) {
            try { reportApiError(error, { route: 'trivia/streak-freeze', userId: user.id }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'streak_freeze_purchase_failed' });
        }
        if (!data || data.success !== true) {
            const code = data?.error || 'streak_freeze_purchase_failed';
            const status = code === 'insufficient_diamonds'
                ? 402
                : code === 'max_streak_freezes_reached'
                    ? 409
                    : code === 'invalid_request_key'
                        ? 400
                        : 500;
            return res.status(status).json({
                success: false,
                error: code,
                ...(Number.isFinite(data?.balance) ? { balance: data.balance } : {}),
                ...(Number.isFinite(data?.quantity) ? { quantity: data.quantity } : {}),
                ...(Number.isFinite(data?.maxQuantity) ? { maxQuantity: data.maxQuantity } : {}),
            });
        }
        return res.status(200).json(data);
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/streak-freeze', userId: user.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
