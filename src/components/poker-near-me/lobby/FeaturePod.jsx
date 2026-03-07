/**
 * FeaturePod.jsx — Cinematic holographic 3D pod orbiting the radar.
 *
 * 2026 AAA-quality rendering:
 *   - MeshPhysicalMaterial with iridescence, clearcoat, sheen, transmission
 *   - Holographic energy rings orbiting inside the sphere
 *   - Bloom-participating glow elements (emissive materials)
 *   - Metallic pedestals with iridescent rim lighting
 *   - Smooth hover/active animations
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float } from '@react-three/drei';
import { Color, Vector3, DoubleSide, AdditiveBlending } from 'three';

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Holographic energy rings that orbit inside the sphere.
 * These participate in Bloom for cinematic glow.
 */
function EnergyRings({ color, isHovered, isActive }) {
  const groupRef = useRef();
  const podColor = useMemo(() => new Color(color), [color]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.4;
    groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.3;
    groupRef.current.rotation.z = Math.cos(t * 0.25) * 0.15;
  });

  const ringOpacity = isHovered ? 0.7 : isActive ? 0.55 : 0.3;
  const emissiveStrength = isHovered ? 1.2 : isActive ? 0.8 : 0.4;

  return (
    <group ref={groupRef}>
      {[0.2, 0.32, 0.44].map((radius, i) => (
        <mesh
          key={i}
          rotation={[
            Math.PI * (0.3 + i * 0.4),
            Math.PI * (0.1 + i * 0.5),
            Math.PI * (0.2 + i * 0.3),
          ]}
        >
          <torusGeometry args={[radius, 0.012, 12, 48]} />
          <meshPhysicalMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveStrength}
            clearcoat={1}
            clearcoatRoughness={0.1}
            transparent
            opacity={ringOpacity - i * 0.08}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 3D Icon geometry rendered inside the sphere.
 * Upgraded to MeshPhysicalMaterial for cinematic quality.
 */
function PodIcon({ iconType, color, isHovered, isActive }) {
  const ref = useRef();
  const iconColor = useMemo(() => new Color(color), [color]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.6;
    ref.current.rotation.x = Math.sin(t * 0.4) * 0.15;
    const targetScale = isHovered ? 1.15 : isActive ? 1.08 : 1.0;
    const s = ref.current.scale.x + (targetScale - ref.current.scale.x) * 0.08;
    ref.current.scale.setScalar(s);
  });

  const emissiveIntensity = isHovered ? 1.5 : isActive ? 1.0 : 0.6;

  // Shared PBR material props for icons
  const matProps = {
    color,
    emissive: color,
    emissiveIntensity,
    metalness: 0.7,
    roughness: 0.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    iridescence: 0.3,
    iridescenceIOR: 1.4,
  };

  const iconMesh = useMemo(() => {
    switch (iconType) {
      case 'search':
        return (
          <group>
            <mesh>
              <torusGeometry args={[0.15, 0.03, 16, 32]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
            <mesh position={[0.12, -0.12, 0]} rotation={[0, 0, -0.785]}>
              <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
          </group>
        );
      case 'nearme':
        return (
          <group>
            <mesh position={[0, 0.06, 0]}>
              <sphereGeometry args={[0.1, 24, 24]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
            <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.1, 0.16, 16]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
          </group>
        );
      case 'livegames':
        return (
          <group>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.05, 32]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.14, 0.015, 8, 32]} />
              <meshPhysicalMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} metalness={0.9} roughness={0.1} clearcoat={0.8} />
            </mesh>
          </group>
        );
      case 'mapview':
        return (
          <mesh>
            <icosahedronGeometry args={[0.18, 1]} />
            <meshPhysicalMaterial {...matProps} wireframe />
          </mesh>
        );
      case 'tours':
        return (
          <group>
            <mesh position={[0, 0.04, 0]}>
              <dodecahedronGeometry args={[0.13, 0]} />
              <meshPhysicalMaterial {...matProps} metalness={0.9} iridescence={0.6} />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.04, 0.08, 0.08, 8]} />
              <meshPhysicalMaterial {...matProps} emissiveIntensity={emissiveIntensity * 0.6} />
            </mesh>
          </group>
        );
      case 'calendar':
        return (
          <group>
            <mesh>
              <boxGeometry args={[0.26, 0.22, 0.04]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
            <mesh position={[0, 0.09, 0.025]}>
              <boxGeometry args={[0.26, 0.04, 0.01]} />
              <meshPhysicalMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} clearcoat={0.5} />
            </mesh>
          </group>
        );
      case 'daily':
        return (
          <group>
            <mesh>
              <torusGeometry args={[0.16, 0.025, 16, 32]} />
              <meshPhysicalMaterial {...matProps} />
            </mesh>
            <mesh position={[0, 0.04, 0.02]}>
              <boxGeometry args={[0.015, 0.12, 0.015]} />
              <meshPhysicalMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.7} clearcoat={0.5} />
            </mesh>
            <mesh position={[0.03, 0.01, 0.02]} rotation={[0, 0, -1.2]}>
              <boxGeometry args={[0.015, 0.08, 0.015]} />
              <meshPhysicalMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.7} clearcoat={0.5} />
            </mesh>
          </group>
        );
      case 'series':
        return (
          <mesh>
            <octahedronGeometry args={[0.18, 0]} />
            <meshPhysicalMaterial {...matProps} metalness={0.9} iridescence={0.7} iridescenceIOR={1.8} />
          </mesh>
        );
      case 'wallet':
        return (
          <mesh>
            <octahedronGeometry args={[0.17, 0]} />
            <meshPhysicalMaterial
              {...matProps}
              metalness={0.95}
              roughness={0.02}
              iridescence={0.8}
              iridescenceIOR={2.0}
              sheen={0.5}
              sheenColor={new Color(color)}
              sheenRoughness={0.2}
              transparent
              opacity={0.92}
            />
          </mesh>
        );
      default:
        return (
          <mesh>
            <sphereGeometry args={[0.15, 24, 24]} />
            <meshPhysicalMaterial {...matProps} />
          </mesh>
        );
    }
  }, [iconType, color, emissiveIntensity]);

  return <group ref={ref}>{iconMesh}</group>;
}

