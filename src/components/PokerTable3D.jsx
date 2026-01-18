import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * 3D Poker Table Mesh
 * Renders a cinematic poker table with chips and ambient lighting
 */
function PokerTableMesh() {
    const tableRef = useRef();
    const chipsRef = useRef([]);

    useFrame((state) => {
        // Gentle table rotation
        if (tableRef.current) {
            tableRef.current.rotation.y += 0.002;
        }

        // Subtle chip bobbing animation
        chipsRef.current.forEach((chip, i) => {
            if (chip) {
                chip.position.y = 0.3 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.05;
            }
        });
    });

    return (
        <group ref={tableRef}>
            {/* Poker Table Surface - Green felt */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[3, 3, 0.2, 64]} />
                <meshStandardMaterial
                    color="#0a4d2e"
                    roughness={0.8}
                    metalness={0.1}
                />
            </mesh>

            {/* Table Rail - Wooden edge */}
            <mesh position={[0, 0.15, 0]} castShadow>
                <torusGeometry args={[3, 0.15, 16, 64]} />
                <meshStandardMaterial
                    color="#8B4513"
                    roughness={0.2}
                    metalness={0.5}
                />
            </mesh>

            {/* Poker Chips - Cyan glow (Smarter Poker brand color) */}
            {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const radius = 2.2;
                return (
                    <mesh
                        key={i}
                        ref={(el) => (chipsRef.current[i] = el)}
                        position={[
                            Math.cos(angle) * radius,
                            0.3,
                            Math.sin(angle) * radius
                        ]}
                        castShadow
                    >
                        <cylinderGeometry args={[0.15, 0.15, 0.1, 32]} />
                        <meshStandardMaterial
                            color="#00D4FF"
                            emissive="#00D4FF"
                            emissiveIntensity={0.5}
                            roughness={0.3}
                            metalness={0.7}
                        />
                    </mesh>
                );
            })}

            {/* Center Diamond Logo (placeholder) */}
            <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.5, 32]} />
                <meshStandardMaterial
                    color="#00D4FF"
                    emissive="#00D4FF"
                    emissiveIntensity={0.3}
                    transparent
                    opacity={0.6}
                />
            </mesh>
        </group>
    );
}

/**
 * PokerTable3D Component
 * Full 3D scene with camera, lights, and controls
 */
export default function PokerTable3D() {
    return (
        <Canvas
            style={{ width: '100%', height: '100%' }}
            shadows
            dpr={[1, 2]} // Adaptive pixel ratio for performance
        >
            <PerspectiveCamera makeDefault position={[0, 5, 8]} fov={45} />
            <OrbitControls
                enableZoom={false}
                enablePan={false}
                minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 2}
                autoRotate
                autoRotateSpeed={0.5}
            />

            {/* Lighting */}
            <ambientLight intensity={0.3} />
            <spotLight
                position={[0, 10, 0]}
                intensity={0.8}
                color="#00D4FF"
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
            />
            <pointLight position={[5, 5, 5]} intensity={0.3} color="#ffffff" />

            {/* Table */}
            <PokerTableMesh />

            {/* Environment */}
            <Environment preset="night" />
        </Canvas>
    );
}
