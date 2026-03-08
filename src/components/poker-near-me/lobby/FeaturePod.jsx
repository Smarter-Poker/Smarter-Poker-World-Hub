/**
 * FeaturePod.jsx — Holographic orb pod with floating image icon.
 *
 * Each pod is a glowing glass sphere containing the AI-generated image,
 * floating above a metallic pedestal with cinematic glow effects.
 * The sphere acts as a crystal ball / holographic display.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import {
  Color, Vector3, DoubleSide, AdditiveBlending, FrontSide,
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
 * GlassOrb — The holographic sphere that contains the image.
 * Uses a translucent glass-like material with a subtle iridescent glow.
 */
function GlassOrb({ color, isHovered, isActive, orbRadius }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (!meshRef.current?.material) return;
    const t = clock.getElapsedTime();
    // Subtle pulse on the glass orb
    const baseOpacity = isHovered ? 0.25 : isActive ? 0.2 : 0.12;
    meshRef.current.material.opacity = baseOpacity + Math.sin(t * 2) * 0.03;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[orbRadius, 32, 32]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.15}
        metalness={0.1}
        roughness={0.1}
        clearcoat={1.0}
        clearcoatRoughness={0.05}
        transmission={0.6}
        thickness={0.5}
        ior={1.5}
        envMapIntensity={0.8}
        side={FrontSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * OrbGlowRing — Glowing ring around the orb equator.
 */
function OrbGlowRing({ color, isHovered, isActive, orbRadius }) {
  const ringRef = useRef();

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    ringRef.current.rotation.z = clock.getElapsedTime() * 0.4;
  });

  const opacity = isHovered ? 0.7 : isActive ? 0.5 : 0.25;

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[orbRadius * 0.95, orbRadius * 1.08, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

/**
 * PodImage — The image billboard rendered INSIDE the glass orb.
 * Sized to fit within the sphere, billboard-facing the camera.
 */
function PodImage({ podId, isHovered, isActive, orbRadius }) {
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
    const targetScale = isHovered ? 1.15 : isActive ? 1.08 : 1.0;
    const s = meshRef.current.scale.x + (targetScale - meshRef.current.scale.x) * 0.08;
    meshRef.current.scale.setScalar(s);
  });

  if (!texture) return null;

  // Size the image to fit inside the orb (inscribed square in circle)
  const imageSize = orbRadius * 1.3; // fills ~65% of the orb diameter

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[imageSize, imageSize]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.08}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * FeaturePod — A holographic glass orb containing a photorealistic icon,
 * floating above a sleek pedestal with cinematic glow effects.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Orb size — slightly smaller so 9 pods don't overlap
  const orbRadius = 0.55;

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

    // Gentle idle bobbing
    const bob = Math.sin(t * 0.6 + pod.angle * 0.04) * 0.06;
    groupRef.current.position.y = basePos.y + bob;

    // Hover lift
    const targetLift = hovered ? 0.35 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.06;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Glow pulse
    if (glowRef.current?.material) {
      const alpha = hovered ? 0.7 : isActive ? 0.5 : (0.2 + 0.08 * Math.sin(t * 1.5 + pod.angle * 0.08));
      glowRef.current.material.opacity += (alpha - glowRef.current.material.opacity) * 0.06;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[basePos.x, basePos.y, basePos.z]}
      userData={{ podId: pod.id }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      {/* ─── GLASS ORB ─── */}
      <group position={[0, orbRadius + 0.15, 0]}>
        {/* The holographic glass sphere */}
        <GlassOrb
          color={pod.color}
          isHovered={hovered}
          isActive={isActive}
          orbRadius={orbRadius}
        />

        {/* Image inside the orb */}
        <PodImage
          podId={pod.id}
          isHovered={hovered}
          isActive={isActive}
          orbRadius={orbRadius}
        />

        {/* Equator glow ring */}
        <OrbGlowRing
          color={pod.color}
          isHovered={hovered}
          isActive={isActive}
          orbRadius={orbRadius}
        />

        {/* Inner light source for the orb */}
        <pointLight
          color={pod.color}
          intensity={hovered ? 1.5 : isActive ? 1.0 : 0.4}
          distance={3}
          decay={2}
        />
      </group>

      {/* ─── PEDESTAL ─── */}
      {/* Slim column */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.15, 0.45, 16]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.7}
          emissive={pod.color}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Pedestal base disc */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 24]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.5}
          emissive={pod.color}
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* ─── BASE GLOW ─── */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
        <ringGeometry args={[0.25, 0.5, 32]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.25}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ground light pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.37, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.04}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── FLOATING LABEL ─── */}
      <Text
        position={[0, -0.55, 0.3]}
        fontSize={0.16}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? '#ffffff' : '#c8d6e5'}
        textAlign="center"
        maxWidth={2.0}
        letterSpacing={0.08}
        outlineWidth={0.02}
        outlineColor="#000000"
        font="/fonts/Inter-Bold.woff"
      >
        {pod.label}
      </Text>

      {/* Active indicator dot */}
      {isActive && (
        <mesh position={[0, -0.75, 0.3]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color={pod.color} />
        </mesh>
      )}
    </group>
  );
}
