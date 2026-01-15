/**
 * 🎮 USE TRAINING PROGRESS — User Progress Tracking Hook
 * ═══════════════════════════════════════════════════════════════════════════
 * Tracks user progress across all 100 training games
 * - Local storage persistence (demo mode)
 * - Per-game stats: mastery, levels, attempts, last played
 * - Overall user ranking calculation
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { getPlayStatus, getRankFromMastery, PLAY_STATUS, USER_RANKS } from '../components/training/GameBadge';

const STORAGE_KEY = 'pokeriq_training_progress';

// Default empty progress for a game
const createEmptyProgress = () => ({
    attempts: 0,
    levelsCompleted: 0,
    mastery: 0,
    bestScore: 0,
    totalXP: 0,
    lastPlayed: null,
    streakBest: 0,
});

export default function useTrainingProgress() {
    const [progress, setProgress] = useState({});
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setProgress(JSON.parse(stored));
            }
        } catch (e) {
            console.warn('Failed to load training progress:', e);
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
            } catch (e) {
                console.warn('Failed to save training progress:', e);
            }
        }
    }, [progress, isLoaded]);

    // Get progress for a specific game
    const getGameProgress = useCallback((gameId) => {
        return progress[gameId] || createEmptyProgress();
    }, [progress]);

    // Check if game has been played
    const hasPlayed = useCallback((gameId) => {
        const p = progress[gameId];
        return p && (p.attempts > 0 || p.lastPlayed);
    }, [progress]);

    // Check if game is mastered (85%+)
    const isMastered = useCallback((gameId) => {
        const p = progress[gameId];
        return p && p.mastery >= 85;
    }, [progress]);

    // Get play status for a game
    const getStatus = useCallback((gameId) => {
        return getPlayStatus(progress[gameId]);
    }, [progress]);

    // Get rank for a game
    const getRank = useCallback((gameId) => {
        const p = progress[gameId];
        return p ? getRankFromMastery(p.mastery) : USER_RANKS.UNRANKED;
    }, [progress]);

    // Record a game session
    const recordSession = useCallback((gameId, sessionData) => {
        setProgress(prev => {
            const existing = prev[gameId] || createEmptyProgress();
            const newProgress = {
                ...existing,
                attempts: existing.attempts + 1,
                lastPlayed: new Date().toISOString(),
                mastery: Math.max(existing.mastery, sessionData.accuracy || 0),
                bestScore: Math.max(existing.bestScore, sessionData.score || 0),
                totalXP: existing.totalXP + (sessionData.xpEarned || 0),
                streakBest: Math.max(existing.streakBest, sessionData.bestStreak || 0),
            };

            // Level up if passed (85%+)
            if (sessionData.passed && sessionData.level > existing.levelsCompleted) {
                newProgress.levelsCompleted = sessionData.level;
            }

            return { ...prev, [gameId]: newProgress };
        });
    }, []);

    // Get overall stats
    const getOverallStats = useCallback(() => {
        const games = Object.values(progress);
        if (games.length === 0) {
            return {
                gamesPlayed: 0,
                gamesMastered: 0,
                totalXP: 0,
                averageMastery: 0,
                overallRank: USER_RANKS.UNRANKED,
            };
        }

        const gamesPlayed = games.filter(g => g.attempts > 0).length;
        const gamesMastered = games.filter(g => g.mastery >= 85).length;
        const totalXP = games.reduce((sum, g) => sum + g.totalXP, 0);
        const averageMastery = games.reduce((sum, g) => sum + g.mastery, 0) / games.length;

        return {
            gamesPlayed,
            gamesMastered,
            totalXP,
            averageMastery: Math.round(averageMastery),
            overallRank: getRankFromMastery(averageMastery),
        };
    }, [progress]);

    // Get unplayed games
    const getUnplayedGames = useCallback((allGames) => {
        return allGames.filter(game => !hasPlayed(game.id));
    }, [hasPlayed]);

    // Get games needing improvement (played but < 70% mastery)
    const getLeakGames = useCallback((allGames) => {
        return allGames.filter(game => {
            const p = progress[game.id];
            return p && p.attempts > 0 && p.mastery < 70;
        });
    }, [progress]);

    // Get recently played games
    const getRecentGames = useCallback((allGames, limit = 5) => {
        return allGames
            .filter(game => progress[game.id]?.lastPlayed)
            .sort((a, b) => {
                const aTime = new Date(progress[a.id].lastPlayed).getTime();
                const bTime = new Date(progress[b.id].lastPlayed).getTime();
                return bTime - aTime;
            })
            .slice(0, limit);
    }, [progress]);

    // Reset all progress (for testing)
    const resetProgress = useCallback(() => {
        setProgress({});
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        isLoaded,
        progress,
        getGameProgress,
        hasPlayed,
        isMastered,
        getStatus,
        getRank,
        recordSession,
        getOverallStats,
        getUnplayedGames,
        getLeakGames,
        getRecentGames,
        resetProgress,
    };
}
