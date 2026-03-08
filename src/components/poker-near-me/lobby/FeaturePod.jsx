/**
 * FeaturePod.jsx — Premium holographic orb pod with cinematic AAA quality.
 *
 * Each pod is a premium glass sphere containing the AI-generated image,
 * floating above a sleek pedestal with volumetric glow, iridescent materials,
 * and atmospheric haze effects.
 * The sphere acts as a crystal ball / holographic display with theatrical presence.
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
 * GlassOrb — Premium holographic sphere with iridescent and sheen effects.
 * AAA cinematic glass material with refraction, iridescence, and holographic shimmer.
 */
function GlassOrb({ color, isHovered, isActive, orbRadius }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (!meshRef.current?.material) return;
    const t = clock.getElapsedTime();
    // Enhanced pulse on the glass orb
    const baseOpacity = isHovered ? 0.50 : isActive ? 0.45 : 0.40;
    meshRef.current.material.opacity = baseOpacity + Math.sin(t * 0.8) * 0.02;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[orbRadius, 32, 32]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.40}
        metalness={0.2}
        roughness={0.1}
        clearcoat={1.0}
        clearcoatRoughness={0.05}
        iridescence={0.4}
        iridescenceIOR={1.8}
        sheen={0.6}
        sheenColor={color}
        transmission={0.5}
        thickness={1.0}
        ior={1.5}
        emissive={color}
        emissiveIntensity={0.10}
        envMapIntensity={1.2}
        side={FrontSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * OrbGlowRing — Premium dual glow rings with gyroscopic rotation.
 * Primary ring with enhanced thickness and secondary tilted ring for dimensional effect.
 */
function OrbGlowRing({ color, isHovered, isActive, orbRadius }) {
  const ringRef = useRef();
  const ring2Ref = useRef();

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.getElapsedTime() * 0.08;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = clock.getElapsedTime() * -0.06;
    }
  });

  const opacity = isHovered ? 0.4 : isActive ? 0.3 : 0.15;

  return (
    <>
      {/* Primary equator ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[orbRadius * 0.8, orbRadius * 1.25, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Secondary tilted ring for gyroscope effect */}
      <mesh ref={ring2Ref} rotation={[degToRad(15), 0, 0]}>
        <ringGeometry args={[orbRadius * 0.8, orbRadius * 1.25, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.7}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </>
  );
}

/**
 * PodImage — Premium billboard image with enhanced presence inside the orb.
 * Larger image footprint for better visibility and cinematic presence.
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
    const targetScale = isHovered ? 1.04 : isActive ? 1.02 : 1.0;
    const s = meshRef.current.scale.x + (targetScale - meshRef.current.scale.x) * 0.08;
    meshRef.current.scale.setScalar(s);
  });

  if (!texture) return null;

  // Size the image to fill more of the orb for premium presence
  const imageSize = orbRadius * 1.8; // fills more of the orb for dramatic visibility

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
 * FeaturePod — Premium holographic glass orb with AAA cinematic quality.
 * Features volumetric glow, iridescent materials, and theatrical atmospheric effects.
 */
export function FeaturePod({ pod, radius, y, isActive, onClick }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const volumetricGlowRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Orb size — increased for premium presence and visibility
  const orbRadius = 1.1;

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

    // Enhanced idle bobbing for more dynamic feel
    const bob = Math.sin(t * 0.6 + pod.angle * 0.04) * 0.04;
    groupRef.current.position.y = basePos.y + bob;

    // Enhanced hover lift for more responsive feedback
    const targetLift = hovered ? 0.30 : 0;
    const currentLift = groupRef.current.userData.lift || 0;
    const newLift = currentLift + (targetLift - currentLift) * 0.06;
    groupRef.current.userData.lift = newLift;
    groupRef.current.position.y += newLift;

    // Glow pulse with enhanced range
    if (glowRef.current?.material) {
      const alpha = hovered ? 0.85 : isActive ? 0.65 : (0.3 + 0.12 * Math.sin(t * 1.5 + pod.angle * 0.08));
      glowRef.current.material.opacity += (alpha - glowRef.current.material.opacity) * 0.06;
    }

    // Volumetric glow sphere rotation for atmospheric effect
    if (volumetricGlowRef.current) {
      volumetricGlowRef.current.rotation.x = t * 0.05;
      volumetricGlowRef.current.rotation.y = t * 0.03;
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
        {/* Volumetric glow sphere for atmospheric haze — subtle */}
        <mesh ref={volumetricGlowRef}>
          <sphereGeometry args={[orbRadius * 2.0, 16, 16]} />
          <meshBasicMaterial
            color={pod.color}
            transparent
            opacity={0.05}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

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

        {/* Dual glow rings with gyroscope effect */}
        <OrbGlowRing
          color={pod.color}
          isHovered={hovered}
          isActive={isActive}
          orbRadius={orbRadius}
        />

        {/* Inner light source for the orb — restrained for contrast */}
        <pointLight
          color={pod.color}
          intensity={hovered ? 1.2 : isActive ? 0.8 : 0.5}
          distance={5}
          decay={2}
        />
      </group>

      {/* ─── PEDESTAL ─── */}
      {/* Enhanced column with iridescence */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.5, 16]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.7}
          iridescence={0.3}
          iridescenceIOR={1.8}
          emissive={pod.color}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Pedestal base disc */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.04, 24]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.08}
          clearcoat={0.5}
          emissive={pod.color}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* ─── BASE GLOW ─── */}
      {/* Subtle base glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
        <ringGeometry args={[0.45, 1.0, 32]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.08}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Subtle ground light pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.37, 0]}>
        <circleGeometry args={[1.0, 24]} />
        <meshBasicMaterial
          color={pod.color}
          transparent
          opacity={0.06}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* ─── FLOATING LABEL ─── */}
      {/* Enhanced label with larger font and bolder outline */}
      <Text
        position={[0, -0.55, 0.3]}
        fontSize={0.24}
        anchorX="center"
        anchorY="top"
        color={hovered || isActive ? '#ffffff' : '#c8d6e5'}
        textAlign="center"
        maxWidth={2.0}
        letterSpacing={0.08}
        outlineWidth={0.04}
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
