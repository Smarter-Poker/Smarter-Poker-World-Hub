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
 *
 * ARCHITECTURE: This component uses next/dynamic ssr:false (set by the page)
 * to ensure it only runs client-side. The R3F Canvas is rendered directly
 * in the component tree — no isolated React root needed.
 *
 * An error boundary wraps the Canvas to prevent R3F crashes from taking
 * down the entire page.
 */

import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';

// ─── Detect device quality ONCE at module load (not inside a component) ───
const IS_MOBILE = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || window.innerWidth < 768
);
const INITIAL_QUALITY = IS_MOBILE ? 'low' : 'high';
const INITIAL_DPR = IS_MOBILE ? 0.75 : 1.5;

/**
 * Error boundary to catch R3F/Three.js crashes without killing the page.
 */
class R3FErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[R3FErrorBoundary] 3D scene crashed:', error);
    console.error('[R3FErrorBoundary] Component stack:', errorInfo?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#030818', color: '#6ee7ef',
          fontFamily: 'Orbitron, sans-serif', fontSize: 14,
          flexDirection: 'column', gap: 12,
        }}>
          <div>3D Scene Error — Reloading...</div>
          <div style={{ color: '#ff4444', fontSize: 11, maxWidth: '80%', textAlign: 'center' }}>
            {this.state.error?.message?.substring(0, 120)}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#1877f2', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
              fontSize: 13,
            }}
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
 * LobbyScene — The exported component.
 *
 * Directly renders the R3F Canvas with all 3D content.
 * The next/dynamic ssr:false wrapper ensures this only runs client-side.
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const propsRef = useRef({ onPodClick, activePod, liveData });
  const [R3FScene, setR3FScene] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // Keep props ref updated without triggering R3F re-renders
  useEffect(() => {
    propsRef.current = { onPodClick, activePod, liveData };
  });

  // Dynamically import the R3F scene to code-split Three.js
  useEffect(() => {
    let cancelled = false;
    console.log('[LobbyScene] Loading R3F scene module...');

    import('./LobbyR3FScene')
      .then((mod) => {
        if (cancelled) return;
        console.log('[LobbyScene] R3F scene module loaded successfully');
        setR3FScene(() => mod.R3FScene);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[LobbyScene] Failed to load R3F scene:', err);
        setLoadError(err.message);
      });

    return () => { cancelled = true; };
  }, []);

  if (loadError) {
    return (
      <div
        className="lobby-scene-container"
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: '#030818', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#ff4444', fontFamily: 'Orbitron, sans-serif', fontSize: 14,
        }}
      >
        3D Scene failed to load: {loadError}
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
        background: '#030818',
      }}
    >
      <R3FErrorBoundary>
        {R3FScene ? (
          <R3FScene
            propsRef={propsRef}
            initialQuality={INITIAL_QUALITY}
            initialDpr={INITIAL_DPR}
            isMobile={IS_MOBILE}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6ee7ef', fontFamily: 'Orbitron, sans-serif', fontSize: 14,
          }}>
            Loading 3D Engine...
          </div>
        )}
      </R3FErrorBoundary>
    </div>
  );
}
