const IGNORE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]';

/**
 * Pure desktop keyboard shortcut resolver for Trivia gameplay surfaces:
 * - Keys 1-4 or A-D select the corresponding enabled answer option.
 * - Enter or Space advances to the next question when `canAdvance` is true.
 * - Optional ArrowLeft / ArrowRight handlers for flashcard review.
 * Strictly ignores modifier combos, active text inputs / modal dialogs, and
 * enabled interactive buttons/links (while allowing Enter/Space when focus
 * stayed on an already-disabled answered option button).
 */
export function resolveTriviaKeyAction(event, {
    optionCount = 4,
    canSelect = false,
    canAdvance = false,
    eliminatedIndices = [],
    allowArrows = false,
} = {}) {
    if (!event || event.metaKey || event.ctrlKey || event.altKey) return null;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest(IGNORE_SELECTOR)) {
        return null;
    }

    const key = String(event.key || '');
    if (canSelect && optionCount > 0) {
        let index = -1;
        if (/^[1-9]$/.test(key)) index = Number.parseInt(key, 10) - 1;
        else if (/^[a-dA-D]$/.test(key)) index = key.toLowerCase().charCodeAt(0) - 97;

        if (index >= 0 && index < optionCount && !eliminatedIndices.includes(index)) {
            return { type: 'select', index };
        }
    }

    if (canAdvance && (key === 'Enter' || key === ' ')) {
        // Avoid double-firing if focus is already on an enabled interactive button/link,
        // while allowing Enter/Space to advance when focus remained on a disabled answer option.
        if (target && typeof target.closest === 'function') {
            const interactive = target.closest('button:not(:disabled), a, summary');
            if (interactive && interactive.disabled !== true) {
                return null;
            }
        }
        return { type: 'advance' };
    }

    if (allowArrows && key === 'ArrowLeft') return { type: 'prev' };
    if (allowArrows && key === 'ArrowRight') return { type: 'next' };

    return null;
}
