import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    isTrainingPersistenceUnavailable,
    runTrainingPersistenceQuery,
    trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = new Set(['attemptId']);
// fn_complete_training_attempt_v2 can request at most 34 diamonds (Level 12,
// perfect, >5 streak). award_diamonds_v2 then applies the centrally guarded
// profile multiplier, whose database ceiling is 10. Reject anything outside
// that composed server contract without rejecting a legitimate 2x award.
const MAX_TRAINING_COMPLETION_DIAMONDS = 340;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

function resultStatus(result) {
    const explicit = Number(result?.status);
    if (Number.isInteger(explicit) && explicit >= 400 && explicit <= 499) return explicit;

    const code = String(result?.code || '').toUpperCase();
    if (code === 'TRAINING_REWARD_NOT_SETTLED') return 503;
    if (code.includes('NOT_FOUND')) return 404;
    if (code.includes('INCOMPLETE') || code.includes('NOT_COMPLETED')) return 409;
    if (code.includes('INVALID')) return 400;
    return 409;
}

function reportFailure(error, req) {
    try {
        reportApiError(error, req);
        return true;
    } catch (reportingError) {
        console.warn('[SaveProgress] Error reporting failed:', reportingError?.message || reportingError);
        return false;
    }
}

/**
 * Complete one server-owned Training attempt.
 *
 * The browser supplies only the opaque attempt id. Answer counts, accuracy,
 * mastery, progress, leaderboard changes, and any rewards are derived and
 * committed atomically by fn_complete_training_attempt_v2. Keeping that work
 * inside the database makes retries idempotent and prevents a client from
 * manufacturing a completion by editing request totals.
 */
export default async function handler(req, res) {
    try {
        withTiming(res);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Authorization');

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({ success: false, error: 'A valid attemptId is required' });
        }

        const bodyKeys = Object.keys(body);
        if (
            bodyKeys.length !== 1
            || !Object.hasOwn(body, 'attemptId')
            || bodyKeys.some((key) => !ALLOWED_BODY_KEYS.has(key))
        ) {
            return res.status(400).json({
                success: false,
                error: 'Only attemptId may be supplied; completion statistics are server-owned',
            });
        }

        const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : '';
        if (!UUID_RE.test(attemptId)) {
            return res.status(400).json({ success: false, error: 'A valid attemptId is required' });
        }

        let completionResult;
        try {
            completionResult = await runTrainingPersistenceQuery(
                () => getSupabase().rpc('fn_complete_training_attempt_v2', {
                    p_user_id: user.id,
                    p_attempt_id: attemptId,
                }),
                { label: 'SaveProgress:complete-attempt' },
            );
        } catch (error) {
            if (isTrainingPersistenceUnavailable(error)) {
                return res.status(503).json(trainingPersistenceUnavailableBody());
            }
            throw error;
        }

        const { data, error } = completionResult;

        if (error) {
            console.warn('[SaveProgress] completion RPC failed:', error.message);
            return res.status(503).json({
                success: false,
                code: 'TRAINING_COMPLETION_UNAVAILABLE',
                error: 'Training completion is temporarily unavailable',
            });
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            console.warn('[SaveProgress] completion RPC returned an invalid contract');
            return res.status(502).json({
                success: false,
                code: 'TRAINING_COMPLETION_INVALID_RESPONSE',
                error: 'Training completion could not be verified',
            });
        }

        if (data.success !== true) {
            const status = resultStatus(data);
            return res.status(status).json({
                ...data,
                success: false,
                ...(status === 503 ? { retryable: true } : {}),
            });
        }

        const returnedAttemptId = String(data.attemptId || '').toLowerCase();
        const rewardReference = String(data.rewardReference || '');
        const diamondsEarned = Number(data.diamondsEarned);
        const validReward = Number.isInteger(diamondsEarned)
            && diamondsEarned >= 0
            && diamondsEarned <= MAX_TRAINING_COMPLETION_DIAMONDS
            && rewardReference === `training_attempt:${attemptId}`
            && (!data.practiceOnly || diamondsEarned === 0);
        if (returnedAttemptId !== attemptId.toLowerCase() || !validReward) {
            console.warn('[SaveProgress] completion RPC returned a mismatched attempt or reward entitlement');
            return res.status(502).json({
                success: false,
                code: 'TRAINING_COMPLETION_INVALID_RESPONSE',
                error: 'Training completion could not be verified',
            });
        }

        return res.status(200).json({
            ...data,
            success: true,
            attemptId,
            // Compatibility alias. Both values are the actual amount already
            // settled atomically by fn_complete_training_attempt_v2.
            diamondsAwarded: diamondsEarned,
        });
    } catch (error) {
        reportFailure(error, req);
        console.warn('[SaveProgress] Unhandled error:', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
