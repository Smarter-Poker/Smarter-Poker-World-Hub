/**
 * LobbyScene.jsx — The main 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * Cinematic 3D command lobby with:
 *   - Central holographic radar with scanning beam
 *   - Orbiting holographic sphere pods on metallic pedestals
 *   - Dense star-field particle system
 *   - Parallax camera tied to mouse/tilt
 *   - Dramatic lighting (cyan + amber accents)
 */

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';

// Feature pod definitions — each maps to a real tab/feature
// Icons are handled by the FeaturePod's PodIcon component using the `id` field
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

// Orbit radius for pods (in Three.js world units)
const POD_ORBIT_RADIUS = 4.2;
const POD_Y = 0.5; // elevated for pedestal height

/**
 * Inner scene content — runs inside the Canvas context.
 * Lazy-loads heavy 3D components to avoid blocking Canvas mount.
 */
function SceneContent({ onPodClick, activePod, liveData }) {
  const [RadarDisc, setRadarDisc] = useState(null);
  const [FeaturePod, setFeaturePod] = useState(null);
  const [ParticleField, setParticleField] = useState(null);
  const [ParallaxCamera, setParallaxCamera] = useState(null);

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
      {/* ═══ CINEMATIC LIGHTING ═══ */}
      {/* Main ambient — soft fill */}
      <ambientLight intensity={0.4} color="#88ccdd" />

      {/* Key light — top right (white) */}
      <directionalLight position={[5, 10, 5]} intensity={1.5} color="#ffffff" />
      {/* Fill light — left (cyan tint) */}
      <directionalLight position={[-5, 8, -3]} intensity={0.7} color="#6ee7ef" />

      {/* Center top spotlight — dramatic downward pool */}
      <spotLight
        position={[0, 14, 0]}
        angle={0.6}
        penumbra={0.7}
        intensity={3.0}
        color="#ffffff"
        castShadow
      />

      {/* Cyan accent lights */}
      <pointLight position={[0, 5, 0]} intensity={2.5} color="#6ee7ef" distance={15} decay={2} />
      <pointLight position={[4, 2, 4]} intensity={1.2} color="#00d2ff" distance={10} decay={2} />
      <pointLight position={[-4, 2, -4]} intensity={1.0} color="#00d2ff" distance={10} decay={2} />

      {/* Blue rim light from below */}
      <pointLight position={[0, -2, 0]} intensity={0.8} color="#3b82f6" distance={10} decay={2} />

      {/* Orange/amber accent lights for pedestals */}
      <pointLight position={[3, 0, 3]} intensity={0.6} color="#ff8c00" distance={8} decay={2} />
      <pointLight position={[-3, 0, -3]} intensity={0.6} color="#ff8c00" distance={8} decay={2} />
      <pointLight position={[3, 0, -3]} intensity={0.4} color="#ff6b00" distance={8} decay={2} />
      <pointLight position={[-3, 0, 3]} intensity={0.4} color="#ff6b00" distance={8} decay={2} />

      {/* Purple accent */}
      <pointLight position={[-5, 3, 0]} intensity={0.5} color="#8b5cf6" distance={8} decay={2} />

      {/* Front spot — camera-facing highlight */}
      <spotLight
        position={[0, 6, 10]}
        angle={0.4}
        penumbra={0.5}
        intensity={1.5}
        color="#ffffff"
        target-position={[0, 0, 0]}
      />

      {/* ═══ GROUND PLATFORM ═══ */}
      {/* Main disc — dark metallic platform */}
      <mesh position={[0, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        <meshStandardMaterial
          color="#061525"
          metalness={0.95}
          roughness={0.15}
          emissive="#00d4ff"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Inner ring glow — pod orbit indicator */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.9, 3.95, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.25} />
      </mesh>

      {/* Mid ring */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.0, 3.15, 64]} />
        <meshBasicMaterial color="#6ee7ef" transparent opacity={0.35} />
      </mesh>

      {/* Outer ring glow — platform edge */}
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.2, 5.5, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.35} />
      </mesh>

      {/* Outer haze ring — soft glow beyond platform */}
      <mesh position={[0, -0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.5, 6.8, 64]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.04} depthWrite={false} />
      </mesh>

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

      {/* ═══ STAR FIELD — dense atmospheric particles ═══ */}
      {ParticleField && <ParticleField count={500} spread={16} />}

      {/* ═══ PARALLAX CAMERA ═══ */}
      {ParallaxCamera && <ParallaxCamera />}
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
 * LobbyScene — The exported component. Wraps everything in a Canvas.
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const [canvasReady, setCanvasReady] = useState(false);

  const handleCreated = useCallback((state) => {
    console.log('[LobbyScene] Canvas created, gl:', !!state.gl, 'scene:', !!state.scene);
    state.gl.setClearColor(0x000000, 0);
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
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          shadows
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
            />
          </Suspense>
        </Canvas>
      </R3FErrorBoundary>
    </div>
  );
}
