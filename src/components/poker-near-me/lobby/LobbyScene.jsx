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
 * CRITICAL FIX: R3F Canvas runs in a SEPARATE React root (ReactDOM.createRoot)
 * to isolate it from the page's React #418 hydration error recovery cycles.
 * Without this isolation, hydration errors from other page components (header,
 * etc.) cause repeated unmount/remount of the entire page tree, destroying
 * R3F's internal reconciler and killing the animation loop.
 */

import React, { useEffect, useRef, useCallback } from 'react';

// ─── Detect device quality ONCE at module load (not inside a component) ───
const IS_MOBILE = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || window.innerWidth < 768
);
const INITIAL_QUALITY = IS_MOBILE ? 'low' : 'high';
const INITIAL_DPR = IS_MOBILE ? 0.75 : 1.5;

/**
 * LobbyScene — The exported component.
 *
 * This is a thin wrapper that creates an isolated React root for R3F.
 * The page's React tree only sees a simple div container, while R3F
 * runs in its own reconciler that is immune to page-level re-renders.
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const containerRef = useRef(null);
  const r3fRootRef = useRef(null);
  const propsRef = useRef({ onPodClick, activePod, liveData });

  // Keep props ref updated without triggering R3F root recreation
  useEffect(() => {
    propsRef.current = { onPodClick, activePod, liveData };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log('[LobbyScene] Creating isolated R3F root');

    // Create isolated React root for R3F — immune to page hydration errors
    let root = null;
    let disposed = false;

    (async () => {
      try {
        const ReactDOM = await import('react-dom/client');
        const { R3FScene } = await import('./LobbyR3FScene');

        if (disposed) return;

        root = ReactDOM.createRoot(container);
        r3fRootRef.current = root;

        // Render the R3F scene in the isolated root
        root.render(
          React.createElement(R3FScene, {
            propsRef,
            initialQuality: INITIAL_QUALITY,
            initialDpr: INITIAL_DPR,
            isMobile: IS_MOBILE,
          })
        );

        console.log('[LobbyScene] Isolated R3F root created successfully');
      } catch (err) {
        console.error('[LobbyScene] Failed to create R3F root:', err);
      }
    })();

    return () => {
      disposed = true;
      console.log('[LobbyScene] Disposing isolated R3F root');
      // Delay unmount slightly to avoid React concurrent mode issues
      if (root) {
        setTimeout(() => {
          try {
            root.unmount();
          } catch (e) {
            // Root may already be unmounted
          }
        }, 0);
      }
      r3fRootRef.current = null;
    };
  }, []); // Empty deps — only create root once, NEVER recreate

  // Re-render the isolated root when props change
  useEffect(() => {
    const root = r3fRootRef.current;
    if (!root) return;

    // Import and re-render — the isolated root handles its own updates
    import('./LobbyR3FScene').then(({ R3FScene }) => {
      try {
        root.render(
          React.createElement(R3FScene, {
            propsRef,
            initialQuality: INITIAL_QUALITY,
            initialDpr: INITIAL_DPR,
            isMobile: IS_MOBILE,
          })
        );
      } catch (e) {
        // Ignore if root was already unmounted
      }
    });
  }, [activePod]); // Only re-render when active pod changes

  return (
    <div
      className="lobby-scene-container"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: '#0a0a0f',
      }}
    >
      {/* R3F canvas will be rendered here by the isolated React root */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />
    </div>
  );
}
