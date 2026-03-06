/**
 * FeaturePod.jsx — A holographic 3D pod orbiting the radar.
 *
 * Each pod is a glowing glass sphere sitting on a metallic pedestal,
 * with a 3D geometric icon floating inside. Matches the cinematic
 * reference design with:
 *   - Translucent holographic sphere with inner glow
 *   - Metallic pedestal/cylinder with orange-amber rim light
 *   - Floating 3D icon inside the sphere (unique per feature)
 *   - Label text floating below
 *   - Hover: lift + brighten + scale
 *   - Active: locked glow + pulse
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Color, Vector3, DoubleSide, AdditiveBlending } from 'three';

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * 3D Icon geometry rendered inside the sphere.
 * Uses built-in Three.js geometries for each feature type.
 */
function PodIcon({ iconType, color, isHovered, isActive }) {
  const ref = useRef();
  const iconColor = useMemo(() => new Color(color), [color]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    // Slow rotation
    ref.current.rotation.y = t * 0.6;
    ref.current.rotation.x = Math.sin(t * 0.4) * 0.15;
    // Scale pulse on hover
    const targetScale = isHovered ? 1.15 : isActive ? 1.08 : 1.0;
    const s = ref.current.scale.x + (targetScale - ref.current.scale.x) * 0.08;
    ref.current.scale.setScalar(s);
  });

  const emissiveIntensity = isHovered ? 1.2 : isActive ? 0.9 : 0.5;

  // Each icon type gets a unique geometry
  const iconMesh = useMemo(() => {
    switch (iconType) {
      case 'search':
        // Magnifying glass — torus (ring) + small cylinder (handle)
        return (
          <group>
            <mesh>
              <torusGeometry args={[0.15, 0.03, 12, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0.12, -0.12, 0]} rotation={[0, 0, -0.785]}>
              <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        );
      case 'nearme':
        // Location pin — cone + sphere
        return (
          <group>
            <mesh position={[0, 0.06, 0]}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.1, 0.16, 12]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        );
      case 'livegames':
        // Poker chip — cylinder with rings
        return (
          <group>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.7} roughness={0.2} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.14, 0.015, 8, 24]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      case 'mapview':
        // Globe — wireframe icosahedron
        return (
          <mesh>
            <icosahedronGeometry args={[0.18, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} wireframe metalness={0.4} roughness={0.4} />
          </mesh>
        );
      case 'tours':
        // Trophy — two shapes
        return (
          <group>
            <mesh position={[0, 0.04, 0]}>
              <dodecahedronGeometry args={[0.13, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.8} roughness={0.15} />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.04, 0.08, 0.08, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity * 0.6} metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      case 'calendar':
        // Calendar grid — box with lines
        return (
          <group>
            <mesh>
              <boxGeometry args={[0.26, 0.22, 0.04]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.09, 0.025]}>
              <boxGeometry args={[0.26, 0.04, 0.01]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
          </group>
        );
      case 'daily':
        // Clock — ring + hands
        return (
          <group>
            <mesh>
              <torusGeometry args={[0.16, 0.025, 12, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.04, 0.02]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.015, 0.12, 0.015]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0.03, 0.01, 0.02]} rotation={[0, 0, -1.2]}>
              <boxGeometry args={[0.015, 0.08, 0.015]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
            </mesh>
          </group>
        );
      case 'series':
        // Star — octahedron (diamond-like)
        return (
          <mesh>
            <octahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.85} roughness={0.1} />
          </mesh>
        );
      case 'wallet':
        // Diamond — octahedron with high metalness
        return (
          <mesh>
            <octahedronGeometry args={[0.17, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.95} roughness={0.05} transparent opacity={0.9} />
          </mesh>
        );
      default:
        // Default sphere
        return (
          <mesh>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} metalness={0.5} roughness={0.3} />
          </mesh>
        );
    }
  }, [iconType, color, emissiveIntensity]);

  return <group ref={ref}>{iconMesh}</group>;
}

