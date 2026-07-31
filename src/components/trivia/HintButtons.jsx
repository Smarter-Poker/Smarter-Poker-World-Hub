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
import { motion } from 'framer-motion';
import { Gem, Percent, SkipForward, Clock, Check } from 'lucide-react';
import useVIP from '../../hooks/useVIP';
import { supabase } from '../../lib/supabase';

const HINTS = [
    {
        id: 'fifty_fifty',
        name: '50/50',
        description: 'Remove 2 Wrong Answers',
        icon: Percent,
        cost: 5,
        color: '#f97316'
    },
    {
        id: 'skip',
        name: 'Skip',
        description: 'Skip This Question',
        icon: SkipForward,
        cost: 10,
        color: '#8b5cf6'
    },
    {
        id: 'extra_time',
        name: '+30s',
        description: 'Add 30 Seconds',
        icon: Clock,
        cost: 15,
        color: '#31a24c'
    }
];

/**
 * Skip telemetry (phase 54). `increment_trivia_skipped` has existed and been
 * granted to `authenticated` since migration 20260505_phase54, but nothing ever
 * called it — so `trivia_questions.skipped_count` was permanently 0 and the
 * quality pipeline that reads it had no signal to work with. Fire-and-forget:
 * a failed telemetry write must never block or undo a hint the player paid for.
 */
function recordSkip(questionId) {
    if (!questionId) return;
    try {
        const p = supabase.rpc('increment_trivia_skipped', { p_question_id: questionId });
        if (p && typeof p.then === 'function') {
            p.then(({ error } = {}) => {
                if (error) console.warn('[HintButtons] skip telemetry failed:', error.message || error);
            }, (e) => console.warn('[HintButtons] skip telemetry failed:', e?.message || e));
        }
    } catch (e) {
        console.warn('[HintButtons] skip telemetry failed:', e?.message || e);
    }
}

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
            showNotice(`Need ${hint.cost} diamonds — you have ${Math.max(0, userDiamonds)}`, !onNeedDiamonds);
            onNeedDiamonds?.(hint);
            return;
        }
        if (hint.id === 'skip') recordSkip(questionId);
        onUseHint?.(hint);
    };

    return (
        <div className={`hint-buttons ${compact ? 'compact' : ''}`}>
            {visibleHints.map((hint) => {
                const Icon = hint.icon;
                const isUsed = disabledHints.includes(hint.id);
                const canAfford = isVip || userDiamonds >= hint.cost;
                // Unaffordable hints stay clickable so the tap can explain
                // itself; only spent hints are truly inert.
                const isInert = isUsed;
                const looksDisabled = isUsed || !canAfford;

                return (
                    <motion.button
                        key={hint.id}
                        type="button"
                        className={`hint-btn ${looksDisabled ? 'disabled' : ''} ${isUsed ? 'used' : ''}`}
                        onClick={() => handleUseHint(hint)}
                        disabled={isInert}
                        aria-disabled={looksDisabled}
                        aria-label={`${hint.name} — ${hint.description}${isVip ? ' (free for VIP)' : ` (${hint.cost} diamonds)`}`}
                        title={isUsed ? `${hint.name} already used` : hint.description}
                        whileHover={!looksDisabled ? { scale: 1.05 } : {}}
                        whileTap={!looksDisabled ? { scale: 0.95 } : {}}
                        style={{
                            '--hint-color': hint.color
                        }}
                    >
                        <div className="hint-icon">
                            <Icon size={compact ? 16 : 20} />
                        </div>
                        {!compact && (
                            <div className="hint-info">
                                <span className="hint-name">{hint.name}</span>
                            </div>
                        )}
                        {isUsed ? (
                            <div className="hint-cost used-chip">
                                <Check size={compact ? 10 : 12} />
                                <span>USED</span>
                            </div>
                        ) : !isVip ? (
                            <div className="hint-cost">
                                <Gem size={compact ? 10 : 12} />
                                <span>{hint.cost}</span>
                            </div>
                        ) : (
                            <div className="hint-cost vip-chip">
                                <span>FREE</span>
                            </div>
                        )}
                    </motion.button>
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

            <style>{`
                .hint-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    flex-wrap: wrap;
                    position: relative;
                }

                .hint-buttons.compact {
                    gap: 6px;
                }

                .hint-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    /* 44px keeps the tap target above the mobile minimum */
                    min-height: 44px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background-color 0.2s ease, opacity 0.2s ease;
                }

                .hint-buttons.compact .hint-btn {
                    padding: 8px 10px;
                    gap: 6px;
                    min-height: 40px;
                }

                /* rgba() cannot take a hex custom property, so the old
                   rgba(var(--hint-color), 0.1) declaration was dropped by
                   every browser. color-mix() works with the hex value. */
                .hint-btn:hover:not(.disabled) {
                    border-color: var(--hint-color);
                    background: color-mix(in srgb, var(--hint-color) 12%, rgba(30, 41, 59, 0.8));
                }

                .hint-btn.disabled {
                    opacity: 0.45;
                }

                .hint-btn.used {
                    cursor: not-allowed;
                }

                .hint-notice {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    white-space: nowrap;
                    padding: 8px 12px;
                    background: rgba(15, 23, 42, 0.97);
                    border: 1px solid rgba(0, 212, 255, 0.35);
                    border-radius: 8px;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.85);
                    z-index: 5;
                    pointer-events: auto;
                }

                .hint-notice-link {
                    color: #00d4ff;
                    font-weight: 700;
                    text-decoration: none;
                    border-bottom: 1px solid rgba(0, 212, 255, 0.5);
                }

                .hint-cost.vip-chip {
                    background: rgba(255, 215, 0, 0.15);
                    color: #FFD700;
                }

                .hint-cost.used-chip {
                    background: rgba(34, 197, 94, 0.15);
                    color: #22c55e;
                }

                .hint-icon {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: var(--hint-color);
                }

                .hint-buttons.compact .hint-icon {
                    width: 24px;
                    height: 24px;
                }

                .hint-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                }

                .hint-cost {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    padding: 4px 8px;
                    background: rgba(0, 212, 255, 0.15);
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 700;
                    color: #2374e1;
                }

                .hint-buttons.compact .hint-cost {
                    padding: 3px 6px;
                    font-size: 11px;
                }

                @media (prefers-reduced-motion: reduce) {
                    .hint-btn {
                        transition: none;
                    }
                }
            `}</style>
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
