/**
 * 🎲 DAILY ROTATION ENGINE — AI-Powered 24h Content Selection
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE LAW:
 * - Featured games + daily challenges MUST automatically change every 24 hours
 * - Rotation is AI-powered (smart selection), NOT a fixed schedule
 * - Selection considers: user mastery gaps, recent mistakes, streak targets, engagement
 * 
 * Logs selection metadata to Central Bus for auditability.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { centralBus } from './CentralBus';

// Game Library import (will use the 100-game manifest)
const GAME_CATEGORIES = ['MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED'];

// Selection weights for AI rotation
const SELECTION_WEIGHTS = {
    MASTERY_GAP: 0.35,      // Prioritize games where user is weak
    RECENT_MISTAKES: 0.25,  // Target games where user made errors recently
    ENGAGEMENT_VARIETY: 0.20, // Avoid repeating same content
    STREAK_TARGET: 0.10,    // Games that help maintain/build streaks
    FRESHNESS: 0.10,        // Prefer games not played recently
};

// Local storage keys
const STORAGE_KEYS = {
    LAST_ROTATION: 'dailyRotation_lastRotation',
    CURRENT_SELECTION: 'dailyRotation_currentSelection',
    SELECTION_HISTORY: 'dailyRotation_history',
};

/**
 * 🎲 DAILY ROTATION ENGINE CLASS
 */
class DailyRotationEngineClass {
    constructor() {
        this.currentSelection = null;
        this.lastRotationTime = null;
        this.userMastery = {};
        this.userLeaks = [];
        this.initPromise = null;
    }

    /**
     * Initialize the rotation engine
     * Checks if rotation needed on load
     */
    async init(gameLibrary, userMasteryData = {}, userLeakData = []) {
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInit(gameLibrary, userMasteryData, userLeakData);
        return this.initPromise;
    }

    async _doInit(gameLibrary, userMasteryData, userLeakData) {
        this.gameLibrary = gameLibrary;
        this.userMastery = userMasteryData;
        this.userLeaks = userLeakData;

        // Load persisted state
        this._loadPersistedState();

        // Check if rotation needed (24h passed)
        const now = Date.now();
        const hoursSinceRotation = this.lastRotationTime
            ? (now - this.lastRotationTime) / (1000 * 60 * 60)
            : 999;

        if (hoursSinceRotation >= 24 || !this.currentSelection) {
            await this.rotate();
        }

        return this.currentSelection;
    }

    /**
     * Force rotation (or automatic 24h trigger)
     * Returns the new daily selection
     */
    async rotate() {
        const selection = await this._selectDailyContent();

        this.currentSelection = selection;
        this.lastRotationTime = Date.now();

        // Persist to local storage
        this._persistState();

        // Log to Central Bus for auditability
        await this._logRotation(selection);

        return selection;
    }

    /**
     * Get current daily selection
     */
    getCurrentSelection() {
        return this.currentSelection;
    }

    /**
     * Get featured hero content for the day
     */
    getFeaturedHero() {
        if (!this.currentSelection) return null;
        return this.currentSelection.featuredHero;
    }

    /**
     * Get daily challenge for the day
     */
    getDailyChallenge() {
        if (!this.currentSelection) return null;
        return this.currentSelection.dailyChallenge;
    }

    /**
     * Get recommended games based on user context
     */
    getRecommendedGames() {
        if (!this.currentSelection) return [];
        return this.currentSelection.recommendedGames;
    }

    /**
     * Get "Fix Your Leaks" games (mastery < 70% or repeated mistakes)
     */
    getLeakGames() {
        if (!this.currentSelection) return [];
        return this.currentSelection.leakGames;
    }

