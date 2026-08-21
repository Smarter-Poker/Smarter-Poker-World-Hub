/**
 * LobbyScene.jsx — Cinematic 3D React Three Fiber scene for the Poker Near Me lobby.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * [AUDIT] NOT MOUNTED IN PRODUCTION — DO NOT REVIVE WITHOUT READING THIS.
 *
 * Nothing outside src/components/poker-near-me/lobby/ imports this file. The
 * page (pages/hub/poker-near-me/lobby.js) renders <LobbyCanvas /> — a 2D image
 * plus CSS radar — and the barrel (./index.js) exports only LobbyCanvas and
 * LobbyOverlay. LobbyScene, LobbyR3FScene, RadarDisc, ParticleField,
 * ParallaxCamera and FeaturePod reference only each other, and FeaturePod /
 * ClickDetector are additionally commented out inside LobbyR3FScene. No WebGL
 * context is ever created on the live lobby, so questions about GL disposal,
 * rAF leaks and low-end-mobile degradation have no production surface here.
 *
 * If this stack is brought back, it is already mis-wired: RadarDisc reads
 * `liveData.userLocation`, `liveData.venues` and `liveData.radiusMiles` to place
 * venue markers, and the page's `liveData` memo emits none of those three keys
 * (it emits liveGameCount, liveGameLabel and dailyCount only) — `venuePositions`
 * would resolve to [] and the radar would render with no markers. Extend the
 * memo in lobby.js FIRST, then mount this behind a quality/opt-in flag.
 * ─────────────────────────────────────────────────────────────────────────────
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

// ─── Detect device quality ───
// [AUDIT] This used to be a UA regex plus `window.innerWidth < 768` evaluated
// ONCE at module load, so an iPad in landscape or a rotated phone was classed
// 'high' and got DPR 1.5 with shadows on, and a narrow desktop window was
// classed 'low' forever. Use actual capability signals (core count, device
// memory, coarse pointer) and honour prefers-reduced-motion, evaluated when the
// singleton is first initialised rather than at import time.
function detectDeviceProfile() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isLowPower: true, quality: 'low', dpr: 0.75, reducedMotion: false };
  }
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Low power: few cores, little RAM, or a touch-primary device.
  const isLowPower = cores <= 4 || memory <= 4 || coarsePointer;

  if (reducedMotion || isLowPower) {
    return { isLowPower: true, quality: 'low', dpr: 0.75, reducedMotion };
  }
  const highEnd = cores >= 8 && memory >= 8;
  return {
    isLowPower: false,
    quality: highEnd ? 'high' : 'medium',
    dpr: highEnd ? 1.5 : 1,
    reducedMotion,
  };
}

// ─── Module-level singleton for the R3F scene ───
// Uses R3F's own createRoot API — NOT ReactDOM.createRoot.
// This directly initializes WebGL without depending on React's useLayoutEffect.
let singletonCanvas = null;    // The actual <canvas> DOM element
let singletonR3FRoot = null;   // R3F's createRoot instance
let singletonWrapper = null;   // Wrapper div for positioning
let singletonPropsRef = null;  // Shared ref for latest props
let singletonInitialized = false;
let singletonError = null;
let singletonGl = null;        // The WebGL context created in initSingleton
let singletonProfile = null;   // Device profile chosen at init time
let singletonConfig = null;    // The exact options passed to root.configure()
let singletonState = null;     // R3F root state captured in onCreated

/**
 * Initialize the R3F singleton using R3F's own createRoot API.
 * This bypasses the <Canvas> component and directly initializes WebGL.
 */
async function initSingleton(propsRef) {
  if (singletonInitialized) return;
  singletonInitialized = true;
  singletonPropsRef = propsRef;
  singletonProfile = detectDeviceProfile();

  console.debug('[LobbyScene] Initializing R3F singleton via createRoot API...');

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
    // [AUDIT] Keep the handle. destroySingleton used to re-query
    // getContext('webgl2') to reach WEBGL_lose_context; on some drivers that
    // returns null when the original context was created with different
    // attributes, and the context was then never explicitly lost.
    singletonGl = singletonCanvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
      stencil: true,
      depth: true,
    });
    console.debug('[LobbyScene] WebGL context pre-created with alpha:false');

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

    console.debug('[LobbyScene] Creating R3F root on canvas element...');

    // Create R3F root directly on the canvas element
    // It will reuse the pre-created WebGL context with alpha:false
    singletonR3FRoot = createRoot(singletonCanvas);

    // Configure the R3F root with all Canvas-equivalent settings.
    // The object is kept in `singletonConfig` because root.configure() applies
    // DEFAULTS for every key it is not given (shadows:false, dpr:[1,2], ...) —
    // a later configure({ frameloop }) alone would silently disable shadows and
    // reset the device-pixel-ratio. See setSingletonFrameloop.
    singletonConfig = {
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
      dpr: singletonProfile.dpr,
      frameloop: 'always',
      shadows: singletonProfile.quality === 'high',
      events: r3f.createPointerEvents,
      onCreated: (state) => {
        // Keep the root state — it exposes setFrameloop, which pauses the loop
        // without re-running configure() and its defaults.
        singletonState = state;
        console.debug('[LobbyScene] R3F root created! Renderer:', state.gl.constructor.name);
        console.debug('[LobbyScene] Canvas size:', state.gl.domElement.width, 'x', state.gl.domElement.height);
        state.gl.setClearColor(0x030818, 1);
        state.gl.toneMapping = 4; // ACESFilmicToneMapping
        state.gl.toneMappingExposure = 1.2; // Phase 1: brighter cinematic exposure
      },
    };

    singletonR3FRoot.configure(singletonConfig);

    // Render the scene content (no <Canvas> wrapper needed!)
    singletonR3FRoot.render(
      <SceneContentWrapper
        propsRef={singletonPropsRef}
        initialQuality={singletonProfile.quality}
        isMobile={singletonProfile.isLowPower}
      />
    );

    console.debug('[LobbyScene] R3F singleton fully initialized and rendering!');
  } catch (err) {
    console.warn('[LobbyScene] Failed to initialize R3F singleton:', err);
    singletonError = err.message;
  }
}

