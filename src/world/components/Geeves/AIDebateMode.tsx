/* ═══════════════════════════════════════════════════════════════════════════
   AI DEBATE MODE — Two AI perspectives argue about a poker decision
   Get both aggressive and conservative viewpoints on your hand
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface DebateMessage {
    id: string;
    speaker: 'aggro' | 'conservative' | 'verdict';
    content: string;
}

interface AIDebateModeProps {
    onAskGeeves: (question: string) => void;
    onClose?: () => void;
}

export function AIDebateMode({ onAskGeeves, onClose }: AIDebateModeProps) {
    const [scenario, setScenario] = useState('');
    const [isDebating, setIsDebating] = useState(false);
    const [messages, setMessages] = useState<DebateMessage[]>([]);

    const exampleScenarios = [
        'I have AKo on BTN, villain 3-bets from SB. Call or 4-bet?',
        'Flush draw on flop, villain bets pot. Call, raise, or fold?',
        'Top pair weak kicker facing river overbet. Hero call?',
        'Set on monotone board, should I slow play or fast play?'
    ];

    const startDebate = () => {
        if (!scenario.trim()) return;

        setIsDebating(true);
        setMessages([]);

        // Build debate prompt
        const debatePrompt = `Create a poker strategy debate with two AI perspectives:

**SCENARIO:** ${scenario}

Format your response exactly like this with clear separators:

🔥 AGGRESSIVE PERSPECTIVE:
[Give a compelling argument for the aggressive play - bet/raise/bluff. Be bold and confident. Use specific reasoning.]

🛡️ CONSERVATIVE PERSPECTIVE:
[Give a compelling argument for the safer play - check/call/fold. Be cautious and risk-aware. Use specific reasoning.]

⚖️ VERDICT:
[Give a balanced conclusion on which approach is generally better and when to use each. Keep it short - 2-3 sentences.]`;

        onAskGeeves(debatePrompt);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '400px',
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
                        ⚔️ AI Debate Mode
                    </h4>
                    <p style={{
                        margin: '4px 0 0 0',
                        fontSize: '10px',
                        color: 'rgba(255, 255, 255, 0.5)'
                    }}>
                        Two AI perspectives argue your decision
                    </p>
                </div>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Debaters */}
            <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '16px',
                justifyContent: 'center'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        background: 'linear-gradient(135deg, #f44336, #FF9800)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        margin: '0 auto 6px auto'
                    }}>
                        🔥
                    </div>
                    <span style={{
                        fontSize: '10px',
                        color: '#FF9800',
                        fontWeight: 600
                    }}>
                        AGGRO
                    </span>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '20px',
                    color: 'rgba(255, 255, 255, 0.3)'
                }}>
                    ⚔️
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        background: 'linear-gradient(135deg, #2196F3, #4CAF50)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        margin: '0 auto 6px auto'
                    }}>
                        🛡️
                    </div>
                    <span style={{
                        fontSize: '10px',
                        color: '#4CAF50',
                        fontWeight: 600
                    }}>
                        SAFE
                    </span>
                </div>
            </div>

            {/* Scenario Input */}
            <div style={{ marginBottom: '12px' }}>
                <label style={{
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.7)',
                    display: 'block',
                    marginBottom: '6px'
                }}>
                    Describe your decision:
                </label>
                <textarea
                    value={scenario}
                    onChange={e => setScenario(e.target.value)}
                    placeholder="e.g., I have AQ on the button facing a 3-bet..."
                    rows={3}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 215, 0, 0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                        resize: 'none'
                    }}
                />
            </div>

            {/* Quick Scenarios */}
            <div style={{ marginBottom: '12px' }}>
                <p style={{
                    margin: '0 0 6px 0',
                    fontSize: '10px',
                    color: 'rgba(255, 215, 0, 0.7)'
                }}>
                    Quick examples:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {exampleScenarios.map((ex, i) => (
                        <button
                            key={i}
                            onClick={() => setScenario(ex)}
                            style={{
                                padding: '4px 8px',
                                background: 'rgba(255, 215, 0, 0.1)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '4px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '9px',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            {ex.substring(0, 40)}...
                        </button>
                    ))}
                </div>
            </div>

            {/* Start Debate Button */}
            <button
                onClick={startDebate}
                disabled={!scenario.trim()}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: scenario.trim()
                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                        : 'rgba(255, 215, 0, 0.2)',
                    border: 'none',
                    borderRadius: '8px',
                    color: scenario.trim() ? '#000' : 'rgba(255, 255, 255, 0.4)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: scenario.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}
            >
                <span>⚔️</span>
                <span>Start the Debate!</span>
            </button>

            {/* Instructions */}
            <p style={{
                margin: '12px 0 0 0',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.4)',
                textAlign: 'center'
            }}>
                Geeves will present both sides and give a verdict
            </p>
        </div>
    );
}
