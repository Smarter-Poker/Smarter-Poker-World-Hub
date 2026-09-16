import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { serviceClient } from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const scoreId = typeof req.body?.scoreId === 'string' ? req.body.scoreId.trim() : '';
        if (!UUID_RE.test(scoreId)) {
            return res.status(400).json({ success: false, error: 'invalid_score_id' });
        }

        const sb = serviceClient();
        const { user, error: authError } = await getServerUserWithFallback(req, sb);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }

        // The RPC accepts service_role so it can own the transaction. Restore
        // the caller binding explicitly before invoking it; never let a leaked
        // score UUID become a prize claim capability.
        const { data: score, error: scoreError } = await sb
            .from('trivia_scores')
            .select('id, user_id')
            .eq('id', scoreId)
            .maybeSingle();
        if (scoreError) {
            return res.status(500).json({ success: false, error: 'score_lookup_failed' });
        }
        if (!score) return res.status(404).json({ success: false, error: 'score_not_found' });
        if (score.user_id !== user.id) {
            return res.status(403).json({ success: false, error: 'not_your_score' });
        }

        const { data, error } = await sb.rpc('fn_trivia_prize_wheel_spin', {
            p_score_id: scoreId
        });
        if (error) {
            throw new Error(`wheel_rpc_failed:${error.message || error}`);
        }
        if (!data || data.success === false) {
            const code = data?.error || 'wheel_rejected';
            const status = code === 'spin_window_expired' ? 410
                : code === 'not_a_perfect_game' || code === 'score_not_server_verified' ? 409
                : code === 'score_not_found' ? 404
                : 400;
            return res.status(status).json({ success: false, error: code });
        }

        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json(data);
    } catch (error) {
        console.error('[trivia prize-wheel-spin] unexpected:', error);
        try { reportApiError(error, req); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
