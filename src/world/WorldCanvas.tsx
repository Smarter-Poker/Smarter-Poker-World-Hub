/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — WORLD CANVAS (R3F Core)
   The spatial 3D environment with 10-Orb Carousel
   ═══════════════════════════════════════════════════════════════════════════ */

import { Canvas } from '@react-three/fiber';
import {
    PerspectiveCamera,
    OrbitControls,
    Environment,
    Stars,
    Float,
} from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';
import { CarouselEngine } from './carousel/CarouselEngine';
import { WorldEffects } from './WorldEffects';
import { useWorldStore } from '../state/worldStore';

// ─────────────────────────────────────────────────────────────────────────────
// 🌌 SPACE BACKGROUND
// ─────────────────────────────────────────────────────────────────────────────
function SpaceBackground() {
    return (
        <>
            <Stars
                radius={150}
                depth={80}
                count={4000}
                factor={5}
                saturation={0.2}
                fade
                speed={0.3}
            />
            <fog attach="fog" args={['#0a0a0f', 20, 100]} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 💡 AMBIENT LIGHTING
// ─────────────────────────────────────────────────────────────────────────────
function WorldLighting() {
    return (
        <>
            {/* Ambient base */}
            <ambientLight intensity={0.2} color="#ffffff" />

            {/* Key light (top-front) */}
            <directionalLight
                position={[10, 20, 15]}
                intensity={0.5}
                color="#e0e8ff"
                castShadow
                shadow-mapSize={[2048, 2048]}
            />

            {/* Fill light */}
            <directionalLight
                position={[-10, 8, -10]}
                intensity={0.25}
                color="#8080ff"
            />

            {/* Rim light */}
            <directionalLight
                position={[0, -10, -20]}
                intensity={0.15}
                color="#ff80ff"
            />

            {/* Center spotlight */}
            <spotLight
                position={[0, 30, 0]}
                angle={0.5}
                penumbra={0.8}
                intensity={0.6}
                color="#ffffff"
                castShadow
            />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔮 CENTRAL PLATFORM
// ─────────────────────────────────────────────────────────────────────────────
function CentralPlatform() {
    return (
        <group position={[0, -5, 0]}>
            {/* Main platform disc */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <ringGeometry args={[8, 30, 64]} />
                <meshStandardMaterial
                    color="#0a0a18"
                    metalness={0.9}
                    roughness={0.3}
                    envMapIntensity={0.5}
                />
            </mesh>

            {/* Inner glow ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[7, 8.5, 64]} />
                <meshBasicMaterial
                    color="#00f6ff"
                    transparent
                    opacity={0.3}
                />
            </mesh>

            {/* Outer glow ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[29, 31, 64]} />
                <meshBasicMaterial
                    color="#9d4edd"
                    transparent
                    opacity={0.2}
                />
            </mesh>
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 LOADING FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
function LoadingFallback() {
    return (
        <Float speed={2} rotationIntensity={0.5}>
            <mesh>
                <icosahedronGeometry args={[1, 1]} />
                <meshBasicMaterial color="#00f6ff" wireframe />
            </mesh>
        </Float>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌍 WORLD CANVAS — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function WorldCanvas() {
    const selectOrb = useWorldStore((s) => s.selectOrb);

    const handleOrbSelect = (id: string) => {
        selectOrb(id as any);
    };

    return (
        <div className="world-canvas">
            <Canvas
                shadows
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                    outputColorSpace: THREE.SRGBColorSpace,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.1,
                }}
                dpr={[1, 2]}
                performance={{ min: 0.5 }}
            >
                <Suspense fallback={<LoadingFallback />}>
                    {/* Camera System */}
                    <PerspectiveCamera
                        makeDefault
                        position={[0, 15, 45]}
                        fov={50}
                        near={0.1}
                        far={500}
                    />
                    <OrbitControls
                        enablePan={false}
                        enableZoom={true}
                        enableRotate={true}
                        maxPolarAngle={Math.PI / 2.2}
                        minPolarAngle={Math.PI / 4}
                        maxDistance={80}
                        minDistance={25}
                        rotateSpeed={0.5}
                        zoomSpeed={0.5}
                    />

                    {/* Environment */}
                    <color attach="background" args={['#050508']} />
                    <SpaceBackground />
                    <WorldLighting />
                    <Environment preset="night" />

                    {/* World Objects */}
                    <CentralPlatform />
                    <CarouselEngine onOrbSelect={handleOrbSelect} />

                    {/* Post Effects */}
                    <WorldEffects />
                </Suspense>
            </Canvas>
        </div>
    );
}