    /**
     * Update user context (called when mastery/leaks change)
     */
    updateUserContext(masteryData, leakData) {
        this.userMastery = masteryData || {};
        this.userLeaks = leakData || [];

        // Recalculate leak games immediately (doesn't need 24h wait)
        if (this.currentSelection) {
            this.currentSelection.leakGames = this._selectLeakGames();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS — AI SELECTION LOGIC
    // ═══════════════════════════════════════════════════════════════════════

    async _selectDailyContent() {
        const allGames = this.gameLibrary?.getAllGames?.() || this._getDefaultGames();

        // Score each game based on selection weights
        const scoredGames = allGames.map(game => ({
            game,
            score: this._calculateGameScore(game),
        }));

        // Sort by score descending
        scoredGames.sort((a, b) => b.score - a.score);

        // Select featured hero (highest score)
        const featuredHero = this._buildFeaturedHero(scoredGames[0]?.game);

        // Select daily challenge (second highest, different category)
        const dailyChallengeGame = scoredGames.find(
            sg => sg.game.id !== featuredHero.gameId
        )?.game;
        const dailyChallenge = this._buildDailyChallenge(dailyChallengeGame);

        // Select recommended games (top 6-8 excluding featured)
        const recommendedGames = scoredGames
            .filter(sg => sg.game.id !== featuredHero.gameId)
            .slice(0, 8)
            .map(sg => sg.game);

        // Select leak games
        const leakGames = this._selectLeakGames();

        return {
            timestamp: Date.now(),
            rotationId: `rot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            featuredHero,
            dailyChallenge,
            recommendedGames,
            leakGames,
            selectionRationale: this._buildRationale(featuredHero, dailyChallenge),
        };
    }

    _calculateGameScore(game) {
        let score = 0;

        // MASTERY_GAP: Lower mastery = higher score
        const mastery = this.userMastery[game.id] || 0;
        const masteryGapScore = (100 - mastery) / 100;
        score += masteryGapScore * SELECTION_WEIGHTS.MASTERY_GAP;

        // RECENT_MISTAKES: Games matching user leak categories score higher
        const leakMatch = this.userLeaks.some(leak =>
            leak.category?.toLowerCase().includes(game.focus?.toLowerCase()) ||
            game.focus?.toLowerCase().includes(leak.category?.toLowerCase())
        );
        if (leakMatch) {
            score += 1.0 * SELECTION_WEIGHTS.RECENT_MISTAKES;
        }

        // ENGAGEMENT_VARIETY: Check history to avoid repetition
        const recentHistory = this._getSelectionHistory(7); // Last 7 days
        const wasRecentlyFeatured = recentHistory.some(h =>
            h.featuredHero?.gameId === game.id ||
            h.dailyChallenge?.gameId === game.id
        );
        if (!wasRecentlyFeatured) {
            score += 1.0 * SELECTION_WEIGHTS.ENGAGEMENT_VARIETY;
        }

        // STREAK_TARGET: Moderate difficulty games for streak maintenance
        if (game.difficulty >= 2 && game.difficulty <= 3) {
            score += 0.8 * SELECTION_WEIGHTS.STREAK_TARGET;
        }

        // FRESHNESS: Penalize recently played games
        const lastPlayed = this._getLastPlayedTime(game.id);
        if (!lastPlayed) {
            score += 1.0 * SELECTION_WEIGHTS.FRESHNESS;
        } else {
            const hoursSincePlayed = (Date.now() - lastPlayed) / (1000 * 60 * 60);
            const freshnessScore = Math.min(hoursSincePlayed / 168, 1); // 168h = 1 week
            score += freshnessScore * SELECTION_WEIGHTS.FRESHNESS;
        }

        // Add small random factor for variety (up to 5%)
        score += Math.random() * 0.05;

        return score;
    }

    _selectLeakGames() {
        if (!this.gameLibrary) return [];

        const allGames = this.gameLibrary.getAllGames?.() || this._getDefaultGames();

        // Games with mastery < 70% OR matching leak categories
        const leakGames = allGames.filter(game => {
            const mastery = this.userMastery[game.id] || 0;
            if (mastery < 70 && mastery > 0) return true;

            // Check if game matches any detected leak
            return this.userLeaks.some(leak =>
                leak.category?.toLowerCase().includes(game.focus?.toLowerCase())
            );
        });

        // Limit to 6 games
        return leakGames.slice(0, 6);
    }

    _buildFeaturedHero(game) {
        if (!game) {
            return {
                gameId: 'mtt_01',
                title: 'Daily Challenge',
                subtitle: 'Master GTO Play',
                focus: 'Foundation Training',
                xpMultiplier: 1.5,
                streakBonus: true,
                backgroundType: 'cinematic',
                ctaText: 'PLAY NOW',
            };
        }

        const mastery = this.userMastery[game.id] || 0;

        // Dynamic focus text based on mastery
        let focusText = game.focus;
        if (mastery < 50) {
            focusText = `Master ${game.focus}`;
        } else if (mastery < 85) {
            focusText = `Complete ${game.focus}`;
        } else {
            focusText = `Perfect Your ${game.focus}`;
        }

        return {
            gameId: game.id,
            title: 'Daily Challenge',
            subtitle: game.name,
            focus: focusText,
            difficulty: game.difficulty,
            xpMultiplier: 1.0 + (game.difficulty * 0.25), // Higher diff = more XP
            streakBonus: true,
            backgroundType: 'cinematic',
            ctaText: 'PLAY NOW',
            mastery,
        };
    }

    _buildDailyChallenge(game) {
        if (!game) return null;

        return {
            gameId: game.id,
            name: game.name,
            focus: game.focus,
            difficulty: game.difficulty,
            xpReward: 100 + (game.difficulty * 50),
            timeLimit: game.difficulty <= 2 ? null : 30, // 30 min for hard games
        };
    }

    _buildRationale(featuredHero, dailyChallenge) {
        const reasons = [];

        // Mastery gap reason
        if (featuredHero.mastery !== undefined && featuredHero.mastery < 70) {
            reasons.push(`LOW_MASTERY: ${featuredHero.mastery}%`);
        }

        // Leak targeting
        if (this.userLeaks.length > 0) {
            const leakCategories = this.userLeaks.slice(0, 3).map(l => l.category).join(', ');
            reasons.push(`TARGETING_LEAKS: ${leakCategories}`);
        }

        // Variety
        const history = this._getSelectionHistory(3);
        if (history.length === 0) {
            reasons.push('NEW_USER: First rotation');
        } else {
            reasons.push(`VARIETY: Avoiding last ${history.length} selections`);
        }

        return {
            reasons,
            weights: SELECTION_WEIGHTS,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════

    _loadPersistedState() {
        if (typeof window === 'undefined') return;

        try {
            const lastRotation = localStorage.getItem(STORAGE_KEYS.LAST_ROTATION);
            const currentSelection = localStorage.getItem(STORAGE_KEYS.CURRENT_SELECTION);

            this.lastRotationTime = lastRotation ? parseInt(lastRotation, 10) : null;
            this.currentSelection = currentSelection ? JSON.parse(currentSelection) : null;
        } catch (err) {
            console.warn('[DailyRotationEngine] Failed to load persisted state:', err);
        }
    }

    _persistState() {
        if (typeof window === 'undefined') return;

        try {
            localStorage.setItem(STORAGE_KEYS.LAST_ROTATION, String(this.lastRotationTime));
            localStorage.setItem(STORAGE_KEYS.CURRENT_SELECTION, JSON.stringify(this.currentSelection));

            // Also persist to history (last 30 days)
            const history = this._getSelectionHistory(30);
            history.unshift({
                timestamp: this.lastRotationTime,
                featuredHero: this.currentSelection?.featuredHero,
                dailyChallenge: this.currentSelection?.dailyChallenge,
            });
            localStorage.setItem(STORAGE_KEYS.SELECTION_HISTORY, JSON.stringify(history.slice(0, 30)));
        } catch (err) {
            console.warn('[DailyRotationEngine] Failed to persist state:', err);
        }
    }

    _getSelectionHistory(days = 7) {
        if (typeof window === 'undefined') return [];

        try {
            const history = localStorage.getItem(STORAGE_KEYS.SELECTION_HISTORY);
            const parsed = history ? JSON.parse(history) : [];

            // Filter to requested days
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            return parsed.filter(h => h.timestamp > cutoff);
        } catch {
            return [];
        }
    }

    _getLastPlayedTime(gameId) {
        // This would normally come from user session data
        // For now, return null (not tracked)
        return null;
    }

    async _logRotation(selection) {
        await centralBus.emit('DAILY_ROTATION', {
            rotation_id: selection.rotationId,
            featured_game_id: selection.featuredHero?.gameId,
            challenge_game_id: selection.dailyChallenge?.gameId,
            recommended_count: selection.recommendedGames?.length,
            leak_games_count: selection.leakGames?.length,
            rationale: selection.selectionRationale,
        });
    }

    // Default games if GameLibrary not available
    _getDefaultGames() {
        return [
            { id: 'mtt_01', name: 'Nash Push/Fold', focus: 'Short Stack', difficulty: 1 },
            { id: 'mtt_02', name: 'ICM Pressure', focus: 'Bubble Play', difficulty: 2 },
            { id: 'cash_01', name: '6-Max Blueprint', focus: 'GTO Ranges', difficulty: 1 },
            { id: 'cash_02', name: 'Rake-Proof Defense', focus: 'High Rake Adj', difficulty: 2 },
            { id: 'spin_01', name: 'Hyper Opener', focus: '25BB 3-Max', difficulty: 2 },
            { id: 'psy_01', name: 'The Metronome', focus: 'Timing', difficulty: 2 },
            { id: 'adv_01', name: 'Aggro Vampire', focus: 'Redline', difficulty: 4 },
        ];
    }
}

// Singleton export
export const dailyRotationEngine = new DailyRotationEngineClass();

export default dailyRotationEngine;
