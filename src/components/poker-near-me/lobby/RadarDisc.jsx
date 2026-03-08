/**
 * RadarDisc.jsx — The central holographic radar/map at the heart of the lobby.
 *
 * Phase 2 upgrade:
 *   - Brighter sweep beam with bloom-friendly emissive values
 *   - Energy pulse waves radiating outward
 *   - Enhanced venue markers with additive glow halos
 *   - Outer ring upgraded to MeshPhysicalMaterial
 *   - Subtle holographic data lines (connecting radar to pods)
 *   - Center beacon with expanding ripple rings
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ShaderMaterial,
  DoubleSide,
  Color,
  AdditiveBlending,
} from 'three';

// ─── Radar sweep beam shader (enhanced bloom-friendly) ───
const sweepVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sweepFragmentShader = `
  uniform float uTime;
  uniform float uSweepAngle;
  varying vec2 vUv;

  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);
    float angle = atan(dir.y, dir.x);

    // Sweep cone — 35-degree arc with soft edges
    float sweep = uSweepAngle;
    float diff = mod(angle - sweep + 3.14159, 6.28318) - 3.14159;
    float cone = smoothstep(0.55, 0.0, abs(diff));

    // Trail fade — particles left behind the sweep
    float trail = smoothstep(1.2, 0.0, abs(diff)) * 0.3;

    // Radial falloff
    float radial = smoothstep(0.5, 0.08, dist);

    // Combine with bloom-hot values (>1.0 for bloom pickup)
    float alpha = (cone + trail) * radial * 0.65;

    // Emissive cyan — pushed above 1.0 for bloom
    vec3 color = vec3(0.55, 1.2, 1.25) * (cone * 0.8 + trail * 0.4);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── Radar disc surface shader (enhanced) ───
const discVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-worldPos.xyz);
    gl_Position = projectionMatrix * worldPos;
  }
`;

const discFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);

    // Base dark surface
    vec3 baseColor = vec3(0.025, 0.055, 0.09);

    // Concentric rings — more of them, varying brightness
    float ring1 = smoothstep(0.003, 0.0, abs(dist - 0.08)) * 0.4;
    float ring2 = smoothstep(0.003, 0.0, abs(dist - 0.16)) * 0.35;
    float ring3 = smoothstep(0.003, 0.0, abs(dist - 0.24)) * 0.3;
    float ring4 = smoothstep(0.003, 0.0, abs(dist - 0.32)) * 0.3;
    float ring5 = smoothstep(0.003, 0.0, abs(dist - 0.40)) * 0.35;
    float ring6 = smoothstep(0.004, 0.0, abs(dist - 0.48)) * 0.4;
    float rings = ring1 + ring2 + ring3 + ring4 + ring5 + ring6;

    // Cross lines (every 45 degrees)
    float angle = atan(dir.y, dir.x);
    float crossLine = 0.0;
    for (int i = 0; i < 8; i++) {
      float target = float(i) * 0.7854;
      float diff = abs(mod(angle - target + 3.14159, 6.28318) - 3.14159);
      crossLine += smoothstep(0.012, 0.0, diff) * smoothstep(0.0, 0.04, dist) * 0.1;
    }

    // Pulse wave — expanding ring from center
    float pulsePhase = fract(uTime * 0.3);
    float pulseRing = smoothstep(0.015, 0.0, abs(dist - pulsePhase * 0.5)) * (1.0 - pulsePhase);
    float pulsePhase2 = fract(uTime * 0.3 + 0.5);
    float pulseRing2 = smoothstep(0.015, 0.0, abs(dist - pulsePhase2 * 0.5)) * (1.0 - pulsePhase2);

    // Outer edge glow
    float edgeGlow = smoothstep(0.42, 0.5, dist) * smoothstep(0.52, 0.48, dist);

    // Fresnel edge highlight
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);

    // Combine
    vec3 cyan = vec3(0.43, 0.91, 0.94);
    vec3 brightCyan = vec3(0.55, 1.1, 1.15); // bloom-hot
    vec3 color = baseColor;
    color += cyan * rings;
    color += cyan * crossLine;
    color += brightCyan * (pulseRing + pulseRing2) * 0.5;
    color += cyan * edgeGlow * 0.5;
    color += cyan * fresnel * 0.15;

    // Subtle breathing
    float pulse = 0.92 + 0.08 * sin(uTime * 1.5);
    color *= pulse;

    // Circular mask
    float mask = smoothstep(0.5, 0.49, dist);

    gl_FragColor = vec4(color, mask * 0.88);
  }
`;

/**
 * Venue marker — glowing sphere with additive halo.
 */
