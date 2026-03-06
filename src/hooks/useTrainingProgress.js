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
import supabase from '../lib/supabase';

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

    const loadProgress = useCallback(async () => {
        try {
            // Get user ID from Supabase session (primary method - works reliably)
            let userId = null;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                userId = session?.user?.id;
                console.log('[useTrainingProgress] Session check:', {
                    hasSession: !!session,
                    userId,
                    userEmail: session?.user?.email
                });
            } catch (sessionError) {
                console.warn('[useTrainingProgress] Session fetch failed, trying localStorage fallback:', sessionError.message);
            }

            // Fallback to localStorage if session not available
            if (!userId) {
                try {
                    const { getAuthUser } = await import('../lib/authUtils');
                    const authUser = getAuthUser();
                    userId = authUser?.id;
                    console.log('[useTrainingProgress] localStorage fallback:', {
                        hasUser: !!authUser,
                        userId
                    });
                } catch (e) {
                    console.warn('[useTrainingProgress] localStorage fallback failed:', e.message);
                }
            }

            if (userId) {
                // Fetch from API with auth header
                console.log('[useTrainingProgress] Fetching progress for userId:', userId);
                const { data: { session: authSession } } = await supabase.auth.getSession();
                const token = authSession?.access_token;
                const response = await fetch(`/api/training/get-progress?userId=${userId}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.progress) {
                        // Convert array to object keyed by game_id
                        const progressObj = {};
                        data.progress.forEach(p => {
                            // Calculate mastery percentage from correct/total answers
                            const mastery = p.total_answers > 0
                                ? Math.round((p.correct_answers / p.total_answers) * 100)
                                : 0;
                            progressObj[p.game_id] = {
                                attempts: p.hands_played || p.total_answers || 0,
                                levelsCompleted: Math.max(0, (p.level || 1) - 1), // level 2 means 1 level completed
                                mastery: mastery,
                                bestScore: 0, // Not tracked yet
                                totalXP: p.xp || 0,
                                lastPlayed: p.last_played_at,
                                streakBest: p.best_streak || 0,
                                currentLevel: p.level || 1,
                            };
                        });
                        setProgress(progressObj);
                    }
                }
            } else {
                // Fallback to localStorage for anonymous users
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    setProgress(JSON.parse(stored));
                }
            }
        } catch (e) {
            console.warn('Failed to load training progress:', e);
            // Fallback to localStorage
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    setProgress(JSON.parse(stored));
                }
            } catch (e2) {
                console.warn('Failed to load from localStorage:', e2);
            }
        }
        setIsLoaded(true);
    }, []);

    // Load on mount and listen to global events
    useEffect(() => {
        loadProgress();

        if (typeof window !== 'undefined') {
            const handleReload = () => {
                console.log('[useTrainingProgress] Caught trainingSessionSaved bus event, re-hydrating...');
                loadProgress();
            };
            window.addEventListener('trainingSessionSaved', handleReload);
            return () => window.removeEventListener('trainingSessionSaved', handleReload);
        }
    }, [loadProgress]);

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
