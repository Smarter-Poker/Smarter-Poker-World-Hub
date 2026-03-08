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
 * ARCHITECTURE: Uses a module-level singleton pattern for the R3F Canvas.
 * React #418 hydration errors on this 950+ page Next.js app cause repeated
 * unmount/remount cycles. If the R3F Canvas is inside React's tree, each
 * cycle destroys the WebGL context before Three.js can finish initializing.
 *
 * Solution: Create the R3F React root ONCE at module scope, then just
 * attach/detach the DOM node when the component mounts/unmounts. The WebGL
 * context persists across hydration recovery cycles, so the 3D scene loads
 * reliably even when React remounts the component 4+ times.
 *
 * The next/dynamic ssr:false wrapper (set by the page) ensures this only
 * runs client-side.
 */

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// ─── Detect device quality ONCE at module load (not inside a component) ───
const IS_MOBILE = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || window.innerWidth < 768
);
const INITIAL_QUALITY = IS_MOBILE ? 'low' : 'high';
const INITIAL_DPR = IS_MOBILE ? 0.75 : 1.5;

// ─── Module-level singleton for the R3F scene ───
// This survives React hydration remount cycles.
let singletonMountPoint = null;  // The DOM div holding the R3F Canvas
let singletonRoot = null;        // The isolated ReactDOM root
let singletonPropsRef = null;    // Shared ref for latest props
let singletonInitialized = false;
let singletonError = null;

/**
 * Initialize the R3F singleton (called once, ever).
 * Creates an isolated React root with the R3F Canvas inside it.
 */
function initSingleton(propsRef) {
  if (singletonInitialized) return;
  singletonInitialized = true;
  singletonPropsRef = propsRef;

  console.log('[LobbyScene] Initializing R3F singleton...');

  // Create a detached DOM node for the R3F scene
  singletonMountPoint = document.createElement('div');
  singletonMountPoint.style.cssText = 'position:absolute;inset:0;';
  singletonMountPoint.className = 'r3f-singleton-mount';

  // Create isolated React root (outside main app's React tree)
  singletonRoot = ReactDOM.createRoot(singletonMountPoint);

  // Dynamically import and render the R3F scene
  import('./LobbyR3FScene')
    .then((mod) => {
      if (!singletonRoot) return; // Page navigated away
      console.log('[LobbyScene] R3F scene module loaded, rendering into singleton root...');
      const R3FScene = mod.R3FScene;
      singletonRoot.render(
        <R3FScene
          propsRef={singletonPropsRef}
          initialQuality={INITIAL_QUALITY}
          initialDpr={INITIAL_DPR}
          isMobile={IS_MOBILE}
        />
      );
    })
    .catch((err) => {
      console.error('[LobbyScene] Failed to load R3F scene:', err);
      singletonError = err.message;
    });
}

/**
 * Destroy the singleton (called on page navigation away).
 * Cleans up WebGL context and React root.
 */
function destroySingleton() {
  if (!singletonInitialized) return;
  console.log('[LobbyScene] Destroying R3F singleton...');

  if (singletonRoot) {
    singletonRoot.unmount();
    singletonRoot = null;
  }
  if (singletonMountPoint?.parentNode) {
    singletonMountPoint.parentNode.removeChild(singletonMountPoint);
  }
  singletonMountPoint = null;
  singletonPropsRef = null;
  singletonInitialized = false;
  singletonError = null;
}

/**
 * LobbyScene — The exported component.
 *
 * On mount: creates the singleton (if needed) and attaches the R3F DOM node.
 * On unmount: detaches the DOM node but does NOT destroy the WebGL context.
 * On page navigation away: destroys the singleton via routeChangeStart listener.
 *
 * This ensures the 3D scene survives React's hydration error recovery cycles
 * (which cause repeated unmount/remount of the component tree).
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const containerRef = useRef(null);
  const propsRef = useRef({ onPodClick, activePod, liveData });

  // Keep props ref updated (this ref is shared with the singleton)
  useEffect(() => {
    propsRef.current = { onPodClick, activePod, liveData };
    // Also update the singleton's ref if it exists
    if (singletonPropsRef) {
      singletonPropsRef.current = { onPodClick, activePod, liveData };
    }
  });

  // Attach/detach the singleton R3F DOM node
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initialize singleton on first mount
    initSingleton(propsRef);

    // Attach the R3F mount point to our container
    if (singletonMountPoint && singletonMountPoint.parentNode !== container) {
      container.appendChild(singletonMountPoint);
      console.log('[LobbyScene] R3F singleton attached to DOM');
    }

    return () => {
      // On unmount: just detach, do NOT destroy
      // This preserves the WebGL context across hydration remounts
      if (singletonMountPoint && singletonMountPoint.parentNode === container) {
        container.removeChild(singletonMountPoint);
        console.log('[LobbyScene] R3F singleton detached from DOM (preserved)');
      }
    };
  }, []);

  // Clean up singleton on page navigation (Next.js route change)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { Router } = require('next/router');
    const handleRouteChange = () => {
      destroySingleton();
    };

    Router.events.on('routeChangeStart', handleRouteChange);
    return () => {
      Router.events.off('routeChangeStart', handleRouteChange);
    };
  }, []);

  // Clean up singleton on full page unload
  useEffect(() => {
    const handleUnload = () => destroySingleton();
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <div
      ref={containerRef}
      className="lobby-scene-container"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: '#030818',
      }}
    >
      {/* R3F singleton DOM node is attached here via useEffect */}
      {singletonError && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ff4444', fontFamily: 'Orbitron, sans-serif', fontSize: 14,
          zIndex: 10,
        }}>
          3D Scene failed to load: {singletonError}
        </div>
      )}
    </div>
  );
}