function VenueMarker({ position, color = '#6ee7ef', delay = 0 }) {
  const ref = useRef();
  const haloRef = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() + delay;
    const scale = 0.92 + 0.08 * Math.sin(t * 1.2);
    ref.current.scale.setScalar(scale);
    ref.current.material.opacity = 0.8 + 0.15 * Math.sin(t * 1.2);

    // Halo pulse
    if (haloRef.current) {
      const haloScale = 1.1 + 0.15 * Math.sin(t * 0.8);
      haloRef.current.scale.setScalar(haloScale);
      haloRef.current.material.opacity = 0.15 + 0.05 * Math.sin(t * 0.8);
    }
  });

  return (
    <group position={position}>
      {/* Core marker */}
      <mesh ref={ref}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
          transparent
          opacity={0.9}
          clearcoat={0.5}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      {/* Additive glow halo */}
      <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.12, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Center beacon — enhanced "you are here" indicator with ripple rings.
 */
function CenterBeacon() {
  const ring1Ref = useRef();
  const ring2Ref = useRef();
  const ring3Ref = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Three staggered expanding ripple rings
    const rings = [ring1Ref, ring2Ref, ring3Ref];
    rings.forEach((ref, i) => {
      if (!ref.current) return;
      const phase = (t * 0.2 + i * 0.33) % 1;
      const scale = 1 + 1.5 * phase;
      ref.current.scale.setScalar(scale);
      ref.current.material.opacity = (1 - phase) * 0.5;
    });
  });

  return (
    <group position={[0, 0.06, 0]}>
      {/* Solid center dot — bright for bloom */}
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#00d2ff" />
      </mesh>
      {/* Glowing core halo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[0.15, 24]} />
        <meshBasicMaterial
          color="#00d2ff"
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Expanding pulse rings (staggered) */}
      {[ring1Ref, ring2Ref, ring3Ref].map((ref, i) => (
        <mesh key={i} ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 32]} />
          <meshBasicMaterial
            color="#00d2ff"
            transparent
            opacity={0.5}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Energy pulse ring — expanding outward pulse from center.
 */
function EnergyPulseRings() {
  const ring1Ref = useRef();
  const ring2Ref = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Two staggered energy pulses
    [ring1Ref, ring2Ref].forEach((ref, i) => {
      if (!ref.current) return;
      const phase = (t * 0.12 + i * 0.5) % 1;
      const scale = 0.3 + phase * 2.7;
      ref.current.scale.setScalar(scale);
      ref.current.material.opacity = (1 - phase) * 0.2;
    });
  });

  return (
    <group position={[0, 0.03, 0]}>
      {[ring1Ref, ring2Ref].map((ref, i) => (
        <mesh key={i} ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.0, 64]} />
          <meshBasicMaterial
            color="#6ee7ef"
            transparent
            opacity={0.2}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * RadarDisc — the full radar assembly.
 */
export function RadarDisc({ liveData }) {
  const groupRef = useRef();
  const sweepAngleRef = useRef(0);

  // Disc surface shader material
  const discMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: discVertexShader,
      fragmentShader: discFragmentShader,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Sweep overlay shader material
  const sweepMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: sweepVertexShader,
      fragmentShader: sweepFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSweepAngle: { value: 0 },
      },
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  // Generate simulated venue marker positions
  const venuePositions = useMemo(() => {
    const count = liveData?.venueCount || 8;
    const positions = [];
    for (let i = 0; i < Math.min(count, 12); i++) {
      const angle = (i / Math.min(count, 12)) * Math.PI * 2 + (i * 0.7);
      const r = 0.4 + Math.random() * 2.2;
      positions.push([
        Math.cos(angle) * r,
        0.05,
        Math.sin(angle) * r,
      ]);
    }
    return positions;
  }, [liveData?.venueCount]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Update shader uniforms
    discMaterial.uniforms.uTime.value = t;
    sweepMaterial.uniforms.uTime.value = t;

    // Rotate sweep
    sweepAngleRef.current = t * 0.8;
    sweepMaterial.uniforms.uSweepAngle.value = sweepAngleRef.current;

    // Very subtle idle rotation of the entire radar
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.1) * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main radar disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={discMaterial}>
        <circleGeometry args={[3, 64]} />
      </mesh>

      {/* Sweep overlay (slightly above disc) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={sweepMaterial}>
        <circleGeometry args={[3, 64]} />
      </mesh>

      {/* Energy pulse waves */}
      <EnergyPulseRings />

      {/* Outer metallic ring — upgraded to MeshPhysicalMaterial */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.9, 3.05, 64]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          emissive="#6ee7ef"
          emissiveIntensity={0.15}
          iridescence={0.3}
          iridescenceIOR={2.0}
        />
      </mesh>

      {/* Inner accent ring — bloom-friendly */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.85, 2.88, 64]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Second inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.8, 1.83, 48]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.15}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Center beacon */}
      <CenterBeacon />

      {/* Venue markers */}
      {venuePositions.map((pos, i) => (
        <VenueMarker key={i} position={pos} delay={i * 0.7} />
      ))}
    </group>
  );
}
