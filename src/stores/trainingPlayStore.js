import { create } from 'zustand';

/**
 * Training Play Page Global State
 * Manages UI state for the training game play page
 */
export const useTrainingPlayStore = create((set) => ({
    // UI State
    showResult: false,
    selectedAnswer: null,
    isComplete: false,
    showXPBurst: false,

    // Game State
    streak: 0,
    bestStreak: 0,
    xpEarned: 0,
    lastXP: 0,

    // Actions
    setShowResult: (show) => set({ showResult: show }),
    setSelectedAnswer: (answer) => set({ selectedAnswer: answer }),
    setIsComplete: (complete) => set({ isComplete: complete }),
    setShowXPBurst: (show) => set({ showXPBurst: show }),
    setStreak: (streak) => set({ streak }),
    setBestStreak: (bestStreak) => set({ bestStreak }),
    setXpEarned: (xp) => set({ xpEarned: xp }),
    setLastXP: (xp) => set({ lastXP: xp }),
    resetGame: () => set({
        showResult: false,
        selectedAnswer: null,
        isComplete: false,
        showXPBurst: false,
        streak: 0,
        bestStreak: 0,
        xpEarned: 0,
        lastXP: 0,
    }),
}));
