/* ═══════════════════════════════════════════════════════════════════════════
   POKER QUICK TOPICS — Pre-built poker strategy questions
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface PokerQuickTopicsProps {
    onTopicClick: (query: string) => void;
}

const POKER_TOPICS = [
    // GTO Strategy
    { id: 'opening-ranges', label: 'Opening Ranges', icon: '📊', query: 'Show me optimal opening ranges by position in No-Limit Hold\'em' },
    { id: '3bet-ranges', label: '3-Bet Strategy', icon: '🎯', query: 'What are optimal 3-bet ranges from each position?' },
    { id: 'cbet-strategy', label: 'C-Betting', icon: '💪', query: 'Explain continuation betting strategy and frequencies' },

    // Tournament
    { id: 'icm-basics', label: 'ICM Explained', icon: '🏆', query: 'Explain ICM (Independent Chip Model) and when it matters most' },
    { id: 'bubble-play', label: 'Bubble Strategy', icon: '🎈', query: 'How should I adjust my strategy on the tournament bubble?' },
    { id: 'final-table', label: 'Final Table', icon: '👑', query: 'What are the key adjustments for final table play?' },

    // Hand Analysis
    { id: 'analyze-hand', label: 'Analyze a Hand', icon: '🃏', query: 'I want to analyze a specific poker hand. How should I describe it?' },
    { id: 'equity-calc', label: 'Equity & Odds', icon: '🧮', query: 'Explain pot odds, equity, and how to calculate them' },

    // Learning
    { id: 'improve-game', label: 'Improve My Game', icon: '📈', query: 'What are the most important areas to focus on to improve my poker game?' },
    { id: 'study-plan', label: 'Study Plan', icon: '📚', query: 'Create a comprehensive poker study plan for me' },

    // Advanced
    { id: 'gto-vs-exploit', label: 'GTO vs Exploitative', icon: '⚖️', query: 'Explain the difference between GTO and exploitative play' },
    { id: 'bankroll', label: 'Bankroll Management', icon: '💰', query: 'What are proper bankroll management guidelines?' }
];

export function PokerQuickTopics({ onTopicClick }: PokerQuickTopicsProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div style={{
            borderTop: '1px solid rgba(255, 215, 0, 0.2)',
            background: 'rgba(0, 0, 0, 0.2)'
        }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    width: '100%',
                    padding: '12px 20px',
                    background: 'none',
                    border: 'none',
                    color: '#FFD700',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <span>Quick Poker Topics</span>
                <span style={{ fontSize: '16px' }}>{isExpanded ? '▼' : '▶'}</span>
            </button>

            {isExpanded && (
                <div style={{
                    padding: '12px 20px 20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                }}>
                    {POKER_TOPICS.map(topic => (
                        <button
                            key={topic.id}
                            onClick={() => onTopicClick(topic.query)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '8px',
                                color: '#FFD700',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textAlign: 'left'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 215, 0, 0.15)';
                                e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 215, 0, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.2)';
                            }}
                        >
                            <span style={{ fontSize: '14px' }}>{topic.icon}</span>
                            <span style={{ flex: 1 }}>{topic.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
