/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * PVP MATCH ENGINE — Competitive Poker Training Matches
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Heads-up hyper-turbo competitive format (like GTO Wizard's PokerArena):
 *   - Heads-up format with diamond entry + prizes
 *   - Real-time via Supabase subscriptions
 *   - GTO precision scoring per hand
 *   - TrueSkill-style rating system
 *   - Diamond entry fees + prize pools
 *   - Seasonal rankings and leaderboards
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { HandStateMachine, HAND_STATES } from './HandStateMachine';
import { SessionScorer, calculateSessionDiamonds } from './GTOScoreEngine';

// ●● Match Configuration ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const MATCH_FORMATS = {
    QUICK: {
        label: 'Quick Match',
        hands: 10,
        stackBB: 50,
        blindStructure: 'fixed',
        entryDiamonds: 50,
        prizeMultiplier: 1.8,
    },
    STANDARD: {
        label: 'Standard Match',
        hands: 25,
        stackBB: 100,
        blindStructure: 'fixed',
        entryDiamonds: 100,
        prizeMultiplier: 1.8,
    },
    HYPER: {
        label: 'Hyper Turbo',
        hands: 15,
        stackBB: 25,
        blindStructure: 'increasing',
        entryDiamonds: 200,
        prizeMultiplier: 1.8,
        blindIncrease: { every: 5, multiplier: 1.5 },
    },
    CHAMPIONSHIP: {
        label: 'Championship',
        hands: 50,
        stackBB: 200,
        blindStructure: 'fixed',
        entryDiamonds: 500,
        prizeMultiplier: 1.9,
    },
};

