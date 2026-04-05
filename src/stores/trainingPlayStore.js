import { create } from 'zustand';

/**
 * Training Play Page Global State
 * Manages UI state for the training game play page
 * NOTE: XP system fully removed — diamonds are the only reward currency
 */
export const useTrainingPlayStore = create((set) => ({
    // UI State
    showResult: false,
    selectedAnswer: null,
    isComplete: false,
    showDiamondBurst: false,

    // Game State
    streak: 0,
    bestStreak: 0,
    diamondsEarned: 0,
    lastDiamonds: 0,

    // Actions
    setShowResult: (show) => set({ showResult: show }),
    setSelectedAnswer: (answer) => set({ selectedAnswer: answer }),
    setIsComplete: (complete) => set({ isComplete: complete }),
    setShowDiamondBurst: (show) => set({ showDiamondBurst: show }),
    setStreak: (streak) => set({ streak }),
    setBestStreak: (bestStreak) => set({ bestStreak }),
    setDiamondsEarned: (d) => set({ diamondsEarned: d }),
    setLastDiamonds: (d) => set({ lastDiamonds: d }),
    resetGame: () => set({
        showResult: false,
        selectedAnswer: null,
        isComplete: false,
        showDiamondBurst: false,
        streak: 0,
        bestStreak: 0,
        diamondsEarned: 0,
        lastDiamonds: 0,
    }),

    // Legacy compatibility stubs (prevent import errors)
    showXPBurst: false,
    xpEarned: 0,
    lastXP: 0,
    setShowXPBurst: (show) => set({ showDiamondBurst: show }),
    setXpEarned: (d) => set({ diamondsEarned: d }),
    setLastXP: (d) => set({ lastDiamonds: d }),
}));
