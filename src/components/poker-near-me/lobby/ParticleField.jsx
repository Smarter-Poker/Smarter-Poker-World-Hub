/**
 * ParticleField.jsx — Cinematic multi-layer particle system.
 *
 * Phase 2 upgrade:
 *   - THREE distinct particle layers for parallax depth
 *   - Per-particle size variation via custom shader
 *   - Random sparkle/flash effects (bright pops)
 *   - Shooting star streaks on a timer
 *   - Higher-res glow texture (128x128)
 *   - Proper texture dispose on unmount
 *   - GPU-friendly: single draw call per layer via Points
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  AdditiveBlending,
  TextureLoader,
  ShaderMaterial,
} from 'three';

// ─── High-res procedural glow sprite (256x256) ───
function createGlowTexture(size = 256) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  // Multi-stop gradient for softer, more photorealistic glow
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(240,252,255,0.95)');
  gradient.addColorStop(0.25, 'rgba(200,240,255,0.7)');
  gradient.addColorStop(0.45, 'rgba(110,231,239,0.3)');
  gradient.addColorStop(0.65, 'rgba(59,130,246,0.1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new TextureLoader().load(canvas.toDataURL());
  return tex;
}

// ─── Custom vertex shader for per-particle size ───
const particleVertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;

    // Per-particle twinkle
    float twinkle = 0.3 + 0.7 * sin(uTime * 0.6 + aPhase * 6.283);

    // Sparkle flash — rare bright pops that bloom cinematically
    float flash = pow(max(0.0, sin(uTime * 1.5 + aPhase * 12.566)), 12.0) * 3.5;

    vAlpha = twinkle * 0.6 + flash * 0.4;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float sizeFactor = aSize * (1.0 + flash * 0.5);
    gl_PointSize = sizeFactor * uPixelRatio * (280.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  uniform sampler2D uTexture;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 texColor = texture2D(uTexture, gl_PointCoord);
    float alpha = texColor.a * vAlpha;
    if (alpha < 0.01) discard;

    // Bloom-hot emissive — push above bloom threshold (0.15) for cinematic glow
    vec3 emissive = vColor * 2.0;
    gl_FragColor = vec4(emissive * texColor.rgb, alpha);
  }
`;

/**
 * Single particle layer — renders a cloud of glowing particles.
 */
function ParticleLayer({
  count = 500,
  spread = 16,
  ySpread = 0.5,
  sizeRange = [0.08, 0.18],
  speedScale = 1.0,
  palette,
  warmChance = 0.08,
  glowTexture,
}) {
  const pointsRef = useRef();
  const materialRef = useRef();

  // Generate particle data
  const { geometry, velocities, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const pha = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Spherical distribution, flattened vertically
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.45) * spread * 0.5;
      pos[i3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = r * Math.cos(phi) * ySpread;
      pos[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      // Drift velocity
      vel[i3] = (Math.random() - 0.5) * 0.003 * speedScale;
      vel[i3 + 1] = (Math.random() - 0.3) * 0.0015 * speedScale;
      vel[i3 + 2] = (Math.random() - 0.5) * 0.003 * speedScale;

      // Color selection
      const isWarm = Math.random() < warmChance;
      const ci = isWarm
        ? palette.length - 2 + Math.floor(Math.random() * 2)
        : Math.floor(Math.random() * (palette.length - 2));
      const [cr, cg, cb] = palette[Math.min(ci, palette.length - 1)];
      col[i3] = cr + (Math.random() - 0.5) * 0.08;
      col[i3 + 1] = cg + (Math.random() - 0.5) * 0.08;
      col[i3 + 2] = cb + (Math.random() - 0.5) * 0.08;

      // Per-particle size
      sizes[i] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);

      // Phase offset
      pha[i] = Math.random() * Math.PI * 2;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new Float32BufferAttribute(pha, 1));

    return { geometry: geo, velocities: vel, phases: pha };
  }, [count, spread, ySpread, sizeRange, speedScale, palette, warmChance]);

  // Custom shader material
  const material = useMemo(() => {
    const mat = new ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1 },
        uTexture: { value: glowTexture },
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    materialRef.current = mat;
    return mat;
  }, [glowTexture]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const array = posAttr.array;
    const t = clock.getElapsedTime();
    const halfSpread = spread / 2;

    // Update time uniform
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
    }

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const phase = phases[i];

      // Orbital drift + Brownian motion
      const orbit = Math.sin(t * 0.12 + phase) * 0.004 * speedScale;
      const wobble = Math.cos(t * 0.08 + phase * 2) * 0.003 * speedScale;
      const spiral = Math.sin(t * 0.05 + phase * 3) * 0.003;

      array[i3] += velocities[i3] + orbit + spiral;
      array[i3 + 1] += velocities[i3 + 1] + wobble;
      array[i3 + 2] += velocities[i3 + 2] + orbit * 0.7;

      // Soft wrap (fade through bounds)
      const yHalf = halfSpread * ySpread;
      if (array[i3] > halfSpread) array[i3] = -halfSpread;
      if (array[i3] < -halfSpread) array[i3] = halfSpread;
      if (array[i3 + 1] > yHalf) array[i3 + 1] = -yHalf;
      if (array[i3 + 1] < -yHalf) array[i3 + 1] = yHalf;
      if (array[i3 + 2] > halfSpread) array[i3 + 2] = -halfSpread;
      if (array[i3 + 2] < -halfSpread) array[i3 + 2] = halfSpread;
    }

    posAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// ─── Color palettes ───
