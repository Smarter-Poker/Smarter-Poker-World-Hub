/**
 * ═══════════════════════════════════════════════════════════
 * HAPTIC FEEDBACK UTILITY — Club Arena
 * ═══════════════════════════════════════════════════════════
 * Centralized mobile vibration patterns for premium UX.
 * Safe no-op on unsupported browsers.
 */

const PATTERNS = {
    light: [10],
    medium: [30],
    heavy: [50],
    success: [15, 50, 15],
    error: [30, 30, 30],
    double: [20, 40, 20],
    allIn: [50, 30, 80],
    tap: [8],
};

/**
 * Fire haptic feedback on supported devices.
 * @param {'light'|'medium'|'heavy'|'success'|'error'|'double'|'allIn'|'tap'} style
 */
export function haptic(style = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
        navigator.vibrate(PATTERNS[style] || PATTERNS.light);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

export default haptic;
