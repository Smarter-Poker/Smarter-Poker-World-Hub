/**
 * FeaturePod.jsx — Photorealistic 3D pod with image-based icons.
 *
 * Uses AI-generated photorealistic images rendered as textured billboards
 * in the 3D scene, replacing primitive geometry for AAA visual quality.
 * Each pod floats on a metallic pedestal with cinematic glow effects.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import {
  Color, Vector3, DoubleSide, AdditiveBlending,
  TextureLoader, LinearFilter, SRGBColorSpace,
} from 'three';

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

// Pod image paths map
const POD_IMAGES = {
  search:    '/images/lobby-pods/search.png',
  nearme:    '/images/lobby-pods/nearme.png',
  livegames: '/images/lobby-pods/livegames.png',
  mapview:   '/images/lobby-pods/mapview.png',
  tours:     '/images/lobby-pods/tours.png',
  calendar:  '/images/lobby-pods/calendar.png',
  daily:     '/images/lobby-pods/daily.png',
  series:    '/images/lobby-pods/series.png',
  wallet:    '/images/lobby-pods/wallet.png',
};

/**
 * Glowing holographic base ring that orbits beneath the icon.
 */
function HoloBaseRing({ color, isHovered, isActive }) {
  const ringRef = useRef();

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = clock.getElapsedTime() * 0.3;
  });

  const opacity = isHovered ? 0.9 : isActive ? 0.7 : 0.45;

  return (
    <group ref={ringRef} position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Outer glow ring */}
      <mesh>
        <ringGeometry args={[0.7, 0.82, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.7}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {/* Inner glow ring */}
      <mesh>
        <ringGeometry args={[0.5, 0.55, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.5}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * The image billboard — a plane with the photorealistic icon texture.
 * Always faces the camera (billboard behavior via onBeforeRender).
 */
function PodImage({ podId, isHovered, isActive }) {
  const meshRef = useRef();
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    const imagePath = POD_IMAGES[podId] || POD_IMAGES.search;
    loader.load(
      imagePath,
      (tex) => {
        if (cancelled) { tex.dispose(); return; }
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.colorSpace = SRGBColorSpace;
        setTexture(prev => { if (prev) prev.dispose(); return tex; });
      },
      undefined,
      (err) => console.warn(`[FeaturePod] Failed to load image for ${podId}:`, err)
    );
    return () => { cancelled = true; };
  }, [podId]);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    // Billboard: face the camera
    meshRef.current.quaternion.copy(camera.quaternion);
    // Scale animation
    const targetScale = isHovered ? 1.25 : isActive ? 1.12 : 1.0;
    const s = meshRef.current.scale.x + (targetScale - meshRef.current.scale.x) * 0.08;
    meshRef.current.scale.setScalar(s);
  });

  if (!texture) return null;

  // Image aspect ratio (Grok generates ~16:9 images)
  const aspect = texture.image ? texture.image.width / texture.image.height : 16 / 9;
  const height = 1.4;
  const width = height * aspect;

  return (
    <mesh ref={meshRef} position={[0, 0.35, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.05}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * FeaturePod — a photorealistic image icon floating on a metallic pedestal
 * with cinematic glow effects and holographic base rings.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const glowRef = useRef();
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
    const bob = Math.sin(t * 0.8 + pod.angle * 0.05) * 0.08;
    groupRef.current.position.y = basePos.y + bob;

    // Hover lift
    const targetLift = hovered ? 0.4 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.06;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Glow pulse
    if (glowRef.current?.material) {
      const alpha = hovered ? 0.8 : isActive ? 0.6 : (0.3 + 0.12 * Math.sin(t * 1.5 + pod.angle * 0.08));
      glowRef.current.material.opacity += (alpha - glowRef.current.material.opacity) * 0.06;
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
      {/* ─── PHOTOREALISTIC IMAGE ICON ─── */}
      <PodImage podId={pod.id} isHovered={hovered} isActive={isActive} />

      {/* ─── HOLOGRAPHIC BASE RING ─── */}
      <HoloBaseRing color={pod.color} isHovered={hovered} isActive={isActive} />

      {/* ─── METALLIC PEDESTAL ─── */}
      {/* Main pedestal cylinder */}
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.22, 0.35, 0.5, 24]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.7}
          clearcoatRoughness={0.15}
          iridescence={0.3}
          iridescenceIOR={2.0}
          emissive={pod.color}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Pedestal top ring */}
      <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.38, 32]} />
        <meshPhysicalMaterial
          color="#1e3045"
          metalness={0.92}
          roughness={0.12}
          clearcoat={0.8}
          emissive={pod.color}
          emissiveIntensity={0.2}
          iridescence={0.4}
        />
      </mesh>

      {/* Pedestal base */}
      <mesh position={[0, -0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 32]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.5}
          emissive="#ff8c00"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* ─── BASE GLOW (Bloom participator) ─── */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.81, 0]}>
        <ringGeometry args={[0.35, 0.65, 32]} />
        <meshBasicMaterial
          color="#ff8c00"
          transparent
          opacity={0.3}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ground light pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.84, 0]}>
        <circleGeometry args={[0.75, 24]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.06}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── FLOATING LABEL ─── */}
      <Text
        position={[0, -1.05, 0.3]}
        fontSize={0.18}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? '#ffffff' : '#c8d6e5'}
        textAlign="center"
        maxWidth={2.2}
        letterSpacing={0.1}
        outlineWidth={0.025}
        outlineColor="#000000"
        font="/fonts/Inter-Bold.woff"
      >
        {pod.label}
      </Text>

      {/* Active indicator dot */}
      {isActive && (
        <mesh position={[0, -1.35, 0.3]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
