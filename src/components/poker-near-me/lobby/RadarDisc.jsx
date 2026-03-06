/**
 * RadarDisc.jsx — The central holographic radar/map at the heart of the lobby.
 *
 * Features:
 *   - Concentric metallic rings with soft glow
 *   - Rotating sweep beam (like a real radar)
 *   - Pulsing venue marker dots driven by live data
 *   - Center location beacon
 *   - Cross-hair grid lines
 *   - Subtle idle rotation
 */

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  ShaderMaterial,
  DoubleSide,
  Color,
  Vector3,
} from 'three';

// Shader for the radar sweep beam
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

    // Sweep cone — 30-degree arc
    float sweep = uSweepAngle;
    float diff = mod(angle - sweep + 3.14159, 6.28318) - 3.14159;
    float cone = smoothstep(0.5, 0.0, abs(diff));

    // Fade with distance from center
    float radial = smoothstep(0.5, 0.1, dist);

    // Final color: cyan glow in the sweep area
    float alpha = cone * radial * 0.35;
    gl_FragColor = vec4(0.43, 0.91, 0.94, alpha);
  }
`;

// Shader for the radar disc surface
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
    vec3 baseColor = vec3(0.03, 0.06, 0.1);

    // Concentric rings
    float ring1 = smoothstep(0.002, 0.0, abs(dist - 0.1));
    float ring2 = smoothstep(0.002, 0.0, abs(dist - 0.2));
    float ring3 = smoothstep(0.002, 0.0, abs(dist - 0.3));
    float ring4 = smoothstep(0.002, 0.0, abs(dist - 0.4));
    float ring5 = smoothstep(0.003, 0.0, abs(dist - 0.48));
    float rings = (ring1 + ring2 + ring3 + ring4 + ring5) * 0.3;

    // Cross lines (every 45 degrees)
    float angle = atan(dir.y, dir.x);
    float crossLine = 0.0;
    for (int i = 0; i < 8; i++) {
      float target = float(i) * 0.7854; // pi/4
      float diff = abs(mod(angle - target + 3.14159, 6.28318) - 3.14159);
      crossLine += smoothstep(0.015, 0.0, diff) * smoothstep(0.0, 0.05, dist) * 0.12;
    }

    // Outer edge glow
    float edgeGlow = smoothstep(0.42, 0.5, dist) * smoothstep(0.52, 0.48, dist);

    // Fresnel-ish edge highlight (for 3D metallic feel)
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);

    // Combine
    vec3 cyan = vec3(0.43, 0.91, 0.94);
    vec3 color = baseColor;
    color += cyan * rings;
    color += cyan * crossLine;
    color += cyan * edgeGlow * 0.4;
    color += cyan * fresnel * 0.15;

    // Subtle pulse
    float pulse = 0.9 + 0.1 * sin(uTime * 1.5);
    color *= pulse;

    // Circular mask
    float mask = smoothstep(0.5, 0.49, dist);

    gl_FragColor = vec4(color, mask * 0.85);
  }
`;

/**
 * Venue marker — a small glowing sphere on the radar surface.
 */
function VenueMarker({ position, color = '#6ee7ef', delay = 0 }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() + delay;
    const scale = 0.8 + 0.4 * Math.sin(t * 2);
    ref.current.scale.setScalar(scale);
    ref.current.material.opacity = 0.5 + 0.5 * Math.sin(t * 2);
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

/**
 * Center beacon — the "you are here" indicator.
 */
function CenterBeacon() {
  const ringRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const scale = 1 + 0.8 * ((t * 0.5) % 1);
      ringRef.current.scale.setScalar(scale);
      ringRef.current.material.opacity = 1 - ((t * 0.5) % 1);
    }
  });

  return (
    <group position={[0, 0.06, 0]}>
      {/* Solid center dot */}
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#00d2ff" />
      </mesh>
      {/* Expanding pulse ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.12, 32]} />
        <meshBasicMaterial color="#00d2ff" transparent opacity={0.6} side={DoubleSide} />
      </mesh>
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

      {/* Outer metallic ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.9, 3.05, 64]} />
        <meshStandardMaterial
          color="#1a2a3a"
          metalness={0.9}
          roughness={0.2}
          emissive="#6ee7ef"
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Inner accent ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[2.85, 2.88, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.15} />
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
