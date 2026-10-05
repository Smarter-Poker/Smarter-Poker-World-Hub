/**
 * Route factory for /api/trivia/nightly/[action] (Phase 6 nightly tournament).
 *
 * Order of checks: method -> server-only release control (private 503 while
 * TRIVIA_TOURNAMENTS_ENABLED is off) -> rate limit -> identity from the verified
 * token/cookie (never from the body) -> ONE service-role RPC -> answer-free DTO.
 * No route grades, schedules, chooses horses, moves diamonds or decides a match;
 * the trivia_tournament_* database functions own all of that.
 */
import { getServerUserWithFallback } from '../serverAuth';
import { applyRateLimit, LIMITS } from '../apiRateLimit';
import { reportApiError } from '../apiErrorHandler';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from './tournamentReleaseControl.mjs';
import {
    NIGHTLY_ACTIONS,
    buildNightlyRpc,
    findForbiddenKeys,
    nightlyErrorStatus,
    normalizeNightlyError,
    projectNightlyDto,
} from './nightlyTournamentPolicy.mjs';

/** Runs one already-gated nightly action. Exported for the legacy entry alias. */
export async function runNightlyAction(action, req, res, sb) {
    const spec = NIGHTLY_ACTIONS[action];
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const { user } = await getServerUserWithFallback(req, sb).catch(() => ({ user: null }));
    if (spec.auth === 'required' && !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }
    const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const built = buildNightlyRpc(action, input, user?.id || null);
    if (!built.ok) {
        return res.status(nightlyErrorStatus(built.error)).json({ success: false, error: built.error });
    }
    const { data, error } = await sb.rpc(built.rpc, built.args);
    if (error) {
        console.warn('[trivia nightly] rpc failed:', action, error.message || error);
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
    if (!data || data.success !== true) {
        const code = normalizeNightlyError(data?.error);
        const body = { success: false, error: code };
        if (data?.opens_at) body.opensAt = data.opens_at;
        if (data?.registration_opens_at) body.registrationOpensAt = data.registration_opens_at;
        return res.status(nightlyErrorStatus(code)).json(body);
    }
    const leaked = findForbiddenKeys(data);
    if (leaked.length > 0) {
        console.error('[trivia nightly] refused to forward forbidden keys:', action, leaked.slice(0, 5));
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
    return res.status(200).json(projectNightlyDto(action, data));
}

export function createNightlyTournamentApi({ serviceClient, env = process.env } = {}) {
    if (typeof serviceClient !== 'function') throw new Error('serviceClient is required');
    return async function triviaNightlyRoute(req, res) {
        const action = String(req.query?.action || '');
        const spec = NIGHTLY_ACTIONS[action];
        try {
            if (!spec) return res.status(404).json({ success: false, error: 'not_found' });
            if (!spec.methods.includes(req.method)) {
                res.setHeader('Allow', spec.methods.join(', '));
                return res.status(405).json({ success: false, error: 'method_not_allowed' });
            }
            if (!areTriviaTournamentsReleased(env)) {
                return rejectUnavailableTriviaTournament(res);
            }
            const limit = spec.limit === 'write' ? LIMITS.write : LIMITS.read;
            if (!applyRateLimit(req, res, { ...limit, scope: `trivia-nightly-${spec.limit}` })) return undefined;
            return await runNightlyAction(action, req, res, serviceClient());
        } catch (e) {
            console.warn('[trivia nightly] unexpected:', action, e?.message || e);
            try { reportApiError(e, req); } catch (_reportError) { /* best effort */ }
            if (!res.headersSent) return res.status(500).json({ success: false, error: 'internal_error' });
            return undefined;
        }
    };
}
