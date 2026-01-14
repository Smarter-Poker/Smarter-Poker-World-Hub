// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   RETURN BURST — Fast Card Explosion Animation (3 seconds)
   Plays when user RETURNS to hub from another screen
   Features: Fast particle bursts, card scatter, snap-to-position
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEngine } from '../../audio/SoundEngine';

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Particle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    maxLife: number;
    hue: number;
    type: 'spark' | 'card' | 'trail';
    rotation: number;
    rotationSpeed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RETURN BURST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface ReturnBurstProps {
    onComplete: () => void;
    duration?: number;
}

export function ReturnBurst({ onComplete, duration = 3000 }: ReturnBurstProps) {
    const [phase, setPhase] = useState<'burst' | 'scatter' | 'settle' | 'done'>('burst');
    const [progress, setProgress] = useState(0);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [cardPositions, setCardPositions] = useState<{ x: number; y: number; rotation: number; scale: number }[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();
    const hasStartedRef = useRef(false);
    const startTimeRef = useRef(0);
    const particleIdRef = useRef(0);

    // Card images for the explosion
    const cardImages = [
        '/cards/trivia-card.png',
        '/cards/social-card.png',
        '/cards/club-card.png',
        '/cards/training-card.png',
        '/cards/diamond-card.png',
        '/cards/friends-card.png',
    ];

    // Initialize card positions (start from center, explode outward)
    useEffect(() => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const initialCards = cardImages.map((_, i) => ({
            x: centerX,
            y: centerY,
            rotation: Math.random() * 360 - 180,
            scale: 0.1,
        }));
        setCardPositions(initialCards);
    }, []);

    // Emit particles
    const emitParticles = useCallback((cx: number, cy: number, count: number, type: Particle['type']) => {
        const newParticles: Particle[] = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
            const speed = 8 + Math.random() * 15;
            newParticles.push({
                id: particleIdRef.current++,
                x: cx + (Math.random() - 0.5) * 40,
                y: cy + (Math.random() - 0.5) * 40,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: type === 'spark' ? 2 + Math.random() * 4 : 4 + Math.random() * 6,
                life: 1,
                maxLife: 0.5 + Math.random() * 0.5,
                hue: 180 + Math.random() * 40, // Cyan to blue
                type,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 20,
            });
        }
        setParticles(prev => [...prev, ...newParticles]);
    }, []);

    // Main animation loop
    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;
        startTimeRef.current = performance.now();

        // Play return sound via SoundEngine (if configured)
        SoundEngine.play('hubReturn');

        // Haptic feedback
        if ('vibrate' in navigator) {
            navigator.vibrate([50, 30, 50, 30, 100]);
        }

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Initial burst of particles
        emitParticles(centerX, centerY, 60, 'spark');

        // Animation timeline
        const animate = () => {
            const elapsed = performance.now() - startTimeRef.current;
            const p = elapsed / duration;
            setProgress(p);

            // Phase transitions
            if (p < 0.15) {
                // PHASE 1: Burst (0-0.5s) - Cards explode outward
                if (phase !== 'burst') setPhase('burst');

                // Emit more particles during burst
                if (Math.random() < 0.3) {
                    emitParticles(centerX, centerY, 5, 'spark');
                }

                // Calculate card explosion positions
                setCardPositions(prev => prev.map((card, i) => {
                    const angle = (Math.PI * 2 * i) / prev.length - Math.PI / 2;
                    const explodeRadius = 300 + Math.random() * 100;
                    const burstProgress = p / 0.15;
                    const eased = 1 - Math.pow(1 - burstProgress, 3);

                    return {
                        x: centerX + Math.cos(angle) * explodeRadius * eased,
                        y: centerY + Math.sin(angle) * explodeRadius * eased * 0.6,
                        rotation: card.rotation + (Math.random() - 0.5) * 30,
                        scale: 0.3 + eased * 0.5,
                    };
                }));

            } else if (p < 0.5) {
                // PHASE 2: Scatter (0.5s-1.5s) - Cards spiral and scatter
                if (phase !== 'scatter') {
                    setPhase('scatter');
                    emitParticles(centerX, centerY, 30, 'trail');
                }

                // Secondary particle bursts
                if (Math.random() < 0.15) {
                    const randomCard = cardPositions[Math.floor(Math.random() * cardPositions.length)];
                    if (randomCard) {
                        emitParticles(randomCard.x, randomCard.y, 3, 'spark');
                    }
                }

                // Cards continue moving with slight spiral
                setCardPositions(prev => prev.map((card, i) => {
                    const scatterProgress = (p - 0.15) / 0.35;
                    const spiralAngle = scatterProgress * Math.PI * 0.5;

                    return {
                        x: card.x + Math.sin(spiralAngle + i) * 2,
                        y: card.y + Math.cos(spiralAngle + i) * 1,
                        rotation: card.rotation + (Math.random() - 0.5) * 5,
                        scale: card.scale,
                    };
                }));

            } else if (p < 1) {
                // PHASE 3: Settle (1.5s-3s) - Cards snap to final positions
                if (phase !== 'settle') {
                    setPhase('settle');
                }

                const settleProgress = (p - 0.5) / 0.5;
                const eased = 1 - Math.pow(1 - settleProgress, 4); // Smooth ease-out

                // Calculate final positions (bottom of screen, spread out)
                setCardPositions(prev => prev.map((card, i) => {
                    const finalX = (window.innerWidth / (prev.length + 1)) * (i + 1);
                    const finalY = window.innerHeight - 200;

                    return {
                        x: card.x + (finalX - card.x) * eased * 0.1,
                        y: card.y + (finalY - card.y) * eased * 0.1,
                        rotation: card.rotation * (1 - eased),
                        scale: 0.8 + eased * 0.2,
                    };
                }));
            }

            // Update particles
            setParticles(prev => prev
                .map(p => ({
                    ...p,
                    x: p.x + p.vx,
                    y: p.y + p.vy,
                    vx: p.vx * 0.96,
                    vy: p.vy * 0.96 + 0.2, // Slight gravity
                    life: p.life - (1 / 60) / p.maxLife,
                    rotation: p.rotation + p.rotationSpeed,
                }))
                .filter(p => p.life > 0)
            );

            if (p < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setPhase('done');
                onComplete();
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [duration, onComplete, emitParticles, phase, cardPositions]);

    // Canvas particle rendering
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw particles
        particles.forEach(p => {
            const alpha = p.life;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);

            if (p.type === 'spark') {
                // Glowing spark
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
                gradient.addColorStop(0, `hsla(${p.hue}, 100%, 80%, 1)`);
                gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 60%, 0.5)`);
                gradient.addColorStop(1, `hsla(${p.hue}, 100%, 40%, 0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
                ctx.fill();

                // Core
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'trail') {
                // Motion trail
                ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
                ctx.lineWidth = p.size;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-p.vx * 3, -p.vy * 3);
                ctx.stroke();
            }

            ctx.restore();
        });
    }, [particles]);

    if (phase === 'done') return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            pointerEvents: 'none',
            overflow: 'hidden',
        }}>
            {/* Particle canvas */}
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />

            {/* Flash overlay during burst */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 212, 255, 0.3)',
                opacity: phase === 'burst' ? (1 - progress / 0.15) * 0.5 : 0,
                transition: 'opacity 0.1s',
                pointerEvents: 'none',
            }} />

            {/* Animated card silhouettes */}
            {cardPositions.map((card, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        left: card.x,
                        top: card.y,
                        width: 100,
                        height: 150,
                        transform: `translate(-50%, -50%) rotate(${card.rotation}deg) scale(${card.scale})`,
                        background: `linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 100, 200, 0.2))`,
                        border: '2px solid rgba(0, 212, 255, 0.6)',
                        borderRadius: 8,
                        boxShadow: `
                            0 0 20px rgba(0, 212, 255, 0.4),
                            0 0 40px rgba(0, 212, 255, 0.2)
                        `,
                        opacity: phase !== 'done' ? 0.8 : 0,
                        transition: 'opacity 0.3s',
                    }}
                />
            ))}

            {/* Center burst glow */}
            {phase === 'burst' && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 300,
                    height: 300,
                    transform: `translate(-50%, -50%) scale(${1 + progress * 3})`,
                    background: 'radial-gradient(circle, rgba(0, 212, 255, 0.6) 0%, rgba(0, 100, 200, 0.2) 50%, transparent 70%)',
                    opacity: 1 - progress / 0.15,
                    pointerEvents: 'none',
                }} />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK TO MANAGE RETURN BURST STATE
// ─────────────────────────────────────────────────────────────────────────────
export function useReturnBurst() {
    const [showBurst, setShowBurst] = useState(false);
    const [burstComplete, setBurstComplete] = useState(false);

    const handleBurstComplete = () => {
        setShowBurst(false);
        setBurstComplete(true);
    };

    const triggerBurst = () => {
        setShowBurst(true);
        setBurstComplete(false);
    };

    return {
        showBurst,
        burstComplete,
        handleBurstComplete,
        triggerBurst,
        ReturnBurstComponent: showBurst ? (
            <ReturnBurst onComplete={handleBurstComplete} duration={3000} />
        ) : null,
    };
}

export default ReturnBurst;
