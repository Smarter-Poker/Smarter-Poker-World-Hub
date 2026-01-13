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
    const shineRef = useRef<THREE.Mesh>(null);
    const lastShineTime = useRef(0);

    // Random holographic parameters for each card - truly independent floating
    const holoParams = useMemo(() => ({
        shineInterval: 3 + Math.random() * 5,
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

        // Edge sparkle flash effect - quick glint on edges
        if (shineRef.current) {
            const shineMat = shineRef.current.material as THREE.MeshBasicMaterial;
            const timeSinceLastShine = t - lastShineTime.current;

            if (timeSinceLastShine > holoParams.shineInterval) {
                // Trigger new sparkle on a random edge
                lastShineTime.current = t;
                // Edge positions: top, right, bottom, left
                const edges = [
                    { x: 0, y: 0.72, rx: 0, ry: 0, rz: 0, sx: 0.8, sy: 0.02 },      // top edge
                    { x: 0.48, y: 0, rx: 0, ry: 0, rz: Math.PI / 2, sx: 1.2, sy: 0.02 }, // right edge
                    { x: 0, y: -0.72, rx: 0, ry: 0, rz: 0, sx: 0.8, sy: 0.02 },     // bottom edge
                    { x: -0.48, y: 0, rx: 0, ry: 0, rz: Math.PI / 2, sx: 1.2, sy: 0.02 }, // left edge
                ];
                const edge = edges[Math.floor(Math.random() * edges.length)];
                shineRef.current.position.x = edge.x;
                shineRef.current.position.y = edge.y;
                shineRef.current.rotation.z = edge.rz;
                shineRef.current.scale.set(edge.sx, edge.sy, 1);
            }

            // Animate sparkle opacity (quick flash then fade)
            const shineProgress = timeSinceLastShine;
            if (shineProgress < 0.15) {
                shineMat.opacity = Math.sin(shineProgress * Math.PI / 0.15) * 1;
            } else {
                shineMat.opacity = 0;
            }
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

            {/* Edge sparkle flash - thin line that flashes on edges */}
            <mesh ref={shineRef} position={[0, 0.72, 0.05]}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0}
                    blending={THREE.AdditiveBlending}
                />
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

            {/* Active state - thin bright border (high-def look) */}
            {active && (
                <>
                    {/* Top edge - bright thin line */}
                    <mesh position={[0, cardHeight / 2 - 0.01, 0.04]}>
                        <planeGeometry args={[cardWidth, 0.008]} />
                        <meshBasicMaterial color="#00d4ff" transparent opacity={0.9} />
                    </mesh>
                    {/* Bottom edge - bright thin line */}
                    <mesh position={[0, -(cardHeight / 2 - 0.01), 0.04]}>
                        <planeGeometry args={[cardWidth, 0.008]} />
                        <meshBasicMaterial color="#00d4ff" transparent opacity={0.9} />
                    </mesh>
                    {/* Left edge - bright thin line */}
                    <mesh position={[-(cardWidth / 2 - 0.01), 0, 0.04]}>
                        <planeGeometry args={[0.008, cardHeight]} />
                        <meshBasicMaterial color="#00d4ff" transparent opacity={0.9} />
                    </mesh>
                    {/* Right edge - bright thin line */}
                    <mesh position={[(cardWidth / 2 - 0.01), 0, 0.04]}>
                        <planeGeometry args={[0.008, cardHeight]} />
                        <meshBasicMaterial color="#00d4ff" transparent opacity={0.9} />
                    </mesh>
                </>
            )}
        </group>
    );
}

