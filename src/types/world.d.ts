/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — WORLD TYPE DEFINITIONS
   Core types for the 10-Orb PokerIQ World System
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OrbConfig {
    id: OrbId;
    color: string;
    label: string;
    angle: number;
    icon?: string;
    description?: string;
}

export type OrbId =
    | 'social'
    | 'club-arena'
    | 'diamond-arena'
    | 'training'
    | 'memory-games'
    | 'assistant'
    | 'diamond-arcade'
    | 'bankroll'
    | 'poker-near-me'
    | 'marketplace';

export type WorldState =
    | 'IDLE'
    | 'ORB_HOVER'
    | 'ORB_FOCUS'
    | 'TRANSITIONING'
    | 'ORB_ACTIVE';

export type TransitionType =
    | 'ZOOM_IN'
    | 'ZOOM_OUT'
    | 'CROSS_ORB';

export interface CameraState {
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
}

export interface WorldStore {
    worldState: WorldState;
    activeOrb: OrbId | null;
    hoveredOrb: OrbId | null;
    previousOrb: OrbId | null;
    isTransitioning: boolean;
    transitionType: TransitionType | null;
    transitionProgress: number;
    cameraState: CameraState;
    carouselRotation: number;
    carouselVelocity: number;
    cursorPosition: { x: number; y: number };
}
