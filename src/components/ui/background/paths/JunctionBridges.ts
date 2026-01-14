/* ═══════════════════════════════════════════════════════════════════════════
   JUNCTION BRIDGES — Connection points between Brain and GTO Matrix networks
   Enables particles to hop between the organic brain and analytical grid
   ═══════════════════════════════════════════════════════════════════════════ */

import { PathPoint, PathSegment } from './BrainPathGraph';

export interface JunctionBridge {
    id: string;
    brainPoint: PathPoint;
    gridPoint: PathPoint;
    bidirectional: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌉 DEFINED JUNCTION BRIDGES
// These connect brain neural pathways to the GTO calculation grid
// ─────────────────────────────────────────────────────────────────────────────
export const JUNCTION_BRIDGES: JunctionBridge[] = [
    // Top center - Prefrontal to grid top
    {
        id: 'bridge-top-center',
        brainPoint: { x: 50, y: 20 },
        gridPoint: { x: 50, y: 10 },
        bidirectional: true,
    },
    // Right side - Temporal to grid right
    {
        id: 'bridge-right-mid',
        brainPoint: { x: 80, y: 45 },
        gridPoint: { x: 95, y: 45 },
        bidirectional: true,
    },
    // Left side - Temporal to grid left  
    {
        id: 'bridge-left-mid',
        brainPoint: { x: 20, y: 45 },
        gridPoint: { x: 5, y: 45 },
        bidirectional: true,
    },
    // Bottom right
    {
        id: 'bridge-bottom-right',
        brainPoint: { x: 74, y: 77 },
        gridPoint: { x: 87.5, y: 90 },
        bidirectional: true,
    },
    // Bottom left
    {
        id: 'bridge-bottom-left',
        brainPoint: { x: 26, y: 77 },
        gridPoint: { x: 12.5, y: 90 },
        bidirectional: true,
    },
    // Upper right
    {
        id: 'bridge-upper-right',
        brainPoint: { x: 78, y: 22 },
        gridPoint: { x: 87.5, y: 10 },
        bidirectional: true,
    },
    // Upper left
    {
        id: 'bridge-upper-left',
        brainPoint: { x: 22, y: 22 },
        gridPoint: { x: 12.5, y: 10 },
        bidirectional: true,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🔗 GENERATE BRIDGE PATH SEGMENTS
// ─────────────────────────────────────────────────────────────────────────────
export function generateBridgePaths(): PathSegment[] {
    return JUNCTION_BRIDGES.map((bridge) => ({
        id: bridge.id,
        layer: 'bridge' as const,
        points: [bridge.brainPoint, bridge.gridPoint],
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 FIND NEAREST BRIDGE FROM POINT
// ─────────────────────────────────────────────────────────────────────────────
export function findNearestBridge(
    point: PathPoint,
    fromNetwork: 'brain' | 'grid'
): JunctionBridge | null {
    let nearest: JunctionBridge | null = null;
    let minDist = Infinity;

    for (const bridge of JUNCTION_BRIDGES) {
        const targetPoint = fromNetwork === 'brain' ? bridge.brainPoint : bridge.gridPoint;
        const dist = Math.hypot(point.x - targetPoint.x, point.y - targetPoint.y);

        if (dist < minDist) {
            minDist = dist;
            nearest = bridge;
        }
    }

    return minDist < 15 ? nearest : null; // Only return if within threshold
}

export const BRIDGE_PATHS = generateBridgePaths();
