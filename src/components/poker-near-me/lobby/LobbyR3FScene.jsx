/**
 * LobbyR3FScene.jsx — The actual R3F Canvas and scene content.
 *
 * Phase 2 upgrade:
 *   - Vertical energy beam from center (holographic pillar)
 *   - Exponential fog for depth atmosphere
 *   - Enhanced Bloom with ChromaticAberration on high quality
 *   - Floating holographic ring above pods (orbital halo)
 *   - Improved post-processing chain
 *
 * This component runs inside an ISOLATED React root created by LobbyScene.jsx.
 * It is completely immune to the page's hydration errors and re-render cycles.
 */

import React, { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DoubleSide, AdditiveBlending, FogExp2, Raycaster, Vector2, ShaderMaterial } from 'three';

// Feature pod definitions — each maps to a real tab/feature
const FEATURE_PODS = [
  { id: 'search',    label: 'SEARCH VENUES', angle: 0,   color: '#6ee7ef' },
  { id: 'nearme',    label: 'NEAR ME',       angle: 40,  color: '#00d2ff' },
  { id: 'livegames', label: 'LIVE GAMES',    angle: 80,  color: '#ff4444' },
  { id: 'mapview',   label: 'MAP VIEW',      angle: 120, color: '#3b82f6' },
  { id: 'tours',     label: 'TOURS',         angle: 160, color: '#c9a227' },
  { id: 'calendar',  label: 'CALENDAR',      angle: 200, color: '#8b5cf6' },
  { id: 'daily',     label: 'DAILY',         angle: 240, color: '#22c55e' },
  { id: 'series',    label: 'SERIES',        angle: 280, color: '#f59e0b' },
  { id: 'wallet',    label: 'REWARDS',       angle: 320, color: '#ffd700' },
];

const POD_ORBIT_RADIUS = 5.5;
const POD_Y = 0.3;

// ─── Quality presets for adaptive rendering ───
const QUALITY = {
  high: {
    dpr: 2.0,
    particleCount: 1800,
    shadows: true,
    bloomThreshold: 0.02,
    bloomIntensity: 3.2,
    bloomRadius: 0.9,
  },
  medium: {
    dpr: 1.0,
    particleCount: 1000,
    shadows: false,
    bloomThreshold: 0.06,
    bloomIntensity: 2.4,
    bloomRadius: 0.75,
  },
  low: {
    dpr: 0.75,
    particleCount: 500,
    shadows: false,
    bloomThreshold: 0.12,
    bloomIntensity: 1.2,
    bloomRadius: 0.5,
  },
};

/**
 * StarField — massive inverted sphere with gradient and stars.
 * Creates hyper-realistic cosmic background with subtle nebula effects.
 */
function StarField() {
  const meshRef = useRef();

  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform float uTime;

        // Simple hash for star positions
        float hash(vec3 p) {
          p = fract(p * vec3(443.897, 441.423, 437.195));
          p += dot(p, p.yzx + 19.19);
          return fract((p.x + p.y) * p.z);
        }

        // Noise for nebula
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n = mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
          return n;
        }

        void main() {
          vec3 dir = normalize(vWorldPos);

          // Base gradient: rich navy-purple (BRIGHT enough to see!)
          float y = dir.y * 0.5 + 0.5;
          vec3 bottomColor = vec3(0.03, 0.05, 0.14);
          vec3 topColor = vec3(0.08, 0.04, 0.16);
          vec3 horizonColor = vec3(0.06, 0.10, 0.22);
          // Add bright horizon band
          float horizonFactor = 1.0 - abs(dir.y);
          horizonFactor = pow(horizonFactor, 4.0);
          vec3 color = mix(bottomColor, topColor, y);
          color = mix(color, horizonColor, horizonFactor * 0.6);

          // Nebula clouds — MORE visible
          float neb = noise(dir * 3.0 + uTime * 0.01);
          neb = neb * neb * 0.35;
          color += vec3(0.10, 0.04, 0.16) * neb;
          color += vec3(0.04, 0.12, 0.20) * noise(dir * 5.0 - uTime * 0.005) * 0.2;

          // Bright stars — MORE of them, BRIGHTER
          vec3 starGrid = dir * 200.0;
          float star = hash(floor(starGrid));
          float brightness = step(0.994, star);
          float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + star * 100.0);
          color += vec3(1.0, 1.0, 1.2) * brightness * twinkle * 1.5;

          // Medium stars — more visible
          vec3 starGrid2 = dir * 100.0;
          float star2 = hash(floor(starGrid2));
          float brightness2 = step(0.988, star2);
          float twinkle2 = 0.3 + 0.7 * sin(uTime * 1.5 + star2 * 50.0);
          color += vec3(0.6, 0.8, 1.2) * brightness2 * twinkle2 * 0.7;

          // Faint stars — background density
          vec3 starGrid3 = dir * 60.0;
          float star3 = hash(floor(starGrid3));
          float brightness3 = step(0.975, star3);
          color += vec3(0.3, 0.4, 0.6) * brightness3 * 0.2;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
      },
      side: DoubleSide,
    });
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.005;
    }
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[50, 32, 32]} />
    </mesh>
  );
}

