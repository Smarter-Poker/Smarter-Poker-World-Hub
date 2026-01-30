/* ═══════════════════════════════════════════════════════════════════════════
   SESSION SUMMARY — Auto-generate session recaps with stats and key hands
   Summarizes poker sessions with performance metrics and highlights
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface SessionSummaryProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface SessionData {
    duration: number; // minutes
    handsPlayed: number;
    buyIn: number;
    cashOut: number;
    bigBlind: number;
    winRate: number; // bb/100
    keyHands: string[];
    notes: string;
}

export function SessionSummary({ onAskJarvis, onClose }: SessionSummaryProps) {
    const [session, setSession] = useState<SessionData>({
        duration: 60,
        handsPlayed: 100,
        buyIn: 100,
        cashOut: 130,
        bigBlind: 0.50,
        winRate: 0,
        keyHands: [],
        notes: ''
    });
    const [newHandNote, setNewHandNote] = useState('');

    const profit = session.cashOut - session.buyIn;
    const profitBB = profit / session.bigBlind;
    const bbPer100 = session.handsPlayed > 0
        ? (profitBB / session.handsPlayed) * 100
        : 0;
    const hourlyRate = session.duration > 0
        ? (profit / session.duration) * 60
        : 0;

    const addKeyHand = () => {
        if (!newHandNote.trim()) return;
        setSession({
            ...session,
            keyHands: [...session.keyHands, newHandNote.trim()]
        });
        setNewHandNote('');
    };

    const generateSummary = () => {
        const summary = `Generate a session summary and analysis:

**Session Stats:**
- Duration: ${session.duration} minutes (${(session.duration / 60).toFixed(1)} hours)
- Hands Played: ${session.handsPlayed}
- Buy-in: $${session.buyIn} | Cash-out: $${session.cashOut}
- Result: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)} (${profitBB.toFixed(1)} BB)
- Win Rate: ${bbPer100.toFixed(1)} BB/100
- Hourly: $${hourlyRate.toFixed(2)}/hr

**Key Hands:**
${session.keyHands.map((h, i) => `${i + 1}. ${h}`).join('\n') || 'None logged'}

**Notes:**
${session.notes || 'None'}

Please analyze:
1. Was this a good session overall?
2. What can I learn from the key hands?
3. What should I focus on next session?`;

        onAskJarvis(summary);
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
                marginBottom: '12px'
            }}>
                <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                    📊 Session Summary
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Input Fields */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Duration (min)</label>
                    <input
                        type="number"
                        value={session.duration}
                        onChange={e => setSession({ ...session, duration: +e.target.value })}
                        style={{
                            width: '100%', padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Hands Played</label>
                    <input
                        type="number"
                        value={session.handsPlayed}
                        onChange={e => setSession({ ...session, handsPlayed: +e.target.value })}
                        style={{
                            width: '100%', padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Buy-in ($)</label>
                    <input
                        type="number"
                        value={session.buyIn}
                        onChange={e => setSession({ ...session, buyIn: +e.target.value })}
                        style={{
                            width: '100%', padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Cash-out ($)</label>
                    <input
                        type="number"
                        value={session.cashOut}
                        onChange={e => setSession({ ...session, cashOut: +e.target.value })}
                        style={{
                            width: '100%', padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '12px'
                        }}
                    />
                </div>
            </div>

            {/* Results Summary */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '12px',
                padding: '10px',
                background: profit >= 0 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                border: profit >= 0 ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(244, 67, 54, 0.3)',
                borderRadius: '8px'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '16px', fontWeight: 700,
                        color: profit >= 0 ? '#4CAF50' : '#f44336'
                    }}>
                        {profit >= 0 ? '+' : ''}${profit.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>Profit</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '16px', fontWeight: 700,
                        color: bbPer100 >= 0 ? '#4CAF50' : '#f44336'
                    }}>
                        {bbPer100.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>BB/100</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '16px', fontWeight: 700,
                        color: hourlyRate >= 0 ? '#4CAF50' : '#f44336'
                    }}>
                        ${hourlyRate.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>/hour</div>
                </div>
            </div>

            {/* Key Hands */}
            <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginBottom: '4px', display: 'block' }}>
                    Key Hands ({session.keyHands.length}):
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        value={newHandNote}
                        onChange={e => setNewHandNote(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addKeyHand()}
                        placeholder="e.g., Lost big pot with AA vs set..."
                        style={{
                            flex: 1, padding: '6px 10px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '10px'
                        }}
                    />
                    <button
                        onClick={addKeyHand}
                        style={{
                            padding: '6px 12px', background: 'rgba(255, 215, 0, 0.2)',
                            border: 'none', borderRadius: '4px', color: '#FFD700',
                            fontSize: '10px', cursor: 'pointer'
                        }}
                    >
                        +
                    </button>
                </div>
                {session.keyHands.length > 0 && (
                    <div style={{ marginTop: '6px', maxHeight: '60px', overflowY: 'auto' }}>
                        {session.keyHands.map((hand, i) => (
                            <div key={i} style={{
                                fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)',
                                padding: '2px 0'
                            }}>
                                • {hand}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginBottom: '4px', display: 'block' }}>
                    Session Notes:
                </label>
                <textarea
                    value={session.notes}
                    onChange={e => setSession({ ...session, notes: e.target.value })}
                    placeholder="How did you play? Any tilts or victories?"
                    style={{
                        width: '100%', padding: '8px', height: '50px', resize: 'none',
                        background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                        borderRadius: '4px', color: '#fff', fontSize: '10px'
                    }}
                />
            </div>

            {/* Generate Summary */}
            <button
                onClick={generateSummary}
                style={{
                    width: '100%', padding: '12px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none', borderRadius: '8px',
                    color: '#000', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                }}
            >
                📝 Generate AI Summary
            </button>
        </div>
    );
}
