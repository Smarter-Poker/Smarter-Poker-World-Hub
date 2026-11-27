import { useEffect, useRef } from 'react';

const IGNORE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]';

/**
 * Shared desktop keyboard shortcut handler for Trivia gameplay surfaces:
 * - Keys 1-4 or A-D select the corresponding enabled answer option.
 * - Enter or Space advances to the next question when `canAdvance` is true.
 * - Optional ArrowLeft / ArrowRight handlers for flashcard review.
 * Strictly ignores modifier combos and active text inputs / modal dialogs.
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
        // Avoid double-firing if focus is already on an interactive button/link.
        if (target && typeof target.closest === 'function' && target.closest('button, a, summary')) {
            return null;
        }
        return { type: 'advance' };
    }

    if (allowArrows && key === 'ArrowLeft') return { type: 'prev' };
    if (allowArrows && key === 'ArrowRight') return { type: 'next' };

    return null;
}

export default function useTriviaKeyboardControls({
    enabled = true,
    optionCount = 4,
    canSelect = false,
    canAdvance = false,
    eliminatedIndices = [],
    onSelectOption,
    onAdvance,
    onPrev,
    onNext,
}) {
    const latestRef = useRef({
        enabled,
        optionCount,
        canSelect,
        canAdvance,
        eliminatedIndices,
        onSelectOption,
        onAdvance,
        onPrev,
        onNext,
    });
    latestRef.current = {
        enabled,
        optionCount,
        canSelect,
        canAdvance,
        eliminatedIndices,
        onSelectOption,
        onAdvance,
        onPrev,
        onNext,
    };

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return undefined;
        const onKeyDown = (event) => {
            const cfg = latestRef.current;
            if (!cfg.enabled) return;
            const action = resolveTriviaKeyAction(event, {
                optionCount: cfg.optionCount,
                canSelect: cfg.canSelect,
                canAdvance: cfg.canAdvance,
                eliminatedIndices: cfg.eliminatedIndices,
                allowArrows: Boolean(cfg.onPrev || cfg.onNext),
            });
            if (!action) return;
            if (action.type === 'select' && typeof cfg.onSelectOption === 'function') {
                event.preventDefault();
                cfg.onSelectOption(action.index);
            } else if (action.type === 'advance' && typeof cfg.onAdvance === 'function') {
                event.preventDefault();
                cfg.onAdvance();
            } else if (action.type === 'prev' && typeof cfg.onPrev === 'function') {
                event.preventDefault();
                cfg.onPrev();
            } else if (action.type === 'next' && typeof cfg.onNext === 'function') {
                event.preventDefault();
                cfg.onNext();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