/**
 * NeonGridGround — custom shader ground with animated neon grid and sonar pulse.
 * Replaces the boring dark disc with hyper-realistic neon-lit surface.
 */
function NeonGridGround() {
  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vec2 pos = vWorldPos.xz;
          float gridSize = 1.0;
          vec2 grid = abs(fract(pos / gridSize - 0.5) - 0.5) / fwidth(pos / gridSize);
          float line = min(grid.x, grid.y);
          float gridLine = 1.0 - min(line, 1.0);

          // Distance fade
          float dist = length(pos);
          float fade = 1.0 - smoothstep(4.0, 12.0, dist);

          // Sonar pulse
          float pulse = smoothstep(0.3, 0.0, abs(dist - mod(uTime * 2.0, 14.0)));
          float pulse2 = smoothstep(0.3, 0.0, abs(dist - mod(uTime * 2.0 + 7.0, 14.0)));

          // Grid color — MUCH brighter
          vec3 gridColor = vec3(0.43, 0.91, 0.94);
          float alpha = gridLine * fade * 0.4;
          alpha += gridLine * (pulse + pulse2) * fade * 0.6;

          // Center glow — stronger
          float centerGlow = exp(-dist * 0.25) * 0.18;

          vec3 color = gridColor * (alpha + centerGlow);

          gl_FragColor = vec4(color, alpha + centerGlow);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.97, 0]} material={material}>
      <planeGeometry args={[30, 30, 1, 1]} />
    </mesh>
  );
}

/**
 * Post-processing effects — loaded lazily to avoid breaking R3F init.
 * Phase 2: Added ChromaticAberration for cinematic lens feel.
 */
function PostProcessingEffects({ quality }) {
  const [Effects, setEffects] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rppp, pp] = await Promise.all([
          import('@react-three/postprocessing'),
          import('postprocessing'),
        ]);
        if (!cancelled) setEffects({ rppp, pp });
      } catch (err) {
        console.warn('[R3FScene] Post-processing unavailable:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!Effects) return null;

  const { EffectComposer, Bloom, Vignette, ToneMapping, ChromaticAberration } = Effects.rppp;
  const { BlendFunction, ToneMappingMode } = Effects.pp;

  const bloomConfig = QUALITY[quality] || QUALITY.medium;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={bloomConfig.bloomThreshold}
        luminanceSmoothing={0.065}
        intensity={bloomConfig.bloomIntensity}
        radius={bloomConfig.bloomRadius}
        mipmapBlur
      />
      {quality !== 'low' && (
        <Vignette
          offset={0.25}
          darkness={0.75}
          blendFunction={BlendFunction.NORMAL}
        />
      )}
      {quality === 'high' && ChromaticAberration && (
        <ChromaticAberration
          offset={[0.003, 0.003]}
          radialModulation
          modulationOffset={0.5}
        />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} exposure={1.8} />
    </EffectComposer>
  );
}

/**
 * Cinematic environment lighting — loaded lazily.
 */
function SceneEnvironment() {
  const [EnvComponents, setEnvComponents] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import('@react-three/drei').then(m => {
      if (!cancelled) setEnvComponents({ Environment: m.Environment, Lightformer: m.Lightformer });
    }).catch(err => {
      console.warn('[R3FScene] Environment loading failed:', err.message);
    });
    return () => { cancelled = true; };
  }, []);

  if (!EnvComponents) return null;

  const { Environment, Lightformer } = EnvComponents;

  return (
    <Environment resolution={64} background={false}>
      <Lightformer form="rect" intensity={3.5} position={[5, 10, 5]} scale={[8, 4, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.5} position={[-6, 6, -3]} scale={[6, 3, 1]} color="#6ee7ef" />
      <Lightformer form="circle" intensity={1.8} position={[0, 3, -8]} scale={[5, 5, 1]} color="#3b82f6" />
      <Lightformer form="ring" intensity={1.5} position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[8, 8, 1]} color="#ff8c00" />
      <Lightformer form="circle" intensity={0.6} position={[-5, 4, 2]} scale={[3, 3, 1]} color="#8b5cf6" />
    </Environment>
  );
}

