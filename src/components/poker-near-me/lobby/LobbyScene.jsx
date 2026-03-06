/**
 * LobbyScene.jsx — The main 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * This is the cinematic command lobby that replaces the flat tab layout.
 * It renders a full WebGL scene with:
 *   - Central holographic radar with scanning beam
 *   - Orbiting 3D feature pods (metallic, glowing)
 *   - Ambient particle field
 *   - Parallax camera tied to mouse/tilt
 *
 * The scene is layered UNDER the standard app UI (search, panels, dock).
 */

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';

// Feature pod definitions — each maps to a real tab/feature
const FEATURE_PODS = [
  { id: 'search',    label: 'Search\nVenues', icon: '🔍', angle: 0,   color: '#6ee7ef' },
  { id: 'nearme',    label: 'Near\nMe',       icon: '📍', angle: 40,  color: '#00d2ff' },
  { id: 'livegames', label: 'Live\nGames',    icon: '🃏', angle: 80,  color: '#ff4444' },
  { id: 'mapview',   label: 'Map\nView',      icon: '🌐', angle: 120, color: '#3b82f6' },
  { id: 'tours',     label: 'Tours',          icon: '🏆', angle: 160, color: '#c9a227' },
  { id: 'calendar',  label: 'Calendar',       icon: '📅', angle: 200, color: '#8b5cf6' },
  { id: 'daily',     label: 'Daily',          icon: '⏱',  angle: 240, color: '#22c55e' },
  { id: 'series',    label: 'Series',         icon: '🏅', angle: 280, color: '#f59e0b' },
  { id: 'wallet',    label: 'Rewards',        icon: '💰', angle: 320, color: '#ffd700' },
];

// Orbit radius for pods (in Three.js world units)
const POD_ORBIT_RADIUS = 3.8;
const POD_Y = 0.15; // slight elevation above the radar disc

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
    // Load sub-components after Canvas has mounted
    Promise.all([
      import('./RadarDisc').then(m => setRadarDisc(() => m.RadarDisc)),
      import('./FeaturePod').then(m => setFeaturePod(() => m.FeaturePod)),
      import('./ParticleField').then(m => setParticleField(() => m.ParticleField)),
      import('./ParallaxCamera').then(m => setParallaxCamera(() => m.ParallaxCamera)),
    ]).catch(err => console.error('[LobbyScene] Failed to load sub-components:', err));
  }, []);

  return (
    <>
      {/* Ambient + directional lighting */}
      <ambientLight intensity={0.15} color="#4488aa" />
      <directionalLight position={[5, 8, 5]} intensity={0.3} color="#6ee7ef" />
      <directionalLight position={[-5, 3, -5]} intensity={0.15} color="#3b82f6" />

      {/* Point lights for dramatic effect */}
      <pointLight position={[0, 2, 0]} intensity={0.6} color="#6ee7ef" distance={8} decay={2} />
      <pointLight position={[0, -2, 0]} intensity={0.2} color="#1a365d" distance={6} decay={2} />

      {/* Test geometry — always renders to prove Canvas works */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#0a1628" metalness={0.8} roughness={0.3} emissive="#6ee7ef" emissiveIntensity={0.05} />
      </mesh>

      {/* Central radar disc */}
      {RadarDisc && <RadarDisc liveData={liveData} />}

      {/* Feature pods orbiting the radar */}
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

      {/* Ambient particle field */}
      {ParticleField && <ParticleField count={200} />}

      {/* Parallax camera controller */}
      {ParallaxCamera && <ParallaxCamera />}
    </>
  );
}

/**
 * R3F Error Boundary — catches errors within the Canvas tree
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
 *
 * @param {function} onPodClick - Callback when a pod is clicked (receives pod id)
 * @param {string} activePod - Currently active/selected pod id
 * @param {object} liveData - Live game/venue data for reactive visuals
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
            position: [0, 5, 7],
            fov: 50,
            near: 0.1,
            far: 100,
          }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
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
