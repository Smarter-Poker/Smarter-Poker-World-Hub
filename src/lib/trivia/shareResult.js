/**
 * Shared share/clipboard utility for trivia result screens.
 * Uses Web Share API with clipboard fallback.
 *
 * @param {Object} opts
 * @param {string} opts.mode — game mode name (e.g. 'Endless', 'Mixed')
 * @param {number} opts.score — correct count or streak
 * @param {number} [opts.total] — total questions (if applicable)
 * @param {number} [opts.diamonds] — diamonds earned
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareResult({ mode, score, total, diamonds }) {
    const line1 = total
        ? `I scored ${score}/${total} in ${mode} mode!`
        : `I reached a ${score} streak in ${mode} mode!`;
    const line2 = diamonds ? ` Earned ${diamonds}💎!` : '';
    const text = `🃏 Smarter.Poker Trivia\n${line1}${line2}\nPlay now: https://smarter.poker/hub/trivia`;

    // Try Web Share API first (mobile)
    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({ text });
            return 'shared';
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    // Clipboard fallback
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return 'copied';
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    return 'failed';
}
