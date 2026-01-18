import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera, Text } from '@react-three/drei';
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import confetti from 'canvas-confetti';

/**
 * 3D Poker Table Mesh - Enhanced with Smarter.Poker Branding
 * Interactive table with floating cards, diamond particles, and brand integration
 */
function PokerTableMesh({ onTableClick }) {
    const tableRef = useRef();
    const chipsRef = useRef([]);
    const cardsRef = useRef([]);
    const diamondsRef = useRef([]);
    const [hovered, setHovered] = useState(false);

    useFrame((state) => {
        const time = state.clock.elapsedTime;

        // Gentle table rotation
        if (tableRef.current) {
            tableRef.current.rotation.y += 0.002;
        }

        // Subtle chip bobbing animation
        chipsRef.current.forEach((chip, i) => {
            if (chip) {
                chip.position.y = 0.3 + Math.sin(time * 2 + i) * 0.05;
                chip.rotation.y += 0.01;
            }
        });

        // Floating cards animation
        cardsRef.current.forEach((card, i) => {
            if (card) {
                const angle = (i / 4) * Math.PI * 2 + time * 0.3;
                const radius = 1.5;
                card.position.x = Math.cos(angle) * radius;
                card.position.z = Math.sin(angle) * radius;
                card.position.y = 1 + Math.sin(time * 2 + i) * 0.2;
                card.rotation.y = angle + Math.PI / 2;
            }
        });

        // Orbiting diamond particles
        diamondsRef.current.forEach((diamond, i) => {
            if (diamond) {
                const angle = (i / 12) * Math.PI * 2 + time * 0.5;
                const radius = 3.5;
                diamond.position.x = Math.cos(angle) * radius;
                diamond.position.z = Math.sin(angle) * radius;
                diamond.position.y = 0.5 + Math.sin(time * 3 + i) * 0.3;
                diamond.rotation.y += 0.05;
            }
        });
    });

    const handleClick = () => {
        // Trigger confetti celebration
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#00D4FF', '#00ff88', '#ffd700'],
        });
        if (onTableClick) onTableClick();
    };

    return (
        <group ref={tableRef}>
            {/* Poker Table Surface - Green felt */}
            <mesh
                position={[0, 0, 0]}
                castShadow
                receiveShadow
                onClick={handleClick}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
                <cylinderGeometry args={[3, 3, 0.2, 64]} />
                <meshStandardMaterial
                    color={hovered ? "#0a5d3e" : "#0a4d2e"}
                    roughness={0.8}
                    metalness={0.1}
                />
            </mesh>

            {/* Table Rail - Wooden edge with gold accent */}
            <mesh position={[0, 0.15, 0]} castShadow>
                <torusGeometry args={[3, 0.15, 16, 64]} />
                <meshStandardMaterial
                    color="#8B4513"
                    roughness={0.2}
                    metalness={0.5}
                />
            </mesh>

            {/* Gold inner ring */}
            <mesh position={[0, 0.16, 0]}>
                <torusGeometry args={[2.85, 0.02, 8, 64]} />
                <meshStandardMaterial
                    color="#FFD700"
                    emissive="#FFD700"
                    emissiveIntensity={0.5}
                    metalness={1}
                />
            </mesh>

            {/* Poker Chips - Cyan glow (Smarter Poker brand color) */}
            {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const radius = 2.2;
                return (
                    <mesh
                        key={`chip-${i}`}
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

            {/* Floating Playing Cards */}
            {[...Array(4)].map((_, i) => (
                <mesh
                    key={`card-${i}`}
                    ref={(el) => (cardsRef.current[i] = el)}
                    castShadow
                >
                    <boxGeometry args={[0.3, 0.4, 0.01]} />
                    <meshStandardMaterial
                        color="#ffffff"
                        roughness={0.1}
                        metalness={0.2}
                    />
                </mesh>
            ))}

            {/* Orbiting Diamond Particles */}
            {[...Array(12)].map((_, i) => (
                <mesh
                    key={`diamond-${i}`}
                    ref={(el) => (diamondsRef.current[i] = el)}
                >
                    <octahedronGeometry args={[0.08, 0]} />
                    <meshStandardMaterial
                        color="#00D4FF"
                        emissive="#00D4FF"
                        emissiveIntensity={0.8}
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            ))}

            {/* Center Smarter.Poker Logo */}
            <group position={[0, 0.25, 0]}>
                {/* Logo background circle */}
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[0.6, 32]} />
                    <meshStandardMaterial
                        color="#00D4FF"
                        emissive="#00D4FF"
                        emissiveIntensity={0.5}
                        transparent
                        opacity={0.8}
                    />
                </mesh>

                {/* "SMARTER" text */}
                <Text
                    position={[0, 0.01, 0.2]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.15}
                    color="#000000"
                    anchorX="center"
                    anchorY="middle"
                >
                    SMARTER
                </Text>

                {/* "POKER" text */}
                <Text
                    position={[0, 0.01, -0.2]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.15}
                    color="#000000"
                    anchorX="center"
                    anchorY="middle"
                >
                    POKER
                </Text>

                {/* Diamond icon in center */}
                <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                    <octahedronGeometry args={[0.12, 0]} />
                    <meshStandardMaterial
                        color="#FFD700"
                        emissive="#FFD700"
                        emissiveIntensity={0.8}
                        metalness={1}
                    />
                </mesh>
            </group>

            {/* Hover hint text */}
            {hovered && (
                <Text
                    position={[0, 2, 0]}
                    fontSize={0.2}
                    color="#00D4FF"
                    anchorX="center"
                    anchorY="middle"
                >
                    Click for Celebration! 🎉
                </Text>
            )}
        </group>
    );
}

/**
 * PokerTable3D Component
 * Full 3D scene with camera, lights, and controls
 * Enhanced with Smarter.Poker branding and interactivity
 */
export default function PokerTable3D() {
    const [clicks, setClicks] = useState(0);

    const handleTableClick = () => {
        setClicks(prev => prev + 1);
    };

    return (
        <Canvas
            style={{ width: '100%', height: '100%', cursor: 'pointer' }}
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

            {/* Lighting - Enhanced with brand colors */}
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
            <pointLight position={[-5, 3, -5]} intensity={0.2} color="#00D4FF" />

            {/* Table */}
            <PokerTableMesh onTableClick={handleTableClick} />

            {/* Environment */}
            <Environment preset="night" />
        </Canvas>
    );
}