/**
 * Destroy the singleton (called on page navigation away).
 * Cleans up WebGL context and R3F root.
 */
function destroySingleton() {
  if (!singletonInitialized) return;
  console.debug('[LobbyScene] Destroying R3F singleton...');

  if (singletonR3FRoot) {
    try {
      singletonR3FRoot.unmount();
    } catch (e) {
      console.warn('[LobbyScene] Error unmounting R3F root:', e);
    }
    singletonR3FRoot = null;
  }

  // Force-lose the WebGL context to free GPU memory. Prefer the context handle
  // captured at creation time — re-querying getContext() can return null when the
  // original attributes differ.
  const gl = singletonGl
    || (singletonCanvas && (singletonCanvas.getContext('webgl2') || singletonCanvas.getContext('webgl')));
  if (gl) {
    try {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) {
      console.warn('[LobbyScene] Could not force-lose WebGL context:', e);
    }
  }

  if (singletonWrapper?.parentNode) {
    singletonWrapper.parentNode.removeChild(singletonWrapper);
  }

  singletonCanvas = null;
  singletonWrapper = null;
  singletonR3FRoot = null;
  singletonPropsRef = null;
  singletonGl = null;
  singletonProfile = null;
  singletonConfig = null;
  singletonState = null;
  singletonInitialized = false;
  singletonError = null;
}

/**
 * Pause / resume the render loop without tearing down the WebGL context.
 *
 * [AUDIT] The unmount cleanup deliberately only DETACHES the wrapper and never
 * unmounts the R3F root. The root is configured with frameloop:'always', so the
 * render loop, every useFrame callback, the particle CPU loop and the whole
 * post-processing chain kept executing against an OFF-DOM canvas indefinitely —
 * burning GPU and battery with nothing visible — for any unmount that was not a
 * Next route change (hydration recovery, a conditional render, StrictMode's
 * double-invoke). Flipping frameloop to 'never' on detach costs nothing and is
 * fully reversible on re-attach.
 */
function setSingletonFrameloop(mode) {
  try {
    // Preferred: the root state's own setter — touches nothing else.
    if (singletonState && typeof singletonState.setFrameloop === 'function') {
      singletonState.setFrameloop(mode);
      return;
    }
    // Fallback: re-issue the FULL original configuration with only frameloop
    // changed. Passing `{ frameloop }` on its own would let configure() apply
    // its own defaults for every omitted key (shadows:false, dpr:[1,2], ...)
    // and quietly downgrade the scene on every detach/re-attach.
    if (singletonR3FRoot && singletonConfig) {
      singletonR3FRoot.configure({ ...singletonConfig, frameloop: mode });
    }
  } catch (e) {
    console.warn('[LobbyScene] Could not set frameloop:', e);
  }
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
      setSingletonFrameloop('always');
      console.debug('[LobbyScene] R3F singleton canvas attached to DOM');
    }

    // Poll briefly for the wrapper to be ready (async init)
    const attachInterval = setInterval(() => {
      if (singletonWrapper && singletonWrapper.parentNode !== container) {
        container.appendChild(singletonWrapper);
        setSingletonFrameloop('always');
        console.debug('[LobbyScene] R3F singleton canvas attached to DOM (deferred)');
        clearInterval(attachInterval);
      } else if (singletonWrapper?.parentNode === container) {
        clearInterval(attachInterval);
      }
    }, 100);

    return () => {
      clearInterval(attachInterval);
      // On unmount: detach and PAUSE the loop, but do NOT destroy — this
      // preserves the WebGL context across hydration remounts while making sure
      // an off-DOM canvas never renders at 60 fps.
      if (singletonWrapper && singletonWrapper.parentNode === container) {
        container.removeChild(singletonWrapper);
        setSingletonFrameloop('never');
        console.debug('[LobbyScene] R3F singleton canvas detached from DOM (paused, preserved)');
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

  // Clean up singleton on full page unload.
  // [AUDIT] 'beforeunload' alone is unreliable on iOS Safari and on Android
  // Chrome (bfcache), so a mobile tab switch or close left the WebGL context
  // alive until the browser reclaimed it. 'pagehide' fires in those cases.
  // When the page is only being frozen into the bfcache (event.persisted) we
  // pause the loop instead of destroying, so a back-navigation still restores.
  useEffect(() => {
    const handleUnload = () => destroySingleton();
    const handlePageHide = (e) => {
      if (e.persisted) setSingletonFrameloop('never');
      else destroySingleton();
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
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
          color: '#ff4444', fontFamily: 'Rajdhani, sans-serif', fontSize: 14,
          zIndex: 10,
        }}>
          3D Scene failed to load: {error || singletonError}
        </div>
      )}
    </div>
  );
}
