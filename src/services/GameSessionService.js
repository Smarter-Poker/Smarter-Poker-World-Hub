/**
 * Legacy Memory Games session boundary.
 *
 * A browser-owned practice result is not a Training attempt receipt. Direct
 * writes to `memory_game_sessions` are permanently disabled; verified
 * progression must be settled by the server-authoritative Training attempt
 * completion contract.
 */

const RETIRED_REASON = 'server_authoritative_training_attempt_required';

class GameSessionService {
    async recordSession() {
        return {
            success: false,
            reason: RETIRED_REASON,
        };
    }

    async getUserStats() {
        return {
            success: false,
            reason: RETIRED_REASON,
            authority: 'legacy_local_archive_only',
            sessions: [],
        };
    }

    async getTodaysSessionCount() {
        return 0;
    }
}

const gameSessionService = new GameSessionService();
export default gameSessionService;
