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

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DoubleSide, AdditiveBlending, FogExp2, Raycaster, Vector2 } from 'three';

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

const POD_ORBIT_RADIUS = 4.2;
const POD_Y = 0.5;

// ─── Quality presets for adaptive rendering ───
const QUALITY = {
  high: {
    dpr: 1.5,
    particleCount: 900,
    shadows: true,
  },
  medium: {
    dpr: 1.0,
    particleCount: 550,
    shadows: false,
  },
  low: {
    dpr: 0.75,
    particleCount: 300,
    shadows: false,
  },
};

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

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={quality === 'high' ? 0.1 : quality === 'medium' ? 0.15 : 0.22}
        luminanceSmoothing={0.065}
        intensity={quality === 'high' ? 1.6 : quality === 'medium' ? 1.1 : 0.65}
        radius={quality === 'high' ? 0.8 : quality === 'medium' ? 0.65 : 0.4}
        mipmapBlur
      />
      {quality !== 'low' && (
        <Vignette
          offset={0.25}
          darkness={0.6}
          blendFunction={BlendFunction.NORMAL}
        />
      )}
      {quality === 'high' && ChromaticAberration && (
        <ChromaticAberration
          offset={[0.0015, 0.0015]}
          radialModulation
          modulationOffset={0.5}
        />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
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
      <Lightformer form="rect" intensity={2.5} position={[5, 10, 5]} scale={[8, 4, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={1.5} position={[-6, 6, -3]} scale={[6, 3, 1]} color="#6ee7ef" />
      <Lightformer form="circle" intensity={1.0} position={[0, 3, -8]} scale={[5, 5, 1]} color="#3b82f6" />
      <Lightformer form="ring" intensity={0.8} position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[8, 8, 1]} color="#ff8c00" />
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
      {/* Main ground disc — reflective if loaded, fallback to PBR */}
      <mesh position={[0, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        {ReflectorMat ? (
          <ReflectorMat
            blur={quality === 'high' ? [300, 100] : quality === 'medium' ? [200, 64] : [100, 32]}
            resolution={quality === 'high' ? 256 : quality === 'medium' ? 128 : 64}
            mixBlur={0.85}
            mixStrength={0.45}
            roughness={0.82}
            depthScale={0.12}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#061525"
            metalness={0.92}
            mirror={0.18}
          />
        ) : (
          <meshStandardMaterial color="#061525" metalness={0.9} roughness={0.3} />
        )}
      </mesh>

      {/* Inner ring glow — pod orbit indicator */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.9, 3.95, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Mid ring */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.0, 3.15, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Outer ring glow — platform edge */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.2, 5.5, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Outer haze ring */}
      <mesh position={[0, -0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 7.5, 64]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.05} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Vertical energy beam — holographic light pillar rising from the center.
 * Creates a sci-fi "data stream" effect above the radar disc.
 */
function EnergyBeam() {
  const beamRef = useRef();
  const ringsRef = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Beam pulse
    if (beamRef.current) {
      beamRef.current.material.opacity = 0.08 + 0.04 * Math.sin(t * 1.5);
    }

    // Floating rings orbit upward
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;
      const phase = (t * 0.3 + i * 0.33) % 1;
      ring.position.y = phase * 6;
      ring.scale.setScalar(0.3 + phase * 0.7);
      ring.material.opacity = (1 - phase) * 0.15;
      ring.rotation.y = t * 0.5 + i * 2;
    });
  });

  return (
    <group position={[0, -0.9, 0]}>
      {/* Main beam cylinder — very subtle, bloom does the heavy lifting */}
      <mesh ref={beamRef}>
        <cylinderGeometry args={[0.08, 0.15, 8, 16, 1, true]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.08}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Outer glow cylinder */}
      <mesh>
        <cylinderGeometry args={[0.2, 0.4, 7, 16, 1, true]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.03}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Floating ring markers ascending the beam */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={el => { ringsRef.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.15, 0.25, 24]} />
          <meshBasicMaterial
            color="#6ee7ef"
            transparent
            opacity={0.15}
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
 * Orbital halo ring — a slow-spinning holographic ring above the pod orbit.
 */
function OrbitalHalo() {
  const ringRef = useRef();

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.getElapsedTime();
    ringRef.current.rotation.z = t * 0.05;
    ringRef.current.material.opacity = 0.06 + 0.03 * Math.sin(t * 0.8);
  });

  return (
    <mesh ref={ringRef} position={[0, 2.5, 0]} rotation={[-Math.PI / 2.2, 0, 0]}>
      <ringGeometry args={[5.5, 5.7, 96]} />
      <meshBasicMaterial
        color="#6ee7ef"
        transparent
        opacity={0.06}
        blending={AdditiveBlending}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

/**
 * Scene fog setup — adds exponential fog for depth.
 */
function SceneFog() {
  useFrame(({ scene }) => {
    if (!scene.fog) {
      scene.fog = new FogExp2('#020810', 0.035);
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

  return (
    <>
      {/* ═══ PROPS BRIDGE ═══ */}
      <PropsSync propsRef={propsRef} onUpdate={handlePropsUpdate} />

      {/* ═══ NATIVE CLICK DETECTION (bypasses broken R3F events) ═══ */}
      <ClickDetector propsRef={propsRef} />

      {/* ═══ SCENE ATMOSPHERE ═══ */}
      <SceneFog />

      {/* ═══ CINEMATIC LIGHTING ═══ */}
      <ambientLight intensity={0.2} color="#88ccdd" />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.8}
        color="#ffffff"
        castShadow={q.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-5, 8, -3]} intensity={0.8} color="#6ee7ef" />
      <directionalLight position={[0, 3, -8]} intensity={0.5} color="#3b82f6" />
      <pointLight position={[0, 5, 0]} intensity={2.2} color="#6ee7ef" distance={15} decay={2} />
      {/* Underlight for pod pedestals */}
      <pointLight position={[0, -0.5, 0]} intensity={0.8} color="#ff8c00" distance={8} decay={2} />

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
 * R3FScene — The component rendered inside the isolated React root.
 * Contains the Canvas and all 3D content.
 */
export function R3FScene({ propsRef, initialQuality, initialDpr, isMobile }) {
  const [quality, setQuality] = useState(initialQuality);
  const [dpr, setDpr] = useState(initialDpr);

  const handleCreated = useCallback((state) => {
    console.log('[R3FScene] Canvas created, renderer:', state.gl.constructor.name);
    console.log('[R3FScene] Scene children:', state.scene.children.length);
    state.gl.setClearColor(0x000000, 0);
    state.gl.toneMapping = 4; // ACESFilmicToneMapping
    state.gl.toneMappingExposure = 1.2; // Slightly brighter for Phase 2
  }, []);

  return (
    <Canvas
      camera={{
        position: [0, 4.5, 9.5],
        fov: 48,
        near: 0.1,
        far: 100,
      }}
      dpr={dpr}
      frameloop="always"
      gl={{
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      shadows={quality === 'high'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
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
