/* ═══════════════════════════════════════════════════════════════════════════
   BRAIN PATH GRAPH — Organic neural pathway network
   Curved lines representing the "thinking brain" visual identity
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PathPoint {
    x: number;
    y: number;
}

export interface PathSegment {
    id: string;
    points: PathPoint[];
    layer: 'brain' | 'bridge';
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN OUTLINE PATHS — Main neural contours (percentage coordinates 0-100)
// ─────────────────────────────────────────────────────────────────────────────
export const BRAIN_OUTLINE_PATHS: PathSegment[] = [
    // Right hemisphere outer curve (top)
    {
        id: 'brain-outer-top',
        layer: 'brain',
        points: [
            { x: 50, y: 20 }, { x: 55, y: 18 }, { x: 62, y: 17 },
            { x: 70, y: 18 }, { x: 78, y: 22 }, { x: 85, y: 28 },
            { x: 90, y: 35 }, { x: 92, y: 42 },
        ],
    },
    // Right hemisphere outer curve (bottom)
    {
        id: 'brain-outer-bottom',
        layer: 'brain',
        points: [
            { x: 92, y: 42 }, { x: 93, y: 50 }, { x: 92, y: 58 },
            { x: 88, y: 65 }, { x: 82, y: 72 }, { x: 74, y: 77 },
            { x: 65, y: 80 }, { x: 55, y: 82 }, { x: 50, y: 82 },
        ],
    },
    // Left hemisphere outer curve (top)
    {
        id: 'brain-left-top',
        layer: 'brain',
        points: [
            { x: 50, y: 20 }, { x: 45, y: 18 }, { x: 38, y: 17 },
            { x: 30, y: 18 }, { x: 22, y: 22 }, { x: 15, y: 28 },
            { x: 10, y: 35 }, { x: 8, y: 42 },
        ],
    },
    // Left hemisphere outer curve (bottom)
    {
        id: 'brain-left-bottom',
        layer: 'brain',
        points: [
            { x: 8, y: 42 }, { x: 7, y: 50 }, { x: 8, y: 58 },
            { x: 12, y: 65 }, { x: 18, y: 72 }, { x: 26, y: 77 },
            { x: 35, y: 80 }, { x: 45, y: 82 }, { x: 50, y: 82 },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🔮 INTERNAL NEURAL PATHWAYS — Flowing thought traces
// ─────────────────────────────────────────────────────────────────────────────
export const INTERNAL_BRAIN_PATHS: PathSegment[] = [
    // Corpus callosum (center connection)
    {
        id: 'brain-corpus',
        layer: 'brain',
        points: [
            { x: 20, y: 45 }, { x: 30, y: 42 }, { x: 40, y: 40 },
            { x: 50, y: 40 }, { x: 60, y: 40 }, { x: 70, y: 42 },
            { x: 80, y: 45 },
        ],
    },
    // Frontal lobe traces (right)
    {
        id: 'brain-frontal-r',
        layer: 'brain',
        points: [
            { x: 55, y: 30 }, { x: 62, y: 28 }, { x: 70, y: 30 },
            { x: 75, y: 35 }, { x: 78, y: 42 },
        ],
    },
    // Frontal lobe traces (left)
    {
        id: 'brain-frontal-l',
        layer: 'brain',
        points: [
            { x: 45, y: 30 }, { x: 38, y: 28 }, { x: 30, y: 30 },
            { x: 25, y: 35 }, { x: 22, y: 42 },
        ],
    },
    // Temporal connections (right)
    {
        id: 'brain-temporal-r',
        layer: 'brain',
        points: [
            { x: 60, y: 55 }, { x: 68, y: 58 }, { x: 75, y: 62 },
            { x: 80, y: 68 }, { x: 82, y: 74 },
        ],
    },
    // Temporal connections (left)
    {
        id: 'brain-temporal-l',
        layer: 'brain',
        points: [
            { x: 40, y: 55 }, { x: 32, y: 58 }, { x: 25, y: 62 },
            { x: 20, y: 68 }, { x: 18, y: 74 },
        ],
    },
    // Central vertical (top to bottom)
    {
        id: 'brain-central',
        layer: 'brain',
        points: [
            { x: 50, y: 20 }, { x: 50, y: 30 }, { x: 50, y: 40 },
            { x: 50, y: 50 }, { x: 50, y: 60 }, { x: 50, y: 70 },
            { x: 50, y: 82 },
        ],
    },
    // Prefrontal radiating (top-right)
    {
        id: 'brain-prefrontal-r',
        layer: 'brain',
        points: [
            { x: 50, y: 25 }, { x: 58, y: 22 }, { x: 68, y: 20 },
            { x: 78, y: 22 }, { x: 85, y: 26 },
        ],
    },
    // Prefrontal radiating (top-left)
    {
        id: 'brain-prefrontal-l',
        layer: 'brain',
        points: [
            { x: 50, y: 25 }, { x: 42, y: 22 }, { x: 32, y: 20 },
            { x: 22, y: 22 }, { x: 15, y: 26 },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 📊 UTILITY: Sample path for smooth particle traversal
// ─────────────────────────────────────────────────────────────────────────────
export function samplePathPoints(path: PathSegment, resolution: number = 50): PathPoint[] {
    const { points } = path;
    if (points.length < 2) return points;

    const sampled: PathPoint[] = [];
    const totalSegments = points.length - 1;

    for (let i = 0; i < resolution; i++) {
        const t = i / (resolution - 1);
        const segmentFloat = t * totalSegments;
        const segmentIndex = Math.min(Math.floor(segmentFloat), totalSegments - 1);
        const segmentT = segmentFloat - segmentIndex;

        const p0 = points[segmentIndex];
        const p1 = points[segmentIndex + 1];

        sampled.push({
            x: p0.x + (p1.x - p0.x) * segmentT,
            y: p0.y + (p1.y - p0.y) * segmentT,
        });
    }

    return sampled;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 EXPORT ALL BRAIN PATHS
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_BRAIN_PATHS: PathSegment[] = [
    ...BRAIN_OUTLINE_PATHS,
    ...INTERNAL_BRAIN_PATHS,
];
