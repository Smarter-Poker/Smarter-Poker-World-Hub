/**
 * useTrainingFeedback
 * ═══════════════════════════════════════════════════════════════════════════
 * Unified sound + haptic feedback hook for training surfaces.
 *
 *   const fb = useTrainingFeedback();
 *   fb.correct();        // success chime + 30ms double-pulse vibration
 *   fb.incorrect();      // soft buzz + 80ms single vibration
 *   fb.click();          // tick + 10ms tap
 *   fb.complete();       // ascending arpeggio
 *   fb.warning();
 *
 * Both modalities are gated by user preference, stored in localStorage:
 *   sp.training.sound    'on' | 'off'  (default 'on')
 *   sp.training.haptics  'on' | 'off'  (default 'on')
 *
 * Plus a global respect for `prefers-reduced-motion` — when true, all
 * vibrations are skipped and audio is reduced in volume by 50%.
 *
 * Audio is synthesized via WebAudio (no asset loads, no autoplay-policy
 * issues since playback is triggered by user actions). Falls back to
 * silent no-ops if WebAudio is unavailable.
 *
 * Haptics use navigator.vibrate where supported (mostly Android). iOS
 * Safari does not expose Vibration API — calls are silent no-ops.
 *
 * Build-safety: no emoji chars, no JSX (pure hook).
 */
// TRAIN-FEEDBACK-FX-1 — audit-marker registry token

import { useCallback, useEffect, useRef } from 'react';

const STORAGE_SOUND = 'sp.training.sound';
const STORAGE_HAPTICS = 'sp.training.haptics';

function readPref(key) {
  try {
    if (typeof window === 'undefined') return 'on';
    const v = window.localStorage.getItem(key);
    return v === 'off' ? 'off' : 'on';
  } catch (_) {
    return 'on';
  }
}

function writePref(key, value) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value === 'off' ? 'off' : 'on');
  } catch (_) {
    // ignore
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTrainingFeedback() {
  const audioCtxRef = useRef(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const handler = () => { reducedRef.current = prefersReducedMotion(); };
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    return () => {
      if (mq && typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler);
    };
  }, []);

  const ensureCtx = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtxRef.current = new Ctx();
    } catch (_) {
      audioCtxRef.current = null;
    }
    return audioCtxRef.current;
  }, []);

  const playTone = useCallback((freq, durationMs, type, gainScale) => {
    if (readPref(STORAGE_SOUND) === 'off') return;
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const baseGain = reducedRef.current ? 0.05 : 0.1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain * (gainScale || 1), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }, [ensureCtx]);

  const playArpeggio = useCallback((freqs, stepMs, type) => {
    if (readPref(STORAGE_SOUND) === 'off') return;
    const ctx = ensureCtx();
    if (!ctx) return;
    freqs.forEach((f, i) => {
      window.setTimeout(() => playTone(f, stepMs * 1.2, type || 'triangle', 0.9), i * stepMs);
    });
  }, [ensureCtx, playTone]);

  const vibrate = useCallback((pattern) => {
    if (readPref(STORAGE_HAPTICS) === 'off') return;
    if (reducedRef.current) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
  }, []);

  const correct = useCallback(() => {
    playArpeggio([523.25, 659.25, 783.99], 70, 'triangle'); // C5 E5 G5
    vibrate([30, 40, 30]);
  }, [playArpeggio, vibrate]);

  const incorrect = useCallback(() => {
    playTone(196, 220, 'sawtooth', 0.7); // G3
    vibrate(80);
  }, [playTone, vibrate]);

  const click = useCallback(() => {
    playTone(880, 30, 'square', 0.45); // A5
    vibrate(10);
  }, [playTone, vibrate]);

  const complete = useCallback(() => {
    playArpeggio([523.25, 659.25, 783.99, 1046.5], 90, 'sine'); // C5 E5 G5 C6
    vibrate([40, 30, 40, 30, 80]);
  }, [playArpeggio, vibrate]);

  const warning = useCallback(() => {
    playTone(330, 90, 'square', 0.5); // E4
    window.setTimeout(() => playTone(330, 90, 'square', 0.5), 110);
    vibrate([50, 50, 50]);
  }, [playTone, vibrate]);

  const setSoundEnabled = useCallback((enabled) => writePref(STORAGE_SOUND, enabled ? 'on' : 'off'), []);
  const setHapticsEnabled = useCallback((enabled) => writePref(STORAGE_HAPTICS, enabled ? 'on' : 'off'), []);
  const getPrefs = useCallback(() => ({
    sound: readPref(STORAGE_SOUND) === 'on',
    haptics: readPref(STORAGE_HAPTICS) === 'on',
  }), []);

  return {
    correct,
    incorrect,
    click,
    complete,
    warning,
    setSoundEnabled,
    setHapticsEnabled,
    getPrefs,
  };
}

export default useTrainingFeedback;
export const TRAINING_FEEDBACK_VERSION = '1.0.0';
