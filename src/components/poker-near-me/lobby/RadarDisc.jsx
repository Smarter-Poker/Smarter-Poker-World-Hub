/**
 * RadarDisc.jsx — AAA Game Holographic Radar (2026 cutting-edge)
 *
 * Phase 3 upgrade — Full visual enhancement:
 *   - Visible concentric rings (0.012-0.015 thickness, 0.6-0.9 brightness)
 *   - Enhanced sweep beam (1.8x cone brightness, 0.7 trail, 1.2x alpha)
 *   - Brilliant energy pulses with 1.2x opacity multiplier
 *   - Saturated cyan colors for better visibility
 *   - Enlarged center beacon (0.12 radius) with visible halo (0.3 radius)
 *   - Prominent venue markers (0.08 sphere, 2.5x emissive intensity)
 *   - Dynamic breathing effect (0.85-1.0 range)
 *   - Holographic grid pattern with rotating animation
 *   - Holographic data arc segments at cardinal directions (N/E/S/W)
 *   - Metallic outer ring with 0.4x emissive intensity
 *   - Cross lines at 0.25 opacity for visual impact
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  ShaderMaterial,
  DoubleSide,
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

    // Trail fade — particles left behind the sweep (increased from 0.3 to 0.7)
    float trail = smoothstep(1.2, 0.0, abs(diff)) * 0.7;

    // Radial falloff
    float radial = smoothstep(0.5, 0.08, dist);

    // Combine with bloom-hot values (increased cone multiplier to 1.8, alpha to 1.2)
    float alpha = (cone + trail) * radial * 1.2;

    // Emissive cyan — pushed above 1.0 for bloom (1.8x cone brightness, 0.7 trail)
    vec3 color = vec3(0.55, 1.2, 1.25) * (cone * 1.8 + trail * 0.7);

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
    float angle = atan(dir.y, dir.x);

    // Base dark surface (slightly darker for contrast)
    vec3 baseColor = vec3(0.02, 0.04, 0.08);

    // Concentric rings — VISIBLE with increased thickness (0.012-0.015) and brightness (0.6-0.9)
    float ring1 = smoothstep(0.012, 0.0, abs(dist - 0.08)) * 0.75;
    float ring2 = smoothstep(0.012, 0.0, abs(dist - 0.16)) * 0.70;
    float ring3 = smoothstep(0.012, 0.0, abs(dist - 0.24)) * 0.65;
    float ring4 = smoothstep(0.012, 0.0, abs(dist - 0.32)) * 0.65;
    float ring5 = smoothstep(0.012, 0.0, abs(dist - 0.40)) * 0.70;
    float ring6 = smoothstep(0.015, 0.0, abs(dist - 0.48)) * 0.75;
    float rings = ring1 + ring2 + ring3 + ring4 + ring5 + ring6;

    // Cross lines (every 45 degrees) — increased opacity from 0.1 to 0.25
    float crossLine = 0.0;
    for (int i = 0; i < 8; i++) {
      float target = float(i) * 0.7854;
      float diff = abs(mod(angle - target + 3.14159, 6.28318) - 3.14159);
      crossLine += smoothstep(0.012, 0.0, diff) * smoothstep(0.0, 0.04, dist) * 0.25;
    }

    // Holographic grid pattern — fine dotted grid that rotates slowly
    float gridScale = 24.0;
    vec2 gridUv = vUv * gridScale;
    vec2 gridCell = fract(gridUv);
    float gridDot = length(gridCell - vec2(0.5)) < 0.15 ? 1.0 : 0.0;
    float gridRotated = gridDot * 0.15 * smoothstep(0.5, 0.0, dist);
    gridRotated *= sin(uTime * 0.3) * 0.5 + 0.5;

    // Pulse wave — expanding ring from center
    float pulsePhase = fract(uTime * 0.3);
    float pulseRing = smoothstep(0.015, 0.0, abs(dist - pulsePhase * 0.5)) * (1.0 - pulsePhase);
    float pulsePhase2 = fract(uTime * 0.3 + 0.5);
    float pulseRing2 = smoothstep(0.015, 0.0, abs(dist - pulsePhase2 * 0.5)) * (1.0 - pulsePhase2);

    // Outer edge glow — increased from 0.5 to 1.0
    float edgeGlow = smoothstep(0.42, 0.5, dist) * smoothstep(0.52, 0.48, dist);

    // Fresnel edge highlight — increased from 0.15 to 0.4
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);

    // Combine
    vec3 cyan = vec3(0.43, 0.91, 0.94);
    vec3 brightCyan = vec3(0.55, 1.1, 1.15); // bloom-hot
    vec3 color = baseColor;
    color += cyan * rings;
    color += cyan * crossLine;
    color += brightCyan * (pulseRing + pulseRing2) * 1.2;  // Pulse ring opacity multiplier from 0.5 to 1.2
    color += cyan * edgeGlow * 1.0;  // Increased from 0.5 to 1.0
    color += cyan * fresnel * 0.4;   // Increased from 0.15 to 0.4
    color += cyan * gridRotated;     // Add rotating grid pattern

    // More dynamic breathing — changed from 0.92+0.08 to 0.85+0.15
    float pulse = 0.85 + 0.15 * sin(uTime * 1.5);
    color *= pulse;

    // Circular mask — disc alpha increased from 0.88 to 0.95
    float mask = smoothstep(0.5, 0.49, dist);

    gl_FragColor = vec4(color, mask * 0.95);
  }
`;

/**
 * Venue marker — prominent glowing sphere with enlarged additive halo.
 * Increased from 0.045 sphere radius to 0.08, halo from 0.12 to 0.2, emissive from 1.2 to 2.5
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

    // Halo pulse — increased opacity from 0.15+0.05 to 0.30+0.15
    if (haloRef.current) {
      const haloScale = 1.1 + 0.15 * Math.sin(t * 0.8);
      haloRef.current.scale.setScalar(haloScale);
      haloRef.current.material.opacity = 0.30 + 0.15 * Math.sin(t * 0.8);
    }
  });

  return (
    <group position={position}>
      {/* Core marker — bloom-hot emissive for cinematic glow */}
      <mesh ref={ref}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3.5}
          transparent
          opacity={0.95}
          clearcoat={0.8}
          metalness={0.5}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>
      {/* Additive glow halo — ring increased from 0.12 to 0.2 outer radius, opacity from 0.25 to 0.45 */}
      <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.06, 0.2, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.45}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Center beacon — prominent "you are here" indicator with ripple rings.
 * Beacon increased from 0.07 to 0.12 radius, halo from 0.15 to 0.3, opacity from 0.25 to 0.45
 * Pulse rings increased from 0.1/0.14 to 0.15/0.22
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
      {/* Solid center dot — bright for bloom (increased from 0.07 to 0.12) */}
      <mesh>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#00d2ff" />
      </mesh>
      {/* Glowing core halo (increased from 0.15 to 0.3 radius, opacity from 0.25 to 0.45) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[0.3, 24]} />
        <meshBasicMaterial
          color="#00d2ff"
          transparent
          opacity={0.45}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Expanding pulse rings (staggered, increased from 0.1/0.14 to 0.15/0.22) */}
      {[ring1Ref, ring2Ref, ring3Ref].map((ref, i) => (
        <mesh key={i} ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.22, 32]} />
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
 * Increased opacity from 0.2 to 0.4 (1.2x multiplier in animation)
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
      // Increased from (1 - phase) * 0.2 to (1 - phase) * 0.4
      ref.current.material.opacity = (1 - phase) * 0.4;
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
            opacity={0.4}
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
 * RadarDisc — the full radar assembly with 2026 AAA game aesthetics.
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

  // Holographic data arcs at the four cardinal directions.
  //
  // [AUDIT] This used to build FOUR ShaderMaterials and render FOUR full
  // circleGeometry(3, 64) meshes — four additively-blended full-disc fragment
  // passes just to light up four small arcs. One material with a uAngles array
  // draws all four in a single pass.
  const dataArcMaterial = useMemo(() => {
    const arcVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const arcFragmentShader = `
      uniform float uTime;
      uniform float uAngles[4];
      varying vec2 vUv;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 dir = vUv - center;
        float dist = length(dir);
        float angle = atan(dir.y, dir.x);

        // Curved arc band at a fixed radial distance — shared by all four arcs
        float band = smoothstep(0.08, 0.0, abs(dist - 0.35));

        float arcSum = 0.0;
        float alphaSum = 0.0;
        for (int i = 0; i < 4; i++) {
          float a = uAngles[i];
          float diff = abs(mod(angle - a + 3.14159, 6.28318) - 3.14159);
          float arc = band * smoothstep(0.15, 0.0, diff);
          float glow = sin(uTime * 2.0 + a) * 0.5 + 0.5;
          arcSum += arc;
          alphaSum += arc * (0.6 + 0.4 * glow);
        }

        // Bright cyan color for HUD readout
        vec3 color = vec3(0.55, 1.2, 1.25) * arcSum;

        gl_FragColor = vec4(color, alphaSum);
      }
    `;

    return new ShaderMaterial({
      vertexShader: arcVertexShader,
      fragmentShader: arcFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        // N, E, S, W
        uAngles: { value: [Math.PI / 2, 0, -Math.PI / 2, Math.PI] },
      },
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  // [AUDIT] R3F only disposes objects it constructs from JSX. These materials are
  // handed to meshes as props, so the reconciler does not own them and each
  // mount/remount leaked a compiled GLSL program plus its uniform buffers.
  useEffect(() => () => { discMaterial.dispose(); }, [discMaterial]);
  useEffect(() => () => { sweepMaterial.dispose(); }, [sweepMaterial]);
  useEffect(() => () => { dataArcMaterial.dispose(); }, [dataArcMaterial]);

  // Venue markers, projected from REAL bearings and distances.
  //
  // [AUDIT] This used to take the genuine count of venues within 100 mi
  // (liveData.venueCount) and scatter up to 12 markers at
  // `0.4 + Math.random() * 2.2` with a synthetic angle. The count was real,
  // every position was fabricated — and rendered inside a radar labelled with
  // the user's own location, glowing dots at invented bearings and distances
  // read as actual nearby rooms. Markers are now drawn ONLY from real
  // coordinates: pass liveData.userLocation plus liveData.venues (each with
  // latitude/longitude) and each marker lands at its true bearing, with radial
  // distance scaled against liveData.radiusMiles. With no real data the radar
  // stays abstract rather than inventing rooms.
  const venuePositions = useMemo(() => {
    const origin = liveData?.userLocation;
    const list = Array.isArray(liveData?.venues) ? liveData.venues : null;
    if (!origin || origin.lat == null || origin.lng == null || !list || list.length === 0) {
      return [];
    }

    const DISC_RADIUS = 2.6;           // world units — inside the 3.0 disc rim
    const maxMiles = Number(liveData?.radiusMiles) > 0 ? Number(liveData.radiusMiles) : 100;
    const latRad = (origin.lat * Math.PI) / 180;
    const MILES_PER_DEG_LAT = 69.0;

    return list
      .filter(v => v && v.latitude != null && v.longitude != null)
      .map(v => {
        // Local equirectangular projection — accurate enough at radar scale.
        const north = (v.latitude - origin.lat) * MILES_PER_DEG_LAT;
        const east = (v.longitude - origin.lng) * MILES_PER_DEG_LAT * Math.cos(latRad);
        const miles = Math.sqrt(north * north + east * east);
        return { north, east, miles };
      })
      .filter(p => p.miles <= maxMiles)
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 12)
      .map(p => {
        const scale = DISC_RADIUS / maxMiles;
        // +X is east, -Z is north in this scene's disc orientation.
        return [p.east * scale, 0.05, -p.north * scale];
      });
  }, [liveData?.userLocation, liveData?.venues, liveData?.radiusMiles]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Update shader uniforms
    discMaterial.uniforms.uTime.value = t;
    sweepMaterial.uniforms.uTime.value = t;

    // Update the single holographic data-arc material
    dataArcMaterial.uniforms.uTime.value = t;

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

      {/* Holographic data arc segments at cardinal directions (N, E, S, W) —
          all four drawn in ONE pass by a single shader. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} material={dataArcMaterial}>
        <circleGeometry args={[3, 64]} />
      </mesh>

      {/* Energy pulse waves */}
      <EnergyPulseRings />

      {/* Outer metallic ring — increased emissiveIntensity from 0.15 to 0.4 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.9, 3.05, 64]} />
        <meshPhysicalMaterial
          color="#1a2a3a"
          metalness={0.95}
          roughness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
          emissive="#6ee7ef"
          emissiveIntensity={0.4}
          iridescence={0.3}
          iridescenceIOR={2.0}
        />
      </mesh>

      {/* Inner accent ring — increased opacity from 0.25 to 0.5 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.85, 2.88, 64]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.5}
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