/**
 * Reflective ground platform — uses MeshReflectorMaterial (loaded lazily).
 */
function GroundPlatform({ quality }) {
  const [ReflectorMat, setReflectorMat] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import('@react-three/drei').then(m => {
      if (!cancelled) setReflectorMat(() => m.MeshReflectorMaterial);
    }).catch(err => {
      console.warn('[R3FScene] MeshReflectorMaterial unavailable:', err.message);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <group>
      {/* Neon grid ground shader — underneath reflector */}
      <NeonGridGround />

      {/* Main ground disc — reflective if loaded, fallback to PBR */}
      <mesh position={[0, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        {ReflectorMat ? (
          <ReflectorMat
            blur={quality === 'high' ? [300, 100] : quality === 'medium' ? [200, 64] : [100, 32]}
            resolution={quality === 'high' ? 256 : quality === 'medium' ? 128 : 64}
            mixBlur={0.85}
            mixStrength={0.4}
            roughness={0.82}
            depthScale={0.12}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#061525"
            metalness={0.95}
            mirror={0.2}
            transparent
            opacity={0.7}
          />
        ) : (
          <meshStandardMaterial color="#061525" metalness={0.9} roughness={0.3} transparent opacity={0.7} />
        )}
      </mesh>

      {/* Inner ring glow — pod orbit indicator */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.85, 3.98, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Mid ring */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.95, 3.2, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Outer ring glow — platform edge */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.1, 5.55, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Outer haze ring */}
      <mesh position={[0, -0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 7.5, 64]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.20} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Vertical energy beam — hyper-dramatic holographic column with rings and glow.
 * Creates an intense sci-fi "data stream" effect rising from center.
 */
function EnergyBeam() {
  const beamRef = useRef();
  const glowBeamRef = useRef();
  const topGlowRef = useRef();
  const ringsRef = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Main beam pulse — HIGHLY visible
    if (beamRef.current) {
      beamRef.current.material.opacity = 0.55 + 0.15 * Math.sin(t * 1.5);
    }

    // Glow beam pulse
    if (glowBeamRef.current) {
      glowBeamRef.current.material.opacity = 0.25 + 0.10 * Math.sin(t * 1.2);
    }

    // Top bright spot — pulse via opacity (meshBasicMaterial has no emissive)
    if (topGlowRef.current) {
      topGlowRef.current.material.opacity = 0.6 + 0.3 * Math.sin(t * 2);
    }

    // Floating rings orbit upward (5 rings now, bigger)
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;
      const phase = (t * 0.15 + i * 0.2) % 1;
      ring.position.y = phase * 8;
      ring.scale.setScalar(0.5 + phase * 1.0);
      ring.material.opacity = (1 - phase) * 0.5;
      ring.rotation.y = t * 0.5 + i * 2;
    });
  });

  return (
    <group position={[0, -0.9, 0]}>
      {/* Main beam cylinder — HYPER visible */}
      <mesh ref={beamRef}>
        <cylinderGeometry args={[0.25, 0.45, 10, 16, 1, true]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Outer glow cylinder — wider, more dramatic */}
      <mesh ref={glowBeamRef}>
        <cylinderGeometry args={[0.5, 0.8, 9, 16, 1, true]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Bright spot at beam top — glowing sphere (additive blending creates glow) */}
      <mesh ref={topGlowRef} position={[0, 5, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Floating ring markers ascending the beam — 5 rings, bigger */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          ref={el => { ringsRef.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.25, 0.45, 32]} />
          <meshBasicMaterial
            color="#6ee7ef"
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
 * Orbital halo rings — TWO slow-spinning holographic rings for dramatic effect.
 * Ring 1 is thicker and more visible, Ring 2 is tilted and subtle.
 */
function OrbitalHalo() {
  const ring1Ref = useRef();
  const ring2Ref = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Ring 1 — main orbital ring — BRIGHT
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = t * 0.05;
      ring1Ref.current.material.opacity = 0.45 + 0.15 * Math.sin(t * 0.8);
    }

    // Ring 2 — secondary, tilted ring, slower rotation
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = t * 0.03;
      ring2Ref.current.material.opacity = 0.35 + 0.10 * Math.sin(t * 0.6 + 1.5);
    }
  });

  return (
    <>
      {/* Ring 1: Main orbital halo */}
      <mesh ref={ring1Ref} position={[0, 2.5, 0]} rotation={[-Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[5.0, 6.0, 96]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.45}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Ring 2: Secondary tilted ring, slower, subtler */}
      <mesh
        ref={ring2Ref}
        position={[0, 2.3, 0]}
        rotation={[-Math.PI / 2.5, 0, (15 * Math.PI) / 180]}
      >
        <ringGeometry args={[4.8, 5.5, 96]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.35}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </>
  );
}

/**
 * Scene fog setup — adds exponential fog for depth (lighter for more visibility).
 */
function SceneFog() {
  useFrame(({ scene }) => {
    if (!scene.fog) {
      scene.fog = new FogExp2('#030818', 0.018);
    }
  });
  return null;
}

/**
 * Performance monitor — loaded lazily from drei.
 */
function AdaptiveQuality({ quality, setQuality, setDpr }) {
  const [PerfMon, setPerfMon] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import('@react-three/drei').then(m => {
      if (!cancelled) setPerfMon(() => m.PerformanceMonitor);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!PerfMon) return null;

  return (
    <PerfMon
      onIncline={() => {
        if (quality === 'low') { setQuality('medium'); setDpr(1); }
        else if (quality === 'medium') { setQuality('high'); setDpr(1.5); }
      }}
      onDecline={() => {
        if (quality === 'high') { setQuality('medium'); setDpr(1); }
        else if (quality === 'medium') { setQuality('low'); setDpr(0.75); }
      }}
      flipflops={3}
      onFallback={() => { setQuality('low'); setDpr(0.75); }}
    />
  );
}

/**
 * PropsSync — reads from the propsRef to sync page-level props into R3F.
 */
function PropsSync({ propsRef, onUpdate }) {
  useFrame(() => {
    const props = propsRef.current;
    if (props) onUpdate(props);
  });
  return null;
}

/**
 * ClickDetector — Native DOM click → Three.js raycast → pod callback.
 *
 * R3F's built-in event system doesn't initialize properly in the isolated
 * React root (ReactDOM.createRoot). This component bypasses it entirely by:
 *   1. Listening for native DOM click/pointermove events on the canvas
 *   2. Running Three.js Raycaster against the scene
 *   3. Walking up the hit object's parent chain to find a pod group (userData.podId)
 *   4. Calling the propsRef.onPodClick callback
 */
function ClickDetector({ propsRef }) {
  const { gl, camera, scene } = useThree();
  const raycasterRef = useRef(new Raycaster());
  const mouseRef = useRef(new Vector2());

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const getMouseNDC = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const findPodId = (object) => {
      let current = object;
      while (current) {
        if (current.userData?.podId) return current.userData.podId;
        current = current.parent;
      }
      return null;
    };

    const handleClick = (e) => {
      getMouseNDC(e);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        const podId = findPodId(hit.object);
        if (podId) {
          console.log('[ClickDetector] Pod clicked:', podId);
          propsRef.current?.onPodClick?.(podId);
          return;
        }
      }
    };

    const handlePointerMove = (e) => {
      getMouseNDC(e);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(scene.children, true);

      let foundPod = false;
      for (const hit of intersects) {
        if (findPodId(hit.object)) {
          foundPod = true;
          break;
        }
      }
      canvas.style.cursor = foundPod ? 'pointer' : 'auto';
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('pointermove', handlePointerMove);
    console.log('[ClickDetector] Native click detection attached to canvas');

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointermove', handlePointerMove);
    };
  }, [gl, camera, scene, propsRef]);

  return null;
}

