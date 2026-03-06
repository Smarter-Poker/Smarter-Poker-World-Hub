/**
 * ParticleField.jsx — Ambient floating particle system.
 *
 * Creates a field of small luminous particles that drift slowly,
 * giving the lobby its "alive" atmosphere. Uses Points rendering
 * for performance.
 *
 * Features:
 *   - Random positions in a large bounding volume
 *   - Individual drift velocities
 *   - Cyan-tinted color to match the lobby aesthetic
 *   - GPU-friendly: single draw call via Points
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  AdditiveBlending,
} from 'three';

/**
 * ParticleField — renders count particles as a single Points object.
 *
 * @param {number} count - Number of particles (default 200)
 * @param {number} spread - Bounding volume radius (default 12)
 */
export function ParticleField({ count = 200, spread = 12 }) {
  const pointsRef = useRef();

  // Generate initial positions, velocities, and phase offsets
  const { positions, velocities, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Random position in a sphere
      pos[i3] = (Math.random() - 0.5) * spread;
      pos[i3 + 1] = (Math.random() - 0.5) * spread * 0.6; // flatter vertically
      pos[i3 + 2] = (Math.random() - 0.5) * spread;

      // Slow drift velocity
      vel[i3] = (Math.random() - 0.5) * 0.003;
      vel[i3 + 1] = (Math.random() - 0.5) * 0.002;
      vel[i3 + 2] = (Math.random() - 0.5) * 0.003;

      // Cyan-ish color with slight variation
      col[i3] = 0.3 + Math.random() * 0.2;     // R
      col[i3 + 1] = 0.7 + Math.random() * 0.25; // G
      col[i3 + 2] = 0.85 + Math.random() * 0.15; // B
    }

    return { positions: pos, velocities: vel, colors: col };
  }, [count, spread]);

  // Create geometry with color attribute
  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  // Material
  const material = useMemo(() => {
    return new PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const array = posAttr.array;
    const t = clock.getElapsedTime();
    const halfSpread = spread / 2;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Drift
      array[i3] += velocities[i3];
      array[i3 + 1] += velocities[i3 + 1];
      array[i3 + 2] += velocities[i3 + 2];

      // Wrap around bounds
      if (array[i3] > halfSpread) array[i3] = -halfSpread;
      if (array[i3] < -halfSpread) array[i3] = halfSpread;
      if (array[i3 + 1] > halfSpread * 0.6) array[i3 + 1] = -halfSpread * 0.6;
      if (array[i3 + 1] < -halfSpread * 0.6) array[i3 + 1] = halfSpread * 0.6;
      if (array[i3 + 2] > halfSpread) array[i3 + 2] = -halfSpread;
      if (array[i3 + 2] < -halfSpread) array[i3 + 2] = halfSpread;
    }

    posAttr.needsUpdate = true;

    // Pulse overall opacity
    material.opacity = 0.4 + 0.2 * Math.sin(t * 0.5);
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
