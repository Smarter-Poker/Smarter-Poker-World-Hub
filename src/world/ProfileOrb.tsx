/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — PROFILE ORB
   Top-right clickable profile picture orb
   - Displays user profile picture or default anonymous avatar
   - Clicking navigates to Social Media home page
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback } from 'react';
import { useFrame, useLoader, ThreeEvent } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Mesh, TextureLoader, CircleGeometry } from 'three';

interface ProfileOrbProps {
    profileImageUrl?: string;  // Custom profile picture URL
    onNavigateToSocialMedia?: () => void;  // Navigation callback
}

export function ProfileOrb({
    profileImageUrl = '/default-avatar.png',
    onNavigateToSocialMedia
}: ProfileOrbProps) {
    const groupRef = useRef<Mesh>(null);
    const glowRef = useRef<Mesh>(null);
    const [hovered, setHovered] = useState(false);

    // Load profile texture
    const texture = useLoader(TextureLoader, profileImageUrl);

    // Handle click to navigate to Social Media
    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        console.log('Profile Orb clicked — Navigate to Social Media');
        if (onNavigateToSocialMedia) {
            onNavigateToSocialMedia();
        }
        // TODO: Integrate with routing/navigation system
        // For now, select the social-media card in carousel
    }, [onNavigateToSocialMedia]);

    // Hover handlers for cursor feedback
    const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
    }, []);

    const handlePointerOut = useCallback(() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
    }, []);

    useFrame((state) => {
        if (!groupRef.current) return;

        // Breathing scale + hover boost
        const baseScale = hovered ? 1.08 : 1;
        const breath = Math.sin(state.clock.elapsedTime * 2) * 0.03 + baseScale;
        groupRef.current.scale.setScalar(breath);

        // Glow pulse (brighter on hover)
        if (glowRef.current) {
            const glowMat = glowRef.current.material as any;
            if (glowMat.opacity !== undefined) {
                const baseOpacity = hovered ? 0.5 : 0.35;
                glowMat.opacity = baseOpacity + Math.sin(state.clock.elapsedTime * 2.5) * 0.1;
            }
        }
    });

    return (
        <group position={[22, 14, 0]} scale={2.8}>
            <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.15}>
                {/* Clickable Profile Disc with Image */}
                <mesh
                    ref={groupRef}
                    onClick={handleClick}
                    onPointerOver={handlePointerOver}
                    onPointerOut={handlePointerOut}
                >
                    <circleGeometry args={[1, 64]} />
                    <meshBasicMaterial map={texture} />
                </mesh>

                {/* Glowing Ring Border */}
                <mesh ref={glowRef}>
                    <ringGeometry args={[0.95, 1.15, 64]} />
                    <meshBasicMaterial
                        color="#00d4ff"
                        transparent
                        opacity={0.5}
                        depthWrite={false}
                    />
                </mesh>

                {/* Outer Glow Halo */}
                <mesh>
                    <ringGeometry args={[1.1, 1.4, 64]} />
                    <meshBasicMaterial
                        color="#00d4ff"
                        transparent
                        opacity={0.2}
                        depthWrite={false}
                    />
                </mesh>

                {/* Subtle Point Light */}
                <pointLight
                    position={[0, 0, 1]}
                    intensity={2}
                    color="#00d4ff"
                    distance={12}
                />
            </Float>
        </group>
    );
}
