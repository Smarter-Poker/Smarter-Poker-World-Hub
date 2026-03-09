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
 * ARCHITECTURE: Uses R3F's own createRoot API for a module-level singleton.
 *
 * React #418 hydration errors on this 950+ page Next.js app cause repeated
 * unmount/remount cycles. If the R3F Canvas is inside React's tree, each
 * cycle destroys the WebGL context before Three.js can finish initializing.
 *
 * Solution: Create a <canvas> element at module scope and use R3F's own
 * `createRoot(canvas)` API (from @react-three/fiber) to initialize WebGL
 * directly — bypassing the <Canvas> component entirely. This gives us full
 * control over WebGL initialization without depending on React's effect
 * lifecycle. The canvas element persists across hydration recovery cycles.
 *
 * The next/dynamic ssr:false wrapper (set by the page) ensures this only
 * runs client-side.
 */

import React, { useEffect, useRef, useState } from 'react';

// ─── Detect device quality ONCE at module load (not inside a component) ───
const IS_MOBILE = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || window.innerWidth < 768
);
const INITIAL_QUALITY = IS_MOBILE ? 'low' : 'high';
const INITIAL_DPR = IS_MOBILE ? 0.75 : 1.5;

// ─── Module-level singleton for the R3F scene ───
// Uses R3F's own createRoot API — NOT ReactDOM.createRoot.
// This directly initializes WebGL without depending on React's useLayoutEffect.
let singletonCanvas = null;    // The actual <canvas> DOM element
let singletonR3FRoot = null;   // R3F's createRoot instance
let singletonWrapper = null;   // Wrapper div for positioning
let singletonPropsRef = null;  // Shared ref for latest props
let singletonInitialized = false;
let singletonError = null;

/**
 * Initialize the R3F singleton using R3F's own createRoot API.
 * This bypasses the <Canvas> component and directly initializes WebGL.
 */
async function initSingleton(propsRef) {
  if (singletonInitialized) return;
  singletonInitialized = true;
  singletonPropsRef = propsRef;

  console.log('[LobbyScene] Initializing R3F singleton via createRoot API...');

  try {
    // Create the wrapper div and canvas element at module scope
    singletonWrapper = document.createElement('div');
    singletonWrapper.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    singletonWrapper.className = 'r3f-singleton-mount';

    singletonCanvas = document.createElement('canvas');
    singletonCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;';

    // PRE-CREATE WebGL context with correct attributes BEFORE R3F touches it.
    // WebGL context attributes are IMMUTABLE after creation. If R3F creates
    // the context first (with defaults), alpha:true can never be changed.
    // By creating it here with alpha:false, R3F will reuse this context.
    // antialias: false — post-processing SMAA handles anti-aliasing
    singletonCanvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
      stencil: true,
      depth: true,
    });
    console.log('[LobbyScene] WebGL context pre-created with alpha:false');

    singletonWrapper.appendChild(singletonCanvas);

    // Import R3F's createRoot and the scene content
    const [r3f, sceneMod] = await Promise.all([
      import('@react-three/fiber'),
      import('./LobbyR3FScene'),
    ]);

    if (!singletonCanvas) {
      console.warn('[LobbyScene] Singleton destroyed before R3F loaded');
      return;
    }

    const { createRoot, extend } = r3f;
    const { SceneContentWrapper } = sceneMod;

    // Extend Three.js catalog (required for R3F createRoot)
    const THREE = await import('three');
    extend(THREE);

    console.log('[LobbyScene] Creating R3F root on canvas element...');

    // Create R3F root directly on the canvas element
    // It will reuse the pre-created WebGL context with alpha:false
    singletonR3FRoot = createRoot(singletonCanvas);

    // Configure the R3F root with all Canvas-equivalent settings
    singletonR3FRoot.configure({
      gl: {
        antialias: false, // SMAA handles AA via post-processing
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      },
      camera: {
        position: [0, 3.0, 7.0],
        fov: 55,
        near: 0.1,
        far: 100,
      },
      dpr: INITIAL_DPR,
      frameloop: 'always',
      shadows: INITIAL_QUALITY === 'high',
      events: r3f.createPointerEvents,
      onCreated: (state) => {
        console.log('[LobbyScene] R3F root created! Renderer:', state.gl.constructor.name);
        console.log('[LobbyScene] Canvas size:', state.gl.domElement.width, 'x', state.gl.domElement.height);
        state.gl.setClearColor(0x030818, 1);
        state.gl.toneMapping = 4; // ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.2; // Phase 1: brighter cinematic exposure
      },
    });

    // Render the scene content (no <Canvas> wrapper needed!)
    singletonR3FRoot.render(
      <SceneContentWrapper
        propsRef={singletonPropsRef}
        initialQuality={INITIAL_QUALITY}
        isMobile={IS_MOBILE}
      />
    );

    console.log('[LobbyScene] R3F singleton fully initialized and rendering!');
  } catch (err) {
    console.error('[LobbyScene] Failed to initialize R3F singleton:', err);
    singletonError = err.message;
  }
}

