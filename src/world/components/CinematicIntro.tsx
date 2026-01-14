// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — 2026 CINEMATIC INTRO v3.0
   PS5-Quality Visual + Premium Cinematic Music Score
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 2026 PREMIUM CINEMATIC AUDIO - Real audio files, not synthesized sounds
// For true PS5/Netflix quality, we use actual recorded audio
// ─────────────────────────────────────────────────────────────────────────────

// Audio file options (all royalty-free):
// 1. Local: /public/audio/cinematic-intro.mp3 (add your own premium audio)
// 2. Mixkit CDN: https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3 (cinematic impact)

const CINEMATIC_AUDIO_URL = '/audio/cinematic-intro.mp3'; // Local file (recommended)
const FALLBACK_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'; // Mixkit fallback

class CinematicAudioPlayer {
    private audio: HTMLAudioElement | null = null;
    private loaded: boolean = false;

    constructor() {
        // Pre-load audio on construction
        if (typeof window !== 'undefined') {
            this.preload();
        }
    }

    private preload() {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.volume = 0.7;

        // Try local file first, fall back to CDN
        this.audio.src = CINEMATIC_AUDIO_URL;

        this.audio.addEventListener('canplaythrough', () => {
            this.loaded = true;
            console.log('[CinematicAudio] Audio loaded successfully');
        });

        this.audio.addEventListener('error', () => {
            console.log('[CinematicAudio] Local audio not found, trying fallback...');
            if (this.audio) {
                this.audio.src = FALLBACK_AUDIO_URL;
            }
        });

        // Force load
        this.audio.load();
    }

    async play() {
        if (!this.audio) {
            this.preload();
        }

        try {
            if (this.audio) {
                this.audio.currentTime = 0;
                await this.audio.play();
                console.log('[CinematicAudio] Playing cinematic intro audio');
            }
        } catch (e) {
            console.log('[CinematicAudio] Playback failed (likely needs user interaction):', e);
        }
    }
}

const cinematicPlayer = new CinematicAudioPlayer();


// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED PARTICLE SYSTEM - GPU-like performance with Canvas 2D
// ─────────────────────────────────────────────────────────────────────────────
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    maxLife: number;
    hue: number;
    brightness: number;
    type: 'spark' | 'glow' | 'streak' | 'dust';
}

