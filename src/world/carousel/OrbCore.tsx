// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — HOLOGRAPHIC 3D CARD WITH GLASS EFFECT
   Premium gaming aesthetic with animated holographic rim and glass materials
   Color palette: Cyan, Blue, White, Green (no purple/pink)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';

interface OrbCoreProps {
    color: string;
    label: string;
    gradient?: [string, string];
    active: boolean;
    imageUrl?: string;
    description?: string;
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

export function OrbCore({ color, label, gradient, active, imageUrl, description }: OrbCoreProps) {
    const groupRef = useRef<THREE.Group>(null);

    // Random holographic parameters for each card - truly independent floating
    const holoParams = useMemo(() => ({
        floatSpeed: 0.3 + Math.random() * 0.2,
        floatPhase: Math.random() * Math.PI * 2,
        rotXSpeed: 0.25 + Math.random() * 0.1,
        rotYSpeed: 0.2 + Math.random() * 0.1,
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
            // Independent floating motion using unique phase and speed
            groupRef.current.position.y = Math.sin(t * holoParams.floatSpeed + holoParams.floatPhase) * 0.04;
            // Subtle 3D rotation for depth - also independent
            groupRef.current.rotation.x = Math.sin(t * holoParams.rotXSpeed + holoParams.floatPhase) * 0.015;
            groupRef.current.rotation.y = Math.sin(t * holoParams.rotYSpeed + holoParams.floatPhase * 0.7) * 0.02;
        }
    });

    // Card dimensions (2:3 aspect ratio)
    const cardWidth = 1;
    const cardHeight = 1.5;
    const borderWidth = 0.025;

    return (
        <group ref={groupRef}>
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

            {/* ═══════════════════════════════════════════════════════════════
                THIN BRIGHT BORDER - All 4 edges
                ═══════════════════════════════════════════════════════════════ */}
            {/* Top border */}
            <mesh position={[0, cardHeight / 2 - 0.005, 0.035]}>
                <planeGeometry args={[cardWidth - 0.02, 0.006]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.85} />
            </mesh>
            {/* Bottom border */}
            <mesh position={[0, -(cardHeight / 2 - 0.005), 0.035]}>
                <planeGeometry args={[cardWidth - 0.02, 0.006]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.85} />
            </mesh>
            {/* Left border */}
            <mesh position={[-(cardWidth / 2 - 0.005), 0, 0.035]}>
                <planeGeometry args={[0.006, cardHeight - 0.02]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.85} />
            </mesh>
            {/* Right border */}
            <mesh position={[(cardWidth / 2 - 0.005), 0, 0.035]}>
                <planeGeometry args={[0.006, cardHeight - 0.02]} />
                <meshBasicMaterial color="#00d4ff" transparent opacity={0.85} />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                INNER WHITE BORDER FRAME - Continuous line rectangle
                Using drei's Line for a proper connected rectangle with no gaps
                ═══════════════════════════════════════════════════════════════ */}
            {(() => {
                const inset = 0.05;
                const left = -(cardWidth / 2) + inset;
                const right = (cardWidth / 2) - inset;
                const top = (cardHeight / 2) - inset;
                const bottom = -(cardHeight / 2) + inset;

                // Points forming a closed rectangle
                const points: [number, number, number][] = [
                    [left, top, 0.04],      // Top-left
                    [right, top, 0.04],     // Top-right
                    [right, bottom, 0.04],  // Bottom-right
                    [left, bottom, 0.04],   // Bottom-left
                    [left, top, 0.04],      // Back to top-left (close the loop)
                ];

                return (
                    <Line
                        points={points}
                        color="#ffffff"
                        lineWidth={2}
                        transparent
                        opacity={0.95}
                    />
                );
            })()}

            {/* ═══════════════════════════════════════════════════════════════
                CARD TITLE - Neon glow positioned ABOVE the card
                ═══════════════════════════════════════════════════════════════ */}
            <Text
                position={[0, (cardHeight / 2) + 0.02, 0.02]}
                fontSize={0.07}
                color="#00ffff"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.004}
                outlineColor="#00d4ff"
                letterSpacing={0.08}
            >
                {label.toUpperCase()}
            </Text>

            {/* ═══════════════════════════════════════════════════════════════
                CARD DESCRIPTION - Neon glow positioned BELOW the card
                ═══════════════════════════════════════════════════════════════ */}
            {description && (
                <Text
                    position={[0, -(cardHeight / 2) - 0.02, 0.02]}
                    fontSize={0.05}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="top"
                    outlineWidth={0.002}
                    outlineColor="#00d4ff"
                    letterSpacing={0.03}
                >
                    {description}
                </Text>
            )}
        </group>
    );
}
