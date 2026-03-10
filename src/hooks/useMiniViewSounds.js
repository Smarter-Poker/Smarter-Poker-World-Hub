/**
 * useMiniViewSounds — Sound pack for live table mini-view events
 *
 * Synthesizes short sound effects via Web Audio API:
 *   • Chip stack on pot change
 *   • Card flip on deal
 *   • Fold whoosh on fold action
 *   • Winner chime on payout
 *
 * All sounds are procedurally generated — no external audio files needed.
 * Respects user preference via localStorage 'miniview_sounds_enabled'.
 */

import { useRef, useCallback, useEffect } from 'react';

const SOUND_ENABLED_KEY = 'miniview_sounds_enabled';

export default function useMiniViewSounds() {
  const ctxRef = useRef(null);
  const enabledRef = useRef(true);

  // Only create AudioContext once, lazily
  const getCtx = useCallback(() => {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  // Check localStorage preference
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const saved = localStorage.getItem(SOUND_ENABLED_KEY);
    if (saved === 'false') enabledRef.current = false;
  }, []);

  const playTone = useCallback((freq, duration, type = 'sine', volume = 0.06) => {
    if (!enabledRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* Audio unavailable */ }
  }, [getCtx]);

  /** Chip stack sound — two quick taps */
  const playChipStack = useCallback(() => {
    playTone(2000, 0.05, 'square', 0.03);
    setTimeout(() => playTone(2400, 0.04, 'square', 0.025), 40);
  }, [playTone]);

  /** Card flip sound — quick rising sweep */
  const playCardFlip = useCallback(() => {
    playTone(1200, 0.08, 'sawtooth', 0.03);
  }, [playTone]);

  /** Fold whoosh — descending noise burst */
  const playFoldWhoosh = useCallback(() => {
    playTone(600, 0.12, 'triangle', 0.04);
  }, [playTone]);

  /** Winner chime — happy ascending arpeggio */
  const playWinnerChime = useCallback(() => {
    playTone(523, 0.15, 'sine', 0.05); // C5
    setTimeout(() => playTone(659, 0.15, 'sine', 0.05), 80); // E5
    setTimeout(() => playTone(784, 0.2, 'sine', 0.06), 160); // G5
  }, [playTone]);

  /** Toggle sounds on/off */
  const toggleSounds = useCallback(() => {
    enabledRef.current = !enabledRef.current;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_ENABLED_KEY, String(enabledRef.current));
    }
    return enabledRef.current;
  }, []);

  return {
    playChipStack,
    playCardFlip,
    playFoldWhoosh,
    playWinnerChime,
    toggleSounds,
    isEnabled: enabledRef.current,
  };
}
