/* ═══════════════════════════════════════════════════════════════════════════
   NEURON LIGHTS — Subtle blue light pulses traveling ONLY on background lines
   Paths are precisely mapped to the circuit-brain-bg.png grid and brain traces
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🔮 NEURON PATH DEFINITIONS — Mapped to actual background circuit lines
// These coordinates are in percentage (0-100) of viewport
// Each path follows EXACTLY the lines visible in circuit-brain-bg.png
// ─────────────────────────────────────────────────────────────────────────────

// LEFT SIDE: Poker matrix grid - vertical lines with horizontal connectors
const GRID_PATHS = [
    // Vertical line far left (column 1 - As, Ks, Qs, Js, Ts, 6s)
    { id: 'grid-v1', points: [[3, 0], [3, 12], [5, 14], [5, 25], [3, 27], [3, 40], [5, 42], [5, 55], [3, 57], [3, 70]] },
    // Vertical line (column 2 - A8s, KTs, 9s, 8s, 7s)
    { id: 'grid-v2', points: [[8, 0], [8, 15], [10, 17], [10, 28], [8, 30], [8, 45], [10, 47], [10, 60]] },
    // Vertical line (column 3 - A7s, K7s, Q7s)
    { id: 'grid-v3', points: [[13, 5], [13, 20], [15, 22], [15, 35], [13, 37], [13, 55]] },
    // Horizontal connector top
    { id: 'grid-h1', points: [[0, 15], [5, 15], [7, 17], [12, 17], [14, 15], [20, 15]] },
    // Horizontal connector mid
    { id: 'grid-h2', points: [[0, 30], [4, 30], [6, 32], [10, 32], [12, 30], [18, 30]] },
    // Horizontal connector lower
    { id: 'grid-h3', points: [[0, 45], [3, 45], [5, 47], [9, 47], [11, 45], [16, 45]] },
];

// RIGHT SIDE: Brain radiating traces
const BRAIN_PATHS = [
    // Top radiating trace
    { id: 'brain-r1', points: [[65, 35], [70, 30], [75, 27], [80, 23], [85, 18], [90, 12], [95, 8]] },
    // Upper-mid radiating trace
    { id: 'brain-r2', points: [[68, 40], [73, 38], [78, 35], [83, 32], [88, 28], [93, 24], [98, 20]] },
    // Mid radiating trace (horizontal-ish)
    { id: 'brain-r3', points: [[70, 48], [75, 47], [80, 46], [85, 45], [90, 44], [95, 43], [100, 42]] },
    // Lower-mid radiating trace
    { id: 'brain-r4', points: [[68, 55], [73, 58], [78, 62], [83, 66], [88, 70], [93, 74]] },
    // Bottom radiating trace
    { id: 'brain-r5', points: [[65, 62], [70, 68], [75, 73], [80, 78], [85, 83], [90, 88]] },
    // Internal brain curve top
    { id: 'brain-i1', points: [[60, 40], [62, 38], [65, 37], [68, 38], [70, 40]] },
    // Internal brain curve bottom
    { id: 'brain-i2', points: [[60, 55], [62, 57], [65, 58], [68, 57], [70, 55]] },
];

// CENTER: Connecting traces between grid and brain
const CENTER_PATHS = [
    { id: 'center-1', points: [[20, 35], [25, 35], [28, 37], [33, 37], [36, 35], [42, 35], [45, 37], [50, 37], [55, 38], [60, 40]] },
    { id: 'center-2', points: [[22, 50], [27, 50], [30, 48], [35, 48], [38, 50], [44, 50], [48, 52], [54, 52], [58, 54], [62, 55]] },
];

// All paths combined
const ALL_PATHS = [...GRID_PATHS, ...BRAIN_PATHS, ...CENTER_PATHS];

// ─────────────────────────────────────────────────────────────────────────────
// 🌟 CONVERT POINTS TO SVG PATH
// ─────────────────────────────────────────────────────────────────────────────
function pointsToPath(points: number[][]): string {
    if (points.length === 0) return '';
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i][0]} ${points[i][1]}`;
    }
    return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌟 SINGLE NEURON PULSE — Blue light traveling along path (NO white balls)
// ─────────────────────────────────────────────────────────────────────────────
interface NeuronPulseProps {
    pathData: string;
    id: string;
    duration: number;
}

function NeuronPulse({ pathData, id, duration }: NeuronPulseProps) {
    const [isActive, setIsActive] = useState(false);
    const [dashOffset, setDashOffset] = useState(0);
    const [opacity, setOpacity] = useState(0);
    const pathRef = useRef<SVGPathElement>(null);
    const pathLength = useRef(100);

    // Get path length on mount
    useEffect(() => {
        if (pathRef.current) {
            pathLength.current = pathRef.current.getTotalLength();
        }
    }, [pathData]);

    // Random activation cycle
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        let animFrame: number;
        let startTime: number;

        const startAnimation = () => {
            setIsActive(true);
            startTime = Date.now();
            const length = pathLength.current;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Move the dash along the path
                setDashOffset(length - (progress * length));

                // Fade in at start, fade out at end
                if (progress < 0.1) {
                    setOpacity(progress * 10); // Fade in
                } else if (progress > 0.85) {
                    setOpacity((1 - progress) * 6.67); // Fade out
                } else {
                    setOpacity(1);
                }

                if (progress < 1) {
                    animFrame = requestAnimationFrame(animate);
                } else {
                    setIsActive(false);
                    setOpacity(0);
                    // Random delay before next activation (8-20 seconds)
                    timeout = setTimeout(startAnimation, 8000 + Math.random() * 12000);
                }
            };

            animFrame = requestAnimationFrame(animate);
        };

        // Initial random delay (0-10 seconds)
        timeout = setTimeout(startAnimation, Math.random() * 10000);

        return () => {
            clearTimeout(timeout);
            cancelAnimationFrame(animFrame);
        };
    }, [duration]);

    const length = pathLength.current;
    const pulseLength = length * 0.15; // 15% of path is lit at a time

    return (
        <path
            ref={pathRef}
            d={pathData}
            fill="none"
            stroke={`rgba(0, 220, 255, ${opacity * 0.7})`}
            strokeWidth="0.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${pulseLength} ${length}`}
            strokeDashoffset={dashOffset}
            style={{
                filter: isActive ? 'blur(1px) drop-shadow(0 0 3px rgba(0, 220, 255, 0.8))' : 'none',
                transition: 'opacity 0.3s ease',
            }}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 NEURON LIGHTS CONTAINER
// ─────────────────────────────────────────────────────────────────────────────
export function NeuronLights() {
    // Use deterministic paths on first render, randomize on client only
    const [activePaths, setActivePaths] = useState(() => ALL_PATHS.slice(0, 5));

    // Randomize paths only on client after mount
    useEffect(() => {
        const shuffled = [...ALL_PATHS].sort(() => Math.random() - 0.5);
        setActivePaths(shuffled.slice(0, 5));
    }, []);

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 3, // Above background (2), below canvas (5)
                overflow: 'hidden',
            }}
        >
            <svg
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                {activePaths.map((neuron, index) => (
                    <NeuronPulse
                        key={neuron.id}
                        id={neuron.id}
                        pathData={pointsToPath(neuron.points)}
                        duration={3000 + index * 500} // Stagger durations
                    />
                ))}
            </svg>
        </div>
    );
}

export default NeuronLights;
