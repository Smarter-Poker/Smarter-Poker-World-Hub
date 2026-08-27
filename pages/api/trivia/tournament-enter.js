import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { serviceClient } from './tournament-lifecycle';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Atomic debit + entry + prize-pool contribution. */
export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const sb = serviceClient();
        const { user, error: authErr } = await getServerUserWithFallback(req, sb);
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'authentication_required' });
        }

        const tournamentId = req.body?.tournament_id ?? req.body?.tournamentId;
        if (typeof tournamentId !== 'string' || !UUID_RE.test(tournamentId)) {
            return res.status(400).json({ success: false, error: 'invalid_tournament_id' });
        }

        const { data, error } = await sb.rpc('enter_trivia_tournament_v2', {
            p_tournament_id: tournamentId,
            p_user_id: user.id,
        });
        if (error) {
            console.warn('[tournament-enter] atomic RPC failed:', error.message || error);
            return res.status(500).json({ success: false, error: 'entry_transaction_failed' });
        }
        if (!data || data.success === false) {
            const code = data?.error;
            const status = code === 'tournament_not_found' ? 404
                : code === 'already_entered' ? 409
                : code === 'vip_required' ? 403
                : code === 'insufficient_diamonds' ? 402
                : code === 'tournament_full' || code === 'registration_closed' ? 409
                : 400;
            return res.status(status).json({ success: false, error: code || 'entry_rejected' });
        }

        return res.status(200).json({
            success: true,
            entry: data.entry,
            new_balance: data.new_balance == null ? null : Number(data.new_balance),
            new_prize_pool: Number(data.new_prize_pool) || 0,
            entries_count: Number(data.entries_count) || 0,
        });
    } catch (error) {
        console.warn('[tournament-enter] unexpected:', error);
        try { reportApiError(error, req); } catch (_e) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
