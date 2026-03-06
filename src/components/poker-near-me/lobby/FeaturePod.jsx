/**
 * FeaturePod.jsx — A single 3D interactive pod orbiting the radar.
 *
 * Each pod represents a feature module (Search, Near Me, Live Games, etc.)
 * and behaves like a physical object in the scene:
 *   - Positioned on an orbital ring around the radar center
 *   - Slow idle rotation + bobbing
 *   - Hover: lifts, brightens, emissive glow intensifies
 *   - Click: triggers the parent onPodClick callback
 *   - Active state: locked glow + slight scale
 *   - Metallic surface with brushed chrome feel
 *   - Bold letter icon with colored accent bar
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import { Color, Vector3, DoubleSide } from 'three';

/**
 * Convert degrees to radians.
 */
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * FeaturePod — a single clickable 3D pod with letter icon.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const glowRef = useRef();
  const accentRef = useRef();
  const iconRef = useRef();
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

  // Parse pod color
  const podColor = useMemo(() => new Color(pod.color), [pod.color]);

  // Hover handlers
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

  // Animation loop
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // Idle bobbing — each pod has its own phase
    const bob = Math.sin(t * 1.2 + pod.angle * 0.05) * 0.08;
    groupRef.current.position.y = basePos.y + bob;

    // Hover lift
    const targetLift = hovered ? 0.4 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.1;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Slow idle rotation on Y axis
    groupRef.current.rotation.y = Math.sin(t * 0.5 + pod.angle * 0.02) * 0.12;

    // Scale on hover/active
    const targetScale = hovered ? 1.2 : isActive ? 1.1 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.1;
    groupRef.current.scale.setScalar(newScale);

    // Emissive intensity on hover/active — much brighter than before
    if (meshRef.current?.material) {
      const targetEmissive = hovered ? 0.7 : isActive ? 0.45 : 0.15;
      const mat = meshRef.current.material;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
    }

    // Accent bar pulsing
    if (accentRef.current?.material) {
      const pulseAlpha = hovered ? 0.9 : isActive ? 0.7 : (0.4 + 0.15 * Math.sin(t * 2 + pod.angle * 0.1));
      accentRef.current.material.opacity += (pulseAlpha - accentRef.current.material.opacity) * 0.1;
    }

    // Glow ring opacity
    if (glowRef.current?.material) {
      const targetAlpha = hovered ? 0.7 : isActive ? 0.45 : 0.15;
      glowRef.current.material.opacity += (targetAlpha - glowRef.current.material.opacity) * 0.1;
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
      {/* Main pod body — rounded box with metallic material */}
      <RoundedBox
        ref={meshRef}
        args={[0.9, 0.9, 0.28]}
        radius={0.1}
        smoothness={4}
        castShadow
      >
        <meshStandardMaterial
          color="#0d1a2a"
          metalness={0.9}
          roughness={0.2}
          emissive={podColor}
          emissiveIntensity={0.15}
          envMapIntensity={1.5}
        />
      </RoundedBox>

      {/* Colored accent bar on top of pod */}
      <mesh ref={accentRef} position={[0, 0.46, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.75, 0.22]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.5}
          side={DoubleSide}
        />
      </mesh>

      {/* Side accent strips — left and right edges */}
      <mesh position={[-0.44, 0, 0.15]}>
        <planeGeometry args={[0.02, 0.7]} />
        <meshBasicMaterial color={pod.color} transparent opacity={0.25} side={DoubleSide} />
      </mesh>
      <mesh position={[0.44, 0, 0.15]}>
        <planeGeometry args={[0.02, 0.7]} />
        <meshBasicMaterial color={pod.color} transparent opacity={0.25} side={DoubleSide} />
      </mesh>

      {/* Glow ring around the pod base */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <ringGeometry args={[0.5, 0.65, 32]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.15}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Ground glow — soft light pool beneath pod */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Bold letter icon on the pod face */}
      <Text
        ref={iconRef}
        position={[0, 0.05, 0.15]}
        fontSize={0.38}
        anchorX="center"
        anchorY="middle"
        color={pod.color}
        letterSpacing={0.02}
      >
        {pod.icon}
      </Text>

      {/* Label text below the pod — bigger and brighter */}
      <Text
        position={[0, -0.65, 0]}
        fontSize={0.14}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? '#ffffff' : pod.color}
        textAlign="center"
        maxWidth={1.5}
        lineHeight={1.2}
        letterSpacing={0.08}
      >
        {pod.label}
      </Text>

      {/* Active indicator dot */}
      {isActive && (
        <mesh position={[0, -0.52, 0.15]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
