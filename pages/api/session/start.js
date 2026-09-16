/**
 * Legacy Training Session Start API
 * =================================
 *
 * Campaign attempts are created by the signed Training question-delivery
 * handshake (`/api/training/batch-preload` or `/api/training/get-question`).
 * This older God Mode endpoint cannot create a `training_attempt`, so returning
 * an unrelated UUID from here would falsely imply that an authoritative run
 * had started. Keep the route as an authenticated, explicit retirement response
 * for stale clients; current clients enter the canonical Arena directly.
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { isCanonicalTrainingGameId } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { reportApiError } from '../../../src/lib/sentryWrap';

let supabase = null;
function getSupabase() {
    if (!supabase) {
        supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
    }
    return supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const gameId = typeof req.body?.game_id === 'string' ? req.body.game_id.trim() : '';
        if (!isCanonicalTrainingGameId(gameId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TRAINING_GAME',
                error: 'A canonical Training game_id is required.',
            });
        }

        return res.status(410).json({
            success: false,
            code: 'TRAINING_SESSION_START_RETIRED',
            error: 'Training attempts now start inside the canonical Arena through signed question delivery.',
            arenaPath: `/hub/training/arena/${gameId}`,
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryError) {
            console.warn('[SessionStart] Error reporting failed:', _sentryError?.message || _sentryError);
        }
        console.warn('[SessionStart] Unhandled error:', error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
