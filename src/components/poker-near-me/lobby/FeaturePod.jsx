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
 * FeaturePod — a single clickable 3D pod.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const glowRef = useRef();
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

    // Idle bobbing
    const bob = Math.sin(t * 1.2 + pod.angle * 0.05) * 0.06;
    groupRef.current.position.y = basePos.y + bob;

    // Hover lift
    const targetLift = hovered ? 0.3 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.1;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Slow idle rotation on Y axis
    groupRef.current.rotation.y = Math.sin(t * 0.5 + pod.angle * 0.02) * 0.15;

    // Scale on hover/active
    const targetScale = hovered ? 1.15 : isActive ? 1.08 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.1;
    groupRef.current.scale.setScalar(newScale);

    // Emissive intensity on hover/active
    if (meshRef.current?.material) {
      const targetEmissive = hovered ? 0.5 : isActive ? 0.3 : 0.08;
      const mat = meshRef.current.material;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
    }

    // Glow ring opacity
    if (glowRef.current?.material) {
      const targetAlpha = hovered ? 0.5 : isActive ? 0.3 : 0.1;
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
        args={[0.8, 0.8, 0.25]}
        radius={0.08}
        smoothness={4}
        castShadow
      >
        <meshStandardMaterial
          color="#1a2535"
          metalness={0.85}
          roughness={0.25}
          emissive={podColor}
          emissiveIntensity={0.08}
          envMapIntensity={1.2}
        />
      </RoundedBox>

      {/* Top highlight strip — metallic sheen */}
      <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.2]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.12}
          side={DoubleSide}
        />
      </mesh>

      {/* Glow ring around the pod */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.1}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Icon text (emoji) */}
      <Text
        position={[0, 0.08, 0.14]}
        fontSize={0.28}
        anchorX="center"
        anchorY="middle"
      >
        {pod.icon}
      </Text>

      {/* Label text below the pod */}
      <Text
        position={[0, -0.6, 0]}
        fontSize={0.11}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? pod.color : '#8899aa'}
        textAlign="center"
        maxWidth={1.2}
        lineHeight={1.3}
        letterSpacing={0.06}
      >
        {pod.label}
      </Text>

      {/* Active indicator dot */}
      {isActive && (
        <mesh position={[0, -0.5, 0.14]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
