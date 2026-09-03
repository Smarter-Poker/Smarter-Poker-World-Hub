/**
 * useHaptics: one tap-feedback helper for the whole hub.
 *
 * WHY: the mobile standard asks for haptic feedback on press
 * (`navigator.vibrate` wrapped in try/catch) and each page was calling it
 * with a different number. Three named strengths keep the feel consistent
 * and keep the try/catch and the SSR guard in one place. iOS Safari has no
 * vibrate API, so this is a silent no-op there; it is never load-bearing.
 *
 * Usage:
 *   const haptic = useHaptics();
 *   <button onClick={() => { haptic('light'); like(); }} />
 */
import { useCallback } from 'react';

const PATTERNS = {
  light: 10,
  medium: 20,
  success: [10, 30, 10],
};

export function triggerHaptic(kind = 'light') {
  if (typeof navigator === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind] || PATTERNS.light);
    }
  } catch (_) {
    // Some browsers throw on vibrate without a user gesture; ignore.
  }
}

export function useHaptics() {
  return useCallback((kind) => triggerHaptic(kind), []);
}

export default useHaptics;
