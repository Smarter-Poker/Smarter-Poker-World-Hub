/**
 * LobbyScene.jsx — Cinematic 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * 2026 AAA-quality rendering with:
 *   - Full post-processing pipeline (Bloom, SMAA, N8AO, Vignette, ChromaticAberration, ToneMapping)
 *   - Environment-based image lighting (IBL) via Lightformers
 *   - Reflective ground platform (MeshReflectorMaterial)
 *   - Adaptive quality via PerformanceMonitor (mobile-first)
 *   - Cinematic lighting (5 optimized lights + IBL)
 *   - Holographic sphere pods with iridescent PBR materials
 */

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, SMAA, N8AO, Vignette, ChromaticAberration, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { DoubleSide, AdditiveBlending, Vector2 } from 'three';

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
    bloomIntensity: 1.4,
    bloomThreshold: 0.12,
    bloomRadius: 0.75,
    aoEnabled: true,
    aoIntensity: 0.5,
    vignetteEnabled: true,
    chromaticEnabled: true,
    chromaticOffset: 0.0025,
    particleCount: 800,
    reflectionResolution: 256,
    reflectionBlur: [300, 100],
    shadows: true,
  },
  medium: {
    dpr: 1.0,
    bloomIntensity: 1.0,
    bloomThreshold: 0.18,
    bloomRadius: 0.6,
    aoEnabled: true,
    aoIntensity: 0.3,
    vignetteEnabled: true,
    chromaticEnabled: false,
    chromaticOffset: 0,
    particleCount: 500,
    reflectionResolution: 128,
    reflectionBlur: [200, 64],
    shadows: false,
  },
  low: {
    dpr: 0.75,
    bloomIntensity: 0.6,
    bloomThreshold: 0.25,
    bloomRadius: 0.4,
    aoEnabled: false,
    aoIntensity: 0,
    vignetteEnabled: false,
    chromaticEnabled: false,
    chromaticOffset: 0,
    particleCount: 300,
    reflectionResolution: 64,
    reflectionBlur: [100, 32],
    shadows: false,
  },
};

/**
 * Post-processing effects pipeline — cinematic rendering chain.
 */
