// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — HOLOGRAPHIC 3D CARD WITH GLASS EFFECT
   Premium gaming aesthetic with animated holographic rim and glass materials
   Color palette: Cyan, Blue, White, Green (no purple/pink)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
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
    const b = 0.022; // border thickness — thin & sleek

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

            {/* ═══════════════════════════════════════════════════════════════
                3D BEVEL BORDER — thin, sleek, physically lit
                Top & Left  = bright face  (light hits here)
                Bottom & Right = dark face  (shadow side)
                Each strip is a flat plane tilted slightly on Z to sit proud of card
                ═══════════════════════════════════════════════════════════════ */}

            {/* TOP — lit face (bright highlight) */}
            <mesh position={[0, cardHeight / 2 - b / 2, 0.02]}>
                <planeGeometry args={[cardWidth, b]} />
                <meshStandardMaterial
                    color="#c8e8ff"
                    metalness={0.85}
                    roughness={0.15}
                    emissive="#88ccff"
                    emissiveIntensity={0.25}
                />
            </mesh>

            {/* LEFT — lit face (bright highlight) */}
            <mesh position={[-cardWidth / 2 + b / 2, 0, 0.02]}>
                <planeGeometry args={[b, cardHeight]} />
                <meshStandardMaterial
                    color="#b0d8f8"
                    metalness={0.8}
                    roughness={0.2}
                    emissive="#66aaee"
                    emissiveIntensity={0.18}
                />
            </mesh>

            {/* BOTTOM — shadow face (dark edge) */}
            <mesh position={[0, -cardHeight / 2 + b / 2, 0.02]}>
                <planeGeometry args={[cardWidth, b]} />
                <meshStandardMaterial
                    color="#080e1a"
                    metalness={0.9}
                    roughness={0.1}
                    emissive="#000000"
                    emissiveIntensity={0}
                />
            </mesh>

            {/* RIGHT — shadow face (dark edge) */}
            <mesh position={[cardWidth / 2 - b / 2, 0, 0.02]}>
                <planeGeometry args={[b, cardHeight]} />
                <meshStandardMaterial
                    color="#0c1422"
                    metalness={0.9}
                    roughness={0.1}
                    emissive="#000000"
                    emissiveIntensity={0}
                />
            </mesh>

            {/* INNER RIM — razor-thin glass highlight just inside the card edge */}
            <mesh position={[0, 0, 0.025]}>
                <planeGeometry args={[cardWidth - b * 0.5, cardHeight - b * 0.5]} />
                <meshStandardMaterial
                    color="#ffffff"
                    metalness={1}
                    roughness={0}
                    transparent
                    opacity={0.04}
                />
            </mesh>

            {/* BACKING PLATE — dark base that makes the bevel read as depth */}
            <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[cardWidth + b, cardHeight + b]} />
                <meshStandardMaterial
                    color="#020408"
                    metalness={0.6}
                    roughness={0.4}
                />
            </mesh>

            {/* ═══════════════════════════════════════════════════════════════
                TITLES AND DESCRIPTIONS REMOVED — Cards now show only the image
                ═══════════════════════════════════════════════════════════════ */}
        </group>
    );
}
