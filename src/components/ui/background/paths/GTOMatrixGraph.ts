/* ═══════════════════════════════════════════════════════════════════════════
   GTO MATRIX GRAPH — Orthogonal solver grid network
   Represents the analytical, calculation-driven nature of GTO poker
   ═══════════════════════════════════════════════════════════════════════════ */

import { PathPoint, PathSegment } from './BrainPathGraph';

export interface GTOGridConfig {
    rows: number;
    cols: number;
    marginX: number;  // Percentage from edges
    marginY: number;
    offsetX?: number; // Optional center offset
    offsetY?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔲 DEFAULT GRID CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_GRID_CONFIG: GTOGridConfig = {
    rows: 8,
    cols: 12,
    marginX: 5,
    marginY: 10,
    offsetX: 0,
    offsetY: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// 📐 GENERATE GTO MATRIX PATHS
// ─────────────────────────────────────────────────────────────────────────────
export function generateGTOMatrix(config: GTOGridConfig = DEFAULT_GRID_CONFIG): PathSegment[] {
    const { rows, cols, marginX, marginY, offsetX = 0, offsetY = 0 } = config;
    const paths: PathSegment[] = [];

    const width = 100 - marginX * 2;
    const height = 100 - marginY * 2;
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
        const y = marginY + row * cellHeight + offsetY;
        const points: PathPoint[] = [];

        for (let col = 0; col <= cols; col++) {
            points.push({
                x: marginX + col * cellWidth + offsetX,
                y: y,
            });
        }

        paths.push({
            id: `gto-h-${row}`,
            layer: 'brain',
            points,
        });
    }

    // Vertical lines
    for (let col = 0; col <= cols; col++) {
        const x = marginX + col * cellWidth + offsetX;
        const points: PathPoint[] = [];

        for (let row = 0; row <= rows; row++) {
            points.push({
                x: x,
                y: marginY + row * cellHeight + offsetY,
            });
        }

        paths.push({
            id: `gto-v-${col}`,
            layer: 'brain',
            points,
        });
    }

    return paths;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 GET GRID INTERSECTION NODES (for junction bridging)
// ─────────────────────────────────────────────────────────────────────────────
export function getGridIntersections(config: GTOGridConfig = DEFAULT_GRID_CONFIG): PathPoint[] {
    const { rows, cols, marginX, marginY, offsetX = 0, offsetY = 0 } = config;
    const intersections: PathPoint[] = [];

    const width = 100 - marginX * 2;
    const height = 100 - marginY * 2;
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    for (let row = 0; row <= rows; row++) {
        for (let col = 0; col <= cols; col++) {
            intersections.push({
                x: marginX + col * cellWidth + offsetX,
                y: marginY + row * cellHeight + offsetY,
            });
        }
    }

    return intersections;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎲 PRE-GENERATED DEFAULT MATRIX
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_GTO_MATRIX = generateGTOMatrix(DEFAULT_GRID_CONFIG);
export const DEFAULT_GRID_INTERSECTIONS = getGridIntersections(DEFAULT_GRID_CONFIG);
