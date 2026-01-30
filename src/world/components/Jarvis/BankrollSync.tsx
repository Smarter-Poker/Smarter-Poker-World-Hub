/* ═══════════════════════════════════════════════════════════════════════════
   BANKROLL SYNC — Connect with Bankroll Manager and display trends
   Shows bankroll history and provides insights for proper bankroll management
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface BankrollSyncProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface BankrollData {
    current: number;
    history: { date: string; amount: number }[];
    stakes: string;
    buyIns: number;
}

export function BankrollSync({ onAskJarvis, onClose }: BankrollSyncProps) {
    const [bankroll, setBankroll] = useState<BankrollData>({
        current: 2500,
        history: [
            { date: '2026-01-01', amount: 2000 },
            { date: '2026-01-08', amount: 2200 },
            { date: '2026-01-15', amount: 2100 },
            { date: '2026-01-22', amount: 2400 },
            { date: '2026-01-29', amount: 2500 }
        ],
        stakes: '1/2',
        buyIns: 25 // Number of buy-ins for current stakes
    });
    const [newAmount, setNewAmount] = useState('');

    // Load from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('jarvis_bankroll');
        if (saved) {
            try {
                setBankroll(JSON.parse(saved));
            } catch (e) { }
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        localStorage.setItem('jarvis_bankroll', JSON.stringify(bankroll));
    }, [bankroll]);

    const updateBankroll = () => {
        const amount = parseFloat(newAmount);
        if (isNaN(amount) || amount <= 0) return;

        setBankroll({
            ...bankroll,
            current: amount,
            history: [...bankroll.history, { date: new Date().toISOString().split('T')[0], amount }]
        });
        setNewAmount('');
    };

    const calculateTrend = () => {
        if (bankroll.history.length < 2) return 0;
        const recent = bankroll.history.slice(-5);
        const first = recent[0].amount;
        const last = recent[recent.length - 1].amount;
        return ((last - first) / first) * 100;
    };

    const getRecommendedStakes = (br: number) => {
        if (br >= 10000) return '5/10';
        if (br >= 5000) return '2/5';
        if (br >= 2000) return '1/2';
        if (br >= 1000) return '0.50/1';
        return '0.25/0.50';
    };

    const trend = calculateTrend();
    const recommended = getRecommendedStakes(bankroll.current);
    const maxHeight = Math.max(...bankroll.history.map(h => h.amount));

    const askForBankrollAdvice = () => {
        onAskJarvis(`Analyze my bankroll and give me advice:

**Current Bankroll:** $${bankroll.current}
**Current Stakes:** ${bankroll.stakes}
**Buy-ins at Stakes:** ${bankroll.buyIns}
**Trend (30 days):** ${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%
**Recommended Stakes:** ${recommended}

**History (last 5):**
${bankroll.history.slice(-5).map(h => `- ${h.date}: $${h.amount}`).join('\n')}

Questions:
1. Am I properly rolled for ${bankroll.stakes}?
2. Should I move up or down in stakes?
3. What's a safe shot-taking strategy?
4. How should I handle downswings?`);
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
                    💰 Bankroll Sync
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Current Bankroll Display */}
            <div style={{
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))',
                borderRadius: '10px',
                textAlign: 'center',
                marginBottom: '12px'
            }}>
                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>Current Bankroll</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#FFD700' }}>
                    ${bankroll.current.toLocaleString()}
                </div>
                <div style={{
                    fontSize: '11px',
                    color: trend >= 0 ? '#4CAF50' : '#f44336',
                    marginTop: '4px'
                }}>
                    {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% this month
                </div>
            </div>

            {/* Mini Chart */}
            <div style={{
                height: '60px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '2px',
                marginBottom: '12px',
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '6px'
            }}>
                {bankroll.history.slice(-10).map((point, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            height: `${(point.amount / maxHeight) * 100}%`,
                            minHeight: '4px',
                            background: i === bankroll.history.slice(-10).length - 1
                                ? 'linear-gradient(to top, #FFD700, #FFA500)'
                                : 'rgba(255, 215, 0, 0.3)',
                            borderRadius: '2px'
                        }}
                        title={`$${point.amount}`}
                    />
                ))}
            </div>

            {/* Stats Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                        {bankroll.stakes}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        Current Stakes
                    </div>
                </div>
                <div style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                        {bankroll.buyIns} BI
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        Buy-ins
                    </div>
                </div>
            </div>

            {/* Recommended Stakes */}
            <div style={{
                padding: '10px',
                background: recommended !== bankroll.stakes ? 'rgba(255, 152, 0, 0.1)' : 'rgba(76, 175, 80, 0.1)',
                border: `1px solid ${recommended !== bankroll.stakes ? 'rgba(255, 152, 0, 0.3)' : 'rgba(76, 175, 80, 0.3)'}`,
                borderRadius: '6px',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>
                        Recommended Stakes
                    </span>
                    <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: recommended !== bankroll.stakes ? '#FF9800' : '#4CAF50'
                    }}>
                        {recommended}
                    </span>
                </div>
            </div>

            {/* Update Bankroll */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    placeholder="Update bankroll..."
                    style={{
                        flex: 1, padding: '8px',
                        background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                        borderRadius: '6px', color: '#fff', fontSize: '11px'
                    }}
                />
                <button
                    onClick={updateBankroll}
                    style={{
                        padding: '8px 16px', background: 'rgba(255, 215, 0, 0.2)',
                        border: 'none', borderRadius: '6px', color: '#FFD700',
                        fontSize: '11px', cursor: 'pointer'
                    }}
                >
                    Update
                </button>
            </div>

            {/* Ask Jarvis */}
            <button
                onClick={askForBankrollAdvice}
                style={{
                    width: '100%', padding: '12px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none', borderRadius: '8px',
                    color: '#000', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                }}
            >
                📈 Get Bankroll Advice
            </button>
        </div>
    );
}
