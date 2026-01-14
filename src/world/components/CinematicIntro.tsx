// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — 2026 CINEMATIC INTRO v3.0
   PS5-Quality Visual + Premium Cinematic Music Score
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 2026 PREMIUM CINEMATIC SCORE - Not sound effects, actual MUSIC
// Warm analog pads + brass power + epic strings + atmospheric depth
// ─────────────────────────────────────────────────────────────────────────────
class CinematicMusicScore {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private reverb: ConvolverNode | null = null;
    private reverbGain: GainNode | null = null;

    async init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Create lush reverb for cinematic depth
            this.reverb = this.ctx.createConvolver();
            this.reverb.buffer = await this.createReverbImpulse(3, 3);

            this.reverbGain = this.ctx.createGain();
            this.reverbGain.gain.value = 0.4;

            // Master with subtle compression
            const compressor = this.ctx.createDynamicsCompressor();
            compressor.threshold.value = -18;
            compressor.knee.value = 20;
            compressor.ratio.value = 4;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            this.master = this.ctx.createGain();
            this.master.gain.value = 0.7;

            // Signal flow
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(compressor);
            this.master.connect(compressor);
            this.master.connect(this.reverb);
            compressor.connect(this.ctx.destination);
        } catch (e) {
            console.log('Audio not available');
        }
    }

    // Generate reverb impulse response
    private async createReverbImpulse(duration: number, decay: number): Promise<AudioBuffer> {
        const length = this.ctx!.sampleRate * duration;
        const buffer = this.ctx!.createBuffer(2, length, this.ctx!.sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return buffer;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WARM ANALOG PAD - The foundation of the cinematic sound
    // Uses multiple detuned oscillators for analog warmth
    // ═══════════════════════════════════════════════════════════════════════════
    private playWarmPad(notes: number[], start: number, duration: number, vol: number = 0.15) {
        if (!this.ctx || !this.master) return;

        notes.forEach((freq, idx) => {
            // Each note has 3 oscillators for warmth
            for (let layer = 0; layer < 3; layer++) {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                const filter = this.ctx!.createBiquadFilter();

                // Alternate between sine and triangle for richness
                osc.type = layer === 0 ? 'sine' : 'triangle';
                osc.frequency.value = freq;

                // Subtle detuning for analog feel (±5 cents per layer)
                osc.detune.value = (layer - 1) * 7 + (Math.random() - 0.5) * 4;

                // Warm lowpass filter
                filter.type = 'lowpass';
                filter.frequency.value = 1200 + idx * 200;
                filter.Q.value = 0.5;

                // Slow attack for lush swell
                const attackTime = 0.4 + idx * 0.1;
                const releaseTime = 0.6;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(vol / 3, start + attackTime);
                gain.gain.setValueAtTime(vol / 3 * 0.8, start + duration - releaseTime);
                gain.gain.linearRampToValueAtTime(0, start + duration);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.master!);

                osc.start(start);
                osc.stop(start + duration + 0.5);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BRASS POWER STAB - The epic impact moment
    // Aggressive sawtooth with quick attack, brass-like timbre
    // ═══════════════════════════════════════════════════════════════════════════
    private playBrassStab(notes: number[], start: number, duration: number, vol: number = 0.25) {
        if (!this.ctx || !this.master) return;

        notes.forEach((freq, idx) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const filter = this.ctx!.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.value = freq;

            // Brass-like filter sweep
            filter.type = 'lowpass';
            filter.Q.value = 2;
            filter.frequency.setValueAtTime(800, start);
            filter.frequency.linearRampToValueAtTime(3000, start + 0.05);
            filter.frequency.linearRampToValueAtTime(1500, start + duration);

            // Quick attack, medium decay
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.02);
            gain.gain.setValueAtTime(vol * 0.7, start + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.master!);

            osc.start(start);
            osc.stop(start + duration + 0.1);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUB BASS - Physical rumble foundation
    // ═══════════════════════════════════════════════════════════════════════════
    private playSub(freq: number, start: number, duration: number, vol: number = 0.5) {
        if (!this.ctx || !this.master) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, start + duration);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.setValueAtTime(vol * 0.7, start + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        gain.connect(this.master);

        osc.start(start);
        osc.stop(start + duration + 0.1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CINEMATIC RISER - Building tension with filtered noise sweep
    // ═══════════════════════════════════════════════════════════════════════════
    private playRiser(start: number, duration: number, vol: number = 0.2) {
        if (!this.ctx || !this.master) return;

        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

        // Pink noise for smoother sweep
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

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 2;
        filter.frequency.setValueAtTime(150, start);
        filter.frequency.exponentialRampToValueAtTime(8000, start + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol * 0.3, start + duration * 0.3);
        gain.gain.linearRampToValueAtTime(vol, start + duration * 0.9);
        gain.gain.linearRampToValueAtTime(0, start + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        noise.start(start);
        noise.stop(start + duration);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IMPACT HIT - The big moment with layered transients
    // ═══════════════════════════════════════════════════════════════════════════
    private playImpact(start: number, intensity: number = 1) {
        if (!this.ctx || !this.master) return;

        // Layer 1: Sub thump
        this.playSub(55, start, 0.6, 0.6 * intensity);

        // Layer 2: Mid punch
        const midBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.15), this.ctx.sampleRate);
        const midData = midBuffer.getChannelData(0);
        for (let i = 0; i < midData.length; i++) {
            midData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / midData.length, 4);
        }

        const mid = this.ctx.createBufferSource();
        mid.buffer = midBuffer;

        const midFilter = this.ctx.createBiquadFilter();
        midFilter.type = 'bandpass';
        midFilter.frequency.value = 300;
        midFilter.Q.value = 1.5;

        const midGain = this.ctx.createGain();
        midGain.gain.value = 0.4 * intensity;

        mid.connect(midFilter);
        midFilter.connect(midGain);
        midGain.connect(this.master);
        mid.start(start);

        // Layer 3: High transient crack
        const crackBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.04), this.ctx.sampleRate);
        const crackData = crackBuffer.getChannelData(0);
        for (let i = 0; i < crackData.length; i++) {
            crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackData.length, 8);
        }

        const crack = this.ctx.createBufferSource();
        crack.buffer = crackBuffer;

        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'highpass';
        crackFilter.frequency.value = 2000;

        const crackGain = this.ctx.createGain();
        crackGain.gain.value = 0.35 * intensity;

        crack.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(this.master);
        crack.start(start);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SHIMMER - Ethereal high-frequency sparkle for reveals
    // ═══════════════════════════════════════════════════════════════════════════
    private playShimmer(start: number, duration: number, vol: number = 0.1) {
        if (!this.ctx || !this.master) return;

        // Multiple high sine waves with slight modulation
        const baseFreqs = [2637, 3520, 4186, 5274, 6272]; // High harmonics

        baseFreqs.forEach((freq, i) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            // Subtle vibrato
            const lfo = this.ctx!.createOscillator();
            const lfoGain = this.ctx!.createGain();
            lfo.frequency.value = 4 + i;
            lfoGain.gain.value = 10;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start(start);
            lfo.stop(start + duration);

            // Staggered entry
            const entryDelay = i * 0.08;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol / baseFreqs.length, start + entryDelay + 0.2);
            gain.gain.setValueAtTime(vol / baseFreqs.length * 0.7, start + duration * 0.7);
            gain.gain.linearRampToValueAtTime(0, start + duration);

            osc.connect(gain);
            gain.connect(this.master!);

            osc.start(start + entryDelay);
            osc.stop(start + duration);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // THE 2026 CINEMATIC SCORE - 4-act structure matching the visual
    // ═══════════════════════════════════════════════════════════════════════════
    async playCinematicScore() {
        await this.init();
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // Note frequencies (A minor scale - cinematic and powerful)
        const A2 = 110, C3 = 130.81, E3 = 164.81, G3 = 196;
        const A3 = 220, C4 = 261.63, E4 = 329.63, G4 = 392;
        const A4 = 440, C5 = 523.25, E5 = 659.25;

        // ═══════════════════════════════════════════════════════════════════
        // ACT 1: THE AWAKENING (0 - 0.8s) - Deep, mysterious build
        // ═══════════════════════════════════════════════════════════════════
        this.playSub(A2 / 2, t, 1.5, 0.4);                    // Ultra-low foundation
        this.playWarmPad([A2, E3], t + 0.1, 1.5, 0.12);       // Ominous fifth interval
        this.playRiser(t, 0.85, 0.15);                         // Building tension

        // ═══════════════════════════════════════════════════════════════════
        // ACT 2: THE IMPACT (0.8s) - Massive cinematic hit
        // ═══════════════════════════════════════════════════════════════════
        this.playImpact(t + 0.8, 1.2);                         // The big hit
        this.playBrassStab([A2, E3, A3], t + 0.8, 0.4, 0.3);  // Power chord stab

        // ═══════════════════════════════════════════════════════════════════
        // ACT 3: THE EXPANSION (1.0 - 2.5s) - Epic spreading power
        // ═══════════════════════════════════════════════════════════════════
        this.playWarmPad([A2, C3, E3, A3], t + 1.0, 2.0, 0.2);  // Full Am chord
        this.playRiser(t + 1.0, 1.0, 0.12);                      // Secondary rise
        this.playSub(A2, t + 1.2, 1.5, 0.35);                    // Sustained bass

        // Rising melodic motion
        this.playBrassStab([E4], t + 1.5, 0.25, 0.15);
        this.playBrassStab([G4], t + 1.75, 0.25, 0.15);
        this.playBrassStab([A4], t + 2.0, 0.4, 0.2);

        // ═══════════════════════════════════════════════════════════════════
        // ACT 4: THE REVELATION (2.5 - 4s) - Triumphant resolution
        // ═══════════════════════════════════════════════════════════════════
        this.playImpact(t + 2.4, 0.8);                           // Arrival hit
        this.playWarmPad([A2, C3, E3, G3, A3], t + 2.5, 2.0, 0.25); // Rich chord
        this.playBrassStab([A3, C4, E4], t + 2.5, 0.8, 0.2);    // Major resolution feel
        this.playShimmer(t + 2.6, 1.8, 0.12);                    // Sparkle on logo
        this.playSub(A2 / 2, t + 2.5, 2.0, 0.35);               // Final foundation

        // Triumphant high note
        this.playBrassStab([A4, E5], t + 3.0, 1.2, 0.15);
    }
}

const musicScore = new CinematicMusicScore();

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

        // Play the cinematic score
        musicScore.playCinematicScore();

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
