/* ═══════════════════════════════════════════════════════════════════════════
   POKER TOOLS TOOLBAR — Quick access to poker analysis tools
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { RangeVisualizer } from './RangeVisualizer';
import { EquityCalculator } from './EquityCalculator';
import { HandDiagram } from './HandDiagram';

interface PokerToolsToolbarProps {
    onAskQuestion?: (question: string) => void;
}

export function PokerToolsToolbar({ onAskQuestion }: PokerToolsToolbarProps) {
    const [activeTool, setActiveTool] = useState<string | null>(null);

    const tools = [
        { id: 'range', icon: '📊', label: 'Ranges', component: RangeVisualizer },
        { id: 'equity', icon: '🎯', label: 'Equity', component: EquityCalculator },
        { id: 'hand', icon: '🃏', label: 'Hand', component: HandDiagram }
    ];

    return (
        <div style={{ position: 'relative' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                gap: '6px',
                padding: '8px 12px',
                borderTop: '1px solid rgba(255, 215, 0, 0.1)',
                background: 'rgba(0, 0, 0, 0.2)'
            }}>
                <span style={{
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.5)',
                    alignSelf: 'center',
                    marginRight: '4px'
                }}>
                    Tools:
                </span>
                {tools.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                        style={{
                            padding: '6px 10px',
                            background: activeTool === tool.id
                                ? 'rgba(255, 215, 0, 0.2)'
                                : 'rgba(255, 215, 0, 0.05)',
                            border: activeTool === tool.id
                                ? '1px solid rgba(255, 215, 0, 0.4)'
                                : '1px solid rgba(255, 215, 0, 0.15)',
                            borderRadius: '6px',
                            color: activeTool === tool.id ? '#FFD700' : 'rgba(255, 255, 255, 0.7)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                        }}
                        title={tool.label}
                    >
                        <span>{tool.icon}</span>
                        <span>{tool.label}</span>
                    </button>
                ))}

                {/* Quick Ask Buttons */}
                {onAskQuestion && (
                    <>
                        <div style={{
                            width: '1px',
                            background: 'rgba(255, 215, 0, 0.2)',
                            margin: '0 4px'
                        }} />
                        <button
                            onClick={() => onAskQuestion("What's the optimal preflop strategy for my current stack depth?")}
                            style={{
                                padding: '6px 10px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.15)',
                                borderRadius: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '10px',
                                cursor: 'pointer'
                            }}
                            title="Ask about preflop"
                        >
                            Preflop?
                        </button>
                        <button
                            onClick={() => onAskQuestion("How should I size my c-bet on this board texture?")}
                            style={{
                                padding: '6px 10px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.15)',
                                borderRadius: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '10px',
                                cursor: 'pointer'
                            }}
                            title="Ask about c-betting"
                        >
                            C-bet?
                        </button>
                    </>
                )}
            </div>

            {/* Active Tool Panel */}
            {activeTool && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '12px',
                    marginBottom: '8px',
                    zIndex: 100
                }}>
                    {activeTool === 'range' && (
                        <RangeVisualizer onClose={() => setActiveTool(null)} />
                    )}
                    {activeTool === 'equity' && (
                        <EquityCalculator onClose={() => setActiveTool(null)} />
                    )}
                    {activeTool === 'hand' && (
                        <HandDiagram
                            board={['As', 'Kh', 'Qd']}
                            heroCards={['Ah', 'Kd']}
                            heroPosition="BTN"
                            villainPosition="BB"
                            potSize={150}
                            action="Hero bets $100"
                            onClose={() => setActiveTool(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
