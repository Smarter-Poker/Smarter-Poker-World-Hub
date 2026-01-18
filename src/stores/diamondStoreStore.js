import { create } from 'zustand';

/**
 * Diamond Store Global State
 * Manages UI state for diamond store page
 */
export const useDiamondStoreStore = create((set) => ({
    // UI State
    selectedPackage: 'popular',
    isProcessing: false,
    showPaymentModal: false,

    // Actions
    setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),
    setIsProcessing: (processing) => set({ isProcessing: processing }),
    setShowPaymentModal: (show) => set({ showPaymentModal: show }),
    togglePaymentModal: () => set((state) => ({ showPaymentModal: !state.showPaymentModal })),
}));
