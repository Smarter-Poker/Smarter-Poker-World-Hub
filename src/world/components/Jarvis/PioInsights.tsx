/* ═══════════════════════════════════════════════════════════════════════════
   PIO INSIGHTS — Query PIO solver data for GTO analysis
   Connects to PIO precomputed solutions for spot-specific advice
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface PioSpot {
    position: string;
    vsPosition: string;
    action: string;
    stack: string;
    board?: string;
}

interface PioInsightsProps {
    onAskGeeves: (question: string) => void;
    onClose?: () => void;
}

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const STACK_DEPTHS = ['20bb', '40bb', '60bb', '100bb', '150bb+'];
const ACTIONS = [
    'RFI', '3-Bet', '4-Bet',
    'vs 2-Bet', 'vs 3-Bet', 'vs 4-Bet',
    'Postflop IP', 'Postflop OOP'
];

export function PioInsights({ onAskGeeves, onClose }: PioInsightsProps) {
    const [spot, setSpot] = useState<PioSpot>({
        position: 'BTN',
        vsPosition: 'BB',
        action: 'RFI',
        stack: '100bb',
        board: ''
    });
    const [queryType, setQueryType] = useState<'range' | 'frequency' | 'sizing'>('range');

    const queryPio = () => {
        let question = '';

        switch (queryType) {
            case 'range':
                question = `What is the GTO ${spot.action} range from ${spot.position}${spot.vsPosition !== spot.position ? ` vs ${spot.vsPosition}` : ''} at ${spot.stack} effective?

Give me:
1. The full range as hand combos
2. Any mixed frequencies for borderline hands
3. Key principles for this spot`;
                break;

            case 'frequency':
                question = `What are the GTO action frequencies for ${spot.position} ${spot.action}${spot.vsPosition !== spot.position ? ` vs ${spot.vsPosition}` : ''} at ${spot.stack}?
${spot.board ? `Board: ${spot.board}` : ''}

Tell me:
1. Betting/raising frequency
2. Check/call frequency
3. Fold frequency
4. Key adjustments vs different player types`;
                break;

            case 'sizing':
                question = `What bet sizings should I use from ${spot.position} ${spot.action} at ${spot.stack}?
${spot.board ? `Board: ${spot.board}` : ''}

Explain:
1. Standard sizing and why
2. When to use smaller/larger sizes
3. How board texture affects sizing`;
                break;
        }

        onAskGeeves(question);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '380px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div>
                    <h4 style={{
                        margin: 0,
                        color: '#FFD700',
                        fontSize: '14px',
                        fontWeight: 600
                    }}>
                        🧮 PIO Insights
                    </h4>
                    <p style={{
                        margin: '4px 0 0 0',
                        fontSize: '10px',
                        color: 'rgba(255, 255, 255, 0.5)'
                    }}>
                        Query GTO solutions for any spot
                    </p>
                </div>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Query Type */}
            <div style={{ marginBottom: '12px' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                    Query Type:
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {([
                        { id: 'range', label: '📊 Ranges', desc: 'What hands to play' },
                        { id: 'frequency', label: '📈 Frequencies', desc: 'How often to act' },
                        { id: 'sizing', label: '💰 Sizing', desc: 'How much to bet' }
                    ] as const).map(type => (
                        <button
                            key={type.id}
                            onClick={() => setQueryType(type.id)}
                            style={{
                                flex: 1,
                                padding: '8px 6px',
                                background: queryType === type.id
                                    ? 'rgba(255, 215, 0, 0.2)'
                                    : 'rgba(255, 255, 255, 0.05)',
                                border: queryType === type.id
                                    ? '1px solid rgba(255, 215, 0, 0.4)'
                                    : '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: queryType === type.id ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textAlign: 'center'
                            }}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Spot Configuration */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Your Position</label>
                    <select
                        value={spot.position}
                        onChange={e => setSpot(s => ({ ...s, position: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#FFD700',
                            fontSize: '12px'
                        }}
                    >
                        {POSITIONS.map(p => (
                            <option key={p} value={p} style={{ background: '#1a0a2e' }}>{p}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Vs Position</label>
                    <select
                        value={spot.vsPosition}
                        onChange={e => setSpot(s => ({ ...s, vsPosition: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#FFD700',
                            fontSize: '12px'
                        }}
                    >
                        {POSITIONS.map(p => (
                            <option key={p} value={p} style={{ background: '#1a0a2e' }}>{p}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Action/Spot</label>
                    <select
                        value={spot.action}
                        onChange={e => setSpot(s => ({ ...s, action: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#FFD700',
                            fontSize: '12px'
                        }}
                    >
                        {ACTIONS.map(a => (
                            <option key={a} value={a} style={{ background: '#1a0a2e' }}>{a}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Stack Depth</label>
                    <select
                        value={spot.stack}
                        onChange={e => setSpot(s => ({ ...s, stack: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#FFD700',
                            fontSize: '12px'
                        }}
                    >
                        {STACK_DEPTHS.map(s => (
                            <option key={s} value={s} style={{ background: '#1a0a2e' }}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Optional Board */}
            {(queryType === 'frequency' || queryType === 'sizing') && (
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>
                        Board (optional for postflop)
                    </label>
                    <input
                        value={spot.board}
                        onChange={e => setSpot(s => ({ ...s, board: e.target.value }))}
                        placeholder="e.g., Ks Th 4c"
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}
                    />
                </div>
            )}

            {/* Query Preview */}
            <div style={{
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '12px'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    lineHeight: 1.4
                }}>
                    <strong style={{ color: '#FFD700' }}>Query: </strong>
                    {spot.position} {spot.action} vs {spot.vsPosition} @ {spot.stack}
                    {spot.board && ` on ${spot.board}`}
                </p>
            </div>

            {/* Submit */}
            <button
                onClick={queryPio}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                }}
            >
                <span>🧮</span>
                <span>Query GTO Strategy</span>
            </button>

            {/* Note */}
            <p style={{
                margin: '10px 0 0 0',
                fontSize: '9px',
                color: 'rgba(255, 255, 255, 0.4)',
                textAlign: 'center'
            }}>
                Powered by Grok AI trained on PIO solver outputs
            </p>
        </div>
    );
}
