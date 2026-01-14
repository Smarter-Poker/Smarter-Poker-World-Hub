// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — EPIC CINEMATIC INTRO
   Full-screen explosions, particle storms, and cinematic music
   THE USER MUST BE EXCITED TO ENTER
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// EPIC MUSIC COMPOSER - Cinematic orchestral-style music
// ─────────────────────────────────────────────────────────────────────────────
class EpicMusicComposer {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private compressor: DynamicsCompressorNode | null = null;

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.compressor = this.ctx.createDynamicsCompressor();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.compressor);
            this.compressor.connect(this.ctx.destination);
            this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        } catch (e) {
            console.log('Audio not available');
        }
    }

    private playNote(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol: number = 0.2) {
        if (!this.ctx || !this.masterGain) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.setValueAtTime(vol * 0.8, start + dur * 0.7);
        gain.gain.linearRampToValueAtTime(0, start + dur);

        osc.start(start);
        osc.stop(start + dur + 0.1);
    }

    private playChord(freqs: number[], start: number, dur: number, type: OscillatorType = 'sine', vol: number = 0.1) {
        freqs.forEach(f => this.playNote(f, start, dur, type, vol));
    }

    playEpicIntro() {
        this.init();
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // ══════════════════════════════════════════════════════════════════
        // PHASE 1: THE VOID AWAKENS (0-1s) - Deep rumble, anticipation
        // ══════════════════════════════════════════════════════════════════
        this.playNote(27.5, t, 2, 'sine', 0.4);  // Sub bass A0
        this.playNote(55, t + 0.3, 1.5, 'sine', 0.25); // A1
        this.playChord([110, 165, 220], t + 0.5, 1.2, 'triangle', 0.08); // Am chord rising

        // ══════════════════════════════════════════════════════════════════
        // PHASE 2: THE EXPLOSION (1-1.5s) - MASSIVE IMPACT
        // ══════════════════════════════════════════════════════════════════
        // Impact bass
        this.playNote(30, t + 1, 0.4, 'sawtooth', 0.5);
        this.playNote(60, t + 1, 0.3, 'square', 0.3);

        // Power chord explosion
        this.playChord([110, 165, 220, 330], t + 1, 0.6, 'sawtooth', 0.2);

        // White noise burst for impact
        if (this.ctx && this.masterGain) {
            const bufferSize = this.ctx.sampleRate * 0.15;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const noiseGain = this.ctx.createGain();
            noise.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            noiseGain.gain.setValueAtTime(0.4, t + 1);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 1.15);
            noise.start(t + 1);
        }

        // ══════════════════════════════════════════════════════════════════
        // PHASE 3: THE REVELATION (1.5-2.5s) - Epic rising melody
        // ══════════════════════════════════════════════════════════════════
        // Rising melodic phrase
        const melody = [220, 262, 330, 392, 440, 523];
        melody.forEach((freq, i) => {
            this.playNote(freq, t + 1.5 + i * 0.12, 0.25, 'triangle', 0.15);
        });

        // Sustained power chord
        this.playChord([110, 220, 330, 440], t + 1.8, 1, 'sine', 0.12);

        // ══════════════════════════════════════════════════════════════════
        // PHASE 4: THE TRIUMPH (2.5-3.5s) - Glorious resolution
        // ══════════════════════════════════════════════════════════════════
        // Major chord resolution (A major)
        this.playChord([110, 138.59, 165, 220, 277.18, 330], t + 2.5, 1.2, 'sine', 0.1);

        // Shimmering high notes
        [880, 1100, 1320, 1760].forEach((f, i) => {
            this.playNote(f, t + 2.6 + i * 0.08, 0.5, 'sine', 0.06);
        });

        // Final bass note
        this.playNote(55, t + 2.5, 1.5, 'sine', 0.3);
    }
}

const musicComposer = new EpicMusicComposer();

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE EXPLOSION SYSTEM - Canvas-based for maximum performance
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
    type: 'spark' | 'ember' | 'trail';
}

