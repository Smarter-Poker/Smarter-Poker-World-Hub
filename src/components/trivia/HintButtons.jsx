/**
 * HINTS SYSTEM — Diamond sink for trivia
 * 50/50: 5 diamonds, Skip: 10 diamonds, Extra Time: 15 diamonds
 *
 * Gating rule (the whole system was dead before this):
 *   Only the "+30s" hint depends on there being a countdown. Every other
 *   hint works in untimed modes. Previously handleUseHint returned early and
 *   isDisabled included `!hasTimeLimit` for ALL three hints — and since every
 *   TRIVIA_MODES entry except arcade has timeLimit:null (and arcade disables
 *   hints entirely), the hint buttons rendered permanently inert everywhere.
 */

import React, { useState, useRef, useEffect } from 'react';
import useVIP from '../../hooks/useVIP';

const HINTS = [
    {
        id: 'fifty_fifty',
        name: '50/50',
        description: 'Remove 2 Wrong Answers',
        cost: 5,
    },
    {
        id: 'skip',
        name: 'Skip',
        description: 'Skip This Question',
        cost: 10,
    },
    {
        id: 'extra_time',
        name: '+30s',
        description: 'Add 30 Seconds',
        cost: 15,
    }
];

function HintButtons({
    userDiamonds = 0,
    onUseHint,
    disabledHints = [], // Array of hint IDs that can't be used
    compact = false,
    hasTimeLimit = true,
    onNeedDiamonds = null, // optional: parent can open its own diamond store modal
    questionId = null      // optional: enables skip telemetry for this question
}) {
    const { isVip } = useVIP();

    // Tapping an unaffordable / already-used hint used to do nothing at all
    // (the button was `disabled`, so not even the click landed). Now it
    // explains why and offers a route to the store.
    const [notice, setNotice] = useState(null); // { text, showStore }
    const noticeTimerRef = useRef(null);
    useEffect(() => () => {
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    }, []);

    const showNotice = (text, showStore = false) => {
        setNotice({ text, showStore });
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
    };

    // "+30s" is meaningless without a countdown, so hide it in untimed modes
    // rather than rendering a permanently dead button.
    const visibleHints = HINTS.filter(hint => hint.id !== 'extra_time' || hasTimeLimit);

    const handleUseHint = (hint) => {
        if (hint.id === 'extra_time' && !hasTimeLimit) return;
        if (disabledHints.includes(hint.id)) {
            showNotice(`${hint.name} already used this game`);
            return;
        }
        if (!isVip && userDiamonds < hint.cost) {
            showNotice(`Need ${hint.cost} diamonds - you have ${Math.max(0, userDiamonds)}`, !onNeedDiamonds);
            onNeedDiamonds?.(hint);
            return;
        }
        onUseHint?.(hint);
    };

    return (
        <div className={`hint-buttons ${compact ? 'compact' : ''}`}>
            {visibleHints.map((hint) => {
                const isUsed = disabledHints.includes(hint.id);
                const canAfford = isVip || userDiamonds >= hint.cost;
                // Unaffordable hints stay clickable so the tap can explain
                // itself; only spent hints are truly inert.
                const isInert = isUsed;
                const looksDisabled = isUsed || !canAfford;

                return (
                    <button
                        key={hint.id}
                        type="button"
                        className={`hint-btn ${looksDisabled ? 'disabled' : ''} ${isUsed ? 'used' : ''}`}
                        onClick={() => handleUseHint(hint)}
                        disabled={isInert}
                        aria-disabled={looksDisabled}
                        aria-label={`${hint.name} - ${hint.description}${isVip ? ' (free for VIP)' : ` (${hint.cost} diamonds)`}`}
                        title={isUsed ? `${hint.name} already used` : hint.description}
                    >
                        <span className="hint-name">{hint.name}</span>
                        {!compact ? <span className="hint-description">{hint.description}</span> : null}
                        <span className="hint-cost">
                            {isUsed ? 'Used' : isVip ? 'VIP' : `${hint.cost} Diamonds`}
                        </span>
                    </button>
                );
            })}

            {notice && (
                <div className="hint-notice" role="status">
                    <span>{notice.text}</span>
                    {notice.showStore && (
                        <a className="hint-notice-link" href="/hub/diamond-store">Get Diamonds</a>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Apply a hint to the current question.
 *
 * State key contract: callers have historically used two different names for
 * the eliminated-option list (TriviaGame passes `eliminatedOptions`, this
 * module used to read `hiddenOptions`), which silently dropped previously
 * eliminated options. Both keys are now read AND written, so either caller
 * gets a correctly merged list.
 */
export function applyHint(hintId, question, currentState) {
    const state = currentState || {};

    switch (hintId) {
        case 'fifty_fifty': {
            const options = Array.isArray(question?.options) ? question.options : [];
            const correctIndex = question?.correct_index;
            const wrongIndices = options
                .map((_, idx) => idx)
                .filter(idx => idx !== correctIndex);

            // Randomly remove wrong answers.
            // Phase 60: was using sort(()=>Math.random()-0.5) which is
            // mathematically biased (some permutations 2x more likely).
            // Fisher-Yates is uniform.
            for (let i = wrongIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
            }

            // Never strip every wrong option: on a 2- or 3-option question a
            // flat slice(0, 2) left only the correct answer, handing the
            // player the solution for 5 diamonds.
            const removeCount = Math.max(0, Math.min(2, wrongIndices.length - 1));
            const toRemove = wrongIndices.slice(0, removeCount);

            const previous = state.hiddenOptions || state.eliminatedOptions || [];
            const merged = Array.from(new Set([...previous, ...toRemove]));

            return {
                ...state,
                hiddenOptions: merged,
                eliminatedOptions: merged
            };
        }

        case 'skip': {
            return {
                ...state,
                skipQuestion: true
            };
        }

        case 'extra_time': {
            return {
                ...state,
                addTime: 30
            };
        }

        default:
            return state;
    }
}

export { HINTS };

export default React.memo(HintButtons);