/**
 * Inner scene content — runs inside the Canvas context.
 */
function SceneContent({ propsRef, quality, setQuality, setDpr }) {
  const [RadarDisc, setRadarDisc] = useState(null);
  const [FeaturePod, setFeaturePod] = useState(null);
  const [ParticleField, setParticleField] = useState(null);
  const [ParallaxCamera, setParallaxCamera] = useState(null);
  const mountedRef = useRef(true);
  const { camera } = useThree();

  // Bridge props from page React tree
  const [syncedProps, setSyncedProps] = useState({
    onPodClick: propsRef.current?.onPodClick,
    activePod: propsRef.current?.activePod,
    liveData: propsRef.current?.liveData,
  });

  const q = QUALITY[quality] || QUALITY.medium;

  useEffect(() => {
    mountedRef.current = true;
    console.log('[R3FScene] SceneContent mounting, loading sub-components...');

    import('./RadarDisc').then(m => { if (mountedRef.current) setRadarDisc(() => m.RadarDisc); }).catch(err => console.warn('[R3FScene] RadarDisc failed:', err.message));
    import('./FeaturePod').then(m => { if (mountedRef.current) setFeaturePod(() => m.FeaturePod); }).catch(err => console.warn('[R3FScene] FeaturePod failed:', err.message));
    import('./ParticleField').then(m => { if (mountedRef.current) setParticleField(() => m.ParticleField); }).catch(err => console.warn('[R3FScene] ParticleField failed:', err.message));
    import('./ParallaxCamera').then(m => { if (mountedRef.current) setParallaxCamera(() => m.ParallaxCamera); }).catch(err => console.warn('[R3FScene] ParallaxCamera failed:', err.message));

    return () => { mountedRef.current = false; };
  }, []);

  // Sync props from page tree at 60fps via useFrame (no re-renders)
  const handlePropsUpdate = useCallback((props) => {
    setSyncedProps(prev => {
      if (prev.activePod !== props.activePod || prev.onPodClick !== props.onPodClick || prev.liveData !== props.liveData) {
        return props;
      }
      return prev;
    });
  }, []);

  // Auto-orbit camera around Y axis for subtle parallax effect
  useFrame(({ clock }) => {
    if (camera) {
      const t = clock.getElapsedTime();
      const orbitRadius = Math.sqrt(3.0 * 3.0 + 7.0 * 7.0); // Distance from center
      const orbitAngle = t * 0.02; // Slow rotation (0.02 radians/sec)
      camera.position.x = Math.sin(orbitAngle) * orbitRadius;
      camera.position.z = Math.cos(orbitAngle) * orbitRadius;
      camera.lookAt(0, 1.5, 0);
    }
  });

  return (
    <>
      {/* ═══ PROPS BRIDGE ═══ */}
      <PropsSync propsRef={propsRef} onUpdate={handlePropsUpdate} />

      {/* ═══ NATIVE CLICK DETECTION (bypasses broken R3F events) ═══ */}
      <ClickDetector propsRef={propsRef} />

      {/* ═══ COSMIC BACKGROUND ═══ */}
      <StarField />

      {/* ═══ SCENE ATMOSPHERE ═══ */}
      <SceneFog />

      {/* ═══ CINEMATIC LIGHTING ═══ */}
      <ambientLight intensity={0.5} color="#88ccdd" />
      <directionalLight
        position={[5, 10, 5]}
        intensity={3.0}
        color="#ffffff"
        castShadow={q.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-5, 8, -3]} intensity={2.0} color="#6ee7ef" />
      <directionalLight position={[0, 3, -8]} intensity={1.2} color="#3b82f6" />
      <pointLight position={[0, 5, 0]} intensity={5.0} color="#6ee7ef" distance={25} decay={2} />
      {/* Underlight for pod pedestals */}
      <pointLight position={[0, -0.5, 0]} intensity={2.5} color="#ff8c00" distance={10} decay={2} />

      {/* Additional colored accent lights — hyper-realistic */}
      <pointLight position={[4, 3, -3]} intensity={2.5} color="#ff4444" distance={15} decay={2} />
      <pointLight position={[-4, 2, 3]} intensity={2.0} color="#8b5cf6" distance={12} decay={2} />
      <pointLight position={[0, 6, -2]} intensity={1.5} color="#ffd700" distance={18} decay={2} />

      {/* ═══ ENVIRONMENT-BASED LIGHTING (lazy) ═══ */}
      <SceneEnvironment />

      {/* ═══ REFLECTIVE GROUND PLATFORM ═══ */}
      <GroundPlatform quality={quality} />

      {/* ═══ CENTRAL RADAR DISC ═══ */}
      {RadarDisc && (
        <group position={[0, -0.95, 0]}>
          <RadarDisc liveData={syncedProps.liveData} />
        </group>
      )}

      {/* ═══ VERTICAL ENERGY BEAM ═══ */}
      <EnergyBeam />

      {/* ═══ ORBITAL HALO ═══ */}
      <OrbitalHalo />

      {/* ═══ FEATURE PODS ═══ */}
      {FeaturePod && FEATURE_PODS.map((pod) => (
        <FeaturePod
          key={pod.id}
          pod={pod}
          radius={POD_ORBIT_RADIUS}
          y={POD_Y}
          isActive={syncedProps.activePod === pod.id}
          onClick={() => syncedProps.onPodClick?.(pod.id)}
        />
      ))}

      {/* ═══ PARTICLE FIELD ═══ */}
      {ParticleField && <ParticleField count={q.particleCount} spread={16} />}

      {/* ═══ PARALLAX CAMERA ═══ */}
      {ParallaxCamera && <ParallaxCamera />}

      {/* ═══ ADAPTIVE QUALITY MONITOR ═══ */}
      <AdaptiveQuality quality={quality} setQuality={setQuality} setDpr={setDpr} />

      {/* ═══ POST-PROCESSING (lazy) ═══ */}
      <PostProcessingEffects quality={quality} />
    </>
  );
}

