import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { serviceClient } from './tournament-lifecycle';
import { runNightlyAction } from '../../../src/lib/trivia/nightlyTournamentApiHandler';
import {
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
} from '../../../src/lib/trivia/tournamentReleaseControl.mjs';

/** Nightly tournament entry (Phase 6 engine; Phase 2 ledger hold). */
export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;
        if (!areTriviaTournamentsReleased(process.env)) {
            return rejectUnavailableTriviaTournament(res);
        }

        // Phase 6: the legacy entry path is retired behind the nightly engine.
        // Same request shape, one Phase 2 entry contract (trivia_tournament_enter).
        return await runNightlyAction('enter', req, res, serviceClient());
    } catch (error) {
        console.warn('[tournament-enter] unexpected:', error);
        try { reportApiError(error, req); } catch (_e) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
