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
    // Configure texture to show FULL image (contain mode - no cropping)
    const texture = useMemo(() => {
        if (imageUrl) {
            const loader = new TextureLoader();
            const tex = loader.load(imageUrl, (loadedTex) => {
                // Required for repeat/offset to work
                loadedTex.wrapS = THREE.ClampToEdgeWrapping;
                loadedTex.wrapT = THREE.ClampToEdgeWrapping;
                loadedTex.needsUpdate = true;

                // CONTAIN MODE: Show full image, fit within card bounds
                // No cropping - image scales to fit entirely inside card
                const imgAspect = loadedTex.image.width / loadedTex.image.height;
                const cardAspect = 2 / 3; // Our card is 2:3 (portrait)

                if (imgAspect > cardAspect) {
                    // Image is wider than card - letterbox (black bars top/bottom)
                    const scale = imgAspect / cardAspect;
                    loadedTex.repeat.set(1, 1 / scale);
                    loadedTex.offset.set(0, (1 - 1 / scale) / 2);
                } else {
                    // Image is taller than card - pillarbox (black bars left/right)
                    const scale = cardAspect / imgAspect;
                    loadedTex.repeat.set(1 / scale, 1);
                    loadedTex.offset.set((1 - 1 / scale) / 2, 0);
                }
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

            {/* ═══════════════════════════════════════════════════════════════
                INNER WHITE BORDER FRAME - Hidden for marketplace (full image)
                ═══════════════════════════════════════════════════════════════ */}
            {!isMarketplace && (() => {
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
                CARD DESCRIPTION - Neon glow positioned BELOW the card (2 lines max)
                ═══════════════════════════════════════════════════════════════ */}
            {description && (
                <Text
                    position={[0, -(cardHeight / 2) - 0.03, 0.02]}
                    fontSize={0.04}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="top"
                    textAlign="center"
                    maxWidth={cardWidth}
                    lineHeight={1.3}
                    outlineWidth={0.001}
                    outlineColor="#00d4ff"
                    letterSpacing={0.02}
                >
                    {description}
                </Text>
            )}
        </group>
    );
}