/**
 * SceneContentWrapper — Wraps SceneContent with Suspense and quality state.
 * Used by LobbyScene.jsx's R3F createRoot API (no Canvas component needed).
 *
 * When using R3F's createRoot API, we render this directly — it contains
 * everything that was previously inside the <Canvas> component.
 */
export function SceneContentWrapper({ propsRef, initialQuality, isMobile }) {
  const [quality, setQuality] = useState(initialQuality);

  return (
    <Suspense fallback={null}>
      <SceneContent
        propsRef={propsRef}
        quality={quality}
        setQuality={setQuality}
        setDpr={() => {}} // DPR is managed by R3F root.configure() in LobbyScene.jsx
      />
    </Suspense>
  );
}

/**
 * R3FScene — Legacy Canvas-based component (kept for reference/fallback).
 * The primary approach now uses R3F's createRoot API in LobbyScene.jsx.
 */
export function R3FScene({ propsRef, initialQuality, initialDpr, isMobile }) {
  const [quality, setQuality] = useState(initialQuality);
  const [dpr, setDpr] = useState(initialDpr);

  const handleCreated = useCallback((state) => {
    console.log('[R3FScene] Canvas created, renderer:', state.gl.constructor.name);
    console.log('[R3FScene] Scene children:', state.scene.children.length);
    state.gl.setClearColor(0x030818, 1);
    state.gl.toneMapping = 4; // ACESFilmicToneMapping
    state.gl.toneMappingExposure = 1.8; // Even brighter for hyper-realistic cinematic
  }, []);

  return (
    <Canvas
      camera={{
        position: [0, 3.0, 7.0],
        fov: 55,
        near: 0.1,
        far: 100,
      }}
      dpr={dpr}
      frameloop="always"
      gl={{
        antialias: !isMobile,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      }}
      shadows={quality === 'high'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#030818',
      }}
      onCreated={handleCreated}
    >
      <Suspense fallback={null}>
        <SceneContent
          propsRef={propsRef}
          quality={quality}
          setQuality={setQuality}
          setDpr={setDpr}
        />
      </Suspense>
    </Canvas>
  );
}