function SceneEffects({ quality }) {
  const q = QUALITY[quality] || QUALITY.medium;
  const chromaticOffset = new Vector2(q.chromaticOffset, q.chromaticOffset);

  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      {q.aoEnabled && (
        <N8AO
          halfRes
          aoRadius={0.25}
          distanceFalloff={0.5}
          intensity={q.aoIntensity}
          quality="medium"
        />
      )}
      <Bloom
        luminanceThreshold={q.bloomThreshold}
        luminanceSmoothing={0.075}
        intensity={q.bloomIntensity}
        radius={q.bloomRadius}
        mipmapBlur
      />
      {q.vignetteEnabled && (
        <Vignette
          offset={0.3}
          darkness={0.55}
          blendFunction={BlendFunction.NORMAL}
        />
      )}
      {q.chromaticEnabled && (
        <ChromaticAberration
          offset={chromaticOffset}
          radialModulation
          modulationOffset={0.1}
        />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

/**
 * Cinematic environment lighting — replaces scatter of point lights
 * with physically-based image lighting via Lightformers.
 */
function SceneEnvironment() {
  return (
    <Environment resolution={64} background={false}>
      {/* Key area light — top right warm white */}
      <Lightformer
        form="rect"
        intensity={2.5}
        position={[5, 10, 5]}
        scale={[8, 4, 1]}
        color="#ffffff"
      />
      {/* Fill — left cyan */}
      <Lightformer
        form="rect"
        intensity={1.5}
        position={[-6, 6, -3]}
        scale={[6, 3, 1]}
        color="#6ee7ef"
      />
      {/* Rim — behind, deep blue */}
      <Lightformer
        form="circle"
        intensity={1.0}
        position={[0, 3, -8]}
        scale={[5, 5, 1]}
        color="#3b82f6"
      />
      {/* Bottom — warm amber uplighting */}
      <Lightformer
        form="ring"
        intensity={0.8}
        position={[0, -3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[8, 8, 1]}
        color="#ff8c00"
      />
      {/* Accent — purple side */}
      <Lightformer
        form="circle"
        intensity={0.6}
        position={[-5, 4, 2]}
        scale={[3, 3, 1]}
        color="#8b5cf6"
      />
    </Environment>
  );
}

/**
 * Reflective ground platform — replaces flat metallic disc.
 */
function GroundPlatform({ quality }) {
  const q = QUALITY[quality] || QUALITY.medium;

  return (
    <group>
      {/* Main reflective disc */}
      <mesh position={[0, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        <MeshReflectorMaterial
          blur={q.reflectionBlur}
          resolution={q.reflectionResolution}
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
      </mesh>

      {/* Inner ring glow — pod orbit indicator */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.9, 3.95, 64]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.35}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Mid ring */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.0, 3.15, 64]} />
        <meshBasicMaterial
          color="#6ee7ef"
          transparent
          opacity={0.4}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer ring glow — platform edge */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.2, 5.5, 64]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.4}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer haze ring — soft glow beyond platform */}
      <mesh position={[0, -0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 7.5, 64]} />
        <meshBasicMaterial
          color="#00d4ff"
          transparent
          opacity={0.05}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Inner scene content — runs inside the Canvas context.
 */
function SceneContent({ onPodClick, activePod, liveData, quality }) {
  const [RadarDisc, setRadarDisc] = useState(null);
  const [FeaturePod, setFeaturePod] = useState(null);
  const [ParticleField, setParticleField] = useState(null);
  const [ParallaxCamera, setParallaxCamera] = useState(null);

  const q = QUALITY[quality] || QUALITY.medium;

  useEffect(() => {
    Promise.all([
      import('./RadarDisc').then(m => setRadarDisc(() => m.RadarDisc)),
      import('./FeaturePod').then(m => setFeaturePod(() => m.FeaturePod)),
      import('./ParticleField').then(m => setParticleField(() => m.ParticleField)),
      import('./ParallaxCamera').then(m => setParallaxCamera(() => m.ParallaxCamera)),
    ]).catch(err => console.error('[LobbyScene] Failed to load sub-components:', err));
  }, []);

  return (
    <>
      {/* ═══ CINEMATIC LIGHTING (streamlined: 4 lights + IBL) ═══ */}
      {/* Low ambient — let IBL do the work */}
      <ambientLight intensity={0.25} color="#88ccdd" />

      {/* Key light — top right, shadow-casting */}
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.8}
        color="#ffffff"
        castShadow={q.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />

      {/* Fill light — left cyan */}
      <directionalLight position={[-5, 8, -3]} intensity={0.8} color="#6ee7ef" />

      {/* Rim light — behind, blue */}
      <directionalLight position={[0, 3, -8]} intensity={0.5} color="#3b82f6" />

      {/* Center point — pod area illumination */}
      <pointLight position={[0, 5, 0]} intensity={2.0} color="#6ee7ef" distance={15} decay={2} />

      {/* ═══ ENVIRONMENT-BASED LIGHTING ═══ */}
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

      {/* ═══ POST-PROCESSING ═══ */}
      <SceneEffects quality={quality} />
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
  const [canvasReady, setCanvasReady] = useState(false);
  const [quality, setQuality] = useState('medium');
  const [dpr, setDpr] = useState(1);

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
  }, []);

  const handleCreated = useCallback((state) => {
    state.gl.setClearColor(0x000000, 0);
    // Enable tone mapping at renderer level
    state.gl.toneMapping = 4; // ACESFilmicToneMapping
    state.gl.toneMappingExposure = 1.15;
    setCanvasReady(true);
  }, []);

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
            antialias: false, // SMAA handles this now
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
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
          {/* Adaptive quality monitor — auto-adjusts based on FPS */}
          <PerformanceMonitor
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
          <Suspense fallback={null}>
            <SceneContent
              onPodClick={onPodClick}
              activePod={activePod}
              liveData={liveData}
              quality={quality}
            />
          </Suspense>
        </Canvas>
      </R3FErrorBoundary>
    </div>
  );
}
