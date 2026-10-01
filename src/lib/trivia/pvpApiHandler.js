/**
 * Route factory for /api/trivia/pvp/{join,status,heartbeat,resume,cancel}.
 *
 * Order of checks: method -> server-only release control (private 503 while
 * TRIVIA_PVP_ENABLED is off) -> rate limit -> authenticated identity from the
 * token/cookie (never from the body) -> ONE service-role RPC -> allowlisted,
 * user-scoped DTO. No route reads a queue row, chooses an opponent, touches a
 * wallet or decides an outcome; the trivia_pvp_*_v2 RPCs own all of that.
 *
 * Status and heartbeat also align the Smarter Horse claim with the stored
 * deadline: when a live searching ticket's horse_eligible_at is at most a few
 * seconds away, the request waits for it and polls once more, so fallback
 * happens at the persisted 20-45 s instant instead of at the next client poll.
 */
import { getServerUserWithFallback } from '../serverAuth';
import { applyRateLimit, LIMITS } from '../apiRateLimit';
import { reportApiError } from '../apiErrorHandler';
import {
    areTriviaPvpHorsesReleased,
    isTriviaPvpReleased,
    rejectUnavailableTriviaPvp,
} from './pvpReleaseControl.mjs';
import {
    deadlineAlignDelayMs,
    parseJoinBody,
    parseTicketId,
    pvpErrorStatus,
    toPvpDto,
} from './pvpMatchmakingPolicy.mjs';

export const PVP_ROUTE_ACTIONS = Object.freeze({
    join: { methods: ['POST'], limit: { ...LIMITS.write, scope: 'trivia-pvp-join' } },
    status: { methods: ['GET', 'POST'], limit: { ...LIMITS.read, scope: 'trivia-pvp-status' } },
    heartbeat: { methods: ['POST'], limit: { ...LIMITS.read, scope: 'trivia-pvp-status' } },
    resume: { methods: ['GET', 'POST'], limit: { ...LIMITS.read, scope: 'trivia-pvp-status' } },
    cancel: { methods: ['POST'], limit: { ...LIMITS.write, scope: 'trivia-pvp-cancel' } },
});

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPvpRoute(action, { serviceClient, env = process.env, sleep = defaultSleep } = {}) {
    const spec = PVP_ROUTE_ACTIONS[action];
    if (!spec || typeof serviceClient !== 'function') {
        throw new Error(`invalid PvP route configuration: ${action}`);
    }
    return async function triviaPvpRoute(req, res) {
        const started = Date.now();
        try {
            if (!spec.methods.includes(req.method)) {
                res.setHeader('Allow', spec.methods.join(', '));
                return res.status(405).json({ success: false, error: 'method_not_allowed' });
            }
            if (!isTriviaPvpReleased(env)) {
                return rejectUnavailableTriviaPvp(res);
            }
            if (!applyRateLimit(req, res, spec.limit)) return undefined;
            res.setHeader('Cache-Control', 'private, no-store, max-age=0');

            const sb = serviceClient();
            const { user, error: authError } = await getServerUserWithFallback(req, sb);
            if (authError || !user?.id) {
                return res.status(401).json({ success: false, error: 'authentication_required' });
            }
            const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
            const horsesAllowed = areTriviaPvpHorsesReleased(env);

            let rpc;
            let args;
            if (action === 'join') {
                const parsed = parseJoinBody(input);
                if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
                rpc = 'trivia_pvp_join_v2';
                args = { p_user_id: user.id, p_stake: parsed.stake, p_client_nonce: parsed.clientNonce, p_horses_allowed: horsesAllowed };
            } else if (action === 'cancel') {
                const ticketId = parseTicketId(input.ticketId);
                if (ticketId === undefined) return res.status(400).json({ success: false, error: 'invalid_ticket_id' });
                rpc = 'trivia_pvp_cancel_v2';
                args = { p_user_id: user.id, p_ticket_id: ticketId };
            } else {
                const ticketId = action === 'resume' ? null : parseTicketId(input.ticketId);
                if (ticketId === undefined || (action === 'heartbeat' && !ticketId)) {
                    return res.status(400).json({ success: false, error: 'invalid_ticket_id' });
                }
                rpc = 'trivia_pvp_status_v2';
                args = { p_user_id: user.id, p_ticket_id: ticketId, p_horses_allowed: horsesAllowed };
            }

            const { data, error: rpcError } = await sb.rpc(rpc, args);
            if (rpcError) {
                console.warn('[trivia pvp] rpc failed:', action, rpcError.message || rpcError);
                return res.status(500).json({ success: false, error: 'pvp_unavailable' });
            }
            if (!data || data.success !== true) {
                const code = typeof data?.error === 'string' ? data.error : 'pvp_unavailable';
                return res.status(pvpErrorStatus(code)).json({ success: false, error: code });
            }
            let dto = toPvpDto(data);
            if (rpc === 'trivia_pvp_status_v2') {
                const delay = deadlineAlignDelayMs(dto);
                if (delay > 0) {
                    await sleep(delay);
                    const again = await sb.rpc(rpc, args);
                    if (!again.error && again.data?.success === true) dto = toPvpDto(again.data);
                }
            }
            console.log(JSON.stringify({
                event: 'trivia_pvp_api', action, state: dto.state,
                join: dto.join || undefined, cancel: dto.cancel || undefined,
                matchKind: dto.match?.kind || undefined, ms: Date.now() - started,
            }));
            return res.status(200).json(dto);
        } catch (e) {
            console.warn('[trivia pvp] unexpected:', action, e?.message || e);
            try { reportApiError(e, req); } catch (_reportError) { /* reporting is best effort */ }
            if (!res.headersSent) return res.status(500).json({ success: false, error: 'internal_error' });
            return undefined;
        }
    };
}
