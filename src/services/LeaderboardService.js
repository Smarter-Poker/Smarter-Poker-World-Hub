/**
 * Legacy Memory Games leaderboard boundary.
 *
 * Historical `memory_leaderboards` rows were accepted from browser-owned
 * game state. They cannot establish a verified score or rank. The database
 * is now read-only for those roles and this client service intentionally
 * returns no competitive data until server-authoritative matchmaking owns
 * the result lifecycle.
 */

const RETIRED_REASON = 'server_authoritative_ranked_match_required';

class LeaderboardService {
    async initialize() {
        return { success: true, mode: 'ranked_standings_paused' };
    }

    async getLeaderboard() {
        return {
            success: false,
            reason: RETIRED_REASON,
            leaderboard: [],
        };
    }

    async getUserRank() {
        return {
            success: false,
            reason: RETIRED_REASON,
            rank: null,
            score: null,
        };
    }

    async updateLeaderboard() {
        return {
            success: false,
            reason: RETIRED_REASON,
        };
    }

    async getTopPlayers() {
        return this.getLeaderboard();
    }

    async getUserBestScores() {
        return {
            success: false,
            reason: RETIRED_REASON,
            scores: [],
        };
    }
}

const leaderboardService = new LeaderboardService();
export default leaderboardService;
