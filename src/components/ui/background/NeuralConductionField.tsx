/* ═══════════════════════════════════════════════════════════════════════════
   NEURAL CONDUCTION FIELD — Canvas2D Particle System
   Path-constrained neurons flowing along Brain and GTO Matrix networks
   Core PokerIQ visual identity: "The Thinking Machine"
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ALL_BRAIN_PATHS, samplePathPoints, PathPoint, PathSegment } from './paths/BrainPathGraph';
import { generateGTOMatrix, DEFAULT_GRID_CONFIG } from './paths/GTOMatrixGraph';
import { BRIDGE_PATHS, findNearestBridge } from './paths/JunctionBridges';
import {
    NeuralFieldProvider,
    IntensityMode,
    IntensityConfig,
    NeuralTheme,
    DEFAULT_THEME,
    INTENSITY_PRESETS,
} from './NeuralFieldContext';

// ─────────────────────────────────────────────────────────────────────────────
// 🔮 PARTICLE MODEL
// ─────────────────────────────────────────────────────────────────────────────
interface Particle {
    id: number;
    path: PathPoint[];
    pathIndex: number;
    progress: number;       // 0-1 along current segment
    speed: number;
    size: number;
    opacity: number;
    layer: 'near' | 'far';
    glowIntensity: number;
    network: 'brain' | 'grid' | 'bridge';
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 COMPONENT PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface NeuralConductionFieldProps {
    enabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function NeuralConductionField({
    enabled = true,
    className,
    style,
}: NeuralConductionFieldProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const particleIdRef = useRef<number>(0);

    // State
    const [reducedMotion, setReducedMotion] = useState(false);
    const intensityRef = useRef<IntensityConfig>(INTENSITY_PRESETS.idle);
    const themeRef = useRef<NeuralTheme>(DEFAULT_THEME);
    const pulseQueueRef = useRef<Array<{ x: number; y: number; power: number; time: number }>>([]);

    // ───────────────────────────────────────────────────────────────────────────
    // 📊 PRECOMPUTE ALL PATHS
    // ───────────────────────────────────────────────────────────────────────────
    const allPaths = useMemo(() => {
        const brainPaths = ALL_BRAIN_PATHS.map(p => ({
            ...p,
            sampledPoints: samplePathPoints(p, 60),
            network: 'brain' as const,
        }));

        const gtoMatrix = generateGTOMatrix({
            ...DEFAULT_GRID_CONFIG,
            rows: 6,
            cols: 10,
        });

        const gridPaths = gtoMatrix.map(p => ({
            ...p,
            sampledPoints: samplePathPoints(p, 40),
            network: 'grid' as const,
        }));

        const bridgePaths = BRIDGE_PATHS.map(p => ({
            ...p,
            sampledPoints: samplePathPoints(p, 20),
            network: 'bridge' as const,
        }));

        return [...brainPaths, ...gridPaths, ...bridgePaths];
    }, []);

    // ───────────────────────────────────────────────────────────────────────────
    // 🎛️ REDUCED MOTION CHECK
    // ───────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(mq.matches);

        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // ───────────────────────────────────────────────────────────────────────────
    // 🆕 SPAWN PARTICLE
    // ───────────────────────────────────────────────────────────────────────────
    const spawnParticle = useCallback((layer: 'near' | 'far'): Particle | null => {
        if (allPaths.length === 0) return null;

        const pathData = allPaths[Math.floor(Math.random() * allPaths.length)];
        if (!pathData.sampledPoints || pathData.sampledPoints.length < 2) return null;

        const intensity = intensityRef.current;
        const baseSpeed = layer === 'near' ? 0.015 : 0.008;

        return {
            id: particleIdRef.current++,
            path: pathData.sampledPoints,
            pathIndex: 0,
            progress: Math.random() * 0.3, // Start at random point
            speed: baseSpeed * (0.7 + Math.random() * 0.6) * intensity.speed,
            size: layer === 'near' ? 2 + Math.random() * 1.5 : 1 + Math.random() * 0.8,
            opacity: layer === 'near' ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.2,
            layer,
            glowIntensity: intensity.glowStrength,
            network: pathData.network,
        };
    }, [allPaths]);

    // ───────────────────────────────────────────────────────────────────────────
    // 🖌️ RENDER FRAME
    // ───────────────────────────────────────────────────────────────────────────
    const render = useCallback((timestamp: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // Resize canvas if needed
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        }

        const delta = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;

        const intensity = intensityRef.current;
        const theme = themeRef.current;

        // Clear with subtle fade (creates trail effect)
        ctx.fillStyle = theme.backgroundTint + 'e0';
        ctx.fillRect(0, 0, width, height);

        // ─────────────────────────────────────────────────────────────────────────
        // Draw static path lines (very subtle)
        // ─────────────────────────────────────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = theme.gridLineColor;
        ctx.lineWidth = 0.5;

        for (const pathData of allPaths) {
            if (!pathData.sampledPoints || pathData.sampledPoints.length < 2) continue;

            ctx.beginPath();
            const first = pathData.sampledPoints[0];
            ctx.moveTo((first.x / 100) * width, (first.y / 100) * height);

            for (let i = 1; i < pathData.sampledPoints.length; i++) {
                const pt = pathData.sampledPoints[i];
                ctx.lineTo((pt.x / 100) * width, (pt.y / 100) * height);
            }
            ctx.stroke();
        }
        ctx.restore();

        // ─────────────────────────────────────────────────────────────────────────
        // Spawn particles
        // ─────────────────────────────────────────────────────────────────────────
        const particles = particlesRef.current;
        const targetCount = Math.floor(30 * intensity.spawnRate);

        while (particles.length < targetCount) {
            const layer = Math.random() > 0.4 ? 'near' : 'far';
            const particle = spawnParticle(layer);
            if (particle) particles.push(particle);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // Update and draw particles
        // ─────────────────────────────────────────────────────────────────────────
        const toRemove: number[] = [];

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Update position
            p.progress += p.speed * (delta / 16);

            // Move to next segment when progress >= 1
            while (p.progress >= 1 && p.pathIndex < p.path.length - 2) {
                p.progress -= 1;
                p.pathIndex++;
            }

            // Check if reached end
            if (p.pathIndex >= p.path.length - 2 && p.progress >= 1) {
                toRemove.push(i);
                continue;
            }

            // Calculate current position
            const p0 = p.path[p.pathIndex];
            const p1 = p.path[p.pathIndex + 1];
            const x = p0.x + (p1.x - p0.x) * p.progress;
            const y = p0.y + (p1.y - p0.y) * p.progress;

            const screenX = (x / 100) * width;
            const screenY = (y / 100) * height;

            // ───────────────────────────────────────────────────────────────────────
            // Check pulse effects
            // ───────────────────────────────────────────────────────────────────────
            let pulseBoost = 0;
            const now = timestamp;
            for (const pulse of pulseQueueRef.current) {
                const age = (now - pulse.time) / 1000;
                if (age > 2) continue;

                const pulseX = pulse.x !== undefined ? (pulse.x / 100) * width : width / 2;
                const pulseY = pulse.y !== undefined ? (pulse.y / 100) * height : height / 2;
                const dist = Math.hypot(screenX - pulseX, screenY - pulseY);
                const maxDist = 200 * pulse.power;

                if (dist < maxDist) {
                    const falloff = 1 - dist / maxDist;
                    const timeFalloff = 1 - age / 2;
                    pulseBoost += falloff * timeFalloff * pulse.power * 0.5;
                }
            }

            // ───────────────────────────────────────────────────────────────────────
            // Draw particle
            // ───────────────────────────────────────────────────────────────────────
            const finalOpacity = Math.min(p.opacity + pulseBoost, 1);
            const finalSize = p.size * (1 + pulseBoost * 0.5);

            // Glow layer
            const glowRadius = finalSize * 4 * p.glowIntensity;
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowRadius);
            gradient.addColorStop(0, theme.glowColor + Math.floor(finalOpacity * 100).toString(16).padStart(2, '0'));
            gradient.addColorStop(1, theme.glowColor + '00');

            ctx.beginPath();
            ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Core particle
            ctx.beginPath();
            ctx.arc(screenX, screenY, finalSize, 0, Math.PI * 2);
            ctx.fillStyle = theme.neuronColor;
            ctx.globalAlpha = finalOpacity;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Remove finished particles
        for (let i = toRemove.length - 1; i >= 0; i--) {
            particles.splice(toRemove[i], 1);
        }

        // Clean old pulses
        pulseQueueRef.current = pulseQueueRef.current.filter(p => timestamp - p.time < 2000);

        // Continue animation
        if (enabled && !reducedMotion) {
            animationRef.current = requestAnimationFrame(render);
        }
    }, [allPaths, enabled, reducedMotion, spawnParticle]);

    // ───────────────────────────────────────────────────────────────────────────
    // 🚀 START/STOP ANIMATION
    // ───────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (enabled && !reducedMotion) {
            lastTimeRef.current = performance.now();
            animationRef.current = requestAnimationFrame(render);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [enabled, reducedMotion, render]);

    // ───────────────────────────────────────────────────────────────────────────
    // 🎛️ API CALLBACKS
    // ───────────────────────────────────────────────────────────────────────────
    const handleIntensityChange = useCallback((_mode: IntensityMode, config: IntensityConfig) => {
        intensityRef.current = config;
    }, []);

    const handlePulse = useCallback((at: { x: number; y: number } | undefined, power: number) => {
        pulseQueueRef.current.push({
            x: at?.x ?? 50,
            y: at?.y ?? 50,
            power,
            time: performance.now(),
        });
    }, []);

    const handleThemeChange = useCallback((theme: NeuralTheme) => {
        themeRef.current = theme;
    }, []);

    // ───────────────────────────────────────────────────────────────────────────
    // 🖼️ STATIC FALLBACK (reduced motion / disabled)
    // ───────────────────────────────────────────────────────────────────────────
    if (!enabled || reducedMotion) {
        return (
            <NeuralFieldProvider
                onIntensityChange={handleIntensityChange}
                onPulse={handlePulse}
                onThemeChange={handleThemeChange}
            >
                <div
                    className={className}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 0,
                        pointerEvents: 'none',
                        background: `linear-gradient(135deg, ${DEFAULT_THEME.backgroundTint} 0%, #0a0a20 100%)`,
                        ...style,
                    }}
                >
                    {/* Static grid overlay */}
                    <svg
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0.05,
                        }}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {/* Simplified static grid */}
                        {Array.from({ length: 11 }).map((_, i) => (
                            <React.Fragment key={i}>
                                <line
                                    x1={5 + i * 9}
                                    y1="10"
                                    x2={5 + i * 9}
                                    y2="90"
                                    stroke={DEFAULT_THEME.gridLineColor}
                                    strokeWidth="0.2"
                                />
                                <line
                                    x1="5"
                                    y1={10 + i * 8}
                                    x2="95"
                                    y2={10 + i * 8}
                                    stroke={DEFAULT_THEME.gridLineColor}
                                    strokeWidth="0.2"
                                />
                            </React.Fragment>
                        ))}
                    </svg>
                </div>
            </NeuralFieldProvider>
        );
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 🎬 ACTIVE RENDER
    // ───────────────────────────────────────────────────────────────────────────
    return (
        <NeuralFieldProvider
            onIntensityChange={handleIntensityChange}
            onPulse={handlePulse}
            onThemeChange={handleThemeChange}
        >
            <canvas
                ref={canvasRef}
                className={className}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: 'none',
                    width: '100%',
                    height: '100%',
                    ...style,
                }}
            />
        </NeuralFieldProvider>
    );
}

export default NeuralConductionField;
