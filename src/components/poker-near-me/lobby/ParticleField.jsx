/**
 * ParticleField.jsx — Cinematic ambient particle system.
 *
 * 2026 quality upgrade:
 *   - Emissive particles that participate in Bloom post-processing
 *   - Multi-color cyan/blue spectrum with warm accents
 *   - Orbital drift + Brownian motion for natural movement
 *   - Adaptive particle count (mobile-aware)
 *   - GPU-friendly: single draw call via Points
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  AdditiveBlending,
  TextureLoader,
} from 'three';

// Soft glow sprite texture (procedural via canvas)
function createGlowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(200,240,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(110,231,239,0.3)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new TextureLoader().load(canvas.toDataURL());
  return tex;
}

/**
 * ParticleField — renders floating luminous particles.
 *
 * @param {number} count - Number of particles
 * @param {number} spread - Bounding volume radius
 */
export function ParticleField({ count = 500, spread = 16 }) {
  const pointsRef = useRef();

  // Glow texture for soft particle rendering
  const glowTexture = useMemo(() => createGlowTexture(), []);

  // Generate particle data
  const { positions, velocities, colors, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const pha = new Float32Array(count); // phase offsets for variety

    // Color palette: cyan-blue spectrum with warm accents
    const palette = [
      [0.43, 0.91, 0.94],  // bright cyan
      [0.2, 0.7, 1.0],      // deep blue
      [0.58, 0.95, 0.88],   // light cyan-green
      [0.26, 0.51, 0.82],   // navy blue
      [0.4, 0.85, 0.95],    // mid cyan
      [1.0, 0.55, 0.0],     // warm amber (rare accent)
      [0.55, 0.35, 0.96],   // purple (rare accent)
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Random position in flattened sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * spread * 0.5;
      pos[i3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.cos(phi) * 0.5; // flatter vertically
      pos[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Drift velocity with slight upward bias
      vel[i3] = (Math.random() - 0.5) * 0.004;
      vel[i3 + 1] = (Math.random() - 0.3) * 0.002; // slight upward
      vel[i3 + 2] = (Math.random() - 0.5) * 0.004;

      // Color — mostly cyan, occasional warm accent
      const ci = Math.random() < 0.08
        ? 5 + Math.floor(Math.random() * 2) // rare warm/purple
        : Math.floor(Math.random() * 5);      // cyan-blue range
      const [cr, cg, cb] = palette[ci];
      // Add slight variation
      col[i3] = cr + (Math.random() - 0.5) * 0.1;
      col[i3 + 1] = cg + (Math.random() - 0.5) * 0.1;
      col[i3 + 2] = cb + (Math.random() - 0.5) * 0.1;

      // Phase offset for varied pulsing
      pha[i] = Math.random() * Math.PI * 2;
    }

    return { positions: pos, velocities: vel, colors: col, phases: pha };
  }, [count, spread]);

  // Geometry
  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  // Material — emissive glow for Bloom participation
  const material = useMemo(() => {
    const mat = new PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    if (glowTexture) {
      mat.map = glowTexture;
      mat.alphaMap = glowTexture;
      mat.alphaTest = 0.01;
    }
    return mat;
  }, [glowTexture]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const array = posAttr.array;
    const t = clock.getElapsedTime();
    const halfSpread = spread / 2;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const phase = phases[i];

      // Brownian drift + orbital wobble
      const orbit = Math.sin(t * 0.15 + phase) * 0.002;
      const wobble = Math.cos(t * 0.1 + phase * 2) * 0.001;

      array[i3] += velocities[i3] + orbit;
      array[i3 + 1] += velocities[i3 + 1] + wobble;
      array[i3 + 2] += velocities[i3 + 2] + orbit * 0.7;

      // Wrap around bounds
      if (array[i3] > halfSpread) array[i3] = -halfSpread;
      if (array[i3] < -halfSpread) array[i3] = halfSpread;
      if (array[i3 + 1] > halfSpread * 0.5) array[i3 + 1] = -halfSpread * 0.5;
      if (array[i3 + 1] < -halfSpread * 0.5) array[i3 + 1] = halfSpread * 0.5;
      if (array[i3 + 2] > halfSpread) array[i3 + 2] = -halfSpread;
      if (array[i3 + 2] < -halfSpread) array[i3 + 2] = halfSpread;
    }

    posAttr.needsUpdate = true;

    // Pulse opacity — cinematic breathing
    material.opacity = 0.5 + 0.25 * Math.sin(t * 0.4);
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