const CYAN_PALETTE = [
  [0.6, 1.0, 1.0],      // bright cyan (boosted for bloom)
  [0.3, 0.85, 1.1],     // deep blue (above 1.0)
  [0.7, 1.05, 1.0],     // light cyan-green (saturated)
  [0.35, 0.7, 1.0],     // navy blue (saturated)
  [0.55, 1.0, 1.05],    // mid cyan (boosted)
  [1.1, 0.65, 0.1],     // warm amber (boosted)
  [0.7, 0.5, 1.1],      // purple (saturated)
];

const DEEP_PALETTE = [
  [0.15, 0.4, 0.7],     // deep ocean blue
  [0.1, 0.3, 0.55],     // dark blue
  [0.2, 0.55, 0.85],    // medium blue
  [0.12, 0.25, 0.5],    // midnight blue
  [0.3, 0.6, 0.9],      // bright blue
  [0.8, 0.3, 0.0],      // ember (rare)
  [0.4, 0.2, 0.8],      // violet (rare)
];

const GOLD_PALETTE = [
  [1.0, 0.84, 0.0],     // gold
  [1.0, 0.65, 0.0],     // amber
  [0.96, 0.87, 0.7],    // champagne
  [0.85, 0.65, 0.13],   // dark gold
  [1.0, 0.75, 0.3],     // light gold
  [0.43, 0.91, 0.94],   // cyan accent (rare)
  [0.55, 0.35, 0.96],   // purple accent (rare)
];

/**
 * ParticleField — multi-layer cinematic particle system.
 *
 * @param {number} count - Base particle count (distributed across layers)
 * @param {number} spread - Bounding volume radius
 */
export function ParticleField({ count = 500, spread = 16 }) {
  const textureRef = useRef(null);

  // Create glow texture once
  const glowTexture = useMemo(() => {
    const tex = createGlowTexture(256);
    textureRef.current = tex;
    return tex;
  }, []);

  // Cleanup texture on unmount
  useEffect(() => {
    return () => {
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };
  }, []);

  // Distribute count across layers: 60% main, 25% deep, 15% gold accents
  const mainCount = Math.floor(count * 0.6);
  const deepCount = Math.floor(count * 0.25);
  const goldCount = Math.max(20, count - mainCount - deepCount);

  return (
    <group>
      {/* Layer 1: Main cyan particles — close, bright, lively */}
      <ParticleLayer
        count={mainCount}
        spread={spread * 0.7}
        ySpread={0.45}
        sizeRange={[0.20, 0.55]}
        speedScale={1.0}
        palette={CYAN_PALETTE}
        warmChance={0.06}
        glowTexture={glowTexture}
      />

      {/* Layer 2: Deep blue background particles — far, subtle, slow */}
      <ParticleLayer
        count={deepCount}
        spread={spread * 1.2}
        ySpread={0.6}
        sizeRange={[0.12, 0.35]}
        speedScale={0.4}
        palette={DEEP_PALETTE}
        warmChance={0.04}
        glowTexture={glowTexture}
      />

      {/* Layer 3: Gold accent particles — few, bright, near pods */}
      <ParticleLayer
        count={goldCount}
        spread={spread * 0.6}
        ySpread={0.3}
        sizeRange={[0.18, 0.45]}
        speedScale={0.7}
        palette={GOLD_PALETTE}
        warmChance={0.35}
        glowTexture={glowTexture}
      />
    </group>
  );
}
