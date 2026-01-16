// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — 2026 CINEMATIC INTRO v3.0
   PS5-Quality Visual + Premium Cinematic Music Score
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEngine } from '../../audio/SoundEngine';

// ─────────────────────────────────────────────────────────────────────────────
// GOOSEBUMP ENGINE - Creates spine-tingling, emotional audio
// Not a cheap synth. Not stock audio. Pure emotional impact.
// ─────────────────────────────────────────────────────────────────────────────

class GoosebumpEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private compressor: DynamicsCompressorNode | null = null;

    private init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Professional mastering chain
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -12;
            this.compressor.knee.value = 6;
            this.compressor.ratio.value = 8;
            this.compressor.attack.value = 0.001;
            this.compressor.release.value = 0.1;

            // Limiter stage
            const limiter = this.ctx.createDynamicsCompressor();
            limiter.threshold.value = -3;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.001;
            limiter.release.value = 0.05;

            this.master = this.ctx.createGain();
            this.master.gain.value = 0.85;

            this.master.connect(this.compressor);
            this.compressor.connect(limiter);
            limiter.connect(this.ctx.destination);

            console.log('[GoosebumpEngine] Audio engine initialized');
        } catch (e) {
            console.log('[GoosebumpEngine] Audio not available');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 1: THE VOID - Deep sub-bass that you FEEL in your chest
    // This is the physical foundation - 20-40Hz pure power
    // ═══════════════════════════════════════════════════════════════════════════
    private theVoid(start: number, duration: number) {
        if (!this.ctx || !this.master) return;

        // Ultra-low sine wave - below conscious hearing but you FEEL it
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();

        sub.type = 'sine';
        sub.frequency.setValueAtTime(25, start);
        sub.frequency.exponentialRampToValueAtTime(18, start + duration);

        // Massive swell
        subGain.gain.setValueAtTime(0, start);
        subGain.gain.linearRampToValueAtTime(0.9, start + duration * 0.4);
        subGain.gain.setValueAtTime(0.85, start + duration * 0.6);
        subGain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        sub.connect(subGain);
        subGain.connect(this.master);

        sub.start(start);
        sub.stop(start + duration + 0.5);

        // Second harmonic for warmth
        const warm = this.ctx.createOscillator();
        const warmGain = this.ctx.createGain();

        warm.type = 'sine';
        warm.frequency.setValueAtTime(50, start);
        warm.frequency.exponentialRampToValueAtTime(36, start + duration);

        warmGain.gain.setValueAtTime(0, start);
        warmGain.gain.linearRampToValueAtTime(0.3, start + duration * 0.4);
        warmGain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        warm.connect(warmGain);
        warmGain.connect(this.master);

        warm.start(start);
        warm.stop(start + duration + 0.5);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 2: THE RISE - Tension builder that makes your heart race
    // Filtered noise sweep that builds anticipation
    // ═══════════════════════════════════════════════════════════════════════════
    private theRise(start: number, duration: number) {
        if (!this.ctx || !this.master) return;

        const bufferSize = Math.floor(this.ctx.sampleRate * duration * 1.5);
        const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

        // Pink noise for organic feel
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Bandpass sweep - the tension builder
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 3;
        filter.frequency.setValueAtTime(100, start);
        filter.frequency.exponentialRampToValueAtTime(6000, start + duration * 0.95);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + duration * 0.2);
        gain.gain.linearRampToValueAtTime(0.35, start + duration * 0.8);
        gain.gain.linearRampToValueAtTime(0.5, start + duration * 0.95);
        gain.gain.linearRampToValueAtTime(0, start + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        noise.start(start);
        noise.stop(start + duration + 0.1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 3: THE DROP - The moment of impact that hits you in the chest
    // Layered: sub thump + mid punch + high crack + reverb tail
    // ═══════════════════════════════════════════════════════════════════════════
    private theDrop(start: number, intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        // === SUB THUMP - The physical impact ===
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();

        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(80, start);
        subOsc.frequency.exponentialRampToValueAtTime(30, start + 0.15);
        subOsc.frequency.exponentialRampToValueAtTime(20, start + 0.5);

        subGain.gain.setValueAtTime(0, start);
        subGain.gain.linearRampToValueAtTime(1.0 * intensity, start + 0.005);
        subGain.gain.setValueAtTime(0.8 * intensity, start + 0.1);
        subGain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

        subOsc.connect(subGain);
        subGain.connect(this.master);

        subOsc.start(start);
        subOsc.stop(start + 0.7);

        // === MID PUNCH - The body ===
        const midBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.2), this.ctx.sampleRate);
        const midData = midBuffer.getChannelData(0);
        for (let i = 0; i < midData.length; i++) {
            midData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / midData.length, 5);
        }

        const mid = this.ctx.createBufferSource();
        mid.buffer = midBuffer;

        const midFilter = this.ctx.createBiquadFilter();
        midFilter.type = 'bandpass';
        midFilter.frequency.value = 250;
        midFilter.Q.value = 2;

        const midGain = this.ctx.createGain();
        midGain.gain.value = 0.5 * intensity;

        mid.connect(midFilter);
        midFilter.connect(midGain);
        midGain.connect(this.master);

        mid.start(start);

        // === HIGH CRACK - The attack transient ===
        const crackBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.03), this.ctx.sampleRate);
        const crackData = crackBuffer.getChannelData(0);
        for (let i = 0; i < crackData.length; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackData.length, 12);
        }

        const crack = this.ctx.createBufferSource();
        crack.buffer = crackBuffer;

        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'highpass';
        crackFilter.frequency.value = 3000;

        const crackGain = this.ctx.createGain();
        crackGain.gain.value = 0.4 * intensity;

        crack.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(this.master);

        crack.start(start);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 4: THE BLOOM - Ethereal expansion after the drop
    // Creates that "opening up" feeling - like entering a cathedral
    // ═══════════════════════════════════════════════════════════════════════════
    private theBloom(start: number, duration: number) {
        if (!this.ctx || !this.master) return;

        // Choir-like pad using multiple filtered oscillators
        const frequencies = [
            220,   // A3
            277.18, // C#4
            329.63, // E4
            440,   // A4
            554.37, // C#5
        ];

        frequencies.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const filter = this.ctx!.createBiquadFilter();

            // Use triangle for softer, more ethereal sound
            osc.type = 'triangle';
            osc.frequency.value = freq;

            // Subtle detuning for lush chorus effect
            osc.detune.value = (Math.random() - 0.5) * 15;

            // Lowpass for warmth
            filter.type = 'lowpass';
            filter.frequency.value = 2000;
            filter.Q.value = 0.5;

            // Slow swell - the bloom
            const attackTime = 0.3 + i * 0.05;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.08, start + attackTime);
            gain.gain.setValueAtTime(0.06, start + duration * 0.7);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.master!);

            osc.start(start);
            osc.stop(start + duration + 0.5);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 5: THE SHIMMER - High frequency sparkle for the reveal
    // Like light breaking through clouds
    // ═══════════════════════════════════════════════════════════════════════════
    private theShimmer(start: number, duration: number) {
        if (!this.ctx || !this.master) return;

        // White noise through a very high bandpass
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
        hp.frequency.value = 8000;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 14000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.06, start + 0.3);
        gain.gain.setValueAtTime(0.05, start + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        noise.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(this.master);

        noise.start(start);
        noise.stop(start + duration);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE EXPERIENCE - The complete goosebump journey
    // ═══════════════════════════════════════════════════════════════════════════
    async createGoosebumps() {
        this.init();
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // ─── PHASE 1: ANTICIPATION (0 - 1.0s) ─────────────────────────────
        // You feel something coming... the void opens beneath you
        this.theVoid(t, 1.8);
        this.theRise(t + 0.1, 1.0);

        // ─── PHASE 2: THE DROP (1.0s) ─────────────────────────────────────
        // The moment hits - you feel it in your chest
        this.theDrop(t + 1.0, 1.2);

        // ─── PHASE 3: THE BLOOM (1.1 - 3.0s) ──────────────────────────────
        // The world opens up - beauty and power
        this.theBloom(t + 1.1, 2.5);
        this.theShimmer(t + 1.3, 2.0);

        // ─── PHASE 4: SECONDARY PULSE (2.0s) ──────────────────────────────
        // Reinforcement - the excitement builds
        this.theDrop(t + 2.0, 0.6);

        // ─── PHASE 5: RESOLUTION (2.5 - 4.0s) ─────────────────────────────
        // The final reveal - you've arrived somewhere special
        this.theVoid(t + 2.5, 2.0);
        this.theShimmer(t + 2.7, 1.5);

        console.log('[GoosebumpEngine] Experience triggered');
    }
}

const goosebumpEngine = new GoosebumpEngine();



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

        // Play the cinematic intro audio via SoundEngine
        SoundEngine.play('cinematicIntro');

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
                    SMARTER.POKER
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
// Pass enabled=false to completely skip the intro (no sounds, no visuals)
// ─────────────────────────────────────────────────────────────────────────────
export function useCinematicIntro(enabled: boolean = true) {
    const [showIntro, setShowIntro] = useState(enabled);
    const [introComplete, setIntroComplete] = useState(!enabled);

    const handleIntroComplete = () => {
        setShowIntro(false);
        setIntroComplete(true);
    };

    // If disabled, return null component and completed state
    if (!enabled) {
        return {
            showIntro: false,
            introComplete: true,
            handleIntroComplete,
            CinematicIntroComponent: null,
        };
    }

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