/**
 * Destroy the singleton (called on page navigation away).
 * Cleans up WebGL context and R3F root.
 */
function destroySingleton() {
  if (!singletonInitialized) return;
  console.log('[LobbyScene] Destroying R3F singleton...');

  if (singletonR3FRoot) {
    try {
      singletonR3FRoot.unmount();
    } catch (e) {
      console.warn('[LobbyScene] Error unmounting R3F root:', e);
    }
    singletonR3FRoot = null;
  }

  // Force-lose the WebGL context to free GPU memory
  if (singletonCanvas) {
    const gl = singletonCanvas.getContext('webgl2') || singletonCanvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  if (singletonWrapper?.parentNode) {
    singletonWrapper.parentNode.removeChild(singletonWrapper);
  }

  singletonCanvas = null;
  singletonWrapper = null;
  singletonR3FRoot = null;
  singletonPropsRef = null;
  singletonInitialized = false;
  singletonError = null;
}

/**
 * LobbyScene — The exported component.
 *
 * On mount: creates the singleton (if needed) and attaches the R3F canvas.
 * On unmount: detaches the canvas but does NOT destroy the WebGL context.
 * On page navigation away: destroys the singleton via routeChangeStart listener.
 *
 * This ensures the 3D scene survives React's hydration error recovery cycles
 * (which cause repeated unmount/remount of the component tree).
 */
export default function LobbyScene({ onPodClick, activePod, liveData }) {
  const containerRef = useRef(null);
  const propsRef = useRef({ onPodClick, activePod, liveData });
  const [error, setError] = useState(null);

  // Keep props ref updated (this ref is shared with the singleton)
  useEffect(() => {
    propsRef.current = { onPodClick, activePod, liveData };
    // Also update the singleton's ref if it exists
    if (singletonPropsRef) {
      singletonPropsRef.current = { onPodClick, activePod, liveData };
    }
  });

  // Attach/detach the singleton R3F canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initialize singleton on first mount
    initSingleton(propsRef).then(() => {
      // Check for errors after init
      if (singletonError) {
        setError(singletonError);
      }
    });

    // Attach the R3F wrapper to our container
    if (singletonWrapper && singletonWrapper.parentNode !== container) {
      container.appendChild(singletonWrapper);
      console.log('[LobbyScene] R3F singleton canvas attached to DOM');
    }

    // Poll briefly for the wrapper to be ready (async init)
    const attachInterval = setInterval(() => {
      if (singletonWrapper && singletonWrapper.parentNode !== container) {
        container.appendChild(singletonWrapper);
        console.log('[LobbyScene] R3F singleton canvas attached to DOM (deferred)');
        clearInterval(attachInterval);
      } else if (singletonWrapper?.parentNode === container) {
        clearInterval(attachInterval);
      }
    }, 100);

    return () => {
      clearInterval(attachInterval);
      // On unmount: just detach, do NOT destroy
      // This preserves the WebGL context across hydration remounts
      if (singletonWrapper && singletonWrapper.parentNode === container) {
        container.removeChild(singletonWrapper);
        console.log('[LobbyScene] R3F singleton canvas detached from DOM (preserved)');
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
      {/* R3F singleton canvas is attached here via useEffect */}
      {(error || singletonError) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ff4444', fontFamily: 'Orbitron, sans-serif', fontSize: 14,
          zIndex: 10,
        }}>
          3D Scene failed to load: {error || singletonError}
        </div>
      )}
    </div>
  );
}
