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
    if (code.includes('NOT_FOUND')) return 404;
    if (code.includes('NOT_COMPLETED') || code.includes('INCOMPLETE')) return 409;
    if (code.includes('INVALID')) return 400;
    return 409;
}

function reportFailure(error, req) {
    try {
        reportApiError(error, req);
        return true;
    } catch (reportingError) {
        console.warn('[SaveSession] Error reporting failed:', reportingError?.message || reportingError);
        return false;
    }
}

/**
 * Materialize the analytics projection for a completed Training attempt.
 *
 * The browser may identify the attempt but may not submit scores, totals,
 * accuracy, pass/fail, streaks, EV, hand history, or rewards. The database RPC
 * derives every persisted field from the immutable attempt and its verified
 * answer rows. Its unique attempt_id projection makes network retries safe.
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
                error: 'Only attemptId may be supplied; session analytics are server-owned',
            });
        }

        const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : '';
        if (!UUID_RE.test(attemptId)) {
            return res.status(400).json({ success: false, error: 'A valid attemptId is required' });
        }

        let saveResult;
        try {
            saveResult = await runTrainingPersistenceQuery(
                () => getSupabase().rpc('fn_save_training_session_v2', {
                    p_user_id: user.id,
                    p_attempt_id: attemptId,
                }),
                { label: 'SaveSession:materialize-attempt' },
            );
        } catch (error) {
            if (isTrainingPersistenceUnavailable(error)) {
                return res.status(503).json(trainingPersistenceUnavailableBody());
            }
            throw error;
        }

        const { data, error } = saveResult;
        if (error) {
            console.warn('[SaveSession] analytics RPC failed:', error.message);
            return res.status(503).json(trainingPersistenceUnavailableBody());
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            console.warn('[SaveSession] analytics RPC returned an invalid contract');
            return res.status(502).json({
                success: false,
                code: 'TRAINING_SESSION_INVALID_RESPONSE',
                error: 'Training analytics could not be verified',
            });
        }

        if (data.success !== true) {
            return res.status(resultStatus(data)).json({
                ...data,
                success: false,
            });
        }

        const returnedAttemptId = String(data.attemptId || '').toLowerCase();
        const sessionAttemptId = String(data.session?.attempt_id || '').toLowerCase();
        if (
            returnedAttemptId !== attemptId.toLowerCase()
            || sessionAttemptId !== attemptId.toLowerCase()
            || Number(data.diamondsEarned) !== 0
        ) {
            console.warn('[SaveSession] analytics RPC returned a mismatched or reward-bearing session');
            return res.status(502).json({
                success: false,
                code: 'TRAINING_SESSION_INVALID_RESPONSE',
                error: 'Training analytics could not be verified',
            });
        }

        return res.status(200).json({
            ...data,
            success: true,
            attemptId,
            diamondsEarned: 0,
        });
    } catch (error) {
        reportFailure(error, req);
        console.warn('[SaveSession] Unhandled error:', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
