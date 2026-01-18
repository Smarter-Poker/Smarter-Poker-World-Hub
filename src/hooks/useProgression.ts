/**
 * 🔥 PROGRESSION SYSTEM - The Addictive Persistence Layer
 * 
 * Tracks user progress, rewards streaks, and diagnoses leaks.
 * Uses optimistic UI updates for instant feedback.
 * 
 * Key Features:
 * - XP & Currency calculations with streak bonuses
 * - Leak detection from hand history patterns
 * - Optimistic saves with background sync
 * - Daily streak tracking
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
export interface HandResult {
    id: string;
    timestamp: number;
    type: HandType;
    userAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
    correctAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
    result: 'win' | 'loss';
    xpEarned: number;
    diamondsEarned: number;
    difficulty: 'easy' | 'medium' | 'hard';
}

export type HandType =
    | 'PREFLOP_OPEN'
    | 'PREFLOP_3BET'
    | 'PREFLOP_CALL_VS_3BET'
    | 'PREFLOP_BUTTON_DEFENSE'
    | 'PREFLOP_BLIND_DEFENSE'
    | 'POSTFLOP_CBET'
    | 'POSTFLOP_CHECK_RAISE'
    | 'POSTFLOP_VALUE_BET'
    | 'POSTFLOP_BLUFF';

export interface Leak {
    type: HandType;
    severity: 'warning' | 'critical';
    message: string;
    failureRate: number; // 0-1
    attemptCount: number;
}

export interface StreakData {
    currentStreak: number;
    longestStreak: number;
    lastPlayedDate: string | null; // ISO date string
    isOnFire: boolean; // 3+ consecutive days
}

export interface ProgressionState {
    // Currency
    totalXP: number;
    totalDiamonds: number;
    level: number;

    // Streak
    streak: StreakData;

    // Session
    sessionCorrect: number;
    sessionTotal: number;
    sessionStartTime: number;

    // History
    handHistory: HandResult[];

    // Leaks
    detectedLeaks: Leak[];
}

export interface RewardBreakdown {
    baseXP: number;
    difficultyBonus: number;
    streakBonus: number;
    totalXP: number;
    baseDiamonds: number;
    streakDiamondBonus: number;
    totalDiamonds: number;
    displayText: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// REWARD CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════
export function calculateReward(
    isCorrect: boolean,
    difficulty: 'easy' | 'medium' | 'hard',
    currentStreak: number
): RewardBreakdown {
    if (!isCorrect) {
        return {
            baseXP: 0,
            difficultyBonus: 0,
            streakBonus: 0,
            totalXP: 0,
            baseDiamonds: 0,
            streakDiamondBonus: 0,
            totalDiamonds: 0,
            displayText: ''
        };
    }

    // Base XP
    const baseXP = 100;

    // Difficulty multiplier
    const difficultyMultipliers: Record<string, number> = {
        easy: 1.0,
        medium: 1.25,
        hard: 1.5
    };
    const difficultyMultiplier = difficultyMultipliers[difficulty] || 1.0;
    const difficultyBonus = Math.round(baseXP * (difficultyMultiplier - 1));

    // Streak bonus (10% per streak day)
    const streakMultiplier = Math.max(1, 1 + (currentStreak * 0.1));
    const streakBonus = Math.round(baseXP * (streakMultiplier - 1));

    // Total XP
    const totalXP = baseXP + difficultyBonus + streakBonus;

    // Diamonds
    const baseDiamonds = 5;
    const streakDiamondBonus = Math.floor(currentStreak * 0.1 * baseDiamonds);
    const totalDiamonds = baseDiamonds + streakDiamondBonus;

    // Build display text
    let displayText = `+${baseXP} XP`;
    if (difficultyBonus > 0) {
        displayText += ` +${difficultyBonus} Hard Bonus`;
    }
    if (streakBonus > 0) {
        displayText += ` +${streakBonus} Streak Bonus!`;
    }

    return {
        baseXP,
        difficultyBonus,
        streakBonus,
        totalXP,
        baseDiamonds,
        streakDiamondBonus,
        totalDiamonds,
        displayText
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETECTOR
// ═══════════════════════════════════════════════════════════════════════════
const LEAK_MESSAGES: Record<HandType, { action: string; leak: string }> = {
    PREFLOP_OPEN: {
        action: 'opening raises',
        leak: 'You are opening too tight. Consider widening your range.'
    },
    PREFLOP_3BET: {
        action: '3-betting',
        leak: 'Your 3-bet frequency is off. Review your polarized vs linear ranges.'
    },
    PREFLOP_CALL_VS_3BET: {
        action: 'calling 3-bets',
        leak: 'You are calling 3-bets incorrectly. Check your pot odds.'
    },
    PREFLOP_BUTTON_DEFENSE: {
        action: 'Button defense',
        leak: 'Warning: You are over-folding the Button.'
    },
    PREFLOP_BLIND_DEFENSE: {
        action: 'Blind defense',
        leak: 'You are defending blinds incorrectly. Tighten up vs early position.'
    },
    POSTFLOP_CBET: {
        action: 'continuation betting',
        leak: 'Your c-bet sizing or frequency needs work.'
    },
    POSTFLOP_CHECK_RAISE: {
        action: 'check-raising',
        leak: 'You are missing check-raise opportunities.'
    },
    POSTFLOP_VALUE_BET: {
        action: 'value betting',
        leak: 'You are leaving money on the table. Bet for value more often.'
    },
    POSTFLOP_BLUFF: {
        action: 'bluffing',
        leak: 'Your bluff frequency is exploitable.'
    }
};

export function detectLeaks(handHistory: HandResult[]): Leak[] {
    const leaks: Leak[] = [];

    // Only analyze last 50 hands
    const recentHistory = handHistory.slice(-50);

    // Group by hand type
    const byType = new Map<HandType, HandResult[]>();
    recentHistory.forEach(hand => {
        const existing = byType.get(hand.type) || [];
        existing.push(hand);
        byType.set(hand.type, existing);
    });

    // Check each type for leak patterns
    byType.forEach((hands, type) => {
        // Only check if we have at least 5 attempts of this type
        if (hands.length < 5) return;

        // Get last 10 attempts of this type
        const lastTen = hands.slice(-10);
        const losses = lastTen.filter(h => h.result === 'loss').length;
        const failureRate = losses / lastTen.length;

        // Leak threshold: 30% failure rate (3 out of 10)
        if (losses >= 3 && failureRate >= 0.3) {
            const leakInfo = LEAK_MESSAGES[type];
            leaks.push({
                type,
                severity: failureRate >= 0.5 ? 'critical' : 'warning',
                message: leakInfo?.leak || `Review your ${type.toLowerCase().replace(/_/g, ' ')} strategy.`,
                failureRate,
                attemptCount: lastTen.length
            });
        }
    });

    return leaks;
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAK CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════
export function updateStreak(lastPlayedDate: string | null): {
    newStreak: number;
    isOnFire: boolean;
    streakBroken: boolean;
} {
    const today = new Date().toISOString().split('T')[0];

    if (!lastPlayedDate) {
        // First time playing
        return { newStreak: 1, isOnFire: false, streakBroken: false };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastPlayedDate === today) {
        // Already played today - maintain current streak
        return { newStreak: -1, isOnFire: false, streakBroken: false }; // -1 means no change
    }

    if (lastPlayedDate === yesterdayStr) {
        // Played yesterday - increment streak!
        return { newStreak: 1, isOnFire: true, streakBroken: false }; // Will be added to current
    }

    // Streak broken :(
    return { newStreak: 1, isOnFire: false, streakBroken: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════
export function calculateLevel(totalXP: number): { level: number; xpToNext: number; progress: number } {
    // XP required per level: 1000 * level^1.5
    let level = 1;
    let xpRequired = 0;
    let previousXP = 0;

    while (xpRequired <= totalXP) {
        previousXP = xpRequired;
        level++;
        xpRequired += Math.floor(1000 * Math.pow(level, 1.2));
    }

    level--; // We went one too far
    const xpToNext = xpRequired - totalXP;
    const xpForThisLevel = xpRequired - previousXP;
    const xpIntoLevel = totalXP - previousXP;
    const progress = xpForThisLevel > 0 ? (xpIntoLevel / xpForThisLevel) * 100 : 0;

    return { level: Math.max(1, level), xpToNext, progress };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SAVE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
interface SavePayload {
    handResult: HandResult;
    newTotalXP: number;
    newTotalDiamonds: number;
    newStreak: StreakData;
}

export async function saveHandResult(payload: SavePayload): Promise<{ success: boolean }> {
    // TODO: Replace with actual API call
    // await fetch('/api/progress/save', { method: 'POST', body: JSON.stringify(payload) });

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate occasional failure for retry logic
    if (Math.random() < 0.02) {
        throw new Error('Network error');
    }

    console.log('💾 Saved hand result to backend:', payload.handResult.id);
    return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const STORAGE_KEY = 'smarter_poker_progression';

function loadProgressionFromStorage(): Partial<ProgressionState> | null {
    if (typeof window === 'undefined') return null;

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        console.warn('Failed to load progression from storage');
        return null;
    }
}

function saveProgressionToStorage(state: ProgressionState): void {
    if (typeof window === 'undefined') return;

    try {
        // Only save essential data, not full hand history
        const toSave = {
            totalXP: state.totalXP,
            totalDiamonds: state.totalDiamonds,
            level: state.level,
            streak: state.streak,
            // Keep last 50 hands for leak detection
            handHistory: state.handHistory.slice(-50)
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
        console.warn('Failed to save progression to storage');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE HOOK
// ═══════════════════════════════════════════════════════════════════════════
interface UseProgressionReturn {
    // State
    state: ProgressionState;

    // Computed
    level: number;
    xpToNextLevel: number;
    levelProgress: number;
    winRate: number;

    // Actions
    recordHandResult: (params: {
        type: HandType;
        userAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
        correctAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
        difficulty: 'easy' | 'medium' | 'hard';
    }) => RewardBreakdown;

    // Getters
    getLeaks: () => Leak[];
    isStreakOnFire: () => boolean;
}

export function useProgression(): UseProgressionReturn {
    const [state, setState] = useState<ProgressionState>(() => {
        const stored = loadProgressionFromStorage();

        return {
            totalXP: stored?.totalXP || 0,
            totalDiamonds: stored?.totalDiamonds || 0,
            level: stored?.level || 1,
            streak: stored?.streak || {
                currentStreak: 0,
                longestStreak: 0,
                lastPlayedDate: null,
                isOnFire: false
            },
            sessionCorrect: 0,
            sessionTotal: 0,
            sessionStartTime: Date.now(),
            handHistory: stored?.handHistory || [],
            detectedLeaks: []
        };
    });

    // Save to storage whenever state changes
    useEffect(() => {
        saveProgressionToStorage(state);
    }, [state]);

    // Pending saves queue for retry
    const pendingSaves = useRef<SavePayload[]>([]);

    /**
     * 🎯 RECORD HAND RESULT - Main function called after each decision
     */
    const recordHandResult = useCallback((params: {
        type: HandType;
        userAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
        correctAction: 'FOLD' | 'CALL' | 'RAISE' | 'ALL_IN';
        difficulty: 'easy' | 'medium' | 'hard';
    }): RewardBreakdown => {
        const isCorrect = params.userAction === params.correctAction;

        // Calculate rewards
        const reward = calculateReward(isCorrect, params.difficulty, state.streak.currentStreak);

        // Create hand result
        const handResult: HandResult = {
            id: `hand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            type: params.type,
            userAction: params.userAction,
            correctAction: params.correctAction,
            result: isCorrect ? 'win' : 'loss',
            xpEarned: reward.totalXP,
            diamondsEarned: reward.totalDiamonds,
            difficulty: params.difficulty
        };

        // Update streak
        const today = new Date().toISOString().split('T')[0];
        const streakUpdate = updateStreak(state.streak.lastPlayedDate);

        // OPTIMISTIC UPDATE - instant UI feedback
        setState(prev => {
            const newTotalXP = prev.totalXP + reward.totalXP;
            const newHistory = [...prev.handHistory, handResult].slice(-50);
            const newLeaks = detectLeaks(newHistory);

            let newStreak = { ...prev.streak };
            if (streakUpdate.newStreak !== -1) {
                if (streakUpdate.streakBroken) {
                    newStreak.currentStreak = 1;
                    newStreak.isOnFire = false;
                } else {
                    newStreak.currentStreak = prev.streak.currentStreak + streakUpdate.newStreak;
                    newStreak.isOnFire = newStreak.currentStreak >= 3;
                }
            }
            newStreak.lastPlayedDate = today;
            newStreak.longestStreak = Math.max(newStreak.longestStreak, newStreak.currentStreak);

            const { level } = calculateLevel(newTotalXP);

            return {
                ...prev,
                totalXP: newTotalXP,
                totalDiamonds: prev.totalDiamonds + reward.totalDiamonds,
                level,
                streak: newStreak,
                sessionCorrect: prev.sessionCorrect + (isCorrect ? 1 : 0),
                sessionTotal: prev.sessionTotal + 1,
                handHistory: newHistory,
                detectedLeaks: newLeaks
            };
        });

        // BACKGROUND SAVE - don't make user wait
        const savePayload: SavePayload = {
            handResult,
            newTotalXP: state.totalXP + reward.totalXP,
            newTotalDiamonds: state.totalDiamonds + reward.totalDiamonds,
            newStreak: state.streak
        };

        saveHandResult(savePayload).catch(err => {
            console.warn('Save failed, queuing for retry:', err);
            pendingSaves.current.push(savePayload);
        });

        return reward;
    }, [state]);

    /**
     * 🕳️ GET DETECTED LEAKS
     */
    const getLeaks = useCallback((): Leak[] => {
        return state.detectedLeaks;
    }, [state.detectedLeaks]);

    /**
     * 🔥 IS STREAK ON FIRE (3+ days)
     */
    const isStreakOnFire = useCallback((): boolean => {
        return state.streak.isOnFire && state.streak.currentStreak >= 3;
    }, [state.streak]);

    // Calculate level info
    const levelInfo = calculateLevel(state.totalXP);
    const winRate = state.sessionTotal > 0
        ? Math.round((state.sessionCorrect / state.sessionTotal) * 100)
        : 0;

    return {
        state,
        level: levelInfo.level,
        xpToNextLevel: levelInfo.xpToNext,
        levelProgress: levelInfo.progress,
        winRate,
        recordHandResult,
        getLeaks,
        isStreakOnFire
    };
}