// ●● Match States ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const MATCH_STATES = {
    WAITING: 'waiting',      // Waiting for opponent
    STARTING: 'starting',    // Both players connected, about to start
    IN_PROGRESS: 'in_progress',
    BETWEEN_HANDS: 'between_hands',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MATCH ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export class PvPMatch {
    /**
     * @param {Object} params
     * @param {string} params.matchId - Unique match identifier
     * @param {string} params.format - Key from MATCH_FORMATS
     * @param {Object} params.player1 - { id, name, rating }
     * @param {Object} params.player2 - { id, name, rating }
     */
    constructor(params) {
        const format = MATCH_FORMATS[params.format] || MATCH_FORMATS.STANDARD;

        this.matchId = params.matchId;
        this.format = format;
        this.formatKey = params.format;
        this.state = MATCH_STATES.WAITING;

        this.player1 = { ...params.player1, score: 0, evLoss: 0, handsWon: 0 };
        this.player2 = { ...params.player2, score: 0, evLoss: 0, handsWon: 0 };

        // Internal decision engine config for opponent (if any)
        this._opponentEngine = params.player2?._engine || null;

        this.handNumber = 0;
        this.totalHands = format.hands;
        this.currentHand = null;

        this.scorers = {
            [params.player1.id]: new SessionScorer(),
            [params.player2.id]: new SessionScorer(),
        };

        this.history = [];
        this.startTime = null;
        this.endTime = null;

        // Button assignment alternates
        this.buttonPlayer = params.player1.id;
    }

    /** Start the match */
    start() {
        this.state = MATCH_STATES.IN_PROGRESS;
        this.startTime = Date.now();
        return this.dealNextHand();
    }

    /** Deal the next hand */
    dealNextHand() {
        this.handNumber++;
        if (this.handNumber > this.totalHands) {
            return this.finishMatch();
        }

        // Alternate button
        this.buttonPlayer = this.buttonPlayer === this.player1.id
            ? this.player2.id
            : this.player1.id;

        // Adjust blinds if increasing structure
        let bbSize = 1;
        if (this.format.blindStructure === 'increasing') {
            const level = Math.floor((this.handNumber - 1) / this.format.blindIncrease.every);
            bbSize = Math.pow(this.format.blindIncrease.multiplier, level);
        }

        this.currentHand = new HandStateMachine({
            numPlayers: 2,
            stackBB: this.format.stackBB,
            bbSize,
            sbSize: bbSize / 2,
            seed: this.matchId.hashCode?.() || Date.now() + this.handNumber,
        });

        const handState = this.currentHand.startHand();
        this.state = MATCH_STATES.IN_PROGRESS;

        return {
            handNumber: this.handNumber,
            totalHands: this.totalHands,
            buttonPlayer: this.buttonPlayer,
            handState,
        };
    }

    /**
     * Record a player's action for GTO scoring.
     *
     * @param {string} playerId
     * @param {string} action
     * @param {number} evLoss - Pre-calculated EV loss
     */
    recordPlayerAction(playerId, action, evLoss = 0) {
        if (!this.scorers[playerId]) return;

        this.scorers[playerId].recordMove({
            handId: `match-${this.matchId}-h${this.handNumber}`,
            street: this.currentHand?.state || 'preflop',
            playerAction: action,
            gtoAction: 'unknown',
            evLoss,
        });

        // Track cumulative EV loss
        if (playerId === this.player1.id) {
            this.player1.evLoss += evLoss;
        } else {
            this.player2.evLoss += evLoss;
        }
    }

    /**
     * Complete a hand and determine winner.
     *
     * @param {string} winnerId - ID of the hand winner
     * @param {number} potSize - Final pot size
     */
    completeHand(winnerId, potSize) {
        if (winnerId === this.player1.id) this.player1.handsWon++;
        else if (winnerId === this.player2.id) this.player2.handsWon++;

        this.history.push({
            handNumber: this.handNumber,
            winnerId,
            potSize,
            p1Score: this.scorers[this.player1.id].getGTOScore(),
            p2Score: this.scorers[this.player2.id].getGTOScore(),
        });

        this.state = MATCH_STATES.BETWEEN_HANDS;
    }

    /** Finish the match and determine overall winner */
    finishMatch() {
        this.state = MATCH_STATES.COMPLETED;
        this.endTime = Date.now();

        const p1Score = this.scorers[this.player1.id].getGTOScore();
        const p2Score = this.scorers[this.player2.id].getGTOScore();

        // Winner is determined by GTO score (not chips won)
        let winner, loser;
        if (p1Score > p2Score) {
            winner = this.player1;
            loser = this.player2;
        } else if (p2Score > p1Score) {
            winner = this.player2;
            loser = this.player1;
        } else {
            // Tie: player with fewer EV loss wins
            winner = this.player1.evLoss <= this.player2.evLoss ? this.player1 : this.player2;
            loser = winner === this.player1 ? this.player2 : this.player1;
        }

        const prizePool = this.format.entryDiamonds * 2;
        const winnerPrize = Math.round(prizePool * this.format.prizeMultiplier / 2);
        const loserPrize = prizePool - winnerPrize; // Small consolation

        return {
            matchId: this.matchId,
            winner: { ...winner, gtoScore: p1Score > p2Score ? p1Score : p2Score, prize: winnerPrize },
            loser: { ...loser, gtoScore: p1Score > p2Score ? p2Score : p1Score, prize: loserPrize },
            duration: this.endTime - this.startTime,
            handsPlayed: this.handNumber - 1,
            history: this.history,
            ratingChanges: calculateRatingChange(winner.rating || 1500, loser.rating || 1500),
            _opponentEngine: this._opponentEngine,
        };
    }

    /** Get current match state */
    getState() {
        return {
            matchId: this.matchId,
            state: this.state,
            format: this.formatKey,
            handNumber: this.handNumber,
            totalHands: this.totalHands,
            player1: {
                ...this.player1,
                gtoScore: this.scorers[this.player1.id]?.getGTOScore() || 0,
            },
            player2: {
                ...this.player2,
                gtoScore: this.scorers[this.player2.id]?.getGTOScore() || 0,
            },
        };
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// TRUESKILL-STYLE RATING SYSTEM
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const DEFAULT_RATING = 1500;
const K_FACTOR = 32;

/**
 * Calculate Elo-style rating changes after a match.
 *
 * @param {number} winnerRating
 * @param {number} loserRating
 * @returns {{ winnerDelta: number, loserDelta: number, winnerNew: number, loserNew: number }}
 */
export function calculateRatingChange(winnerRating, loserRating) {
    const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const delta = Math.round(K_FACTOR * (1 - expected));

    return {
        winnerDelta: delta,
        loserDelta: -delta,
        winnerNew: winnerRating + delta,
        loserNew: loserRating - delta,
    };
}

/**
 * Get the rank tier for a rating.
 */
export function getRankTier(rating) {
    if (rating >= 2200) return { name: 'Diamond', icon: '◆', color: '#00bcd4' };
    if (rating >= 2000) return { name: 'Platinum', icon: '○', color: '#9e9e9e' };
    if (rating >= 1800) return { name: 'Gold', icon: '●', color: '#ffd700' };
    if (rating >= 1600) return { name: 'Silver', icon: '●', color: '#c0c0c0' };
    if (rating >= 1400) return { name: 'Bronze', icon: '●', color: '#cd7f32' };
    return { name: 'Iron', icon: '●', color: '#8d6e63' };
}

// ●● Supabase Schema ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const PVP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pvp_matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player1_id UUID REFERENCES auth.users(id),
    player2_id UUID REFERENCES auth.users(id),
    format TEXT NOT NULL DEFAULT 'STANDARD',
    winner_id UUID,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    hands_played INTEGER DEFAULT 0,
    entry_diamonds INTEGER DEFAULT 0,
    prize_diamonds INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pvp_ratings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    rating INTEGER DEFAULT 1500,
    peak_rating INTEGER DEFAULT 1500,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    season INTEGER DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pvp_seasons (
    id SERIAL PRIMARY KEY,
    season_number INTEGER UNIQUE,
    name TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    prize_pool INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_pvp_matches_players ON pvp_matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_pvp_ratings_rating ON pvp_ratings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_ratings_season ON pvp_ratings(season, rating DESC);
`;

export default {
    PvPMatch,
    MATCH_FORMATS,
    MATCH_STATES,
    calculateRatingChange,
    getRankTier,
    PVP_SCHEMA_SQL,
};