function useAdvancedParticles(canvasRef: React.RefObject<HTMLCanvasElement>, phase: string) {
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number>();

    const emit = useCallback((cx: number, cy: number, count: number, type: Particle['type'], config?: Partial<{
        speed: number;
        spread: number;
        hueRange: [number, number];
        life: number;
    }>) => {
        const { speed = 10, spread = Math.PI * 2, hueRange = [180, 220], life = 1 } = config || {};

        for (let i = 0; i < count; i++) {
            const angle = (spread * i / count) - spread / 2 + (Math.random() - 0.5) * 0.3;
            const s = speed * (0.5 + Math.random());

            particlesRef.current.push({
                x: cx + (Math.random() - 0.5) * 20,
                y: cy + (Math.random() - 0.5) * 20,
                vx: Math.cos(angle) * s,
                vy: Math.sin(angle) * s,
                size: type === 'glow' ? 20 + Math.random() * 40 :
                    type === 'streak' ? 1 + Math.random() * 2 :
                        type === 'dust' ? 1 + Math.random() * 3 :
                            2 + Math.random() * 4,
                life: 1,
                maxLife: life * (0.8 + Math.random() * 0.4),
                hue: hueRange[0] + Math.random() * (hueRange[1] - hueRange[0]),
                brightness: 50 + Math.random() * 30,
                type,
            });
        }
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        };
        resize();
        window.addEventListener('resize', resize);

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        // Ambient dust constantly
        let dustInterval: number;
        if (phase !== 'dark') {
            dustInterval = window.setInterval(() => {
                emit(cx, cy, 2, 'dust', { speed: 2, life: 2, hueRange: [190, 210] });
            }, 100);
        }

        let lastTime = performance.now();

        const animate = (currentTime: number) => {
            const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
            lastTime = currentTime;

            // Motion blur effect
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

            particlesRef.current = particlesRef.current.filter(p => {
                p.life -= delta / p.maxLife;
                if (p.life <= 0) return false;

                p.x += p.vx * delta * 60;
                p.y += p.vy * delta * 60;

                // Physics
                if (p.type === 'spark') {
                    p.vy += 15 * delta;
                    p.vx *= 0.99;
                    p.vy *= 0.99;
                } else if (p.type === 'glow') {
                    p.vx *= 0.95;
                    p.vy *= 0.95;
                } else if (p.type === 'streak') {
                    // Keep velocity for trails
                } else {
                    p.vx *= 0.98;
                    p.vy *= 0.98;
                }

                const alpha = Math.pow(p.life, 0.5);
                const size = p.size * (p.type === 'glow' ? (1 - p.life * 0.3) : p.life);

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                if (p.type === 'spark') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.brightness + 20}%, ${alpha})`;
                    ctx.fill();

                    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
                    gradient.addColorStop(0, `hsla(${p.hue}, 100%, ${p.brightness}%, ${alpha * 0.5})`);
                    gradient.addColorStop(1, `hsla(${p.hue}, 100%, ${p.brightness}%, 0)`);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                } else if (p.type === 'glow') {
                    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
                    gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${alpha * 0.6})`);
                    gradient.addColorStop(0.5, `hsla(${p.hue}, 90%, 50%, ${alpha * 0.3})`);
                    gradient.addColorStop(1, `hsla(${p.hue}, 100%, 30%, 0)`);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                } else if (p.type === 'streak') {
                    const length = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 3;
                    const angle = Math.atan2(p.vy, p.vx);

                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - Math.cos(angle) * length, p.y - Math.sin(angle) * length);
                    ctx.strokeStyle = `hsla(${p.hue}, 100%, 80%, ${alpha})`;
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 60%, 80%, ${alpha * 0.5})`;
                    ctx.fill();
                }

                ctx.restore();
                return true;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', resize);
            if (dustInterval) clearInterval(dustInterval);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [phase, emit]);

    return { emit };
}

// ─────────────────────────────────────────────────────────────────────────────
// CINEMATIC RING COMPONENT - Energy ring with glow
// ─────────────────────────────────────────────────────────────────────────────
function EnergyRing({ progress, delay = 0 }: { progress: number; delay?: number }) {
    const adjustedProgress = Math.max(0, Math.min(1, (progress * 1000 - delay) / 800));
    const scale = adjustedProgress * 2.5;
    const opacity = Math.max(0, 1 - adjustedProgress);

    if (adjustedProgress <= 0) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '200px',
            height: '200px',
            marginTop: '-100px',
            marginLeft: '-100px',
            borderRadius: '50%',
            border: '3px solid rgba(0, 200, 255, 0.9)',
            boxShadow: `
                0 0 30px rgba(0, 200, 255, 0.8),
                0 0 60px rgba(0, 200, 255, 0.5),
                0 0 90px rgba(0, 200, 255, 0.3),
                inset 0 0 30px rgba(0, 200, 255, 0.3)
            `,
            transform: `scale(${scale})`,
            opacity,
            pointerEvents: 'none',
        }} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CINEMATIC INTRO COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface CinematicIntroProps {
    onComplete: () => void;
    duration?: number;
}

export function CinematicIntro({ onComplete, duration = 4000 }: CinematicIntroProps) {
    const [phase, setPhase] = useState<'void' | 'charge' | 'impact' | 'expand' | 'reveal' | 'exit'>('void');
    const [progress, setProgress] = useState(0);
    const [screenGlow, setScreenGlow] = useState(0);
    const [logoOpacity, setLogoOpacity] = useState(0);
    const [logoScale, setLogoScale] = useState(0.7);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasStartedRef = useRef(false);
    const startTimeRef = useRef(0);

    const { emit } = useAdvancedParticles(canvasRef, phase);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;
        startTimeRef.current = performance.now();

        // Play the cinematic audio file
        cinematicPlayer.play();

        // Haptic buildup
        if ('vibrate' in navigator) {
            navigator.vibrate([30, 80, 30, 80, 30, 80, 200]);
        }

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        // Animation timeline
        const animate = () => {
            const elapsed = performance.now() - startTimeRef.current;
            const p = elapsed / duration;
            setProgress(p);

            if (p < 0.2) {
                setPhase('charge');
                if (Math.random() < 0.1) {
                    emit(cx, cy, 1, 'dust', { speed: 1, life: 1.5 });
                }
            } else if (p < 0.25) {
                if (phase !== 'impact') {
                    setPhase('impact');
                    setScreenGlow(1);
                    emit(cx, cy, 80, 'spark', { speed: 25, life: 0.8 });
                    emit(cx, cy, 30, 'glow', { speed: 15, life: 1.2 });
                    emit(cx, cy, 50, 'streak', { speed: 35, life: 0.5 });
                    if ('vibrate' in navigator) navigator.vibrate(150);
                }
            } else if (p < 0.6) {
                setPhase('expand');
                setScreenGlow(Math.max(0, screenGlow - 0.03));
                if (Math.random() < 0.15) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 100 + Math.random() * 200;
                    emit(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 3, 'spark', { speed: 8, life: 0.6 });
                }
            } else if (p < 0.85) {
                setPhase('reveal');
                setLogoOpacity(Math.min(1, (p - 0.6) / 0.15));
                setLogoScale(0.7 + (p - 0.6) * 1.2);
            } else {
                setPhase('exit');
                setLogoOpacity(Math.max(0, 1 - (p - 0.85) / 0.15));
            }

            if (p < 1) {
                requestAnimationFrame(animate);
            } else {
                onComplete();
            }
        };

        requestAnimationFrame(animate);
    }, [duration, onComplete, emit, phase, screenGlow]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            zIndex: 10000,
            overflow: 'hidden',
        }}>
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

            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '150vmax',
                height: '150vmax',
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle, 
                    rgba(0, 150, 255, ${0.1 * (1 - Math.abs(progress - 0.25) * 4)}) 0%, 
                    transparent 50%)`,
                pointerEvents: 'none',
            }} />

            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 200, 255, 1)',
                opacity: screenGlow * 0.7,
                transition: 'opacity 0.1s ease-out',
                pointerEvents: 'none',
                mixBlendMode: 'screen',
            }} />

            {phase === 'impact' || phase === 'expand' ? (
                <>
                    <EnergyRing progress={progress - 0.2} delay={0} />
                    <EnergyRing progress={progress - 0.2} delay={80} />
                    <EnergyRing progress={progress - 0.2} delay={160} />
                    <EnergyRing progress={progress - 0.2} delay={240} />
                </>
            ) : null}

            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: phase === 'impact' || phase === 'expand'
                    ? `${Math.min(400, 50 + (progress - 0.2) * 1000)}px`
                    : phase === 'charge'
                        ? `${30 + progress * 100}px`
                        : '0px',
                height: phase === 'impact' || phase === 'expand'
                    ? `${Math.min(400, 50 + (progress - 0.2) * 1000)}px`
                    : phase === 'charge'
                        ? `${30 + progress * 100}px`
                        : '0px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(0,200,255,0.6) 30%, rgba(0,100,200,0.2) 60%, transparent 80%)',
                boxShadow: phase === 'impact'
                    ? '0 0 100px rgba(0,200,255,1), 0 0 200px rgba(0,200,255,0.6)'
                    : '0 0 60px rgba(0,200,255,0.6)',
                opacity: phase === 'reveal' || phase === 'exit' ? 0 : 1,
                transition: 'opacity 0.5s ease-out',
            }} />

            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) scale(${logoScale})`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px',
                opacity: logoOpacity,
                pointerEvents: 'none',
            }}>
                <div style={{
                    fontSize: '140px',
                    color: '#fff',
                    textShadow: `
                        0 0 40px rgba(0,200,255,1),
                        0 0 80px rgba(0,200,255,0.8),
                        0 0 120px rgba(0,200,255,0.5)
                    `,
                    filter: 'drop-shadow(0 0 20px rgba(0,200,255,0.8))',
                }}>
                    ♠
                </div>

                <div style={{
                    fontSize: '64px',
                    fontWeight: 800,
                    letterSpacing: '16px',
                    color: '#fff',
                    textTransform: 'uppercase',
                    textShadow: '0 0 40px rgba(0,200,255,0.8)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                    SMARTER
                </div>

                <div style={{
                    fontSize: '18px',
                    letterSpacing: '10px',
                    color: 'rgba(0,200,255,1)',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    marginTop: '-8px',
                }}>
                    MASTER YOUR GAME
                </div>
            </div>

            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'radial-gradient(circle, transparent 30%, rgba(0,0,0,0.4) 100%)',
                pointerEvents: 'none',
            }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK TO MANAGE INTRO STATE
// ─────────────────────────────────────────────────────────────────────────────
export function useCinematicIntro() {
    const [showIntro, setShowIntro] = useState(true);
    const [introComplete, setIntroComplete] = useState(false);

    const handleIntroComplete = () => {
        setShowIntro(false);
        setIntroComplete(true);
    };

    return {
        showIntro,
        introComplete,
        handleIntroComplete,
        CinematicIntroComponent: showIntro ? (
            <CinematicIntro onComplete={handleIntroComplete} duration={4000} />
        ) : null,
    };
}

export default CinematicIntro;
