/**
 * Shared share/clipboard utility for trivia result screens.
 * Uses Web Share API with clipboard fallback.
 *
 * @param {Object} opts
 * @param {string} opts.mode — game mode name (e.g. 'Endless', 'Mixed')
 * @param {number} opts.score — correct count or streak
 * @param {number} [opts.total] — total questions (if applicable)
 * @param {number} [opts.diamonds] — diamonds earned
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 *          'cancelled' means the user dismissed the native share sheet — do
 *          NOT show a "Copied!" confirmation for that case.
 */
export async function shareResult({ mode, score, total, diamonds }) {
    const line1 = total
        ? `I scored ${score}/${total} in ${mode} mode!`
        : `I reached a ${score} streak in ${mode} mode!`;
    // Plain text only — repo rule: no bare emoji characters in source.
    const line2 = diamonds ? ` Earned ${diamonds} diamonds!` : '';
    const text = `Smarter.Poker Trivia\n${line1}${line2}\nPlay now: https://smarter.poker/hub/trivia`;

    // Try Web Share API first (mobile)
    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({ text });
            return 'shared';
        } catch (e) {
            // AbortError = the user explicitly dismissed the share sheet.
            // Falling through to the clipboard here silently copied the text
            // and reported 'copied', so result screens flashed "Copied!"
            // after the user declined to share.
            if (e?.name === 'AbortError') return 'cancelled';
            console.warn('[shareResult] navigator.share failed:', e?.message || e);
        }
    }

    // Clipboard fallback
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return 'copied';
        } catch (e) { console.warn('[shareResult] clipboard write failed:', e?.message || e); }
    }

    return 'failed';
}

export default shareResult;
