// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — PS5-QUALITY LAUNCH ANIMATION
   Premium AAA-game intro with particles, shockwaves, and cinematic effects
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useEffect, useState, useMemo } from 'react';
import { useSpring, animated, config } from '@react-spring/three';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE - Premium sound effects
// ─────────────────────────────────────────────────────────────────────────────
class LaunchAudioEngine {
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

    // Deep bass thud on initial charge
    playChargeSound() {
        const ctx = this.getContext();
        if (!ctx) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(60, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
    }

    // Epic whoosh with rising pitch on burst
    playBurstSound() {
        const ctx = this.getContext();
        if (!ctx) return;

        // Layer 1: Low whoosh
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(100, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.5);

        // Layer 2: High sweep
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(800, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.4);

        // Layer 3: Impact thud
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(50, ctx.currentTime);
        osc3.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.2);
        gain3.gain.setValueAtTime(0.5, ctx.currentTime);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc3.start(ctx.currentTime);
        osc3.stop(ctx.currentTime + 0.3);
    }

    // Card fly-out whoosh
    playCardFlySound() {
        const ctx = this.getContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    }
}

const audioEngine = new LaunchAudioEngine();

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC ENGINE - Premium vibration patterns
// ─────────────────────────────────────────────────────────────────────────────
const hapticEngine = {
    // Triple pulse pattern for charge
    chargePattern() {
        if ('vibrate' in navigator) {
            navigator.vibrate([20, 50, 20, 50, 30]);
        }
    },
    // Heavy impact burst
    burstPattern() {
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 30, 50]);
        }
    },
    // Light flutter for cards
    cardFlyPattern() {
        if ('vibrate' in navigator) {
            navigator.vibrate([15, 20, 15]);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE SYSTEM - Glowing spark particles
// ─────────────────────────────────────────────────────────────────────────────
interface Particle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    size: number;
    color: THREE.Color;
}

function ParticleSystem({ active, count = 100 }: { active: boolean; count?: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const particlesRef = useRef<Particle[]>([]);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Initialize particles
    useEffect(() => {
        if (active && particlesRef.current.length === 0) {
            const particles: Particle[] = [];
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
                const speed = 3 + Math.random() * 5;
                const upward = Math.random() * 2;

                particles.push({
                    position: new THREE.Vector3(0, 0, 5),
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * speed,
                        upward,
                        Math.sin(angle) * speed
                    ),
                    life: 1,
                    maxLife: 0.8 + Math.random() * 0.4,
                    size: 0.05 + Math.random() * 0.1,
                    color: new THREE.Color().setHSL(0.5 + Math.random() * 0.1, 1, 0.6),
                });
            }
            particlesRef.current = particles;
        }
    }, [active, count]);

    // Animate particles
    useFrame((_, delta) => {
        if (!meshRef.current || !active) return;

        particlesRef.current.forEach((particle, i) => {
            if (particle.life > 0) {
                // Update position
                particle.position.add(particle.velocity.clone().multiplyScalar(delta));
                // Apply gravity
                particle.velocity.y -= delta * 3;
                // Decay
                particle.life -= delta / particle.maxLife;

                // Update instance
                dummy.position.copy(particle.position);
                const scale = particle.size * (particle.life * 2);
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
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.8} />
        </instancedMesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOCKWAVE RING - Expanding energy wave
// ─────────────────────────────────────────────────────────────────────────────
function ShockwaveRing({ active }: { active: boolean }) {
    const ringRef = useRef<THREE.Mesh>(null);
    const [triggered, setTriggered] = useState(false);
    const startTimeRef = useRef(0);

    useEffect(() => {
        if (active && !triggered) {
            setTriggered(true);
            startTimeRef.current = Date.now();
        }
    }, [active, triggered]);

    useFrame(() => {
        if (!ringRef.current || !triggered) return;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const duration = 0.8;
        const progress = Math.min(elapsed / duration, 1);

        // Exponential expansion
        const scale = 1 + progress * 15;
        ringRef.current.scale.setScalar(scale);

        // Fade out
        const material = ringRef.current.material as THREE.MeshBasicMaterial;
        material.opacity = (1 - progress) * 0.6;

        if (progress >= 1) {
            ringRef.current.visible = false;
        }
    });

    if (!active) return null;

    return (
        <mesh ref={ringRef} position={[0, 0, 5]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1, 64]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH PAD - Main component with premium effects
// ─────────────────────────────────────────────────────────────────────────────
interface LaunchPadProps {
    isActive: boolean;
    onBurst: () => void;
}

export function LaunchPad({ isActive, onBurst }: LaunchPadProps) {
    const ringRef = useRef<THREE.Mesh>(null);
    const innerGlowRef = useRef<THREE.Mesh>(null);
    const [phase, setPhase] = useState<'idle' | 'charging' | 'burst' | 'done'>('idle');
    const [showParticles, setShowParticles] = useState(false);
    const [showShockwave, setShowShockwave] = useState(false);
    const rotationRef = useRef(0);

    // Start immediately when component mounts
    useEffect(() => {
        if (phase !== 'idle') return;

        // Immediately start charging
        setPhase('charging');
        audioEngine.playChargeSound();
        hapticEngine.chargePattern();

        // Quick burst after 300ms
        const burstTimer = setTimeout(() => {
            setPhase('burst');
            setShowParticles(true);
            setShowShockwave(true);
            audioEngine.playBurstSound();
            hapticEngine.burstPattern();
            onBurst();

            // Play card fly sound slightly delayed
            setTimeout(() => {
                audioEngine.playCardFlySound();
                hapticEngine.cardFlyPattern();
            }, 100);

            // Fade out
            setTimeout(() => {
                setPhase('done');
            }, 400);
        }, 250);

        return () => clearTimeout(burstTimer);
    }, []);

    // Animate rotation
    useFrame((_, delta) => {
        rotationRef.current += delta * (phase === 'charging' ? 8 : phase === 'burst' ? 20 : 2);

        if (ringRef.current) {
            ringRef.current.rotation.z = rotationRef.current;
        }
        if (innerGlowRef.current) {
            innerGlowRef.current.rotation.z = -rotationRef.current * 1.5;
        }
    });

    // Ring animation springs
    const { scale, opacity } = useSpring({
        scale: phase === 'burst' ? 12 : phase === 'charging' ? 1.8 : 1,
        opacity: phase === 'done' ? 0 : phase === 'burst' ? 0.2 : 0.95,
        config: phase === 'burst'
            ? { tension: 300, friction: 15 }
            : { tension: 200, friction: 20 },
    });

    // Pulsing core
    const { coreScale, coreOpacity } = useSpring({
        coreScale: phase === 'charging' ? [1, 1.3, 1] : phase === 'burst' ? 3 : 0.5,
        coreOpacity: phase === 'done' ? 0 : phase === 'burst' ? 0.4 : 0.8,
        config: config.wobbly,
    });

    if (phase === 'done') return null;

    return (
        <group position={[0, 0, 5]}>
            {/* Outer ring with glow */}
            <animated.mesh ref={ringRef} scale={scale} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.5, 0.06, 16, 64]} />
                <animated.meshBasicMaterial color="#00d4ff" transparent opacity={opacity} />
            </animated.mesh>

            {/* Secondary ring (counter-rotating) */}
            <animated.mesh ref={innerGlowRef} scale={scale.to(s => s * 0.8)} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.2, 0.04, 16, 64]} />
                <animated.meshBasicMaterial color="#00ffff" transparent opacity={opacity.to(o => o * 0.7)} />
            </animated.mesh>

            {/* Inner glow ring */}
            <animated.mesh scale={scale.to(s => s * 0.6)} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.9, 0.03, 16, 64]} />
                <animated.meshBasicMaterial color="#ffffff" transparent opacity={opacity.to(o => o * 0.5)} />
            </animated.mesh>

            {/* Center energy core */}
            <animated.mesh scale={coreScale as any}>
                <sphereGeometry args={[0.4, 32, 32]} />
                <animated.meshBasicMaterial color="#00ffff" transparent opacity={coreOpacity} />
            </animated.mesh>

            {/* Particle explosion */}
            <ParticleSystem active={showParticles} count={80} />

            {/* Shockwave */}
            <ShockwaveRing active={showShockwave} />
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATED CARD WRAPPER - Wraps cards with spring animation from center
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
// LAUNCH ANIMATION HOOK - Controls the overall launch sequence
// INSTANT PLAYBACK - no delays, immediate animation on mount
// ─────────────────────────────────────────────────────────────────────────────
export function useLaunchAnimation() {
    // Start immediately in 'launching' state for instant feel
    const [introState, setIntroState] = useState<'launching' | 'complete'>('launching');

    const onBurst = () => {
        // Immediately transition to complete - no delay
        setIntroState('complete');
    };

    return {
        introState,
        isLaunching: introState === 'launching',
        isComplete: introState === 'complete',
        startLaunch: () => { }, // No-op, animation auto-starts
        onBurst,
    };
}
