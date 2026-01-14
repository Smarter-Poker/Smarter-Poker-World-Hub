// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — CINEMATIC LAUNCH ANIMATION
   Premium AAA-game intro with particles, shockwaves, and cinematic audio
   Duration: 2.5 seconds for full "WOW" impact
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useEffect, useState, useMemo } from 'react';
import { useSpring, animated, config } from '@react-spring/three';
import { useFrame } from '@react-three/fiber';
import { SoundEngine } from '../../audio/SoundEngine';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// CINEMATIC AUDIO ENGINE - Epic soundtrack + layered sound design
// ─────────────────────────────────────────────────────────────────────────────
class CinematicAudioEngine {
    private audioContext: AudioContext | null = null;

    private getContext(): AudioContext | null {
        if (!this.audioContext && typeof window !== 'undefined') {
            try {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.log('Audio not supported');
            }
        }
        return this.audioContext;
    }

    // Epic cinematic intro - building tension + release
    playCinematicIntro() {
        const ctx = this.getContext();
        if (!ctx) return;

        // Layer 1: Deep bass drone (builds tension)
        const bassDrone = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassDrone.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassDrone.type = 'sine';
        bassDrone.frequency.setValueAtTime(40, ctx.currentTime);
        bassDrone.frequency.linearRampToValueAtTime(60, ctx.currentTime + 1.5);
        bassGain.gain.setValueAtTime(0.3, ctx.currentTime);
        bassGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);
        bassGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
        bassDrone.start(ctx.currentTime);
        bassDrone.stop(ctx.currentTime + 2.5);

        // Layer 2: Rising synth sweep
        const synth = ctx.createOscillator();
        const synthGain = ctx.createGain();
        synth.connect(synthGain);
        synthGain.connect(ctx.destination);
        synth.type = 'sawtooth';
        synth.frequency.setValueAtTime(200, ctx.currentTime);
        synth.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1.5);
        synth.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 2.5);
        synthGain.gain.setValueAtTime(0.05, ctx.currentTime);
        synthGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 1.2);
        synthGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
        synth.start(ctx.currentTime);
        synth.stop(ctx.currentTime + 2.5);

        // Layer 3: Impact hit at 1.2s (the "BOOM")
        setTimeout(() => {
            this.playImpactHit();
        }, 1200);

        // Layer 4: Whoosh at 1.4s (cards flying)
        setTimeout(() => {
            this.playWhoosh();
        }, 1400);
    }

    // Heavy impact hit - the "BOOM" moment
    private playImpactHit() {
        const ctx = this.getContext();
        if (!ctx) return;

        // Sub bass impact
        const impact = ctx.createOscillator();
        const impactGain = ctx.createGain();
        impact.connect(impactGain);
        impactGain.connect(ctx.destination);
        impact.type = 'sine';
        impact.frequency.setValueAtTime(80, ctx.currentTime);
        impact.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.3);
        impactGain.gain.setValueAtTime(0.6, ctx.currentTime);
        impactGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        impact.start(ctx.currentTime);
        impact.stop(ctx.currentTime + 0.4);

        // White noise burst for "crack"
        const bufferSize = ctx.sampleRate * 0.1;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        noise.start(ctx.currentTime);
    }

    // Whoosh for flying cards
    private playWhoosh() {
        const ctx = this.getContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    }

    // Final flourish - shimmering finish
    playFinish() {
        const ctx = this.getContext();
        if (!ctx) return;

        // Shimmering high notes
        [1200, 1500, 1800, 2000].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.05 + 0.3);
            osc.start(ctx.currentTime + i * 0.05);
            osc.stop(ctx.currentTime + i * 0.05 + 0.3);
        });
    }
}

