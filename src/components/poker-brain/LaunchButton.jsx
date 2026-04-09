/**
 * Poker Brain Launch Button — drop into smarter.poker/horses
 * -----------------------------------------------------------
 * Adds a "🧠 Poker Brain" button to the horses page that:
 *   1. Prompts camera permission
 *   2. Opens the Poker Brain HUD full-screen with the camera feed linked
 *   3. Falls back to Screen Capture on desktop if the user prefers
 *
 * Drop-in usage inside pages/horses/index.tsx (or wherever the horses
 * admin page lives):
 *
 *   import PokerBrainLaunchButton from '@/components/PokerBrainLaunchButton';
 *   ...
 *   <div className="flex gap-3">
 *     <PokerBrainLaunchButton />
 *     <button>+ New Horse</button>
 *   </div>
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load the HUD so the horses page stays light
const PokerBrainHUD = dynamic(() => import('./HUD'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center text-white z-50">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-lg">Loading Poker Brain…</p>
      </div>
    </div>
  ),
});

export default function PokerBrainLaunchButton({
  className = '',
  label = '🧠 Poker Brain',
  defaultMode = 'camera', // 'camera' | 'screen'
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState(defaultMode);
  const streamRef = useRef(null);

  // Stop any stream on unmount / close
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const requestCamera = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Pre-request permission so the HUD opens with an already-granted camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // rear camera on phones
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setMode('camera');
      setOpen(true);
    } catch (err) {
      console.error(err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Enable camera access in your browser to use Poker Brain.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device. Try Screen Capture mode instead.'
          : `Could not start camera: ${err.message}`
      );
    } finally {
      setStarting(false);
    }
  }, []);

  const requestScreen = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('screen');
      setOpen(true);
    } catch (err) {
      console.error(err);
      if (err.name !== 'NotAllowedError') {
        setError(`Could not start screen capture: ${err.message}`);
      }
    } finally {
      setStarting(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setOpen(false);
  }, []);

  return (
    <>
      {/* The button to drop into the horses header */}
      <div className={`relative inline-flex ${className}`}>
        <button
          onClick={requestCamera}
          disabled={starting}
          className="group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white
                     bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500
                     hover:from-green-400 hover:via-emerald-400 hover:to-teal-400
                     shadow-lg shadow-green-500/30 hover:shadow-green-500/50
                     transition-all duration-200 disabled:opacity-60"
          title="Open Poker Brain with live camera"
        >
          <span className="text-lg">{label}</span>
          {starting && (
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          )}
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
            LIVE
          </span>
        </button>

        {/* Desktop fallback pill */}
        <button
          onClick={requestScreen}
          disabled={starting}
          className="ml-2 px-3 py-3 rounded-xl text-sm font-medium text-gray-300 bg-gray-800
                     hover:bg-gray-700 border border-gray-700 transition"
          title="Use screen capture instead (desktop online poker)"
        >
          🖥️ Screen
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-red-900/95 border border-red-500 text-white p-4 rounded-lg shadow-2xl z-50">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold mb-1">Poker Brain</p>
              <p className="text-sm text-red-100">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white">✕</button>
          </div>
        </div>
      )}

      {/* Full-screen HUD modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-[60] bg-gray-900/80 hover:bg-red-600
                       text-white w-10 h-10 rounded-full flex items-center justify-center
                       backdrop-blur border border-gray-700 transition"
            title="Close Poker Brain"
          >
            ✕
          </button>
          <PokerBrainHUD
            initialMode={mode}
            preAcquiredStream={streamRef.current}
            onClose={handleClose}
          />
        </div>
      )}
    </>
  );
}
