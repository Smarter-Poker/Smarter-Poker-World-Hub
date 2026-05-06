/**
 * HINTS SYSTEM — Diamond sink for trivia
 * 50/50: 5💎, Skip: 10💎, Extra Time: 15💎
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Gem, Percent, SkipForward, Clock } from 'lucide-react';
import useVIP from '../../hooks/useVIP';

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

function HintButtons({
    userDiamonds = 0,
    onUseHint,
    disabledHints = [], // Array of hint IDs that can't be used
    compact = false,
    hasTimeLimit = true
}) {
    const { isVip } = useVIP();

    const handleUseHint = (hint) => {
        if (!hasTimeLimit) return;
        if (!isVip && userDiamonds < hint.cost) return;
        if (disabledHints.includes(hint.id)) return;
        onUseHint?.(hint);
    };

    return (
        <div className={`hint-buttons ${compact ? 'compact' : ''}`}>
            {HINTS.map((hint) => {
                const Icon = hint.icon;
                const canAfford = isVip || userDiamonds >= hint.cost;
                const isDisabled = disabledHints.includes(hint.id) || !canAfford || !hasTimeLimit;

                return (
                    <motion.button
                        key={hint.id}
                        className={`hint-btn ${isDisabled ? 'disabled' : ''}`}
                        onClick={() => handleUseHint(hint)}
                        disabled={isDisabled}
                        whileHover={!isDisabled ? { scale: 1.05 } : {}}
                        whileTap={!isDisabled ? { scale: 0.95 } : {}}
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
                        {!isVip ? (
                            <div className="hint-cost">
                                <Gem size={compact ? 10 : 12} />
                                <span>{hint.cost}</span>
                            </div>
                        ) : (
                            <div className="hint-cost" style={{ background: 'rgba(255, 215, 0, 0.15)', color: '#FFD700' }}>
                                <span>FREE</span>
                            </div>
                        )}
                    </motion.button>
                );
            })}

            <style>{`
                .hint-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                }

                .hint-buttons.compact {
                    gap: 6px;
                }

                .hint-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .hint-buttons.compact .hint-btn {
                    padding: 8px 10px;
                    gap: 6px;
                }

                .hint-btn:hover:not(.disabled) {
                    border-color: var(--hint-color);
                    background: rgba(var(--hint-color), 0.1);
                }

                .hint-btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
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
            `}</style>
        </div>
    );
}

/**
 * Apply a hint to the current question
 */
export function applyHint(hintId, question, currentState) {
    switch (hintId) {
        case 'fifty_fifty': {
            // Remove 2 wrong answers, keep correct and 1 wrong
            const correctIndex = question.correct_index;
            const wrongIndices = question.options
                .map((_, idx) => idx)
                .filter(idx => idx !== correctIndex);

            // Randomly remove 2 wrong answers.
            // Phase 60: was using sort(()=>Math.random()-0.5) which is
            // mathematically biased (some permutations 2x more likely).
            // Fisher-Yates is uniform.
            for (let i = wrongIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
            }
            const toRemove = wrongIndices.slice(0, 2);

            return {
                ...currentState,
                hiddenOptions: [...(currentState.hiddenOptions || []), ...toRemove]
            };
        }

        case 'skip': {
            return {
                ...currentState,
                skipQuestion: true
            };
        }

        case 'extra_time': {
            return {
                ...currentState,
                addTime: 30
            };
        }

        default:
            return currentState;
    }
}

export { HINTS };

export default React.memo(HintButtons);