const audioEngine = new CinematicAudioEngine();

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC ENGINE - Cinematic vibration patterns
// ─────────────────────────────────────────────────────────────────────────────
const hapticEngine = {
    // Building rumble pattern
    buildUp() {
        if ('vibrate' in navigator) {
            navigator.vibrate([30, 100, 50, 100, 80, 100, 100]);
        }
    },
    // Heavy impact
    impact() {
        if ('vibrate' in navigator) {
            navigator.vibrate([150, 50, 100]);
        }
    },
    // Cards flying flutter
    flutter() {
        if ('vibrate' in navigator) {
            navigator.vibrate([20, 30, 20, 30, 20]);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE BURST SYSTEM - Cinematic spark explosion
// ─────────────────────────────────────────────────────────────────────────────
function ParticleExplosion({ active, count = 120 }: { active: boolean; count?: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const particlesRef = useRef<{
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        life: number;
        maxLife: number;
        size: number;
    }[]>([]);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const [initialized, setInitialized] = useState(false);

    // Initialize particles on activation
    useEffect(() => {
        if (active && !initialized) {
            const particles = [];
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
                const speed = 4 + Math.random() * 8;
                const upward = (Math.random() - 0.3) * 3;

                particles.push({
                    position: new THREE.Vector3(0, 0, 0),
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * speed,
                        upward,
                        Math.sin(angle) * speed * 0.5
                    ),
                    life: 1,
                    maxLife: 0.6 + Math.random() * 0.6,
                    size: 0.03 + Math.random() * 0.08,
                });
            }
            particlesRef.current = particles;
            setInitialized(true);
        }
    }, [active, count, initialized]);

    // Animate particles
    useFrame((_, delta) => {
        if (!meshRef.current || !active || !initialized) return;

        particlesRef.current.forEach((particle, i) => {
            if (particle.life > 0) {
                particle.position.add(particle.velocity.clone().multiplyScalar(delta));
                particle.velocity.y -= delta * 4; // gravity
                particle.velocity.multiplyScalar(0.98); // drag
                particle.life -= delta / particle.maxLife;

                dummy.position.copy(particle.position);
                const scale = particle.size * Math.max(0, particle.life * 1.5);
                dummy.scale.setScalar(scale);
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.scale.setScalar(0);
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(i, dummy.matrix);
            }
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    if (!active) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.9} />
        </instancedMesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOCKWAVE RING - Expanding cinematic ring
// ─────────────────────────────────────────────────────────────────────────────
function ShockwaveRing({ active, delay = 0 }: { active: boolean; delay?: number }) {
    const ringRef = useRef<THREE.Mesh>(null);
    const [started, setStarted] = useState(false);
    const startTimeRef = useRef(0);

    useEffect(() => {
        if (active && !started) {
            const timer = setTimeout(() => {
                setStarted(true);
                startTimeRef.current = Date.now();
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [active, started, delay]);

    useFrame(() => {
        if (!ringRef.current || !started) return;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const duration = 1.0;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth expansion with easing
        const eased = 1 - Math.pow(1 - progress, 3);
        const scale = 0.5 + eased * 20;
        ringRef.current.scale.setScalar(scale);

        const material = ringRef.current.material as THREE.MeshBasicMaterial;
        material.opacity = (1 - progress) * 0.5;

        if (progress >= 1) {
            ringRef.current.visible = false;
        }
    });

    if (!active) return null;

    return (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.9, 1, 64]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENERGY CORE - Pulsing central orb
// ─────────────────────────────────────────────────────────────────────────────
function EnergyCore({ phase }: { phase: string }) {
    const coreRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (!coreRef.current) return;

        const time = state.clock.elapsedTime;
        const pulse = 1 + Math.sin(time * 10) * 0.1;

        if (phase === 'charging') {
            coreRef.current.scale.setScalar(0.3 * pulse);
            if (glowRef.current) glowRef.current.scale.setScalar(0.5 * pulse);
        }
    });

    const { scale, opacity } = useSpring({
        scale: phase === 'burst' ? 4 : phase === 'charging' ? 0.4 : 0.2,
        opacity: phase === 'done' ? 0 : phase === 'burst' ? 0.3 : 0.9,
        config: phase === 'burst' ? { tension: 400, friction: 20 } : config.wobbly,
    });

    if (phase === 'done') return null;

    return (
        <group>
            <animated.mesh ref={coreRef} scale={scale}>
                <sphereGeometry args={[1, 32, 32]} />
                <animated.meshBasicMaterial color="#00ffff" transparent opacity={opacity} />
            </animated.mesh>
            <animated.mesh ref={glowRef} scale={scale.to(s => s * 1.5)}>
                <sphereGeometry args={[1, 16, 16]} />
                <animated.meshBasicMaterial color="#0088ff" transparent opacity={opacity.to(o => o * 0.3)} />
            </animated.mesh>
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH PAD - Main cinematic launch component (2.5 second intro)
// ─────────────────────────────────────────────────────────────────────────────
interface LaunchPadProps {
    isActive: boolean;
    onBurst: () => void;
}

export function LaunchPad({ isActive, onBurst }: LaunchPadProps) {
    const outerRingRef = useRef<THREE.Mesh>(null);
    const innerRingRef = useRef<THREE.Mesh>(null);
    const [phase, setPhase] = useState<'idle' | 'charging' | 'burst' | 'done'>('idle');
    const [showParticles, setShowParticles] = useState(false);
    const [showShockwave, setShowShockwave] = useState(false);
    const rotationRef = useRef(0);

    // ═══════════════════════════════════════════════════════════════════════
    // CINEMATIC SEQUENCE - 2.5 second intro
    // Timeline:
    // 0.0s - Start charging, play cinematic audio
    // 1.2s - BURST! Particles + shockwave + impact sound
    // 1.4s - Cards begin flying out
    // 2.5s - Animation complete
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (phase !== 'idle') return;

        // Start the cinematic sequence
        setPhase('charging');
        // Play Main Intro.mp3 via SoundEngine instead of synthesized audio
        SoundEngine.play('cinematicIntro');
        hapticEngine.buildUp();

        // THE BIG MOMENT at 1.2 seconds
        const burstTimer = setTimeout(() => {
            setPhase('burst');
            setShowParticles(true);
            setShowShockwave(true);
            hapticEngine.impact();

            // Trigger cards to fly out
            setTimeout(() => {
                onBurst();
                hapticEngine.flutter();
            }, 200);

            // Finish and fade out
            setTimeout(() => {
                // Note: audioEngine.playFinish() disabled - using Main Intro.mp3 only
                setPhase('done');
            }, 1100);
        }, 1200);

        return () => clearTimeout(burstTimer);
    }, []);

    // Animate ring rotation
    useFrame((_, delta) => {
        const speed = phase === 'charging' ? 4 : phase === 'burst' ? 15 : 1;
        rotationRef.current += delta * speed;

        if (outerRingRef.current) {
            outerRingRef.current.rotation.z = rotationRef.current;
        }
        if (innerRingRef.current) {
            innerRingRef.current.rotation.z = -rotationRef.current * 1.3;
        }
    });

    // Ring animations
    const { ringScale, ringOpacity } = useSpring({
        ringScale: phase === 'burst' ? 15 : phase === 'charging' ? 2 : 1,
        ringOpacity: phase === 'done' ? 0 : phase === 'burst' ? 0.15 : 0.85,
        config: phase === 'burst' ? { tension: 350, friction: 18 } : { tension: 120, friction: 14 },
    });

    if (phase === 'done') return null;

    return (
        <group position={[0, 0, 5]}>
            {/* Outer rotating ring */}
            <animated.mesh
                ref={outerRingRef}
                scale={ringScale}
                rotation={[Math.PI / 2, 0, 0]}
            >
                <torusGeometry args={[1.2, 0.05, 16, 64]} />
                <animated.meshBasicMaterial color="#00d4ff" transparent opacity={ringOpacity} />
            </animated.mesh>

            {/* Inner counter-rotating ring */}
            <animated.mesh
                ref={innerRingRef}
                scale={ringScale.to(s => s * 0.7)}
                rotation={[Math.PI / 2, 0, 0]}
            >
                <torusGeometry args={[1, 0.04, 16, 64]} />
                <animated.meshBasicMaterial color="#00ffff" transparent opacity={ringOpacity.to(o => o * 0.8)} />
            </animated.mesh>

            {/* Third ring for depth */}
            <animated.mesh
                scale={ringScale.to(s => s * 0.5)}
                rotation={[Math.PI / 2, 0, 0]}
            >
                <torusGeometry args={[0.8, 0.03, 16, 64]} />
                <animated.meshBasicMaterial color="#ffffff" transparent opacity={ringOpacity.to(o => o * 0.5)} />
            </animated.mesh>

            {/* Energy core */}
            <EnergyCore phase={phase} />

            {/* Particle explosion */}
            <ParticleExplosion active={showParticles} count={100} />

            {/* Shockwave rings (staggered) */}
            <ShockwaveRing active={showShockwave} delay={0} />
            <ShockwaveRing active={showShockwave} delay={100} />
            <ShockwaveRing active={showShockwave} delay={200} />
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATED CARD WRAPPER - Cards fly out with spring physics
// ─────────────────────────────────────────────────────────────────────────────
interface AnimatedCardWrapperProps {
    children: React.ReactNode;
    targetPosition: [number, number, number];
    delay: number;
    isIntroComplete: boolean;
    index: number;
}

export function AnimatedCardWrapper({
    children,
    targetPosition,
    delay,
    isIntroComplete,
    index
}: AnimatedCardWrapperProps) {
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        if (isIntroComplete && !hasAnimated) {
            const timer = setTimeout(() => {
                setHasAnimated(true);
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [isIntroComplete, delay, hasAnimated]);

    const { position, scale, rotation } = useSpring({
        position: hasAnimated ? targetPosition : [0, 0, 5],
        scale: hasAnimated ? 1 : 0.1,
        rotation: hasAnimated ? [0, 0, 0] : [0, Math.PI * 2, 0],
        config: {
            tension: 120,
            friction: 14,
        },
    });

    return (
        <animated.group
            position={position as any}
            scale={scale}
            rotation={rotation as any}
        >
            {children}
        </animated.group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH ANIMATION HOOK - Controls the 2.5s cinematic sequence
// ─────────────────────────────────────────────────────────────────────────────
export function useLaunchAnimation() {
    const [introState, setIntroState] = useState<'launching' | 'complete'>('launching');

    const onBurst = () => {
        // Transition to complete immediately when burst happens
        setIntroState('complete');
    };

    return {
        introState,
        isLaunching: introState === 'launching',
        isComplete: introState === 'complete',
        startLaunch: () => { },
        onBurst,
    };
}
