/**
 * LobbyScene.jsx — The main 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * This is the cinematic command lobby that replaces the flat tab layout.
 * It renders a full WebGL scene with:
 *   - Central holographic radar with scanning beam
 *   - Orbiting 3D feature pods (metallic, glowing)
 *   - Ambient particle field
 *   - Parallax camera tied to mouse/tilt
 *   - Post-processing (bloom, vignette)
 *
 * The scene is layered UNDER the standard app UI (search, panels, dock).
 */

import React, { useRef, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RadarDisc } from './RadarDisc';
import { FeaturePod } from './FeaturePod';
import { ParticleField } from './ParticleField';
import { ParallaxCamera } from './ParallaxCamera';

// Try to import postprocessing — graceful fallback if not installed
let EffectComposer, Bloom, Vignette;
try {
  const pp = require('@react-three/postprocessing');
  EffectComposer = pp.EffectComposer;
  Bloom = pp.Bloom;
  Vignette = pp.Vignette;
} catch (e) {
  // postprocessing not installed — will skip effects
}

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
 */
function SceneContent({ onPodClick, activePod, liveData }) {
  const groupRef = useRef();

  return (
    <>
      {/* Ambient + directional lighting */}
      <ambientLight intensity={0.15} color="#4488aa" />
      <directionalLight position={[5, 8, 5]} intensity={0.3} color="#6ee7ef" />
      <directionalLight position={[-5, 3, -5]} intensity={0.15} color="#3b82f6" />

      {/* Point lights for dramatic effect */}
      <pointLight position={[0, 2, 0]} intensity={0.6} color="#6ee7ef" distance={8} decay={2} />
      <pointLight position={[0, -2, 0]} intensity={0.2} color="#1a365d" distance={6} decay={2} />

      {/* Main group — everything orbits around center */}
      <group ref={groupRef}>
        {/* Central radar disc */}
        <RadarDisc liveData={liveData} />

        {/* Feature pods orbiting the radar */}
        {FEATURE_PODS.map((pod) => (
          <FeaturePod
            key={pod.id}
            pod={pod}
            radius={POD_ORBIT_RADIUS}
            y={POD_Y}
            isActive={activePod === pod.id}
            onClick={() => onPodClick(pod.id)}
          />
        ))}
      </group>

      {/* Ambient particle field */}
      <ParticleField count={200} />

      {/* Parallax camera controller */}
      <ParallaxCamera />

      {/* Post-processing (optional — graceful fallback if not installed) */}
      {EffectComposer && Bloom && Vignette && (
        <EffectComposer>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            radius={0.8}
          />
          <Vignette eskil={false} offset={0.3} darkness={0.7} />
        </EffectComposer>
      )}
    </>
  );
}

/**
 * LobbyScene — The exported component. Wraps everything in a Canvas.
 *
 * @param {function} onPodClick - Callback when a pod is clicked (receives pod id)
 * @param {string} activePod - Currently active/selected pod id
 * @param {object} liveData - Live game/venue data for reactive visuals
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
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
      <Canvas
        camera={{
          position: [0, 5, 7],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, 1.5]} // cap pixel ratio for performance
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <SceneContent
            onPodClick={onPodClick}
            activePod={activePod}
            liveData={liveData}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
