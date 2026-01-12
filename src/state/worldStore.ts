/* ═══════════════════════════════════════════════════════════════════════════
   WORLD STORE — Global state for the World Hub
   Vanguard Silver | Zustand State Management
   ═══════════════════════════════════════════════════════════════════════════ */

import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 ORB DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const POKER_IQ_ORBS = [
  { id: 'social-media', label: 'Social Media', color: '#00d4ff' },
  { id: 'club-arena', label: 'Club Arena', color: '#8a2be2' },
  { id: 'diamond-arena', label: 'Diamond Arena', color: '#00ff88' },
  { id: 'training-games', label: 'Training Games', color: '#ffa500' },
  { id: 'trivia', label: 'Trivia', color: '#ff00ff' },
  { id: 'bankroll-manager', label: 'Bankroll Manager', color: '#6495ed' },
  { id: 'marketplace-settings', label: 'Marketplace & Settings', color: '#ffffff' },
] as const;

export type OrbId = typeof POKER_IQ_ORBS[number]['id'];

// ─────────────────────────────────────────────────────────────────────────────
// 📊 WORLD STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
interface WorldState {
  // Player Stats
  xp: number;
  diamonds: number;

  // Navigation
  activeOrb: OrbId | null;
  cursor: { x: number; y: number };

  // Actions
  selectOrb: (orbId: OrbId) => void;
  exitOrb: () => void;
  addXP: (amount: number) => void;
  addDiamonds: (amount: number) => void;
  updateCursor: (x: number, y: number) => void;
  syncWithBus: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏪 STORE CREATION
// ─────────────────────────────────────────────────────────────────────────────
export const useWorldStore = create<WorldState>((set) => ({
  // Initial State
  xp: 8750,
  diamonds: 12450,
  activeOrb: null,
  cursor: { x: 0.5, y: 0.5 },

  // Navigation Actions
  selectOrb: (orbId) => {
    console.log(`Navigating to orb: ${orbId}`);
    set({ activeOrb: orbId });
  },

  exitOrb: () => {
    console.log('Returning to World Hub home');
    set({ activeOrb: null });
  },

  // Stats Actions
  addXP: (amount) => set((state) => ({ xp: state.xp + amount })),
  addDiamonds: (amount) => set((state) => ({ diamonds: state.diamonds + amount })),

  // Cursor Tracking
  updateCursor: (x, y) => set({ cursor: { x, y } }),

  // Bus Integration
  syncWithBus: () => {
    console.log('Master-Bus Link Established on Port 4000');
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 SELECTORS
// ─────────────────────────────────────────────────────────────────────────────
export const selectActiveOrb = (state: WorldState) => state.activeOrb;
export const selectCursor = (state: WorldState) => state.cursor;
export const selectXP = (state: WorldState) => state.xp;
export const selectDiamonds = (state: WorldState) => state.diamonds;
