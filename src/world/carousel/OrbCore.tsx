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
    id?: string;
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

export function OrbCore({ id, color, label, gradient, active, imageUrl, description }: OrbCoreProps) {
    const groupRef = useRef<THREE.Group>(null);
    const isMarketplace = id === 'marketplace';

    // Random holographic parameters for each card - truly independent floating
    const holoParams = useMemo(() => ({
        floatSpeed: 0.3 + Math.random() * 0.2,
        floatPhase: Math.random() * Math.PI * 2,
        rotXSpeed: 0.25 + Math.random() * 0.1,
        rotYSpeed: 0.2 + Math.random() * 0.1,
    }), []);

    // Load texture if imageUrl is provided
    // Show FULL image without any cropping or scaling adjustments
    const texture = useMemo(() => {
        if (imageUrl) {
            const loader = new TextureLoader();
            const tex = loader.load(imageUrl, (loadedTex) => {
                loadedTex.wrapS = THREE.ClampToEdgeWrapping;
                loadedTex.wrapT = THREE.ClampToEdgeWrapping;
                // Show full image - no repeat/offset adjustments
                loadedTex.repeat.set(1, 1);
                loadedTex.offset.set(0, 0);
                loadedTex.needsUpdate = true;
            });
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
                CARD CONTENT AREA - Marketplace fills full frame, others have inset
                ═══════════════════════════════════════════════════════════════ */}
            <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={isMarketplace ? [cardWidth, cardHeight] : [cardWidth - 0.10, cardHeight - 0.10]} />
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

            {/* BORDERS REMOVED — Clean card edges per user request */}

            {/* WHITE BORDERS REMOVED — Clean card look per user request */}

            {/* ═══════════════════════════════════════════════════════════════
                TITLES AND DESCRIPTIONS REMOVED — Cards now show only the image
                ═══════════════════════════════════════════════════════════════ */}
        </group>
    );
}
