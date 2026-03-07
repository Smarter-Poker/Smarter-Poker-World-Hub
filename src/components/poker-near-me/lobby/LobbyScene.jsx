/**
 * LobbyScene.jsx — Cinematic 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * 2026 AAA-quality rendering with:
 *   - Full post-processing pipeline (Bloom, Vignette, ToneMapping)
 *   - Environment-based image lighting (IBL) via Lightformers
 *   - Reflective ground platform (MeshReflectorMaterial)
 *   - Adaptive quality via PerformanceMonitor (mobile-first)
 *   - Cinematic lighting (5 optimized lights + IBL)
 *   - Holographic sphere pods with iridescent PBR materials
 */

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { DoubleSide, AdditiveBlending } from 'three';

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
    particleCount: 800,
    shadows: true,
  },
  medium: {
    dpr: 1.0,
    particleCount: 500,
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
 * These effects require @react-three/postprocessing and postprocessing.
 */
function PostProcessingEffects({ quality }) {
  const [Effects, setEffects] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [rppp, pp] = await Promise.all([
          import('@react-three/postprocessing'),
          import('postprocessing'),
        ]);
        setEffects({ rppp, pp });
      } catch (err) {
        console.warn('[LobbyScene] Post-processing unavailable:', err.message);
      }
    })();
  }, []);

  if (!Effects) return null;

  const { EffectComposer, Bloom, Vignette, ToneMapping } = Effects.rppp;
  const { BlendFunction, ToneMappingMode } = Effects.pp;

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={quality === 'high' ? 0.12 : quality === 'medium' ? 0.18 : 0.25}
        luminanceSmoothing={0.075}
        intensity={quality === 'high' ? 1.4 : quality === 'medium' ? 1.0 : 0.6}
        radius={quality === 'high' ? 0.75 : quality === 'medium' ? 0.6 : 0.4}
        mipmapBlur
      />
      {quality !== 'low' && (
        <Vignette
          offset={0.3}
          darkness={0.55}
          blendFunction={BlendFunction.NORMAL}
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
    import('@react-three/drei').then(m => {
      setEnvComponents({ Environment: m.Environment, Lightformer: m.Lightformer });
    }).catch(err => {
      console.warn('[LobbyScene] Environment loading failed:', err.message);
    });
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
    import('@react-three/drei').then(m => {
      setReflectorMat(() => m.MeshReflectorMaterial);
    }).catch(err => {
      console.warn('[LobbyScene] MeshReflectorMaterial unavailable:', err.message);
    });
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
            mixStrength={0.4}
            roughness={0.85}
            depthScale={0.12}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#061525"
            metalness={0.9}
            mirror={0.15}
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
 * Performance monitor — loaded lazily from drei.
 */
function AdaptiveQuality({ quality, setQuality, setDpr }) {
  const [PerfMon, setPerfMon] = useState(null);

  useEffect(() => {
    import('@react-three/drei').then(m => {
      setPerfMon(() => m.PerformanceMonitor);
    }).catch(() => {});
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
 * Inner scene content — runs inside the Canvas context.
 * Sub-components are loaded lazily to avoid import errors breaking the scene.
 */
function SceneContent({ onPodClick, activePod, liveData, quality, setQuality, setDpr }) {
  const [RadarDisc, setRadarDisc] = useState(null);
  const [FeaturePod, setFeaturePod] = useState(null);
  const [ParticleField, setParticleField] = useState(null);
  const [ParallaxCamera, setParallaxCamera] = useState(null);

  const q = QUALITY[quality] || QUALITY.medium;

  useEffect(() => {
    // Load sub-components independently so one failure doesn't block others
    import('./RadarDisc').then(m => setRadarDisc(() => m.RadarDisc)).catch(err => console.warn('[LobbyScene] RadarDisc failed:', err.message));
    import('./FeaturePod').then(m => setFeaturePod(() => m.FeaturePod)).catch(err => console.warn('[LobbyScene] FeaturePod failed:', err.message));
    import('./ParticleField').then(m => setParticleField(() => m.ParticleField)).catch(err => console.warn('[LobbyScene] ParticleField failed:', err.message));
    import('./ParallaxCamera').then(m => setParallaxCamera(() => m.ParallaxCamera)).catch(err => console.warn('[LobbyScene] ParallaxCamera failed:', err.message));
  }, []);

  return (
    <>
      {/* ═══ CINEMATIC LIGHTING ═══ */}
      <ambientLight intensity={0.25} color="#88ccdd" />
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
      <pointLight position={[0, 5, 0]} intensity={2.0} color="#6ee7ef" distance={15} decay={2} />

      {/* ═══ ENVIRONMENT-BASED LIGHTING (lazy) ═══ */}
      <SceneEnvironment />

      {/* ═══ REFLECTIVE GROUND PLATFORM ═══ */}
      <GroundPlatform quality={quality} />

      {/* ═══ CENTRAL RADAR DISC ═══ */}
      {RadarDisc && (
        <group position={[0, -0.95, 0]}>
          <RadarDisc liveData={liveData} />
        </group>
      )}

      {/* ═══ FEATURE PODS ═══ */}
      {FeaturePod && FEATURE_PODS.map((pod) => (
        <FeaturePod
          key={pod.id}
          pod={pod}
          radius={POD_ORBIT_RADIUS}
          y={POD_Y}
          isActive={activePod === pod.id}
          onClick={() => onPodClick(pod.id)}
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
 * R3F Error Boundary
 */
class R3FErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[LobbyScene R3F Error]', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a0f', color: '#ff4444',
          fontFamily: 'monospace', fontSize: 14, padding: 20, textAlign: 'center',
          flexDirection: 'column', gap: 12, zIndex: 2,
        }}>
          <div>3D Scene Error</div>
          <div style={{ color: '#888', fontSize: 12 }}>{String(this.state.error)}</div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * LobbyScene — The exported component. Wraps everything in a Canvas
 * with adaptive quality scaling for mobile devices.
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const [quality, setQuality] = useState('medium');
  const [dpr, setDpr] = useState(1);
  const [renderError, setRenderError] = useState(null);

  // Detect mobile on mount
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
    if (isMobile) {
      setQuality('low');
      setDpr(0.75);
    } else {
      setQuality('high');
      setDpr(1.5);
    }
    console.log('[LobbyScene] Mounted, quality:', isMobile ? 'low' : 'high');
  }, []);

  const handleCreated = useCallback((state) => {
    console.log('[LobbyScene] Canvas created, renderer:', state.gl.constructor.name);
    state.gl.setClearColor(0x000000, 0);
    state.gl.toneMapping = 4; // ACESFilmicToneMapping
    state.gl.toneMappingExposure = 1.15;
  }, []);

  if (renderError) {
    return (
      <div className="lobby-scene-container" style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#ff4444' }}>
        <div>3D Render Error: {renderError}</div>
      </div>
    );
  }

  return (
    <div
      className="lobby-scene-container"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'auto',
      }}
    >
      <R3FErrorBoundary>
        <Canvas
          camera={{
            position: [0, 4.5, 9.5],
            fov: 48,
            near: 0.1,
            far: 100,
          }}
          dpr={dpr}
          gl={{
            antialias: true,
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
              onPodClick={onPodClick}
              activePod={activePod}
              liveData={liveData}
              quality={quality}
              setQuality={setQuality}
              setDpr={setDpr}
            />
          </Suspense>
        </Canvas>
      </R3FErrorBoundary>
    </div>
  );
}