function useParticleExplosion(canvasRef: React.RefObject<HTMLCanvasElement>, active: boolean) {
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number>();

    const createExplosion = useCallback((cx: number, cy: number, count: number, type: 'spark' | 'ember' | 'trail' = 'spark') => {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
            const speed = type === 'spark' ? 8 + Math.random() * 15 :
                type === 'ember' ? 2 + Math.random() * 5 :
                    4 + Math.random() * 8;

            particlesRef.current.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: type === 'spark' ? 2 + Math.random() * 4 :
                    type === 'ember' ? 4 + Math.random() * 8 :
                        1 + Math.random() * 2,
                life: 1,
                maxLife: type === 'spark' ? 0.5 + Math.random() * 0.5 :
                    type === 'ember' ? 1 + Math.random() * 1 :
                        0.3 + Math.random() * 0.3,
                hue: 180 + Math.random() * 40, // Cyan to blue range
                type,
            });
        }
    }, []);

    useEffect(() => {
        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Initial massive explosion at 1 second
        setTimeout(() => {
            createExplosion(cx, cy, 200, 'spark');
            createExplosion(cx, cy, 50, 'ember');
        }, 1000);

        // Secondary wave at 1.3 seconds
        setTimeout(() => {
            createExplosion(cx, cy, 150, 'spark');
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8;
                const dist = 150;
                createExplosion(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 30, 'spark');
            }
        }, 1300);

        // Third wave - ring explosion at 1.6 seconds
        setTimeout(() => {
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12;
                const dist = 250;
                createExplosion(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 20, 'ember');
            }
        }, 1600);

        let lastTime = performance.now();

        const animate = (currentTime: number) => {
            const delta = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            particlesRef.current = particlesRef.current.filter(p => {
                p.life -= delta / p.maxLife;
                if (p.life <= 0) return false;

                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5; // Gravity
                p.vx *= 0.98; // Drag
                p.vy *= 0.98;

                const alpha = p.life;
                const size = p.size * p.life;

                if (p.type === 'spark') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
                    ctx.fill();

                    // Glow
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 100%, 50%, ${alpha * 0.3})`;
                    ctx.fill();
                } else if (p.type === 'ember') {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
                    gradient.addColorStop(0, `hsla(${p.hue}, 100%, 80%, ${alpha})`);
                    gradient.addColorStop(1, `hsla(${p.hue}, 100%, 40%, 0)`);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
                    ctx.strokeStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
                    ctx.lineWidth = size;
                    ctx.stroke();
                }

                return true;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [active, createExplosion]);

    return { createExplosion };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOCKWAVE EFFECT
// ─────────────────────────────────────────────────────────────────────────────
function Shockwave({ delay, duration }: { delay: number; duration: number }) {
    const [scale, setScale] = useState(0);
    const [opacity, setOpacity] = useState(0);

    useEffect(() => {
        const startTime = Date.now() + delay;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < 0) {
                requestAnimationFrame(animate);
                return;
            }

            const progress = Math.min(elapsed / duration, 1);
            setScale(progress * 3);
            setOpacity(1 - progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [delay, duration]);

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
            border: '4px solid rgba(0, 212, 255, 0.8)',
            boxShadow: '0 0 60px rgba(0, 212, 255, 0.6), inset 0 0 40px rgba(0, 212, 255, 0.3)',
            transform: `scale(${scale})`,
            opacity,
            pointerEvents: 'none',
        }} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EPIC CINEMATIC INTRO COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface CinematicIntroProps {
    onComplete: () => void;
    duration?: number;
}

export function CinematicIntro({ onComplete, duration = 3500 }: CinematicIntroProps) {
    const [phase, setPhase] = useState<'dark' | 'charge' | 'explode' | 'reveal' | 'exit'>('dark');
    const [showShockwaves, setShowShockwaves] = useState(false);
    const [screenFlash, setScreenFlash] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasStartedRef = useRef(false);

    useParticleExplosion(canvasRef, phase !== 'dark');

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        // Play epic music
        musicComposer.playEpicIntro();

        // Haptic feedback
        if ('vibrate' in navigator) {
            navigator.vibrate([50, 100, 50, 100, 200]);
        }

        // Timeline
        setTimeout(() => setPhase('charge'), 200);
        setTimeout(() => {
            setPhase('explode');
            setShowShockwaves(true);
            setScreenFlash(1);
            setTimeout(() => setScreenFlash(0), 150);
            if ('vibrate' in navigator) navigator.vibrate([200, 50, 100]);
        }, 1000);
        setTimeout(() => setPhase('reveal'), 2000);
        setTimeout(() => {
            setPhase('exit');
            setTimeout(onComplete, 500);
        }, duration);
    }, [duration, onComplete]);

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
            opacity: phase === 'exit' ? 0 : 1,
            transition: 'opacity 0.5s ease-out',
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

            {/* Screen flash */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: '#00d4ff',
                opacity: screenFlash,
                transition: 'opacity 0.15s ease-out',
                pointerEvents: 'none',
            }} />

            {/* Shockwaves */}
            {showShockwaves && (
                <>
                    <Shockwave delay={0} duration={800} />
                    <Shockwave delay={100} duration={900} />
                    <Shockwave delay={200} duration={1000} />
                </>
            )}

            {/* Central energy core */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: phase === 'explode' || phase === 'reveal' ? '600px' : phase === 'charge' ? '100px' : '20px',
                height: phase === 'explode' || phase === 'reveal' ? '600px' : phase === 'charge' ? '100px' : '20px',
                borderRadius: '50%',
                background: phase === 'explode'
                    ? 'radial-gradient(circle, rgba(0,212,255,0.8) 0%, rgba(0,100,200,0.4) 40%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(0,212,255,0.6) 0%, transparent 70%)',
                boxShadow: phase === 'charge' || phase === 'explode'
                    ? '0 0 100px rgba(0,212,255,0.8), 0 0 200px rgba(0,212,255,0.4)'
                    : 'none',
                transition: phase === 'explode'
                    ? 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    : 'all 0.8s ease-out',
                opacity: phase === 'reveal' || phase === 'exit' ? 0 : 1,
            }} />

            {/* Logo reveal */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                opacity: phase === 'reveal' || phase === 'exit' ? 1 : 0,
                transition: 'opacity 0.8s ease-out',
            }}>
                <div style={{
                    fontSize: '120px',
                    color: '#00d4ff',
                    textShadow: '0 0 60px rgba(0,212,255,0.8), 0 0 120px rgba(0,212,255,0.4)',
                    animation: phase === 'reveal' ? 'pulse 1s ease-in-out infinite' : 'none',
                }}>
                    ♠
                </div>
                <div style={{
                    fontSize: '56px',
                    fontWeight: 800,
                    letterSpacing: '12px',
                    color: '#fff',
                    textTransform: 'uppercase',
                    textShadow: '0 0 40px rgba(0,212,255,0.6)',
                }}>
                    SMARTER
                </div>
                <div style={{
                    fontSize: '20px',
                    letterSpacing: '8px',
                    color: 'rgba(0,212,255,0.9)',
                    textTransform: 'uppercase',
                }}>
                    MASTER YOUR GAME
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `}</style>
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
            <CinematicIntro onComplete={handleIntroComplete} duration={3500} />
        ) : null,
    };
}

export default CinematicIntro;
