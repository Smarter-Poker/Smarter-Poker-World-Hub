/**
 * OPTIONAL MOBILE HAPTICS FOR TRIVIA
 *
 * Tactile feedback strictly gated by:
 * - Client runtime (SSR-safe no-op)
 * - navigator.vibrate availability
 * - OS prefers-reduced-motion: reduce (always no-op when reduced motion is enabled)
 * - Trivia mute state (triviaAudio.isMuted())
 * - localStorage['trivia_settings'] (soundEffects !== false && haptics !== false)
 *
 * Never throws; every path is wrapped in safe try/catch guards.
 */

import { isMuted } from './triviaAudio.js';

export const TRIVIA_SETTINGS_STORAGE_KEY = 'trivia_settings';

export const HAPTIC_PATTERNS = Object.freeze({
    tap: 10,
    correct: [12, 35, 18],
    wrong: [24, 40, 24],
    wheel: [10, 25, 15, 25, 30],
});

function hasReducedMotionPreference() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
}

function isDisabledByTriviaSettings() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return false;
    }
    try {
        const raw = localStorage.getItem(TRIVIA_SETTINGS_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return false;
        if (parsed.soundEffects === false) return true;
        if (parsed.haptics === false) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Returns true only when tactile haptics are supported and explicitly permitted
 * by OS accessibility settings and Trivia user settings.
 */
export function isHapticsAllowed() {
    if (typeof window === 'undefined') return false;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return false;
    }
    try {
        if (hasReducedMotionPreference()) return false;
        if (isMuted()) return false;
        if (isDisabledByTriviaSettings()) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Triggers a named Trivia haptic pattern when allowed; safely no-ops otherwise.
 *
 * @param {'tap' | 'correct' | 'wrong' | 'wheel'} [kind='tap']
 * @returns {boolean} true if navigator.vibrate was invoked
 */
export function triggerTriviaHaptic(kind = 'tap') {
    if (!isHapticsAllowed()) return false;
    const pattern = Object.prototype.hasOwnProperty.call(HAPTIC_PATTERNS, kind)
        ? HAPTIC_PATTERNS[kind]
        : HAPTIC_PATTERNS.tap;
    try {
        navigator.vibrate(pattern);
        return true;
    } catch {
        return false;
    }
}

export default triggerTriviaHaptic;