/**
 * FeaturePod — a holographic sphere on a metallic pedestal
 * with cinematic PBR materials and energy field effects.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const sphereRef = useRef();
  const glowRingRef = useRef();
  const pedestalGlowRef = useRef();
  const [hovered, setHovered] = useState(false);

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

    // Sphere opacity/emissive pulse
    if (sphereRef.current?.material) {
      const mat = sphereRef.current.material;
      const targetOpacity = hovered ? 0.35 : isActive ? 0.28 : 0.2;
      mat.opacity += (targetOpacity - mat.opacity) * 0.06;
      const targetEmissive = hovered ? 0.7 : isActive ? 0.5 : 0.2;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.06;
    }

    // Glow ring pulse
    if (glowRingRef.current?.material) {
      const alpha = hovered ? 0.85 : isActive ? 0.65 : (0.3 + 0.15 * Math.sin(t * 2 + pod.angle * 0.1));
      glowRingRef.current.material.opacity += (alpha - glowRingRef.current.material.opacity) * 0.08;
    }

    // Pedestal base glow
    if (pedestalGlowRef.current?.material) {
      const alpha = hovered ? 0.75 : isActive ? 0.55 : (0.25 + 0.1 * Math.sin(t * 1.5 + pod.angle * 0.08));
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
      {/* ─── HOLOGRAPHIC SPHERE — Iridescent PBR ─── */}
      <mesh ref={sphereRef}>
        <icosahedronGeometry args={[0.55, 4]} />
        <meshPhysicalMaterial
          color={pod.color}
          emissive={pod.color}
          emissiveIntensity={0.2}
          transparent
          opacity={0.2}
          metalness={0.15}
          roughness={0.25}
          iridescence={0.6}
          iridescenceIOR={1.5}
          iridescenceThicknessRange={[100, 400]}
          clearcoat={0.9}
          clearcoatRoughness={0.08}
          sheen={0.5}
          sheenColor={podColor}
          sheenRoughness={0.2}
          transmission={0.15}
          ior={1.4}
          thickness={0.5}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Inner wireframe shell — adds depth */}
      <mesh>
        <icosahedronGeometry args={[0.48, 2]} />
        <meshPhysicalMaterial
          color="#0a1525"
          emissive={pod.color}
          emissiveIntensity={0.12}
          transparent
          opacity={0.15}
          wireframe
          depthWrite={false}
          clearcoat={0.3}
        />
      </mesh>

      {/* ─── HOLOGRAPHIC ENERGY RINGS ─── */}
      <EnergyRings
        color={pod.color}
        isHovered={hovered}
        isActive={isActive}
      />

      {/* 3D Icon floating inside the sphere */}
      <PodIcon
        iconType={pod.id}
        color={pod.color}
        isHovered={hovered}
        isActive={isActive}
      />

      {/* Horizontal glow ring — equator — Bloom participator */}
      <mesh ref={glowRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[0.52, 0.62, 48]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.3}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── METALLIC PEDESTAL — Iridescent PBR ─── */}
      {/* Main pedestal cylinder */}
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.18, 0.28, 0.45, 20]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.6}
          clearcoatRoughness={0.2}
          iridescence={0.3}
          iridescenceIOR={2.0}
          emissive="#6ee7ef"
          emissiveIntensity={0.06}
        />
      </mesh>

      {/* Pedestal top cap */}
      <mesh position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.04, 32]} />
        <meshPhysicalMaterial
          color="#1e3045"
          metalness={0.92}
          roughness={0.12}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          emissive={pod.color}
          emissiveIntensity={0.15}
          iridescence={0.4}
          iridescenceIOR={1.5}
        />
      </mesh>

      {/* Pedestal base */}
      <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.03, 32]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.5}
          emissive="#ff8c00"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* ─── GLOW EFFECTS ─── */}
      {/* Orange/amber base glow — Bloom */}
      <mesh ref={pedestalGlowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.94, 0]}>
        <ringGeometry args={[0.3, 0.55, 32]} />
        <meshBasicMaterial
          color="#ff8c00"
          transparent
          opacity={0.25}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ground light pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial
          color="#ff6b00"
          transparent
          opacity={0.08}
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

      {/* Active indicator */}
      {isActive && (
        <mesh position={[0, -1.45, 0.3]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
