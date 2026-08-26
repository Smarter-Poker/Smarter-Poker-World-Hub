/**
 * Poker Brain Launch Button -- drop into smarter.poker/horses
 * -----------------------------------------------------------
 * Adds a "Poker Brain" button to the horses page that:
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
 *
 * PALETTE, 2026-08-26: this button was a green/emerald/teal gradient. It
 * renders inside the /horses staff console, where the rule is the
 * smarter.poker cyan schema and explicitly no greens -- it was the only green
 * thing on the page. Now cyan/sky/blue, matching the console and the Club
 * Arena accent.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load the HUD so the horses page stays light
const PokerBrainHUD = dynamic(() => import('./HUD'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center text-white z-50">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-lg">Loading Poker Brain…</p>
      </div>
    </div>
  ),
});

export default function PokerBrainLaunchButton({
  className = '',
  label = 'Poker Brain',
  defaultMode = 'screen', // 'screen' | 'camera'
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState(defaultMode);
  const [picking, setPicking] = useState(false);
  const [gameType, setGameType] = useState('nlhe');
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
      console.warn(err);
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
    setPicking(false);
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
      console.warn(err);
      if (err.name !== 'NotAllowedError') {
        setError(`Could not start screen capture: ${err.message}`);
      }
    } finally {
      setStarting(false);
    }
  }, []);

  const openPicker = useCallback(() => {
    setError(null);
    setPicking(true);
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
          onClick={openPicker}
          disabled={starting}
          className="group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white
                     bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500
                     hover:from-cyan-400 hover:via-sky-400 hover:to-blue-400
                     shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50
                     transition-all duration-200 disabled:opacity-60"
          title="Open Poker Brain with screen capture"
        >
          <span className="text-lg">{label}</span>
          {starting && (
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          )}
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
            LIVE
          </span>
        </button>
      </div>

      {/* Variant picker modal */}
      {picking && !open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-white text-xl font-bold mb-1">Select Game Variant</h2>
            <p className="text-slate-400 text-sm mb-5">
              Pick the game you are playing. You can change it later from the HUD.
            </p>
            <div className="grid grid-cols-1 gap-2 mb-5">
              {[
                { value: 'nlhe',     label: "NLHE (Hold'em)",      desc: '2 hole cards' },
                { value: 'plo',      label: 'PLO (Omaha)',         desc: '4 hole cards' },
                { value: 'plo_hilo', label: 'PLO Hi-Lo (8 or Better)', desc: '4 hole cards, split pot' },
                { value: 'plo5',     label: 'PLO5 (5-Card Omaha)', desc: '5 hole cards' },
                { value: 'plo6',     label: 'PLO6 (6-Card Omaha)', desc: '6 hole cards' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGameType(opt.value)}
                  className={`text-left px-4 py-3 rounded-lg border transition ${
                    gameType === opt.value
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPicking(false)}
                className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={requestScreen}
                disabled={starting}
                className="px-5 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 disabled:opacity-60 transition"
              >
                {starting ? 'Starting...' : 'Start Capture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-red-900/95 border border-red-500 text-white p-4 rounded-lg shadow-2xl z-50">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-semibold mb-1">Poker Brain</p>
              <p className="text-sm text-red-100">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white font-bold">X</button>
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
            X
          </button>
          <PokerBrainHUD
            initialMode={mode}
            initialGameType={gameType}
            preAcquiredStream={streamRef.current}
            onClose={handleClose}
          />
        </div>
      )}
    </>
  );
}
