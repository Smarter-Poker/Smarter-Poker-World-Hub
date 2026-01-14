// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — 2026 CINEMATIC INTRO
   PS5-Quality Full-Screen Experience with Modern Sound Design
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 2026 CINEMATIC SOUND DESIGN - Pure texture, zero melody
// No 8-bit oscillator music. Just: whoosh, impact, rumble, shimmer.
// ─────────────────────────────────────────────────────────────────────────────
class CinematicSoundDesign {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private compressor: DynamicsCompressorNode | null = null;

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Master bus with compression for punch
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -24;
            this.compressor.knee.value = 12;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.15;

            this.master = this.ctx.createGain();
            this.master.gain.value = 0.8;

            this.master.connect(this.compressor);
            this.compressor.connect(this.ctx.destination);
        } catch (e) {
            console.log('Audio not available');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXTURE 1: Filtered noise whoosh (the sweep/breath sound)
    // ═══════════════════════════════════════════════════════════════════════
    private whoosh(start: number, duration: number, direction: 'up' | 'down', intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

        // Stereo pink-ish noise
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99765 * b0 + white * 0.0990460;
                b1 = 0.96300 * b1 + white * 0.2965164;
                b2 = 0.57000 * b2 + white * 1.0526913;
                data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
            }
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Bandpass filter for sweep
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.5;

        const startFreq = direction === 'up' ? 200 : 4000;
        const endFreq = direction === 'up' ? 4000 : 200;
        filter.frequency.setValueAtTime(startFreq, start);
        filter.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

        // Volume envelope
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25 * intensity, start + duration * 0.15);
        gain.gain.setValueAtTime(0.2 * intensity, start + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        noise.start(start);
        noise.stop(start + duration);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXTURE 2: Sub bass thump (the physical rumble you feel)
    // ═══════════════════════════════════════════════════════════════════════
    private subThump(start: number, intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, start);
        osc.frequency.exponentialRampToValueAtTime(25, start + 0.4);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.7 * intensity, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

        osc.connect(gain);
        gain.connect(this.master);

        osc.start(start);
        osc.stop(start + 0.6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXTURE 3: Transient click/crack (the initial attack of impacts)
    // ═══════════════════════════════════════════════════════════════════════
    private transient(start: number, intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        // Short noise burst
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // Sharp exponential decay
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Highpass to keep it punchy
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 800;
        hp.Q.value = 0.7;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.5 * intensity;

        noise.connect(hp);
        hp.connect(gain);
        gain.connect(this.master);

        noise.start(start);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXTURE 4: Cinematic impact (sub + transient + body)
    // ═══════════════════════════════════════════════════════════════════════
    private impact(start: number, intensity: number = 1) {
        this.subThump(start, intensity);
        this.transient(start, intensity);

        // Mid-range body
        if (!this.ctx || !this.master) return;

        const bodyBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.2), this.ctx.sampleRate);
        const bodyData = bodyBuffer.getChannelData(0);
        for (let i = 0; i < bodyData.length; i++) {
            bodyData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bodyBuffer.length, 3);
        }

        const body = this.ctx.createBufferSource();
        body.buffer = bodyBuffer;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 400;
        bp.Q.value = 1;

        const bodyGain = this.ctx.createGain();
        bodyGain.gain.value = 0.3 * intensity;

        body.connect(bp);
        bp.connect(bodyGain);
        bodyGain.connect(this.master);

        body.start(start);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEXTURE 5: Air shimmer (subtle high-frequency texture for reveals)
    // ═══════════════════════════════════════════════════════════════════════
    private shimmer(start: number, duration: number, intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 12000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08 * intensity, start + duration * 0.3);
        gain.gain.setValueAtTime(0.06 * intensity, start + duration * 0.7);
        gain.gain.linearRampToValueAtTime(0, start + duration);

        noise.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(this.master);

        noise.start(start);
        noise.stop(start + duration);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // THE 2026 INTRO SEQUENCE - Tension → Impact → Release
    // ═══════════════════════════════════════════════════════════════════════
    play2026Intro() {
        this.init();
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // ─── ACT 1: TENSION (0 - 0.8s) ───────────────────────────────────
        // Building anticipation with breath and rumble
        this.whoosh(t, 0.9, 'up', 0.6);
        this.subThump(t + 0.1, 0.3); // Subtle low rumble

        // ─── ACT 2: IMPACT (0.8s) ────────────────────────────────────────
        // The big hit - this is the moment
        this.impact(t + 0.8, 1.3);
        this.whoosh(t + 0.8, 0.4, 'down', 0.8);

        // ─── ACT 3: EXPANSION (1.0 - 2.5s) ───────────────────────────────
        // Release and spread - the energy radiates outward
        this.whoosh(t + 1.0, 1.5, 'up', 0.5);
        this.shimmer(t + 1.2, 2.0, 0.8);

        // Secondary smaller impact for punch
        this.impact(t + 1.3, 0.5);

        // ─── ACT 4: ARRIVAL (2.5 - 4s) ───────────────────────────────────
        // The logo reveal moment - subtle and confident
        this.impact(t + 2.4, 0.7);
        this.shimmer(t + 2.5, 1.8, 1.0);
        this.whoosh(t + 2.6, 1.5, 'up', 0.3);

        // Final sub bass anchor
        this.subThump(t + 2.5, 0.6);
    }
}

const soundDesigner = new CinematicSoundDesign();

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
                    p.vy += 15 * delta; // Gravity
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
                    // Core
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.brightness + 20}%, ${alpha})`;
                    ctx.fill();

                    // Outer glow
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

        // Play modern sound
        soundDesigner.play2026Intro();

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
                // VOID phase - subtle buildup
                setPhase('charge');
                if (Math.random() < 0.1) {
                    emit(cx, cy, 1, 'dust', { speed: 1, life: 1.5 });
                }
            } else if (p < 0.25) {
                // IMPACT
                if (phase !== 'impact') {
                    setPhase('impact');
                    setScreenGlow(1);
                    emit(cx, cy, 80, 'spark', { speed: 25, life: 0.8 });
                    emit(cx, cy, 30, 'glow', { speed: 15, life: 1.2 });
                    emit(cx, cy, 50, 'streak', { speed: 35, life: 0.5 });
                    if ('vibrate' in navigator) navigator.vibrate(150);
                }
            } else if (p < 0.6) {
                // EXPAND
                setPhase('expand');
                setScreenGlow(Math.max(0, screenGlow - 0.03));
                if (Math.random() < 0.15) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 100 + Math.random() * 200;
                    emit(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 3, 'spark', { speed: 8, life: 0.6 });
                }
            } else if (p < 0.85) {
                // REVEAL
                setPhase('reveal');
                setLogoOpacity(Math.min(1, (p - 0.6) / 0.15));
                setLogoScale(0.7 + (p - 0.6) * 1.2);
            } else {
                // EXIT
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

            {/* Radial gradient background pulse */}
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

            {/* Screen flash on impact */}
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

            {/* Energy rings */}
            {phase === 'impact' || phase === 'expand' ? (
                <>
                    <EnergyRing progress={progress - 0.2} delay={0} />
                    <EnergyRing progress={progress - 0.2} delay={80} />
                    <EnergyRing progress={progress - 0.2} delay={160} />
                    <EnergyRing progress={progress - 0.2} delay={240} />
                </>
            ) : null}

            {/* Central energy core */}
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

            {/* Logo reveal */}
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
                {/* Spade icon */}
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

                {/* Brand name */}
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

                {/* Tagline */}
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

            {/* Vignette overlay */}
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
