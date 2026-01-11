/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — PURE WHITE 3D CARD WITH REACTIVE EDGE GLOW
   All white border with animated reactive edge glow and custom image texture
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';

interface OrbCoreProps {
    color: string;
    label: string;
    gradient?: [string, string];
    active: boolean;
    imageUrl?: string;
}

// Generate a random glow color from a vibrant palette
function getRandomGlowColor(): string {
    const colors = [
        '#00d4ff', // Cyan
        '#ff00ff', // Magenta
        '#00ff88', // Green
        '#ff6600', // Orange
        '#aa00ff', // Purple
        '#ffff00', // Yellow
        '#ff0066', // Pink
        '#00ffff', // Aqua
        '#8b5cf6', // Violet
        '#f59e0b', // Amber
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

export function OrbCore({ color, label, gradient, active, imageUrl }: OrbCoreProps) {
    const groupRef = useRef<THREE.Group>(null);
    const glowRef = useRef<THREE.Mesh>(null);

    // Random glow parameters for each card (set once on mount)
    const glowParams = useMemo(() => ({
        color: getRandomGlowColor(),
        speed: 1.5 + Math.random() * 2, // 1.5-3.5 speed
        phase: Math.random() * Math.PI * 2,
        minOpacity: 0.1,
        maxOpacity: 0.6,
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
            // Subtle breathing motion
            groupRef.current.position.y = Math.sin(t * 0.3) * 0.02;

            // SUBTLE 3D TILT - Shows the card is a 3D frame, not flat
            groupRef.current.rotation.x = Math.sin(t * 0.5) * 0.02;
            groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.03;
        }

        // Animate the reactive edge glow
        if (glowRef.current) {
            const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
            const pulse = (Math.sin(t * glowParams.speed + glowParams.phase) + 1) / 2;
            glowMat.opacity = glowParams.minOpacity + pulse * (glowParams.maxOpacity - glowParams.minOpacity);
        }
    });

    // Card dimensions (2:3 aspect ratio)
    const cardWidth = 1;
    const cardHeight = 1.5;
    const borderWidth = 0.02;

    return (
        <group ref={groupRef}>

            {/* ═══════════════════════════════════════════════════════════════
                PURE WHITE CARD FRAME
                ═══════════════════════════════════════════════════════════════ */}

            {/* Shadow layer (creates 3D depth effect) */}
            <mesh position={[0.04, -0.04, -0.05]}>
                <boxGeometry args={[cardWidth + borderWidth * 2 + 0.04, cardHeight + borderWidth * 2 + 0.04, 0.02]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.6} />
            </mesh>

            {/* Main white border frame */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[cardWidth + borderWidth * 2, cardHeight + borderWidth * 2, 0.04]} />
                <meshBasicMaterial color="#ffffff" />
            </mesh>

            {/* White inner frame */}
            <mesh position={[0, 0, 0.025]}>
                <boxGeometry args={[cardWidth, cardHeight, 0.02]} />
                <meshBasicMaterial color="#ffffff" />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                CARD CONTENT AREA - Custom image or dark placeholder
                ═══════════════════════════════════════════════════════════════ */}
            <mesh position={[0, 0, 0.04]}>
                <planeGeometry args={[cardWidth - 0.04, cardHeight - 0.04]} />
                {texture ? (
                    <meshBasicMaterial map={texture} />
                ) : (
                    <meshStandardMaterial
                        color="#0a0a12"
                        metalness={0.05}
                        roughness={0.95}
                    />
                )}
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                LABEL TEXT - 20 PIXELS BELOW CARD BORDER
                ═══════════════════════════════════════════════════════════════ */}
            <Text
                position={[0, -(cardHeight / 2 + borderWidth + 0.033), 0.02]}
                fontSize={0.1}
                color="#ffffff"
                anchorX="center"
                anchorY="top"
                maxWidth={1.6}
                textAlign="center"
                fontWeight="bold"
                outlineWidth={0.003}
                outlineColor="#000000"
            >
                {label}
            </Text>

            {/* Active glow behind card (intensified when active) */}
            {active && (
                <mesh position={[0, 0, -0.07]}>
                    <boxGeometry args={[cardWidth + borderWidth * 4, cardHeight + borderWidth * 4, 0.01]} />
                    <meshBasicMaterial
                        color="#ffffff"
                        transparent
                        opacity={0.25}
                    />
                </mesh>
            )}
        </group>
    );
}
