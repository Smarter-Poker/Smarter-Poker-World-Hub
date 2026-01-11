/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — WORLD STATE MACHINE (10-ORB VERSION)
   Zustand store for World ↔ Orb transitions
   ═══════════════════════════════════════════════════════════════════════════ */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { POKER_IQ_ORBS, getOrbById } from '../orbs/manifest/registry';
import type { OrbId, OrbConfig, WorldState, TransitionType } from '../types/world';

// Re-export for convenience
export { POKER_IQ_ORBS };
export type { OrbId, OrbConfig };

// ─────────────────────────────────────────────────────────────────────────────
// 📦 STORE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
interface WorldStore {
  // Current State
  worldState: WorldState;
  activeOrb: OrbId | null;
  hoveredOrb: OrbId | null;
  previousOrb: OrbId | null;

  // Transition State
  isTransitioning: boolean;
  transitionType: TransitionType | null;
  transitionProgress: number;

  // Camera State
  cameraTarget: [number, number, number];
  cameraPosition: [number, number, number];
  cameraZoom: number;

  // Carousel State
  carouselRotation: number;

  // Mouse/Cursor State
  cursorPosition: { x: number; y: number };

  // Actions
  hoverOrb: (orbId: OrbId | null) => void;
  selectOrb: (orbId: OrbId) => void;
  exitOrb: () => void;
  crossTransition: (targetOrb: OrbId) => void;
  setTransitionProgress: (progress: number) => void;
  completeTransition: () => void;
  updateCursor: (x: number, y: number) => void;
  setCarouselRotation: (rotation: number) => void;

  // Computed
  getOrbDefinition: (orbId: OrbId) => OrbConfig | undefined;
  getAllOrbs: () => OrbConfig[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏗️ CAMERA PRESETS
// ─────────────────────────────────────────────────────────────────────────────
const CAMERA_PRESETS = {
  WORLD_HUB: {
    position: [0, 15, 40] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    zoom: 1,
  },
  ORB_FOCUS: (orb: OrbConfig, radius: number = 22) => {
    const x = Math.sin(orb.angle) * radius;
    const z = Math.cos(orb.angle) * radius;
    return {
      position: [x * 0.5, 5, z * 0.5 + 15] as [number, number, number],
      target: [x, 0, z] as [number, number, number],
      zoom: 2,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 ZUSTAND STORE
// ─────────────────────────────────────────────────────────────────────────────
export const useWorldStore = create<WorldStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial State
    worldState: 'IDLE',
    activeOrb: null,
    hoveredOrb: null,
    previousOrb: null,

    // Transition State
    isTransitioning: false,
    transitionType: null,
    transitionProgress: 0,

    // Camera State (World Hub default)
    cameraTarget: CAMERA_PRESETS.WORLD_HUB.target,
    cameraPosition: CAMERA_PRESETS.WORLD_HUB.position,
    cameraZoom: CAMERA_PRESETS.WORLD_HUB.zoom,

    // Carousel
    carouselRotation: 0,

    // Cursor
    cursorPosition: { x: 0.5, y: 0.5 },

    // ─────────────────────────────────────────────────────────────────────────
    // 🎯 ACTIONS
    // ─────────────────────────────────────────────────────────────────────────

    hoverOrb: (orbId) => {
      const { isTransitioning } = get();
      if (isTransitioning) return;

      set({
        hoveredOrb: orbId,
        worldState: orbId ? 'ORB_HOVER' : 'IDLE',
      });
    },

    selectOrb: (orbId) => {
      const { isTransitioning, activeOrb } = get();
      if (isTransitioning || activeOrb === orbId) return;

      const orb = getOrbById(orbId);
      if (!orb) return;

      const focusPreset = CAMERA_PRESETS.ORB_FOCUS(orb);

      set({
        worldState: 'TRANSITIONING',
        isTransitioning: true,
        transitionType: 'ZOOM_IN',
        transitionProgress: 0,
        previousOrb: get().activeOrb,
        activeOrb: orbId,
        cameraTarget: focusPreset.target,
        cameraPosition: focusPreset.position,
        cameraZoom: focusPreset.zoom,
      });
    },

    exitOrb: () => {
      const { isTransitioning, activeOrb } = get();
      if (isTransitioning || !activeOrb) return;

      set({
        worldState: 'TRANSITIONING',
        isTransitioning: true,
        transitionType: 'ZOOM_OUT',
        transitionProgress: 0,
        previousOrb: activeOrb,
        cameraTarget: CAMERA_PRESETS.WORLD_HUB.target,
        cameraPosition: CAMERA_PRESETS.WORLD_HUB.position,
        cameraZoom: CAMERA_PRESETS.WORLD_HUB.zoom,
      });
    },

    crossTransition: (targetOrb) => {
      const { isTransitioning, activeOrb } = get();
      if (isTransitioning || !activeOrb || activeOrb === targetOrb) return;

      const orb = getOrbById(targetOrb);
      if (!orb) return;

      const focusPreset = CAMERA_PRESETS.ORB_FOCUS(orb);

      set({
        worldState: 'TRANSITIONING',
        isTransitioning: true,
        transitionType: 'CROSS_ORB',
        transitionProgress: 0,
        previousOrb: activeOrb,
        activeOrb: targetOrb,
        cameraTarget: focusPreset.target,
        cameraPosition: focusPreset.position,
        cameraZoom: focusPreset.zoom,
      });
    },

    setTransitionProgress: (progress) => {
      set({ transitionProgress: Math.min(1, Math.max(0, progress)) });
    },

    completeTransition: () => {
      const { transitionType, activeOrb } = get();

      set({
        worldState: transitionType === 'ZOOM_OUT' ? 'IDLE' : activeOrb ? 'ORB_ACTIVE' : 'IDLE',
        isTransitioning: false,
        transitionType: null,
        transitionProgress: 1,
        activeOrb: transitionType === 'ZOOM_OUT' ? null : activeOrb,
        hoveredOrb: null,
      });
    },

    updateCursor: (x, y) => {
      set({ cursorPosition: { x, y } });
    },

    setCarouselRotation: (rotation) => {
      set({ carouselRotation: rotation });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 📊 COMPUTED
    // ─────────────────────────────────────────────────────────────────────────

    getOrbDefinition: (orbId) => getOrbById(orbId),
    getAllOrbs: () => POKER_IQ_ORBS,
  }))
);

// ─────────────────────────────────────────────────────────────────────────────
// 🔌 SELECTORS
// ─────────────────────────────────────────────────────────────────────────────
export const selectWorldState = (state: WorldStore) => state.worldState;
export const selectActiveOrb = (state: WorldStore) => state.activeOrb;
export const selectHoveredOrb = (state: WorldStore) => state.hoveredOrb;
export const selectIsTransitioning = (state: WorldStore) => state.isTransitioning;
export const selectCameraState = (state: WorldStore) => ({
  position: state.cameraPosition,
  target: state.cameraTarget,
  zoom: state.cameraZoom,
});
export const selectCursorPosition = (state: WorldStore) => state.cursorPosition;
