/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — WORLD EFFECTS
   Post-processing and ambient particle effects
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function FloatingParticles() {
    const particlesRef = useRef<THREE.Points>(null);
    const particleCount = 150;

    const [positions, colors] = useMemo(() => {
        const pos = new Float32Array(particleCount * 3);
        const cols = new Float32Array(particleCount * 3);
        const orbColors = [
            new THREE.Color('#00f6ff'),
            new THREE.Color('#9d4edd'),
            new THREE.Color('#ff006e'),
            new THREE.Color('#ffd60a'),
        ];

        for (let i = 0; i < particleCount; i++) {
            const radius = 3 + Math.random() * 5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
            pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

            const color = orbColors[Math.floor(Math.random() * orbColors.length)];
            cols[i * 3] = color.r;
            cols[i * 3 + 1] = color.g;
            cols[i * 3 + 2] = color.b;
        }
        return [pos, cols];
    }, []);

    useFrame((state) => {
        if (!particlesRef.current) return;
        particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    });

    return (
        <points ref={particlesRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={0.04} vertexColors transparent opacity={0.6} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
    );
}

function EnergyWave({ color, delay = 0 }: { color: string; delay?: number }) {
    const ringRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (!ringRef.current) return;
        const time = (state.clock.elapsedTime * 0.8 + delay) % 4;
        const scale = 1 + time * 1.5;
        ringRef.current.scale.set(scale, scale, 1);
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - time / 4) * 0.15;
    });

    return (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]}>
            <ringGeometry args={[0.5, 0.55, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
    );
}

export function WorldEffects() {
    return (
        <group>
            <FloatingParticles />
            <EnergyWave color="#00f6ff" delay={0} />
            <EnergyWave color="#9d4edd" delay={1} />
            <EnergyWave color="#ff006e" delay={2} />
            <EnergyWave color="#ffd60a" delay={3} />
        </group>
    );
}
