import { create } from 'zustand';

interface WorldState {
  xp: number;
  diamonds: number;
  activeOrb: string | null;
  addXP: (amount: number) => void;
  syncWithBus: () => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  xp: 0,
  diamonds: 0,
  activeOrb: null,
  addXP: (amount) => set((state) => ({ xp: state.xp + amount })),
  syncWithBus: () => {
    console.log("Master-Bus Link Established on Port 4000");
  }
}));
