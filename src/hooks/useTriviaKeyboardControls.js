import { useEffect, useRef } from 'react';
import { resolveTriviaKeyAction } from '../lib/trivia/keyboardControlsModel.mjs';

export { resolveTriviaKeyAction };

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
