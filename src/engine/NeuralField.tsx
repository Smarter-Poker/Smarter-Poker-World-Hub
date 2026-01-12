/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — NEURAL FIELD ENGINE
   Three-Layer Background: Brain Lines + Solver Grid + Path-Restricted Neurons
   ═══════════════════════════════════════════════════════════════════════════ */
// @ts-nocheck - R3F JSX elements require runtime type augmentation
import { useMemo, useRef } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';

// Extend THREE elements for JSX
extend(THREE);

// ─────────────────────────────────────────────────────────────────────────────
// ⚡ LAYER 1: BRAIN LINES — Flowing neural pathways
// ─────────────────────────────────────────────────────────────────────────────
function BrainLines() {
    const linesRef = useRef<THREE.Group>(null);

    const curves = useMemo(() => {
        const paths: THREE.CatmullRomCurve3[] = [];
        for (let i = 0; i < 25; i++) {
            const yOffset = (Math.random() - 0.5) * 60;
            const zOffset = (Math.random() - 0.5) * 40;
            const midY = yOffset + (Math.random() - 0.5) * 20;
            const midZ = zOffset + (Math.random() - 0.5) * 15;

            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(-120, yOffset, zOffset - 30),
                new THREE.Vector3(-40, midY, midZ),
                new THREE.Vector3(0, yOffset + (Math.random() - 0.5) * 10, zOffset),
                new THREE.Vector3(40, midY * 0.8, midZ * 1.2),
                new THREE.Vector3(120, yOffset, zOffset + 30),
            ]);
            paths.push(curve);
        }
        return paths;
    }, []);

    useFrame((state) => {
        if (linesRef.current) {
            // Subtle drift animation
            linesRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.1) * 0.02;
            linesRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.08) * 0.015;
        }
    });

    return (
        <group ref={linesRef} position={[0, 0, -50]}>
            {curves.map((curve, i) => (
                <mesh key={`brain-line-${i}`}>
                    <tubeGeometry args={[curve, 80, 0.06 + Math.random() * 0.04, 8, false]} />
                    <meshStandardMaterial
                        color="#0066ff"
                        emissive="#0033ff"
                        emissiveIntensity={0.4 + Math.random() * 0.3}
                        transparent
                        opacity={0.15 + Math.random() * 0.15}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔲 LAYER 2: SOLVER GRID — Holographic calculation matrix
// ─────────────────────────────────────────────────────────────────────────────
function SolverGrid() {
    const gridRef = useRef<THREE.Group>(null);

    const gridLines = useMemo(() => {
        const lines: { start: THREE.Vector3; end: THREE.Vector3; intensity: number }[] = [];
        const gridSize = 100;
        const divisions = 20;
        const step = gridSize / divisions;

        // Horizontal lines
        for (let i = 0; i <= divisions; i++) {
            const z = -gridSize / 2 + i * step;
            const intensity = Math.abs(divisions / 2 - i) / (divisions / 2);
            lines.push({
                start: new THREE.Vector3(-gridSize / 2, 0, z),
                end: new THREE.Vector3(gridSize / 2, 0, z),
                intensity: 1 - intensity * 0.6,
            });
        }

        // Vertical lines
        for (let i = 0; i <= divisions; i++) {
            const x = -gridSize / 2 + i * step;
            const intensity = Math.abs(divisions / 2 - i) / (divisions / 2);
            lines.push({
                start: new THREE.Vector3(x, 0, -gridSize / 2),
                end: new THREE.Vector3(x, 0, gridSize / 2),
                intensity: 1 - intensity * 0.6,
            });
        }

        return lines;
    }, []);

    useFrame((state) => {
        if (gridRef.current) {
            // Subtle pulse
            const pulse = Math.sin(state.clock.elapsedTime * 0.5) * 0.1 + 0.9;
            gridRef.current.scale.set(pulse, 1, pulse);
        }
    });

    return (
        <group ref={gridRef} position={[0, -15, 0]} rotation={[0, 0, 0]}>
            {gridLines.map((line, i) => {
                const points = [line.start, line.end];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                return (
                    <line key={`grid-line-${i}`}>
                        <bufferGeometry attach="geometry" {...geometry} />
                        <lineBasicMaterial
                            color="#00f6ff"
                            transparent
                            opacity={0.08 * line.intensity}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </line>
                );
            })}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAYER 3: PATH-RESTRICTED NEURONS — Pulsing signal nodes
// ─────────────────────────────────────────────────────────────────────────────
function PathNeurons() {
    const neuronsRef = useRef<THREE.Group>(null);
    const neuronMeshRefs = useRef<THREE.Mesh[]>([]);

    const neurons = useMemo(() => {
        const nodes: { position: THREE.Vector3; speed: number; phase: number; size: number }[] = [];
        for (let i = 0; i < 50; i++) {
            // Restrict to specific "paths" in the background
            const pathIndex = Math.floor(Math.random() * 5);
            const pathZ = -60 + pathIndex * 15;

            nodes.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * 150,
                    (Math.random() - 0.5) * 80,
                    pathZ + (Math.random() - 0.5) * 10
                ),
                speed: 0.5 + Math.random() * 1.5,
                phase: Math.random() * Math.PI * 2,
                size: 0.15 + Math.random() * 0.25,
            });
        }
        return nodes;
    }, []);

    useFrame((state) => {
        neuronMeshRefs.current.forEach((mesh, i) => {
            if (mesh && neurons[i]) {
                const neuron = neurons[i];
                // Pulsing glow
                const pulse = Math.sin(state.clock.elapsedTime * neuron.speed + neuron.phase) * 0.5 + 0.5;
                mesh.scale.setScalar(neuron.size * (0.8 + pulse * 0.4));

                // Update emissive intensity
                const mat = mesh.material as THREE.MeshBasicMaterial;
                if (mat) {
                    mat.opacity = 0.3 + pulse * 0.5;
                }
            }
        });

        if (neuronsRef.current) {
            neuronsRef.current.rotation.y = state.clock.elapsedTime * 0.01;
        }
    });

    return (
        <group ref={neuronsRef}>
            {neurons.map((neuron, i) => (
                <mesh
                    key={`neuron-${i}`}
                    ref={(el) => {
                        if (el) neuronMeshRefs.current[i] = el;
                    }}
                    position={neuron.position}
                >
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshBasicMaterial
                        color="#ff3366"
                        transparent
                        opacity={0.5}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            ))}

            {/* Connecting signal lines between nearby neurons */}
            {neurons.slice(0, 20).map((neuron, i) => {
                const nextNeuron = neurons[(i + 1) % neurons.length];
                const points = [neuron.position, nextNeuron.position];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                return (
                    <line key={`signal-${i}`}>
                        <bufferGeometry attach="geometry" {...geometry} />
                        <lineBasicMaterial
                            color="#ff3366"
                            transparent
                            opacity={0.08}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </line>
                );
            })}
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 NEURAL FIELD — MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function NeuralField() {
    return (
        <group>
            <BrainLines />
            <SolverGrid />
            <PathNeurons />
        </group>
    );
}