/**
 * FeaturePod — a holographic sphere on a metallic pedestal.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const sphereRef = useRef();
  const glowRingRef = useRef();
  const pedestalGlowRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Compute orbital position
  const basePos = useMemo(() => {
    const rad = degToRad(pod.angle - 90);
    return new Vector3(
      Math.cos(rad) * radius,
      y,
      Math.sin(rad) * radius
    );
  }, [pod.angle, radius, y]);

  const podColor = useMemo(() => new Color(pod.color), [pod.color]);

  const handlePointerOver = useCallback((e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback((e) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  }, []);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onClick?.();
  }, [onClick]);

  // Animation
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // Idle bobbing
    const bob = Math.sin(t * 1.0 + pod.angle * 0.05) * 0.06;
    groupRef.current.position.y = basePos.y + bob;

    // Hover lift
    const targetLift = hovered ? 0.5 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.08;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Scale
    const targetScale = hovered ? 1.18 : isActive ? 1.1 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.08;
    groupRef.current.scale.setScalar(newScale);

    // Sphere opacity pulse
    if (sphereRef.current?.material) {
      const mat = sphereRef.current.material;
      const targetOpacity = hovered ? 0.35 : isActive ? 0.28 : 0.18;
      mat.opacity += (targetOpacity - mat.opacity) * 0.06;
      const targetEmissive = hovered ? 0.6 : isActive ? 0.4 : 0.15;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.06;
    }

    // Glow ring pulse
    if (glowRingRef.current?.material) {
      const alpha = hovered ? 0.8 : isActive ? 0.6 : (0.25 + 0.15 * Math.sin(t * 2 + pod.angle * 0.1));
      glowRingRef.current.material.opacity += (alpha - glowRingRef.current.material.opacity) * 0.08;
    }

    // Pedestal base glow
    if (pedestalGlowRef.current?.material) {
      const alpha = hovered ? 0.7 : isActive ? 0.5 : (0.2 + 0.1 * Math.sin(t * 1.5 + pod.angle * 0.08));
      pedestalGlowRef.current.material.opacity += (alpha - pedestalGlowRef.current.material.opacity) * 0.06;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[basePos.x, basePos.y, basePos.z]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {/* ─── HOLOGRAPHIC SPHERE ─── */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color={pod.color}
          emissive={pod.color}
          emissiveIntensity={0.15}
          transparent
          opacity={0.18}
          metalness={0.3}
          roughness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* Inner sphere shell — slightly smaller, adds depth */}
      <mesh>
        <sphereGeometry args={[0.48, 24, 24]} />
        <meshStandardMaterial
          color="#0a1525"
          emissive={pod.color}
          emissiveIntensity={0.08}
          transparent
          opacity={0.12}
          wireframe
          depthWrite={false}
        />
      </mesh>

      {/* 3D Icon floating inside the sphere */}
      <PodIcon
        iconType={pod.id}
        color={pod.color}
        isHovered={hovered}
        isActive={isActive}
      />

      {/* Horizontal glow ring around sphere equator */}
      <mesh ref={glowRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[0.52, 0.6, 32]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.25}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── METALLIC PEDESTAL ─── */}
      {/* Main pedestal cylinder */}
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 0.45, 16]} />
        <meshStandardMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.15}
          emissive="#6ee7ef"
          emissiveIntensity={0.04}
        />
      </mesh>

      {/* Pedestal top cap — wider disc at sphere base */}
      <mesh position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.04, 24]} />
        <meshStandardMaterial
          color="#1e3045"
          metalness={0.9}
          roughness={0.2}
          emissive={pod.color}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Pedestal base — wider disc at bottom */}
      <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.03, 24]} />
        <meshStandardMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.15}
          emissive="#ff8c00"
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* ─── ORANGE/AMBER BASE GLOW ─── */}
      <mesh ref={pedestalGlowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.94, 0]}>
        <ringGeometry args={[0.3, 0.55, 32]} />
        <meshBasicMaterial
          color="#ff8c00"
          transparent
          opacity={0.2}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ground light pool — orange glow on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial
          color="#ff6b00"
          transparent
          opacity={0.06}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── FLOATING LABEL ─── */}
      <Text
        position={[0, -1.2, 0.3]}
        fontSize={0.16}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? '#ffffff' : '#c8d6e5'}
        textAlign="center"
        maxWidth={1.8}
        letterSpacing={0.08}
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {pod.label}
      </Text>

      {/* Active indicator — glowing dot below label */}
      {isActive && (
        <mesh position={[0, -1.45, 0.3]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
