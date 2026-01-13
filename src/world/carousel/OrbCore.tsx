// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — HOLOGRAPHIC 3D CARD WITH GLASS EFFECT
   Premium gaming aesthetic with animated holographic rim and glass materials
   Color palette: Cyan, Blue, White, Green (no purple/pink)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';

interface OrbCoreProps {
    color: string;
    label: string;
    gradient?: [string, string];
    active: boolean;
    imageUrl?: string;
}

// Holographic color palette (cyan/blue/green/white only)
const HOLO_COLORS = [
    '#00d4ff', // Electric Cyan
    '#00ff88', // Neon Green
    '#00bfff', // Deep Sky Blue
    '#4dd2ff', // Light Cyan
    '#00ff9f', // Mint Green
    '#ffffff', // Pure White
];

export function OrbCore({ color, label, gradient, active, imageUrl }: OrbCoreProps) {
    const groupRef = useRef<THREE.Group>(null);
    const rimRef = useRef<THREE.Mesh>(null);
    const glassRef = useRef<THREE.Mesh>(null);

    // Random holographic parameters for each card
    const holoParams = useMemo(() => ({
        primaryColor: HOLO_COLORS[Math.floor(Math.random() * HOLO_COLORS.length)],
        secondaryColor: HOLO_COLORS[Math.floor(Math.random() * HOLO_COLORS.length)],
        speed: 1.2 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
    }), []);

    // Load texture if imageUrl is provided
    const texture = useMemo(() => {
        if (imageUrl) {
            const loader = new TextureLoader();
            const tex = loader.load(imageUrl);
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        }
        return null;
    }, [imageUrl]);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (groupRef.current) {
            // Premium floating motion
            groupRef.current.position.y = Math.sin(t * 0.4) * 0.03;
            // Subtle 3D rotation for depth
            groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.015;
            groupRef.current.rotation.y = Math.sin(t * 0.25) * 0.02;
        }

        // Animate holographic rim glow
        if (rimRef.current) {
            const rimMat = rimRef.current.material as THREE.MeshBasicMaterial;
            const pulse = (Math.sin(t * holoParams.speed + holoParams.phase) + 1) / 2;
            rimMat.opacity = 0.3 + pulse * 0.5;

            // Color shift between primary and secondary
            const colorPulse = (Math.sin(t * 0.5) + 1) / 2;
            const c1 = new THREE.Color(holoParams.primaryColor);
            const c2 = new THREE.Color(holoParams.secondaryColor);
            rimMat.color.lerpColors(c1, c2, colorPulse);
        }
    });

    // Card dimensions (2:3 aspect ratio)
    const cardWidth = 1;
    const cardHeight = 1.5;
    const borderWidth = 0.025;

    return (
        <group ref={groupRef}>
            {/* ═══════════════════════════════════════════════════════════════
                HOLOGRAPHIC RIM GLOW (outer edge lighting)
                ═══════════════════════════════════════════════════════════════ */}
            <mesh ref={rimRef} position={[0, 0, -0.02]}>
                <boxGeometry args={[cardWidth + 0.12, cardHeight + 0.12, 0.01]} />
                <meshBasicMaterial
                    color={holoParams.primaryColor}
                    transparent
                    opacity={0.5}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            {/* Secondary glow layer for depth */}
            <mesh position={[0, 0, -0.04]}>
                <boxGeometry args={[cardWidth + 0.2, cardHeight + 0.2, 0.01]} />
                <meshBasicMaterial
                    color="#00d4ff"
                    transparent
                    opacity={0.15}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                GLASS FRAME (premium transparent border)
                ═══════════════════════════════════════════════════════════════ */}
            <mesh ref={glassRef} position={[0, 0, 0]}>
                <boxGeometry args={[cardWidth + borderWidth * 2, cardHeight + borderWidth * 2, 0.05]} />
                <meshPhysicalMaterial
                    color="#ffffff"
                    metalness={0.1}
                    roughness={0.05}
                    transmission={0.3}
                    thickness={0.5}
                    clearcoat={1}
                    clearcoatRoughness={0.1}
                    envMapIntensity={1}
                />
            </mesh>

            {/* Inner edge highlight */}
            <mesh position={[0, 0, 0.026]}>
                <boxGeometry args={[cardWidth + 0.01, cardHeight + 0.01, 0.002]} />
                <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.9}
                />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                CARD CONTENT AREA - Custom image with holographic overlay
                ═══════════════════════════════════════════════════════════════ */}
            <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={[cardWidth - 0.02, cardHeight - 0.02]} />
                {texture ? (
                    <meshBasicMaterial map={texture} />
                ) : (
                    <meshStandardMaterial
                        color="#0a1628"
                        metalness={0.3}
                        roughness={0.7}
                    />
                )}
            </mesh>

            {/* Corner accent - top left */}
            <mesh position={[-(cardWidth / 2 - 0.05), (cardHeight / 2 - 0.05), 0.04]}>
                <planeGeometry args={[0.08, 0.002]} />
                <meshBasicMaterial color="#00ff88" transparent opacity={0.8} />
            </mesh>
            <mesh position={[-(cardWidth / 2 - 0.02), (cardHeight / 2 - 0.08), 0.04]}>
                <planeGeometry args={[0.002, 0.08]} />
                <meshBasicMaterial color="#00ff88" transparent opacity={0.8} />
            </mesh>

            {/* Corner accent - bottom right */}
            <mesh position={[(cardWidth / 2 - 0.05), -(cardHeight / 2 - 0.05), 0.04]}>
                <planeGeometry args={[0.08, 0.002]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.8} />
            </mesh>
            <mesh position={[(cardWidth / 2 - 0.02), -(cardHeight / 2 - 0.08), 0.04]}>
                <planeGeometry args={[0.002, 0.08]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.8} />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                LABEL TEXT - Holographic style
                ═══════════════════════════════════════════════════════════════ */}
            <Text
                position={[0, -(cardHeight / 2 + borderWidth + 0.05), 0.02]}
                fontSize={0.09}
                color="#ffffff"
                anchorX="center"
                anchorY="top"
                maxWidth={1.6}
                textAlign="center"
                fontWeight="bold"
                outlineWidth={0.004}
                outlineColor="#00d4ff"
            >
                {label}
            </Text>

            {/* Active state - intensified glow */}
            {active && (
                <>
                    <mesh position={[0, 0, -0.06]}>
                        <boxGeometry args={[cardWidth + 0.3, cardHeight + 0.3, 0.01]} />
                        <meshBasicMaterial
                            color="#00d4ff"
                            transparent
                            opacity={0.3}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* Holographic pedestal ring */}
                    <mesh position={[0, -(cardHeight / 2 + 0.15), -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.3, 0.35, 32]} />
                        <meshBasicMaterial
                            color="#00ff88"
                            transparent
                            opacity={0.4}
                            blending={THREE.AdditiveBlending}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </>
            )}
        </group>
    );
}

